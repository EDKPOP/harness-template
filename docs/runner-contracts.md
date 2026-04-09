# Runner Contracts

## Rule
OpenClaw should not execute role CLIs directly when a harness-managed runner exists.

## Use
- full pipeline → `orchestrator.mjs`
- single phase or single role → `role-runner.mjs`
- state/notification sync for existing artifact → `phase-runner.mjs`

## Why
This preserves state, notifications, checkpoints, and consistent operator visibility.

## Streaming Execution Contract (v3.1)

All CLI agent invocations go through `streaming-runner.mjs`, which replaces the previous `execFileSync` pattern.

### Properties
- **Spawn-based**: Uses `child_process.spawn` for real-time output capture
- **Artifact streaming**: Output is appended to `.harness/artifacts/{role}-stream-{timestamp}.log` as it arrives
- **Inactivity watchdog**: No output for `inactivity_timeout_seconds` (default 120s) → SIGTERM → SIGKILL
- **Hard timeout**: Absolute limit per call (default 600s)
- **Heartbeats**: Every 30s, emits elapsed time, output bytes, and idle duration
- **Completion signals**: Watches for `## Machine Signals` and `verdict:` to confirm agent completion
- **Graceful kill**: SIGTERM first, SIGKILL after 10s grace period

### Return contract
```typescript
{
  stdout: string;      // Full captured stdout
  stderr: string;      // Full captured stderr
  exitCode: number;    // Process exit code
  timedOut: boolean;   // True if hard timeout triggered
  stalled: boolean;    // True if inactivity watchdog triggered
  completionDetected: boolean;  // True if completion signals found
  durationMs: number;  // Total execution duration
}
```

### Stall/timeout behavior
When a stall or timeout is detected, the adapter appends a synthetic Machine Signals block to the output:
```
## Machine Signals
verdict: FAIL
escalate: harness_optimizer
reason: cli-stall-detected | cli-timeout
```
This allows the orchestrator to process the result through normal verdict extraction without special-casing.

### Budget tracking
The orchestrator tracks cumulative `budgetUsed.durationMs` and `budgetUsed.agentCalls` in `session-state.json`. Exceeding `budget.max_duration_minutes` or `budget.max_agent_calls` pauses the pipeline.

### Config protection
After each implementation step, `git diff --name-only` is checked against a protected config list. Violations are auto-reverted and recorded as learnings.
