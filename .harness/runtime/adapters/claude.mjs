import { execFileSync } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Claude CLI triggers tool-use when prompt contains file paths or markdown headers.
// Sanitize prompt to plain prose before passing to claude --print.
function sanitize(prompt) {
  return prompt
    // Remove markdown headers - keep text
    .replace(/^#{1,6}\s+/gm, '')
    // Replace file paths (starts with . or /) with placeholder
    .replace(/(?<![`\w])\.\/[^\s)]+/g, '<path>')
    .replace(/(?<![`\w])\.[a-zA-Z/_-]+\/[^\s)]+/g, '<path>')
    .replace(/(?<![`\w])\/[a-zA-Z][^\s)]{2,}/g, '<path>')
    // Remove inline backtick paths
    .replace(/`[./][^`]+`/g, '<path>')
    // Remove fenced code blocks
    .replace(/```[\w]*\n[\s\S]*?```/g, '[code block omitted]')
    // Remove inline code
    .replace(/`([^`]+)`/g, '$1')
    // Remove bold/italic
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    // Collapse blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getSandboxDir() {
  const dir = join(tmpdir(), 'harness-claude-sandbox');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function runClaude(prompt, { cwd: _cwd, dryRun = false }) {
  if (dryRun) return "[DRY RUN] claude";
  const safe = sanitize(prompt);
  const sandboxDir = getSandboxDir();
  return execFileSync('claude', [
    '--permission-mode', 'bypassPermissions',
    '--print',
    '--no-session-persistence',
    safe,
  ], {
    cwd: sandboxDir,
    encoding: 'utf-8',
    timeout: 600000,
    maxBuffer: 20 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
