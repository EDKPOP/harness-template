import { execSync } from 'child_process';

export function runGemini(prompt, { cwd, dryRun = false }) {
  const command = `gemini --approval-mode plan -p ${JSON.stringify(prompt)}`;
  if (dryRun) return `[DRY RUN] ${command}`;
  return execSync(command, {
    cwd,
    encoding: 'utf-8',
    timeout: 600000,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}
