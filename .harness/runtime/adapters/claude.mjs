import { execFileSync } from 'child_process';

// Claude CLI blocks when stdin prompt starts with markdown headers (# ).
// Workaround: prepend a plain-text instruction before the role spec.
function sanitizePrompt(prompt) {
  const lines = prompt.split('\n');
  const firstLine = lines[0] || '';
  if (firstLine.startsWith('#')) {
    return 'Please perform the following role:\n\n' + prompt;
  }
  return prompt;
}

export function runClaude(prompt, { cwd, dryRun = false }) {
  if (dryRun) return "[DRY RUN] claude";
  const safe = sanitizePrompt(prompt);
  return execFileSync('claude', [
    '--permission-mode', 'bypassPermissions',
    '--print',
    '--no-session-persistence',
    safe,
  ], {
    cwd,
    encoding: 'utf-8',
    timeout: 600000,
    maxBuffer: 20 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
