import { streamingRun } from '../streaming-runner.mjs';

// Claude CLI can trigger tool-use when prompt contains file paths or markdown.
// Sanitize prompt to plain prose before passing to claude --print.
// NOTE: When allowedTools is set, tools are already restricted at the CLI level,
// so aggressive path stripping is unnecessary and destroys planning context.
function sanitize(prompt, { preservePaths = false } = {}) {
  let text = prompt
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n');

  if (!preservePaths) {
    // Aggressive path removal — only when tools are unrestricted
    text = text
      .replace(/(?<![`\w])\.\/[^^\s)]+/g, '<path>')
      .replace(/(?<![`\w])\.[a-zA-Z/_-]+\/[^\s)]+/g, '<path>')
      .replace(/(?<![`\w])\/[a-zA-Z][^\s)]{2,}/g, '<path>')
      .replace(/`[./][^`]+`/g, '<path>')
      .replace(/```[\w]*\n[\s\S]*?```/g, '[code block omitted]')
      .replace(/`([^`]+)`/g, '$1');
  }

  return text.trim();
}

/**
 * @param {string} prompt
 * @param {object} opts
 * @param {string} opts.cwd
 * @param {boolean} [opts.dryRun]
 * @param {string} [opts.artifactPath]        - stream output to this file
 * @param {number} [opts.timeoutMs]            - total timeout (default 600s)
 * @param {number} [opts.inactivityMs]         - stall threshold (default 120s)
 * @param {string[]} [opts.allowedTools]       - restrict tool access for read-only phases
 * @param {function} [opts.onHeartbeat]
 * @param {function} [opts.onStall]
 */
export async function runClaude(prompt, opts = {}) {
  const { cwd, dryRun = false, artifactPath, timeoutMs, inactivityMs, allowedTools, onHeartbeat, onStall } = opts;
  if (dryRun) return '[DRY RUN] claude';

  const safe = sanitize(prompt, { preservePaths: !!(allowedTools && allowedTools.length > 0) });
  const args = [
    '--bare',
    '--permission-mode', 'bypassPermissions',
    '--print',
  ];
  if (allowedTools && allowedTools.length > 0) {
    args.push('--allowedTools', allowedTools.join(','));
  }

  const result = await streamingRun('claude', args, {
    cwd: cwd || process.cwd(),
    timeoutMs: timeoutMs || 600_000,
    inactivityMs: inactivityMs || 120_000,
    artifactPath,
    completionSignals: ['## Machine Signals', 'verdict:'],
    onHeartbeat,
    onStall,
    stdinData: safe,
  });

  if (result.stalled) {
    const stallMsg = `[STALL] Claude CLI produced no output for ${Math.round((result.durationMs) / 1000)}s. Partial output (${result.stdout.length} bytes) captured.`;
    return result.stdout + `\n\n${stallMsg}\n\n## Machine Signals\nverdict: FAIL\nescalate: harness_optimizer\nreason: cli-stall-detected\n`;
  }
  if (result.timedOut) {
    const timeoutMsg = `[TIMEOUT] Claude CLI exceeded ${Math.round((opts.timeoutMs || 600_000) / 1000)}s. Partial output captured.`;
    return result.stdout + `\n\n${timeoutMsg}\n\n## Machine Signals\nverdict: FAIL\nescalate: harness_optimizer\nreason: cli-timeout\n`;
  }
  if (result.exitCode !== 0 && !result.stdout) {
    throw new Error(`claude exited ${result.exitCode}: ${result.stderr.slice(0, 500)}`);
  }
  return result.stdout;
}
