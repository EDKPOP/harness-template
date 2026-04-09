import { spawn } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export function runClaude(prompt, { cwd, dryRun = false }) {
  if (dryRun) return Promise.resolve(`[DRY RUN] claude --print <prompt>`);

  return new Promise((resolve, reject) => {
    const tmpFile = join(tmpdir(), `harness-prompt-${Date.now()}.txt`);
    try {
      writeFileSync(tmpFile, prompt, 'utf-8');
    } catch (e) {
      return reject(e);
    }

    const proc = spawn('claude', [
      '--permission-mode', 'bypassPermissions',
      '--print',
      prompt,
    ], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      try { unlinkSync(tmpFile); } catch {}
      if (code !== 0) return reject(new Error(`claude exited ${code}: ${stderr.slice(0, 400)}`));
      resolve(stdout);
    });

    proc.on('error', (err) => {
      try { unlinkSync(tmpFile); } catch {}
      reject(err);
    });
  });
}
