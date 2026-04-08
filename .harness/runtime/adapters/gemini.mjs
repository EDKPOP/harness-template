import { execFileSync } from 'child_process';

export function runGemini(prompt, { cwd, dryRun = false }) {
  const args = ['--approval-mode', 'plan', '-p', prompt];
  if (dryRun) return `[DRY RUN] gemini ${args.join(' ')}`;
  return execFileSync('gemini', args, {
    cwd,
    encoding: 'utf-8',
    timeout: 600000,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}
