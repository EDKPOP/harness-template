import { execFileSync, spawnSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export function runClaude(prompt, { cwd, dryRun = false }) {
  if (dryRun) return "[DRY RUN] claude";

  // Split system context from user instruction
  // Prompt format: <system>\n---USER---\n<user> or just the full prompt as user message
  let systemPrompt = '';
  let userPrompt = prompt;
  
  const separator = '\n---USER---\n';
  const sepIdx = prompt.indexOf(separator);
  if (sepIdx !== -1) {
    systemPrompt = prompt.slice(0, sepIdx);
    userPrompt = prompt.slice(sepIdx + separator.length);
  }

  const tmpSys = join(tmpdir(), `harness-sys-${Date.now()}.txt`);
  const args = [
    '--permission-mode', 'bypassPermissions',
    '--print',
    '--no-session-persistence',
  ];

  if (systemPrompt) {
    writeFileSync(tmpSys, systemPrompt, 'utf-8');
    args.push('--system-prompt-file', tmpSys);
  }

  args.push(userPrompt);

  try {
    const result = execFileSync('claude', args, {
      cwd,
      encoding: 'utf-8',
      timeout: 600000,
      maxBuffer: 20 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return result;
  } finally {
    try { unlinkSync(tmpSys); } catch {}
  }
}
