#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync, symlinkSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { parseArgs } from 'util';
import { execSync } from 'child_process';
import { loadJson, saveJson, normalizeFailureSignature, updateFailureTracking, markProgress } from './state.mjs';
import { appendCheckpoint } from './checkpoints.mjs';
import { recommendIntervention, summarizeStatus, autoAdvanceEnabled } from './status.mjs';
import { requiresApproval } from './approval-gates.mjs';
import { appendNotification, writeLatestNotification, buildPhaseEvent, buildNotifierCommand } from './notifications.mjs';
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

// Read-only tools for discovery/planning phases (ECC pattern: --allowedTools restriction)
const READ_ONLY_TOOLS = ['Read', 'Grep', 'Glob', 'Bash'];
// Protected config files that agents must not modify (ECC pattern: config-protection)
const PROTECTED_CONFIGS = [
  '.eslintrc', '.eslintrc.js', '.eslintrc.json', '.eslintrc.yml',
  '.prettierrc', '.prettierrc.js', '.prettierrc.json', '.prettierrc.yml',
  'tsconfig.json', 'jest.config.js', 'jest.config.ts', 'vitest.config.ts',
  '.harness/config.yaml', '.harness/quality-gates.json',
  'AGENTS.md', 'GEMINI.md', '.claude/CLAUDE.md',
];

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


function extractMachineSignal(text, key) {
  const re = new RegExp(`${key}:\\s*([^\\n]+)`, 'i');
  const m = String(text || '').match(re);
  return m ? m[1].trim() : '';
}

function dryRunOutput(roleName) {
  const outputs = {
    'code-explorer.md': '# Discovery\n\n## Machine Signals\nverdict: PASS\nescalate: none\nreason: discovery-complete\n',
    'planner.md': '# Plan\n\n## Machine Signals\nverdict: PASS\nescalate: none\nreason: plan-complete\n',
    'implementer.md': '# Implementation Log\n\n## Machine Signals\nverdict: PASS\nescalate: none\nreason: impl-complete\n',
    'reviewer.md': '# Code Review Report\n\n## Machine Signals\nverdict: WARNING_ONLY\nescalate: none\nreason: dry-run-review\n',
    'silent-failure-hunter.md': '# Silent Failure Analysis\n\n## Machine Signals\nverdict: NOT_CONFIRMED\nreason: dry-run\n',
    'pr-test-analyzer.md': '# Test Analysis\n\n## Machine Signals\nverdict: SUFFICIENT\nreason: dry-run\n',
    'harness-optimizer.md': '# Optimization\n\n## Machine Signals\npromote_to: learning\nreason: dry-run\n',
    'council.md': '# Council\n\n## Machine Signals\nverdict: PASS\nescalate: none\nreason: dry-run-council\n',
  };
  return outputs[roleName] || `# Dry Run\n\n## Machine Signals\nverdict: PASS\nescalate: none\nreason: dry-run-${roleName}`;
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
    budgetUsed: { durationMs: 0, agentCalls: 0 },
  });
}

function saveState(state) {
  saveJson(join(HARNESS_DIR, 'session-state.json'), state);
}

function stripForClaude(text) {
  if (!text) return '';
  return String(text)
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/```[\w\s]*\n[\s\S]*?```/g, '[code]')
    .replace(/`[^`]+`/g, (m) => m.replace(/[./\\]/g, ''))
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildRoleLabel(roleFile) {
  const name = roleFile.replace('.md','').replace('code-','').replace('-',' ');
  return name;
}

function buildPrompt(roleFile, extras = {}) {
  const template = readFile(TEMPLATE_PATH) || '';
  const role = readFile(join(HARNESS_DIR, 'roles', roleFile)) || '';
  const parts = [`You are the ${buildRoleLabel(roleFile)} for this project. Perform your role.`];
  parts.push('PROJECT CONTEXT: ' + stripForClaude(template));
  if (extras.discovery) parts.push('DISCOVERY: ' + stripForClaude(extras.discovery));
  if (extras.plan) parts.push('PLAN: ' + stripForClaude(extras.plan));
  if (extras.review) parts.push('REVIEW: ' + stripForClaude(extras.review));
  if (extras.gate) parts.push('GATE: ' + stripForClaude(extras.gate));
  if (extras.diff) parts.push('DIFF: ' + stripForClaude(extras.diff));
  parts.push('ROLE SPEC: ' + stripForClaude(role));
  return parts.join('\n\n');
}

// --- Budget tracking ---

function loadBudgetConfig(config) {
  return {
    maxDurationMs: (config.budget?.max_duration_minutes || 60) * 60_000,
    maxAgentCalls: config.budget?.max_agent_calls || 20,
    agentTimeoutMs: (config.budget?.agent_timeout_seconds || 600) * 1000,
    inactivityMs: (config.budget?.inactivity_timeout_seconds || 120) * 1000,
  };
}

function trackAgentCall(state, durationMs) {
  const budget = state.budgetUsed || { durationMs: 0, agentCalls: 0 };
  budget.durationMs += durationMs;
  budget.agentCalls += 1;
  state.budgetUsed = budget;
  return state;
}

function isBudgetExhausted(state, budgetConfig) {
  const budget = state.budgetUsed || { durationMs: 0, agentCalls: 0 };
  if (budget.durationMs >= budgetConfig.maxDurationMs) return `total duration ${Math.round(budget.durationMs / 60000)}m exceeds ${Math.round(budgetConfig.maxDurationMs / 60000)}m limit`;
  if (budget.agentCalls >= budgetConfig.maxAgentCalls) return `${budget.agentCalls} agent calls reached ${budgetConfig.maxAgentCalls} limit`;
  return null;
}

// --- Config protection ---

function checkConfigProtection(cwd) {
  try {
    const diff = execSync('git diff --name-only', { cwd, encoding: 'utf-8' });
    const staged = execSync('git diff --cached --name-only', { cwd, encoding: 'utf-8' });
    const changed = (diff + '\n' + staged).split('\n').map(f => f.trim()).filter(Boolean);
    const violations = changed.filter(f => PROTECTED_CONFIGS.some(p => f === p || f.endsWith('/' + p)));
    return violations;
  } catch {
    return [];
  }
}

// --- No-progress timeout enforcement ---

function isNoProgressTimeout(state, config) {
  const timeoutMin = config.pipeline?.loop?.no_progress_timeout_minutes || 15;
  if (!state.lastProgressAt) return false;
  const elapsed = Date.now() - new Date(state.lastProgressAt).getTime();
  return elapsed > timeoutMin * 60_000;
}

// --- Agent execution with streaming ---

async function runAgent(agent, prompt, roleName = '', opts = {}) {
  if (DRY_RUN) return dryRunOutput(roleName);
  const callOpts = {
    cwd: opts.cwd || PROJECT_ROOT,
    dryRun: false,
    artifactPath: opts.artifactPath || null,
    timeoutMs: opts.timeoutMs || 600_000,
    inactivityMs: opts.inactivityMs || 120_000,
    onHeartbeat: (info) => {
      debug(`[heartbeat] ${agent}/${roleName}: ${Math.round(info.elapsed / 1000)}s elapsed, ${info.outputBytes} bytes, idle ${Math.round(info.lastOutputAge / 1000)}s`);
      sendHeartbeat(roleName.replace('.md', ''), `running ${Math.round(info.elapsed / 1000)}s, ${info.outputBytes} bytes output`);
    },
    onStall: (info) => {
      warn(`[stall] ${agent}/${roleName}: no output for ${Math.round(info.lastOutputAge / 1000)}s`);
      sendPhase(HARNESS_DIR, roleName.replace('.md', ''), 'stalled', `CLI stall detected: no output for ${Math.round(info.lastOutputAge / 1000)}s`);
    },
  };

  // Pass --allowedTools for read-only roles (ECC pattern)
  if (opts.allowedTools && agent === 'claude') {
    callOpts.allowedTools = opts.allowedTools;
  }

  if (agent === 'claude') return runClaude(prompt, callOpts);
  if (agent === 'codex') return runCodex(prompt, callOpts);
  if (agent === 'gemini') return runGemini(prompt, callOpts);
  throw new Error(`Unknown agent engine: ${agent}`);
}

async function runDiscovery(config, timestamp, budgetConfig) {
  const roleFile = config.agents?.explorer?.role_file || '.harness/roles/code-explorer.md';
  const engine = config.agents?.explorer?.engine || 'claude';
  const prompt = buildPrompt(roleFile.split('/').pop());
  const roleName = roleFile.split('/').pop();
  const forceDryRun = Boolean(config.agents?.explorer?.force_dry_run);
  const output = forceDryRun ? dryRunOutput(roleName) : await withFallback(engine, 'claude', (selected) => runAgent(selected, prompt, roleName, {
    artifactPath: join(ARTIFACTS_DIR, `discover-stream-${timestamp}.log`),
    timeoutMs: budgetConfig.agentTimeoutMs,
    inactivityMs: budgetConfig.inactivityMs,
    allowedTools: READ_ONLY_TOOLS,
  }), (_error, fb) => sendHeartbeat('discover', `fallback to ${fb}`));
  writeArtifact('discover', timestamp, output);
  return output;
}

async function runPlanning(config, timestamp, discovery, budgetConfig) {
  const roleFile = config.agents?.planner?.role_file || '.harness/roles/planner.md';
  const engine = config.agents?.planner?.engine || 'claude';
  const prompt = buildPrompt(roleFile.split('/').pop(), { discovery });
  const roleName = roleFile.split('/').pop();
  const forceDryRun = Boolean(config.agents?.planner?.force_dry_run);
  const output = forceDryRun ? dryRunOutput(roleName) : await withFallback(engine, 'claude', (selected) => runAgent(selected, prompt, roleName, {
    artifactPath: join(ARTIFACTS_DIR, `plan-stream-${timestamp}.log`),
    timeoutMs: budgetConfig.agentTimeoutMs,
    inactivityMs: budgetConfig.inactivityMs,
    allowedTools: READ_ONLY_TOOLS,
  }), (_error, fb) => sendHeartbeat('plan', `fallback to ${fb}`));
  writeArtifact('plan', timestamp, output);
  return output;
}

async function runImplementation(config, timestamp, plan, budgetConfig, review = null, gate = null) {
  const roleFile = config.agents?.implementer?.role_file || '.harness/roles/implementer.md';
  const engine = config.agents?.implementer?.engine || 'claude';
  const learnings = readFile(join(HARNESS_DIR, 'learnings.md'));
  const prompt = buildPrompt(roleFile.split('/').pop(), { plan, review, gate, learnings });
  const roleName = roleFile.split('/').pop();
  const output = await runAgent(engine, prompt, roleName, {
    artifactPath: join(ARTIFACTS_DIR, `impl-stream-${timestamp}.log`),
    timeoutMs: budgetConfig.agentTimeoutMs,
    inactivityMs: budgetConfig.inactivityMs,
  });
  writeArtifact('impl', timestamp, output);
  return output;
}

async function runReview(config, timestamp, plan, gateOutput, budgetConfig) {
  const roleFile = config.agents?.reviewer?.role_file || '.harness/roles/reviewer.md';
  const engine = config.agents?.reviewer?.engine || 'codex';
  let diff = '';
  try {
    diff = execSync('git diff -- . ":(exclude).harness"', { cwd: PROJECT_ROOT, encoding: 'utf-8' });
  } catch {
    diff = 'No diff';
  }
  const prompt = buildPrompt(roleFile.split('/').pop(), { plan, diff, gate: gateOutput });
  const roleName = roleFile.split('/').pop();
  const output = await runAgent(engine, prompt, roleName, {
    artifactPath: join(ARTIFACTS_DIR, `review-stream-${timestamp}.log`),
    timeoutMs: budgetConfig.agentTimeoutMs,
    inactivityMs: budgetConfig.inactivityMs,
    allowedTools: READ_ONLY_TOOLS,
  });
  writeArtifact('review', timestamp, output);
  return output;
}

async function maybeRunOptimizer(config, timestamp, reviewOutput, budgetConfig) {
  const roleFile = config.agents?.harness_optimizer?.role_file || '.harness/roles/harness-optimizer.md';
  const engine = config.agents?.harness_optimizer?.engine || 'claude';
  const prompt = buildPrompt(roleFile.split('/').pop(), { review: reviewOutput, learnings: readFile(join(HARNESS_DIR, 'learnings.md')) });
  const roleName = roleFile.split('/').pop();
  const output = await runAgent(engine, prompt, roleName, {
    artifactPath: join(ARTIFACTS_DIR, `optimize-stream-${timestamp}.log`),
    timeoutMs: budgetConfig.agentTimeoutMs,
    inactivityMs: budgetConfig.inactivityMs,
  });
  writeArtifact('optimize', timestamp, output);
  return output;
}

function shouldInvokeCouncil(config, state, reviewOutput = '') {
  const summary = String(reviewOutput || '').toLowerCase() + ' ' + String(state.summary || '').toLowerCase();
  return summary.includes('ambiguous') || summary.includes('unclear scope') || summary.includes('route decision');
}

async function maybeRunCouncil(config, timestamp, state, reviewOutput = '', budgetConfig = {}) {
  const target = { role_file: '.harness/roles/council.md', engine: config.agents?.architect?.engine || 'gemini' };
  const prompt = buildPrompt(target.role_file.split('/').pop(), { review: reviewOutput, learnings: readFile(join(HARNESS_DIR, 'learnings.md')) });
  const roleName = target.role_file.split('/').pop();
  const output = await runAgent(target.engine, prompt, roleName, {
    timeoutMs: budgetConfig.agentTimeoutMs || 600_000,
    inactivityMs: budgetConfig.inactivityMs || 120_000,
  });
  writeArtifact('council', timestamp, output);
  return output;
}

async function maybeRunAnalyzer(config, timestamp, kind, reviewOutput, gateOutput, budgetConfig = {}) {
  const mapping = {
    silent: config.agents?.silent_failure_hunter,
    test: config.agents?.pr_test_analyzer,
  };
  const target = mapping[kind];
  if (!target?.role_file || !target?.engine) return null;
  const prompt = buildPrompt(target.role_file.split('/').pop(), { review: reviewOutput, gate: gateOutput, plan: readFile(join(ARTIFACTS_DIR, 'plan-latest.md')), learnings: readFile(join(HARNESS_DIR, 'learnings.md')) });
  const roleName = target.role_file.split('/').pop();
  const output = await runAgent(target.engine, prompt, roleName, {
    timeoutMs: budgetConfig.agentTimeoutMs || 600_000,
    inactivityMs: budgetConfig.inactivityMs || 120_000,
  });
  writeArtifact(kind === 'silent' ? 'silent-failure' : 'test-analysis', timestamp, output);
  return output;
}



function appendLearningRecord(kind, reason, sourceText = '') {
  const path = join(HARNESS_DIR, 'learnings.md');
  const line = `- [${kind}] ${reason}: ${String(sourceText || '').slice(0, 180).replace(/\n/g, ' ')}\n`;
  try {
    const prev = readFile(path) || '# Learnings\n\n';
    writeFileSync(path, prev + line, 'utf-8');
  } catch {}
}

function promotePatternOrInstinct(reviewOutput, count) {
  if ((count || 0) >= 3) {
    appendInstinctCandidate(reviewOutput);
    appendLearningRecord('instinct-candidate', 'repeated failure reached instinct threshold', reviewOutput);
  } else if ((count || 0) >= 2) {
    appendLearningRecord('pattern-candidate', 'repeated failure reached pattern threshold', reviewOutput);
  }
}

function appendInstinctCandidate(reviewOutput) {
  const instinctsDir = join(HARNESS_DIR, 'instincts');
  const path = join(instinctsDir, 'auto-candidates.md');
  const note = String(reviewOutput || '').slice(0, 300).replace(/\n/g, ' ');
  const entry = `\n## ${new Date().toISOString()}\n- source: review\n- note: ${note}\n`;
  try {
    const prev = existsSync(path) ? readFile(path) || '' : '';
    writeFileSync(path, prev + entry, 'utf-8');
  } catch {}
}


function sendPhase(harnessDir, phase, status, summary) {
  const event = buildPhaseEvent(phase, status, summary);
  appendNotification(harnessDir, event);
  writeLatestNotification(harnessDir, event);
  try { execSync(buildNotifierCommand(harnessDir, event.phase, event.status, event.summary), { cwd: PROJECT_ROOT, stdio: 'ignore', timeout: 15000 }); } catch {}
}

function sendHeartbeat(phase, summary) {
  sendPhase(HARNESS_DIR, phase, 'heartbeat', summary);
}

async function withFallback(primary, fallback, work, onFallback) {
  try {
    return await work(primary);
  } catch (error) {
    if (!fallback || fallback === primary) throw error;
    onFallback?.(error, fallback);
    return await work(fallback);
  }
}

function extractVerdict(text) {
  const machine = extractMachineSignal(text, 'verdict');
  if (machine) return machine.toUpperCase();
  if (!text) return DRY_RUN ? 'WARNING_ONLY' : 'FAIL';
  const direct = text.match(/(PASS|WARNING_ONLY|FAIL)/i);
  if (direct) return direct[1].toUpperCase();
  return DRY_RUN ? 'WARNING_ONLY' : 'FAIL';
}

async function main() {
  log('=== Harness Pipeline Orchestrator v3.1 ===');
  const config = loadConfig();
  const state = loadState();
  const timestamp = getTimestamp();
  const budgetConfig = loadBudgetConfig(config);

  state.taskId = state.taskId || `vibecoding-${timestamp}`;
  state.status = 'running';
  state.phase = 'audit';
  state.maxIterations = config.pipeline?.loop?.max_iterations || 3;
  state.budgetUsed = state.budgetUsed || { durationMs: 0, agentCalls: 0 };
  saveState(state);
  sendPhase(HARNESS_DIR, 'intake', 'completed', 'project initialized, moving to audit');

  const auditSpec = loadAuditSpec(join(HARNESS_DIR, 'audit-spec.json'));
  const auditResult = runAudit({ spec: auditSpec, projectRoot: PROJECT_ROOT, harnessDir: HARNESS_DIR });
  writeArtifact('audit', timestamp, JSON.stringify(auditResult, null, 2));
  sendPhase(HARNESS_DIR, 'audit', auditResult.verdict === 'PASS' ? 'completed' : 'failed', auditResult.verdict === 'PASS' ? 'Audit passed' : `Audit failed: ${(auditResult.top_actions || []).join('; ')}`);
  debug(`audit verdict=${auditResult.verdict}`);
  if (auditResult.verdict !== 'PASS') {
    state.status = 'failed';
    state.stopCondition = 'audit-failed';
    state.summary = `Audit failed: ${auditResult.findings.join(', ')}`;
    saveState(state);
    fail(state.summary);
    process.exit(1);
  }
  success('Audit passed');
  const audited = markProgress({ ...state, phase: 'discover', activeRole: 'code-explorer' }, 'audit complete');
  audited.lastSuccessfulCheckpoint = 'audit';
  audited.recommendedIntervention = recommendIntervention(audited);
  saveState(audited);
  appendCheckpoint(HARNESS_DIR, { timestamp: new Date().toISOString(), phase: 'audit', activeFeature: '', summary: 'audit complete', verdict: 'PASS' });

  sendPhase(HARNESS_DIR, 'discover', 'started', 'starting discovery');
  sendHeartbeat('discover', 'discovery running');

  const mode = loadState().mode || config.project?.mode || '';
  const rawMode = String(mode || '').toLowerCase();
  const mustDiscover = !['resume', 'resumed'].includes(rawMode);
  const discovery = mustDiscover ? await runDiscovery(config, timestamp, budgetConfig) : '';

  // Track budget after discovery
  let currentState = loadState();
  currentState = trackAgentCall(currentState, 0); // duration tracked inside adapter
  saveState(currentState);

  sendPhase(HARNESS_DIR, 'discover', 'completed', 'discovery completed');
  let nextState = loadState();
  nextState = markProgress({ ...nextState, phase: 'plan', activeRole: 'planner' }, 'discovery complete');
  saveState(nextState);
  sendPhase(HARNESS_DIR, 'plan', 'started', 'starting planning');
  sendHeartbeat('plan', 'planning running');

  const plan = await runPlanning(config, timestamp, discovery, budgetConfig);
  const planVerdict = extractVerdict(plan);
  debug(`plan verdict=${planVerdict}`);
  nextState = loadState();
  nextState = trackAgentCall(nextState, 0);

  // --- Plan verdict gate: FAIL must not advance to plan-approved ---
  if (planVerdict === 'FAIL') {
    const reason = extractMachineSignal(plan, 'reason') || 'plan-failed';
    sendPhase(HARNESS_DIR, 'plan', 'failed', `Planning failed: ${reason}`);
    nextState.status = 'paused';
    nextState.phase = 'plan';
    nextState.activeRole = 'planner';
    nextState.stopCondition = reason;
    nextState.summary = `Planning failed: ${reason}`;
    nextState.recommendedIntervention = recommendIntervention(nextState);
    saveState(nextState);
    const failEvent = buildPhaseEvent('plan', 'failed', nextState.summary, {
      planVerdict,
      planBody: String(plan || ''),
    });
    appendNotification(HARNESS_DIR, failEvent);
    writeLatestNotification(HARNESS_DIR, failEvent);
    try { execSync(buildNotifierCommand(HARNESS_DIR, failEvent.phase, failEvent.status, failEvent.summary), { cwd: PROJECT_ROOT, stdio: 'ignore', timeout: 15000 }); } catch {}
    error(nextState.summary);
    process.exit(1);
  }

  sendPhase(HARNESS_DIR, 'plan', 'completed', 'Planning completed');
  nextState = markProgress({ ...nextState, phase: 'plan', activeRole: 'planner' }, 'plan complete');
  nextState.lastSuccessfulCheckpoint = 'plan';
  nextState.recommendedIntervention = recommendIntervention(nextState);
  appendCheckpoint(HARNESS_DIR, { timestamp: new Date().toISOString(), phase: 'plan', activeFeature: '', summary: 'plan complete', verdict: planVerdict });
  saveState(nextState);

  const implementApproval = requiresApproval(loadState(), 'implement');
  if (implementApproval.required || !autoAdvanceEnabled(config)) {
    const finalState = loadState();
    finalState.status = 'paused';
    finalState.phase = 'implement';
    finalState.activeRole = 'implementer';
    finalState.stopCondition = implementApproval.gate || 'auto-advance-disabled';
    finalState.summary = implementApproval.required ? `paused for ${implementApproval.gate}` : 'paused because auto advance is disabled';
    finalState.recommendedIntervention = implementApproval.required ? `await ${implementApproval.gate}` : 'continue';
    saveState(finalState);
    const finalStatus = summarizeStatus(finalState);
    writeArtifact('status', getTimestamp(), JSON.stringify(finalStatus, null, 2));
    const approvalEvent = buildPhaseEvent('implement', 'paused', finalState.summary, {
      approvalGate: implementApproval.gate || 'unknown',
      planBody: String(plan || ''),
    });
    appendNotification(HARNESS_DIR, approvalEvent);
    writeLatestNotification(HARNESS_DIR, approvalEvent);
    try { execSync(buildNotifierCommand(HARNESS_DIR, approvalEvent.phase, approvalEvent.status, approvalEvent.summary), { cwd: PROJECT_ROOT, stdio: 'ignore', timeout: 15000 }); } catch {}
    success(finalState.summary);
    process.exit(0);
  }

  nextState = markProgress({ ...loadState(), phase: 'implement', activeRole: 'implementer' }, 'moving to implement');
  saveState(nextState);

  let reviewOutput = null;
  let gateOutput = null;
  let verdict = DRY_RUN ? 'WARNING_ONLY' : 'FAIL';

  while ((loadState().iteration || 0) < (config.pipeline?.loop?.max_iterations || 3)) {
    let loopState = loadState();

    // --- Budget exhaustion check ---
    const budgetExhausted = isBudgetExhausted(loopState, budgetConfig);
    if (budgetExhausted) {
      loopState.status = 'paused';
      loopState.stopCondition = 'budget-exhausted';
      loopState.summary = `Budget exhausted: ${budgetExhausted}`;
      loopState.recommendedIntervention = 'stop and request human decision';
      saveState(loopState);
      sendPhase(HARNESS_DIR, 'implement', 'paused', loopState.summary);
      warn(loopState.summary);
      process.exit(0);
    }

    // --- No-progress timeout check ---
    if (isNoProgressTimeout(loopState, config)) {
      loopState.status = 'paused';
      loopState.stopCondition = 'no-progress-timeout';
      loopState.summary = `No progress for ${config.pipeline?.loop?.no_progress_timeout_minutes || 15} minutes`;
      loopState.recommendedIntervention = 'stop and request human decision';
      saveState(loopState);
      sendPhase(HARNESS_DIR, 'implement', 'paused', loopState.summary);
      warn(loopState.summary);
      process.exit(0);
    }

    loopState.iteration = (loopState.iteration || 0) + 1;
    loopState.phase = 'implement';
    loopState.activeRole = 'implementer';
    debug(`loop iteration=${loopState.iteration}`);
    saveState(loopState);

    const implOutput = await runImplementation(config, getTimestamp(), plan, budgetConfig, reviewOutput, gateOutput);
    loopState = trackAgentCall(loadState(), 0);
    saveState(loopState);

    // --- Config protection check (ECC pattern) ---
    const violations = checkConfigProtection(PROJECT_ROOT);
    if (violations.length > 0) {
      warn(`Config protection violation: agent modified ${violations.join(', ')}. Reverting.`);
      for (const file of violations) {
        try { execSync(`git checkout -- "${file}"`, { cwd: PROJECT_ROOT, encoding: 'utf-8' }); } catch {}
      }
      appendLearningRecord('config-violation', `agent modified protected config: ${violations.join(', ')}`, implOutput);
      sendPhase(HARNESS_DIR, 'implement', 'warning', `Protected config reverted: ${violations.join(', ')}`);
    }

    const implEvent = buildPhaseEvent('implement', 'completed', 'Implementation step finished', { iteration: loopState.iteration, verdict: extractVerdict(implOutput) });
    appendNotification(HARNESS_DIR, implEvent);
    writeLatestNotification(HARNESS_DIR, implEvent);
    try { execSync(buildNotifierCommand(HARNESS_DIR, implEvent.phase, implEvent.status, implEvent.summary), { cwd: PROJECT_ROOT, stdio: 'ignore', timeout: 15000 }); } catch {}
    debug(`impl verdict=${extractVerdict(implOutput)}`);

    loopState = loadState();
    loopState.phase = 'gate';
    loopState.activeRole = 'loop-operator';
    saveState(loopState);

    const gates = loadQualityGates(join(HARNESS_DIR, 'quality-gates.json'));
    const gateResult = runQualityGates({ gates, cwd: PROJECT_ROOT, dryRun: DRY_RUN });
    debug(`gate verdict=${gateResult.verdict}`);
    const routing = config.pipeline?.role_routing || {};
    gateOutput = JSON.stringify(gateResult, null, 2);
    writeArtifact('gate', getTimestamp(), gateOutput);
    const gateEvent = buildPhaseEvent('gate', gateResult.verdict === 'FAIL' ? 'failed' : gateResult.verdict === 'PENDING' ? 'paused' : 'completed', `Gate ${gateResult.verdict}`, { verdict: gateResult.verdict });
    appendNotification(HARNESS_DIR, gateEvent);
    writeLatestNotification(HARNESS_DIR, gateEvent);
    try { execSync(buildNotifierCommand(HARNESS_DIR, gateEvent.phase, gateEvent.status, gateEvent.summary), { cwd: PROJECT_ROOT, stdio: 'ignore', timeout: 15000 }); } catch {}

    loopState.lastGateResult = gateResult.verdict;
    if (gateResult.verdict === 'PENDING') {
      loopState.status = 'paused';
      loopState.stopCondition = 'gate-commands-unconfigured';
      loopState.summary = 'quality gate commands are not configured yet';
      loopState.recommendedIntervention = recommendIntervention(loopState);
      saveState(loopState);
      warn('Pausing because quality gate commands are not configured');
      process.exit(0);
    }
    if (gateResult.verdict === 'FAIL') {
      loopState = updateFailureTracking(loopState, normalizeFailureSignature(gateOutput));
      loopState.summary = 'quality gate failed';
      if ((loopState.sameFailureCount || 0) >= (config.pipeline?.loop?.max_same_failure || 2)) {
        appendLearningRecord('gate-fail', 'repeated gate failure', gateOutput);
        await maybeRunOptimizer(config, getTimestamp(), gateOutput, budgetConfig);
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

    reviewOutput = await runReview(config, getTimestamp(), plan, gateOutput, budgetConfig);
    loopState = trackAgentCall(loadState(), 0);

    const reviewEvent = buildPhaseEvent('review', 'completed', 'Review finished', { verdict: extractVerdict(reviewOutput) });
    appendNotification(HARNESS_DIR, reviewEvent);
    writeLatestNotification(HARNESS_DIR, reviewEvent);
    try { execSync(buildNotifierCommand(HARNESS_DIR, reviewEvent.phase, reviewEvent.status, reviewEvent.summary), { cwd: PROJECT_ROOT, stdio: 'ignore', timeout: 15000 }); } catch {}
    debug(`review raw=${JSON.stringify(reviewOutput)}`);
    verdict = extractVerdict(reviewOutput);
    loopState.lastReviewResult = verdict;
    loopState.summary = `review verdict: ${verdict}`;
    loopState.recommendedIntervention = recommendIntervention(loopState);
    const reviewed = markProgress(loopState, loopState.summary);
    if (verdict === 'PASS' || verdict === 'WARNING_ONLY') {
      reviewed.lastSuccessfulCheckpoint = 'review';
      appendCheckpoint(HARNESS_DIR, { timestamp: new Date().toISOString(), phase: 'review', activeFeature: reviewed.activeFeature || '', summary: reviewed.summary, verdict });
    }
    saveState(reviewed);

    const reviewLower = String(reviewOutput || '').toLowerCase();
    const escalateSignal = extractMachineSignal(reviewOutput, 'escalate').toLowerCase();
    if (routing.hidden_failure_requires && (escalateSignal === 'silent_failure_hunter' || reviewLower.includes('silent failure') || reviewLower.includes('swallowed') || reviewLower.includes('fake success'))) {
      await maybeRunAnalyzer(config, getTimestamp(), 'silent', reviewOutput, gateOutput, budgetConfig);
    }
    if (routing.weak_test_signal_requires && (escalateSignal === 'pr_test_analyzer' || reviewLower.includes('test coverage') || reviewLower.includes('regression coverage') || reviewLower.includes('misleading test'))) {
      await maybeRunAnalyzer(config, getTimestamp(), 'test', reviewOutput, gateOutput, budgetConfig);
    }
    if (escalateSignal === 'council') {
      await maybeRunCouncil(config, getTimestamp(), loopState, reviewOutput, budgetConfig);
    }

    if (verdict === 'PASS' || verdict === 'WARNING_ONLY') break;

    const signature = normalizeFailureSignature(reviewOutput);
    loopState = updateFailureTracking(loadState(), signature);
    saveState(loopState);

    if (shouldInvokeCouncil(config, loopState, reviewOutput)) {
      await maybeRunCouncil(config, getTimestamp(), loopState, reviewOutput, budgetConfig);
    }

    if ((loopState.sameFailureCount || 0) >= (config.pipeline?.loop?.max_same_failure || 2)) {
      promotePatternOrInstinct(reviewOutput, loopState.sameFailureCount || 0);
      await maybeRunOptimizer(config, getTimestamp(), reviewOutput, budgetConfig);
      loopState.status = 'failed';
      loopState.stopCondition = 'same-review-failure';
      saveState(loopState);
      fail('Stopping due to repeated review failure');
      process.exit(1);
    }
  }

  const finalState = loadState();
  const effectiveVerdict = verdict || (DRY_RUN ? 'WARNING_ONLY' : 'FAIL');
  finalState.status = effectiveVerdict === 'PASS' || effectiveVerdict === 'WARNING_ONLY' ? 'completed' : 'failed';
  finalState.phase = '';
  finalState.activeRole = '';
  finalState.summary = `pipeline finished with ${effectiveVerdict}`;
  finalState.recommendedIntervention = recommendIntervention(finalState);
  saveState(finalState);
  const finalStatus = summarizeStatus(finalState);
  writeArtifact('status', getTimestamp(), JSON.stringify(finalStatus, null, 2));
  const finalEvent = buildPhaseEvent('final', finalState.status, finalState.summary, finalStatus);
  appendNotification(HARNESS_DIR, finalEvent);
  writeLatestNotification(HARNESS_DIR, finalEvent);
  try { execSync(buildNotifierCommand(HARNESS_DIR, finalEvent.phase, finalEvent.status, finalEvent.summary), { cwd: PROJECT_ROOT, stdio: 'ignore', timeout: 15000 }); } catch {}

  debug(`final verdict=${effectiveVerdict}`);
  debug(`final status=${finalState.status}`);
  if (finalState.status === 'completed') success(finalState.summary);
  else fail(finalState.summary);
}

main().catch((error) => {
  fail(error.stack || error.message);
  try {
    const crashState = loadState();
    crashState.status = 'failed';
    crashState.stopCondition = 'unhandled-error';
    crashState.summary = `crash: ${String(error.message || error).slice(0, 200)}`;
    crashState.recommendedIntervention = 'stop and request human decision';
    saveState(crashState);
    sendPhase(HARNESS_DIR, crashState.phase || 'unknown', 'failed', crashState.summary);
  } catch (stateError) {
    fail(`failed to persist crash state: ${stateError.message}`);
  }
  process.exit(1);
});
