import { execSync } from 'child_process';

export function runCodex(prompt, { cwd, dryRun = false }) {
  const command = `codex exec ${JSON.stringify(prompt)}`;
  if (dryRun) return `[DRY RUN] ${command}`;
  return execSync(command, {
    cwd,
    encoding: 'utf-8',
    timeout: 600000,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}
