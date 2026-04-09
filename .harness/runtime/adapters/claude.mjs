import { execFileSync } from 'child_process';

export function runClaude(prompt, { cwd, dryRun = false }) {
  if (dryRun) return "[DRY RUN] claude";
  // Write prompt to file, use pipeline stdin redirect  
  const result = execFileSync('bash', ['-c', `claude --permission-mode bypassPermissions --print "$1"`, '--', prompt], {
    cwd,
    encoding: 'utf-8',
    timeout: 600000,
    maxBuffer: 20 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
    input: '',
  });
  return result;
}
