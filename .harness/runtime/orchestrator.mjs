#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync, symlinkSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { parseArgs } from 'util';
import { execSync } from 'child_process';
import { loadJson, saveJson, normalizeFailureSignature, updateFailureTracking, markProgress } from './state.mjs';
import { loadQualityGates, runQualityGates } from './gates.mjs';
import { loadAuditSpec, runAudit } from './audit.mjs';
import { runClaude } from './adapters/claude.mjs';
import { runCodex } from './adapters/codex.mjs';
import { runGemini } from './adapters/gemini.mjs';

const PROJECT_ROOT = resolve(process.cwd());
const HARNESS_DIR = join(PROJECT_ROOT, '.harness');
const ARTIFACTS_DIR = join(HARNESS_DIR, 'artifacts');

const { values: flags, positionals } = parseArgs({
  options: {
    template: { type: 'string', short: 't' },
    'dry-run': { type: 'boolean' },
    verbose: { type: 'boolean', short: 'v' },
  },
  strict: false,
  allowPositionals: true,
});

const TEMPLATE_PATH = flags.template || (positionals.length > 0 ? positionals[0] : null) || join(HARNESS_DIR, 'task_template.md');
const DRY_RUN = flags['dry-run'] || false;
const VERBOSE = flags.verbose || false;

function log(msg) { console.log(`[harness] ${msg}`); }
function debug(msg) { if (VERBOSE) console.log(`[debug] ${msg}`); }
function fail(msg) { console.error(`[fail] ${msg}`); }
function warn(msg) { console.log(`[warn] ${msg}`); }
function success(msg) { console.log(`[ok] ${msg}`); }

function parseYaml(text) {
  const result = {};
  const lines = text.split('\n');
  const stack = [{ indent: -1, obj: result }];
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.search(/\S/);
    const content = line.trim();
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1].obj;
    if (content.startsWith('- ')) {
      const val = content.slice(2).trim();
      const key = Object.keys(parent).pop();
      if (key && !Array.isArray(parent[key])) parent[key] = [];
      if (key) parent[key].push(val.replace(/^["']|["']$/g, ''));
    } else if (content.includes(':')) {
      const idx = content.indexOf(':');
      const key = content.slice(0, idx).trim();
      const val = content.slice(idx + 1).trim();
      if (val === '' || val === '|' || val === '>') {
        parent[key] = {};
        stack.push({ indent, obj: parent[key] });
      } else {
        let parsed = val.replace(/^["']|["']$/g, '');
        if (parsed === 'true') parsed = true;
        else if (parsed === 'false') parsed = false;
        else if (/^\d+$/.test(parsed)) parsed = parseInt(parsed, 10);
        parent[key] = parsed;
      }
    }
  }
  return result;
}

function readFile(path) {
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf-8');
}

function writeArtifact(prefix, timestamp, content) {
  const filename = `${prefix}-${timestamp}.md`;
  const filepath = join(ARTIFACTS_DIR, filename);
  writeFileSync(filepath, content, 'utf-8');
  const latestPath = join(ARTIFACTS_DIR, `${prefix}-latest.md`);
  try { unlinkSync(latestPath); } catch {}
  try { symlinkSync(filename, latestPath); } catch {}
  return filepath;
}

function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function loadConfig() {
  const configText = readFile(join(HARNESS_DIR, 'config.yaml'));
  return configText ? parseYaml(configText) : {};
}

function loadState() {
  return loadJson(join(HARNESS_DIR, 'session-state.json'), {
    taskId: '', status: 'idle', mode: '', phase: '', activeRole: '', activeFeature: '', iteration: 0, maxIterations: 3,
    lastGateResult: 'PENDING', lastReviewResult: 'PENDING', lastFailureSignature: '', sameFailureCount: 0,
    lastProgressAt: '', progressDelta: 0, stopCondition: '', blockers: [], agentSessions: {}, summary: '초기 상태',
  });
}

function saveState(state) {
  saveJson(join(HARNESS_DIR, 'session-state.json'), state);
}

function buildPrompt(roleFile, extras = {}) {
  const parts = [];
  const role = readFile(join(HARNESS_DIR, 'roles', roleFile));
  if (role) parts.push(role);
  const agents = readFile(join(PROJECT_ROOT, 'AGENTS.md'));
  if (agents) parts.push(`\n---\n## AGENTS.md\n${agents}`);
  const template = readFile(TEMPLATE_PATH);
  if (template) parts.push(`\n---\n## task_template.md\n${template}`);
  if (extras.plan) parts.push(`\n---\n## plan\n${extras.plan}`);
  if (extras.review) parts.push(`\n---\n## review\n${extras.review}`);
  if (extras.gate) parts.push(`\n---\n## gate\n${extras.gate}`);
  if (extras.learnings) parts.push(`\n---\n## learnings\n${extras.learnings}`);
  if (extras.diff) parts.push(`\n---\n## git diff\n\`\`\`diff\n${extras.diff}\n\`\`\``);
  if (extras.discovery) parts.push(`\n---\n## discovery\n${extras.discovery}`);
  return parts.join('\n');
}

function runAgent(agent, prompt) {
  if (agent === 'claude') return runClaude(prompt, { cwd: PROJECT_ROOT, dryRun: DRY_RUN });
  if (agent === 'codex') return runCodex(prompt, { cwd: PROJECT_ROOT, dryRun: DRY_RUN });
  if (agent === 'gemini') return runGemini(prompt, { cwd: PROJECT_ROOT, dryRun: DRY_RUN });
  throw new Error(`Unknown agent engine: ${agent}`);
}

function runDiscovery(config, timestamp) {
  const roleFile = config.agents?.explorer?.role_file || '.harness/roles/code-explorer.md';
  const engine = config.agents?.explorer?.engine || 'gemini';
  const prompt = buildPrompt(roleFile.split('/').pop());
  const output = runAgent(engine, prompt);
  writeArtifact('discover', timestamp, output);
  return output;
}

function runPlanning(config, timestamp, discovery) {
  const roleFile = config.agents?.planner?.role_file || '.harness/roles/planner.md';
  const engine = config.agents?.planner?.engine || 'gemini';
  const prompt = buildPrompt(roleFile.split('/').pop(), { discovery });
  const output = runAgent(engine, prompt);
  writeArtifact('plan', timestamp, output);
  return output;
}

function runImplementation(config, timestamp, plan, review = null, gate = null) {
  const roleFile = config.agents?.implementer?.role_file || '.harness/roles/implementer.md';
  const engine = config.agents?.implementer?.engine || 'claude';
  const learnings = readFile(join(HARNESS_DIR, 'learnings.md'));
  const prompt = buildPrompt(roleFile.split('/').pop(), { plan, review, gate, learnings });
  const output = runAgent(engine, prompt);
  writeArtifact('impl', timestamp, output);
  return output;
}

function runReview(config, timestamp, plan, gateOutput) {
  const roleFile = config.agents?.reviewer?.role_file || '.harness/roles/reviewer.md';
  const engine = config.agents?.reviewer?.engine || 'codex';
  let diff = '';
  try {
    diff = execSync('git diff -- . ":(exclude).harness"', { cwd: PROJECT_ROOT, encoding: 'utf-8' });
  } catch {
    diff = 'No diff';
  }
  const prompt = buildPrompt(roleFile.split('/').pop(), { plan, diff, gate: gateOutput });
  const output = runAgent(engine, prompt);
  writeArtifact('review', timestamp, output);
  return output;
}

function maybeRunOptimizer(config, timestamp, reviewOutput) {
  const roleFile = config.agents?.harness_optimizer?.role_file || '.harness/roles/harness-optimizer.md';
  const engine = config.agents?.harness_optimizer?.engine || 'claude';
  const prompt = buildPrompt(roleFile.split('/').pop(), { review: reviewOutput, learnings: readFile(join(HARNESS_DIR, 'learnings.md')) });
  const output = runAgent(engine, prompt);
  writeArtifact('optimize', timestamp, output);
  return output;
}

function maybeRunAnalyzer(config, timestamp, kind, reviewOutput, gateOutput) {
  const mapping = {
    silent: config.agents?.silent_failure_hunter,
    test: config.agents?.pr_test_analyzer,
  };
  const target = mapping[kind];
  if (!target?.role_file || !target?.engine) return null;
  const prompt = buildPrompt(target.role_file.split('/').pop(), { review: reviewOutput, gate: gateOutput, plan: readFile(join(ARTIFACTS_DIR, 'plan-latest.md')) });
  const output = runAgent(target.engine, prompt);
  writeArtifact(kind === 'silent' ? 'silent-failure' : 'test-analysis', timestamp, output);
  return output;
}

function extractVerdict(text) {
  if (!text) return DRY_RUN ? 'WARNING_ONLY' : 'FAIL';
  const direct = text.match(/(PASS|WARNING_ONLY|FAIL)/i);
  if (direct) return direct[1].toUpperCase();
  return DRY_RUN ? 'WARNING_ONLY' : 'FAIL';
}

async function main() {
  log('=== Harness Pipeline Orchestrator v3 ===');
  const config = loadConfig();
  const state = loadState();
  const timestamp = getTimestamp();

  state.taskId = state.taskId || `vibecoding-${timestamp}`;
  state.status = 'running';
  state.phase = 'audit';
  state.maxIterations = config.pipeline?.loop?.max_iterations || 3;
  saveState(state);

  const auditSpec = loadAuditSpec(join(HARNESS_DIR, 'audit-spec.json'));
  const auditResult = runAudit({ spec: auditSpec, projectRoot: PROJECT_ROOT, harnessDir: HARNESS_DIR });
  writeArtifact('audit', timestamp, JSON.stringify(auditResult, null, 2));
  if (auditResult.verdict !== 'PASS') {
    state.status = 'failed';
    state.stopCondition = 'audit-failed';
    state.summary = `Audit failed: ${auditResult.findings.join(', ')}`;
    saveState(state);
    fail(state.summary);
    process.exit(1);
  }
  success('Audit passed');
  saveState(markProgress({ ...state, phase: 'discover', activeRole: 'code-explorer' }, 'audit complete'));

  const discovery = runDiscovery(config, timestamp);
  let nextState = loadState();
  nextState = markProgress({ ...nextState, phase: 'plan', activeRole: 'planner' }, 'discovery complete');
  saveState(nextState);

  const plan = runPlanning(config, timestamp, discovery);
  nextState = loadState();
  nextState = markProgress({ ...nextState, phase: 'implement', activeRole: 'implementer' }, 'plan complete');
  saveState(nextState);

  let reviewOutput = null;
  let gateOutput = null;
  let verdict = 'FAIL';

  while ((loadState().iteration || 0) < (config.pipeline?.loop?.max_iterations || 3)) {
    let loopState = loadState();
    loopState.iteration = (loopState.iteration || 0) + 1;
    loopState.phase = 'implement';
    loopState.activeRole = 'implementer';
    saveState(loopState);

    runImplementation(config, getTimestamp(), plan, reviewOutput, gateOutput);

    loopState = loadState();
    loopState.phase = 'gate';
    loopState.activeRole = 'loop-operator';
    saveState(loopState);

    const gates = loadQualityGates(join(HARNESS_DIR, 'quality-gates.json'));
    const gateResult = runQualityGates({ gates, cwd: PROJECT_ROOT, dryRun: DRY_RUN });
    gateOutput = JSON.stringify(gateResult, null, 2);
    writeArtifact('gate', getTimestamp(), gateOutput);

    loopState.lastGateResult = gateResult.verdict;
    if (gateResult.verdict === 'PENDING') {
      loopState.status = 'paused';
      loopState.stopCondition = 'gate-commands-unconfigured';
      loopState.summary = 'quality gate commands are not configured yet';
      saveState(loopState);
      warn('Pausing because quality gate commands are not configured');
      process.exit(0);
    }
    if (gateResult.verdict === 'FAIL') {
      loopState = updateFailureTracking(loopState, normalizeFailureSignature(gateOutput));
      loopState.summary = 'quality gate failed';
      if ((loopState.sameFailureCount || 0) >= (config.pipeline?.loop?.max_same_failure || 2)) {
        maybeRunOptimizer(config, getTimestamp(), gateOutput);
        loopState.status = 'failed';
        loopState.stopCondition = 'same-gate-failure';
        saveState(loopState);
        fail('Stopping due to repeated gate failure');
        process.exit(1);
      }
      saveState(loopState);
      continue;
    }

    loopState.phase = 'review';
    loopState.activeRole = 'reviewer';
    saveState(loopState);

    reviewOutput = runReview(config, getTimestamp(), plan, gateOutput);
    verdict = extractVerdict(reviewOutput);
    loopState.lastReviewResult = verdict;
    loopState.summary = `review verdict: ${verdict}`;
    saveState(markProgress(loopState, loopState.summary));

    const reviewLower = String(reviewOutput || '').toLowerCase();
    if (reviewLower.includes('silent failure') || reviewLower.includes('swallowed') || reviewLower.includes('fake success')) {
      maybeRunAnalyzer(config, getTimestamp(), 'silent', reviewOutput, gateOutput);
    }
    if (reviewLower.includes('test coverage') || reviewLower.includes('regression coverage') || reviewLower.includes('misleading test')) {
      maybeRunAnalyzer(config, getTimestamp(), 'test', reviewOutput, gateOutput);
    }

    if (verdict === 'PASS' || verdict === 'WARNING_ONLY') break;

    const signature = normalizeFailureSignature(reviewOutput);
    loopState = updateFailureTracking(loadState(), signature);
    saveState(loopState);

    if ((loopState.sameFailureCount || 0) >= (config.pipeline?.loop?.max_same_failure || 2)) {
      maybeRunOptimizer(config, getTimestamp(), reviewOutput);
      loopState.status = 'failed';
      loopState.stopCondition = 'same-review-failure';
      saveState(loopState);
      fail('Stopping due to repeated review failure');
      process.exit(1);
    }
  }

  const finalState = loadState();
  finalState.status = verdict === 'PASS' || verdict === 'WARNING_ONLY' ? 'completed' : 'failed';
  finalState.phase = '';
  finalState.activeRole = '';
  finalState.summary = `pipeline finished with ${verdict}`;
  saveState(finalState);

  if (finalState.status === 'completed') success(finalState.summary);
  else fail(finalState.summary);
}

main().catch((error) => {
  fail(error.stack || error.message);
  process.exit(1);
});
