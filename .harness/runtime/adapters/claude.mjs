import { execFileSync } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Claude CLI tool-use permission prompts block when run inside a project directory
// that contains CLAUDE.md. Run from a neutral sandbox directory instead.
function getSandboxDir() {
  const dir = join(tmpdir(), 'harness-claude-sandbox');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function runClaude(prompt, { cwd: _cwd, dryRun = false }) {
  if (dryRun) return "[DRY RUN] claude";
  const sandboxDir = getSandboxDir();
  return execFileSync('claude', [
    '--permission-mode', 'bypassPermissions',
    '--print',
    '--no-session-persistence',
    prompt,
  ], {
    cwd: sandboxDir,
    encoding: 'utf-8',
    timeout: 600000,
    maxBuffer: 20 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
