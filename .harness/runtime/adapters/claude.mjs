import { spawn } from 'child_process';

export function runClaude(prompt, { cwd, dryRun = false }) {
  if (dryRun) return `[DRY RUN] claude --permission-mode bypassPermissions --print <prompt>`;

  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['--permission-mode', 'bypassPermissions', '--print', prompt], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`claude exited ${code}: ${stderr.slice(0, 200)}`));
      resolve(stdout);
    });

    proc.on('error', reject);
  });
}
