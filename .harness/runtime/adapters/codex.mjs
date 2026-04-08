import { execFileSync } from 'child_process';

export function runCodex(prompt, { cwd, dryRun = false }) {
  const args = ['exec', prompt];
  if (dryRun) return `[DRY RUN] codex ${args.join(' ')}`;
  return execFileSync('codex', args, {
    cwd,
    encoding: 'utf-8',
    timeout: 600000,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}
