import { execFileSync } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Claude CLI triggers tool-use when prompt contains markdown headers like "## AGENTS.md"
// or file paths. Strip markdown structure and convert to plain prose.
function toPlainText(prompt) {
  return prompt
    // Remove markdown headers (#, ##, ###) - keep the text
    .replace(/^#{1,6}\s+/gm, '')
    // Remove inline backticks
    .replace(/`([^`]+)`/g, '$1')
    // Remove fenced code blocks - keep content
    .replace(/^```[\w]*\n?/gm, '')
    .replace(/^```\s*$/gm, '')
    // Remove bold/italic markers
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    // Remove horizontal rules
    .replace(/^[-*]{3,}\s*$/gm, '---')
    // Collapse multiple blank lines
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
  const safe = toPlainText(prompt);
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
