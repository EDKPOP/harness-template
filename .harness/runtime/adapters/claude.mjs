import { execFileSync } from 'child_process';

export function runClaude(prompt, { cwd, dryRun = false }) {
  const trimmed = String(prompt || '').slice(0, 4000);
  const args = ['--permission-mode', 'bypassPermissions', '--print', trimmed];
  if (dryRun) return `[DRY RUN] claude ${args.join(' ')}`;
  return execFileSync('claude', args, {
    cwd,
    encoding: 'utf-8',
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}
