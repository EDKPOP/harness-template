import { execFileSync } from 'child_process';

export function runClaude(prompt, { cwd, dryRun = false }) {
  const args = ['--permission-mode', 'bypassPermissions', '--print', prompt];
  if (dryRun) return `[DRY RUN] claude ${args.join(' ')}`;
  return execFileSync('claude', args, {
    cwd,
    encoding: 'utf-8',
    timeout: 600000,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}
