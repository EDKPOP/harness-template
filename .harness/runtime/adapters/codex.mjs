import { streamingRun } from '../streaming-runner.mjs';

/**
 * @param {string} prompt
 * @param {object} opts
 * @param {string} opts.cwd
 * @param {boolean} [opts.dryRun]
 * @param {string} [opts.artifactPath]
 * @param {number} [opts.timeoutMs]
 * @param {number} [opts.inactivityMs]
 * @param {function} [opts.onHeartbeat]
 * @param {function} [opts.onStall]
 */
export async function runCodex(prompt, opts = {}) {
  const { cwd, dryRun = false, artifactPath, timeoutMs, inactivityMs, onHeartbeat, onStall, sandbox = 'read-only', approval = 'on-request' } = opts;
  if (dryRun) return '[DRY RUN] codex';

  const result = await streamingRun('codex', ['exec', '--sandbox', sandbox, '-a', approval, prompt], {
    cwd: cwd || process.cwd(),
    timeoutMs: timeoutMs || 600_000,
    inactivityMs: inactivityMs || 120_000,
    artifactPath,
    completionSignals: ['## Machine Signals', 'verdict:'],
    onHeartbeat,
    onStall,
  });

  if (result.stalled) {
    return result.stdout + `\n\n[STALL] Codex CLI stalled.\n\n## Machine Signals\nverdict: FAIL\nescalate: harness_optimizer\nreason: cli-stall-detected\n`;
  }
  if (result.timedOut) {
    return result.stdout + `\n\n[TIMEOUT] Codex CLI timed out.\n\n## Machine Signals\nverdict: FAIL\nescalate: harness_optimizer\nreason: cli-timeout\n`;
  }
  if (result.exitCode !== 0 && !result.stdout) {
    throw new Error(`codex exited ${result.exitCode}: ${result.stderr.slice(0, 500)}`);
  }
  return result.stdout;
}
