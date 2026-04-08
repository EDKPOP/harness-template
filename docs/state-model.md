# State Model

`.harness/session-state.json` is the primary runtime state surface for OpenClaw and the loop operator.

## Key fields
- `phase`
- `activeRole`
- `activeFeature`
- `iteration`
- `lastGateResult`
- `lastReviewResult`
- `lastFailureSignature`
- `sameFailureCount`
- `progressDelta`
- `stopCondition`

## Rule
If the state file says the run is paused, failed, or blocked, OpenClaw should trust that state before assuming forward progress.
