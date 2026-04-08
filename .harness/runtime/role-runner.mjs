#!/usr/bin/env node

import { resolve, join } from 'path';
import { existsSync, readFileSync, writeFileSync, symlinkSync, unlinkSync } from 'fs';
import { parseArgs } from 'util';
import { execSync } from 'child_process';
import { buildPhaseEvent, appendNotification, writeLatestNotification, buildNotifierCommand } from './notifications.mjs';
import { recommendIntervention, summarizeStatus } from './status.mjs';
import { appendCheckpoint } from './checkpoints.mjs';
import { runClaude } from './adapters/claude.mjs';
import { runCodex } from './adapters/codex.mjs';
import { runGemini } from './adapters/gemini.mjs';

const PROJECT_ROOT = resolve(process.cwd());
const HARNESS_DIR = join(PROJECT_ROOT, '.harness');
const ARTIFACTS_DIR = join(HARNESS_DIR, 'artifacts');

const { values, positionals } = parseArgs({
  options: {
    engine: { type: 'string' },
    role: { type: 'string' },
    phase: { type: 'string' },
    'dry-run': { type: 'boolean' },
  },
  allowPositionals: true,
  strict: false,
});

const roleArg = values.role || positionals[0];
const phase = values.phase || positionals[1] || roleArg;
const engine = values.engine || positionals[2] || 'claude';
const DRY_RUN = values['dry-run'] || false;

if (!roleArg) {
  console.error('Usage: node .harness/runtime/role-runner.mjs <role-file> [phase] [engine]');
  process.exit(1);
}

function readFile(path) {
  return existsSync(path) ? readFileSync(path, 'utf-8') : null;
}

function loadState() {
  return JSON.parse(readFileSync(join(HARNESS_DIR, 'session-state.json'), 'utf-8'));
}

function saveState(state) {
  writeFileSync(join(HARNESS_DIR, 'session-state.json'), JSON.stringify(state, null, 2), 'utf-8');
}

function writeArtifact(prefix, content) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const filename = `${prefix}-${ts}.md`;
  const path = join(ARTIFACTS_DIR, filename);
  writeFileSync(path, content, 'utf-8');
  const latest = join(ARTIFACTS_DIR, `${prefix}-latest.md`);
  try { unlinkSync(latest); } catch {}
  try { symlinkSync(filename, latest); } catch {}
  return path;
}

function buildPrompt(roleFile) {
  const parts = [];
  const role = readFile(join(HARNESS_DIR, 'roles', roleFile));
  if (role) parts.push(role);
  const agents = readFile(join(PROJECT_ROOT, 'AGENTS.md'));
  if (agents) parts.push(`\n---\n## AGENTS.md\n${agents}`);
  const task = readFile(join(HARNESS_DIR, 'task_template.md'));
  if (task) parts.push(`\n---\n## task_template.md\n${task}`);
  const plan = readFile(join(ARTIFACTS_DIR, 'plan-latest.md'));
  if (plan && phase !== 'plan' && phase !== 'discover') parts.push(`\n---\n## plan\n${plan}`);
  const review = readFile(join(ARTIFACTS_DIR, 'review-latest.md'));
  if (review && phase === 'implement') parts.push(`\n---\n## review\n${review}`);
  const gate = readFile(join(ARTIFACTS_DIR, 'gate-latest.md'));
  if (gate && phase in { 'review':1, 'implement':1 }) parts.push(`\n---\n## gate\n${gate}`);
  const learnings = readFile(join(HARNESS_DIR, 'learnings.md'));
  if (learnings) parts.push(`\n---\n## learnings\n${learnings}`);
  return parts.join('\n');
}

function runWithClaudeRole(roleFile, prompt) {
  const roleName = roleFile.replace('.md', '');
  const agentPath = join(PROJECT_ROOT, '.claude', 'agents', `${roleName}.md`);
  if (!existsSync(agentPath)) return runClaude(prompt, { cwd: PROJECT_ROOT, dryRun: false });
  const command = `claude --permission-mode bypassPermissions --print --agent ${JSON.stringify(roleName)} ${JSON.stringify(prompt)}`;
  return execSync(command, {
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    timeout: 600000,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function run(engine, prompt) {
  if (DRY_RUN) return `# Dry Run\n\n## Machine Signals\nverdict: WARNING_ONLY\nescalate: none\nreason: dry-run-role-runner\n`;
  if (engine === 'claude') return runWithClaudeRole(roleFile, prompt);
  if (engine === 'codex') return runCodex(prompt, { cwd: PROJECT_ROOT, dryRun: false });
  if (engine === 'gemini') return runGemini(prompt, { cwd: PROJECT_ROOT, dryRun: false });
  throw new Error(`Unknown engine: ${engine}`);
}

const roleFile = roleArg.endsWith('.md') ? roleArg : `${roleArg}.md`;
const prompt = buildPrompt(roleFile);
const output = run(engine, prompt);
const prefix = phase === 'discover' ? 'discover' : phase === 'plan' ? 'plan' : phase === 'implement' ? 'impl' : phase;
const artifact = writeArtifact(prefix, output);
const state = loadState();
state.phase = phase;
state.activeRole = roleFile.replace('.md','');
state.status = 'running';
state.summary = `${phase} completed via role-runner`;
state.lastSuccessfulCheckpoint = phase;
state.recommendedIntervention = recommendIntervention(state);
saveState(state);
appendCheckpoint(HARNESS_DIR, { timestamp: new Date().toISOString(), phase, activeFeature: state.activeFeature || '', summary: state.summary, verdict: 'PASS' });
const event = buildPhaseEvent(phase, 'completed', `${phase} completed via role-runner`, { artifact, engine, role: roleFile });
appendNotification(HARNESS_DIR, event);
writeLatestNotification(HARNESS_DIR, event);
try { execSync(buildNotifierCommand(HARNESS_DIR, event.phase, event.status, event.summary), { cwd: PROJECT_ROOT, stdio: 'ignore' }); } catch {}
writeArtifact('status', JSON.stringify(summarizeStatus(state), null, 2));
console.log(JSON.stringify({ ok: true, phase, artifact, engine, role: roleFile }, null, 2));
