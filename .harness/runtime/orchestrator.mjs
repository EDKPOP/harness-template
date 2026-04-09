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
  const re = new RegExp(`${key}:\s*([^\n]+)`, 'i');
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
  });
}

function saveState(state) {
  saveJson(join(HARNESS_DIR, 'session-state.json'), state);
}

function buildPrompt(roleFile, extras = {}) {
  const sysParts = [];
  const userParts = [];
  const role = readFile(join(HARNESS_DIR, 'roles', roleFile));
  if (role) sysParts.push(role);
  const agents = readFile(join(PROJECT_ROOT, 'AGENTS.md'));
  if (agents) sysParts.push(`\n---\n## AGENTS.md\n${agents}`);
  if (extras.learnings) sysParts.push(`\n---\n## learnings\n${extras.learnings}`);
  const template = readFile(TEMPLATE_PATH);
  if (template) userParts.push(`## task_template.md\n${template}`);
  if (extras.plan) userParts.push(`## plan\n${extras.plan}`);
  if (extras.review) userParts.push(`## review\n${extras.review}`);
  if (extras.gate) userParts.push(`## gate\n${extras.gate}`);
  if (extras.diff) userParts.push(`## git diff\n\`\`\`diff\n${extras.diff}\n\`\`\``);
  if (extras.discovery) userParts.push(`## discovery\n${extras.discovery}`);
  userParts.push("Please perform your role now based on the context above.");
  const system = sysParts.join('\n');
  const user = userParts.join('\n\n');
  return system + '\n---USER---\n' + user;
}

function runClaudeRole(roleName, prompt) {
  const agentName = String(roleName || '').replace('.md', '');
  return runClaude(prompt, { cwd: PROJECT_ROOT, dryRun: false });
}

async function runAgent(agent, prompt, roleName = '') {
  if (DRY_RUN) return dryRunOutput(roleName);
  if (agent === 'claude') return runClaude(prompt, { cwd: PROJECT_ROOT, dryRun: false });
  if (agent === 'codex') return runCodex(prompt, { cwd: PROJECT_ROOT, dryRun: false });
  if (agent === 'gemini') return runGemini(prompt, { cwd: PROJECT_ROOT, dryRun: false });
  throw new Error(`Unknown agent engine: ${agent}`);
}

async function runDiscovery(config, timestamp) {
  const roleFile = config.agents?.explorer?.role_file || '.harness/roles/code-explorer.md';
  const engine = config.agents?.explorer?.engine || 'claude';
  const prompt = buildPrompt(roleFile.split('/').pop());
  const roleName = roleFile.split('/').pop();
  const forceDryRun = Boolean(config.agents?.explorer?.force_dry_run);
  const output = forceDryRun ? dryRunOutput(roleName) : await withFallback(engine, 'claude', (selected) => runAgent(selected, prompt, roleName), (_error, fb) => sendHeartbeat('discover', `fallback to ${fb}`));
  writeArtifact('discover', timestamp, output);
  return output;
}

async function runPlanning(config, timestamp, discovery) {
  const roleFile = config.agents?.planner?.role_file || '.harness/roles/planner.md';
  const engine = config.agents?.planner?.engine || 'claude';
  const prompt = buildPrompt(roleFile.split('/').pop(), { discovery });
  const roleName = roleFile.split('/').pop();
  const forceDryRun = Boolean(config.agents?.planner?.force_dry_run);
  const output = forceDryRun ? dryRunOutput(roleName) : withFallback(engine, 'claude', (selected) => runAgent(selected, prompt, roleName), (_error, fb) => sendHeartbeat('plan', `fallback to ${fb}`));
  writeArtifact('plan', timestamp, output);
  return output;
}

async function runImplementation(config, timestamp, plan, review = null, gate = null) {
  const roleFile = config.agents?.implementer?.role_file || '.harness/roles/implementer.md';
  const engine = config.agents?.implementer?.engine || 'claude';
  const learnings = readFile(join(HARNESS_DIR, 'learnings.md'));
  const prompt = buildPrompt(roleFile.split('/').pop(), { plan, review, gate, learnings });
  const roleName = roleFile.split('/').pop();
  const output = await runAgent(engine, prompt, roleName);
  writeArtifact('impl', timestamp, output);
  return output;
}

async function runReview(config, timestamp, plan, gateOutput) {
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
  const output = await runAgent(engine, prompt, roleName);
  writeArtifact('review', timestamp, output);
  return output;
}

async function maybeRunOptimizer(config, timestamp, reviewOutput) {
  const roleFile = config.agents?.harness_optimizer?.role_file || '.harness/roles/harness-optimizer.md';
  const engine = config.agents?.harness_optimizer?.engine || 'claude';
  const prompt = buildPrompt(roleFile.split('/').pop(), { review: reviewOutput, learnings: readFile(join(HARNESS_DIR, 'learnings.md')) });
  const roleName = roleFile.split('/').pop();
  const output = await runAgent(engine, prompt, roleName);
  writeArtifact('optimize', timestamp, output);
  return output;
}

function shouldInvokeCouncil(config, state, reviewOutput = '') {
  const summary = String(reviewOutput || '').toLowerCase() + ' ' + String(state.summary || '').toLowerCase();
  return summary.includes('ambiguous') || summary.includes('unclear scope') || summary.includes('route decision');
}

async function maybeRunCouncil(config, timestamp, state, reviewOutput = '') {
  const target = { role_file: '.harness/roles/council.md', engine: config.agents?.architect?.engine || 'gemini' };
  const prompt = buildPrompt(target.role_file.split('/').pop(), { review: reviewOutput, learnings: readFile(join(HARNESS_DIR, 'learnings.md')) });
  const roleName = target.role_file.split('/').pop();
  const output = await runAgent(target.engine, prompt, roleName);
  writeArtifact('council', timestamp, output);
  return output;
}

async function maybeRunAnalyzer(config, timestamp, kind, reviewOutput, gateOutput) {
  const mapping = {
    silent: config.agents?.silent_failure_hunter,
    test: config.agents?.pr_test_analyzer,
  };
  const target = mapping[kind];
  if (!target?.role_file || !target?.engine) return null;
  const prompt = buildPrompt(target.role_file.split('/').pop(), { review: reviewOutput, gate: gateOutput, plan: readFile(join(ARTIFACTS_DIR, 'plan-latest.md')), learnings: readFile(join(HARNESS_DIR, 'learnings.md')) });
  const roleName = target.role_file.split('/').pop();
  const output = await runAgent(target.engine, prompt, roleName);
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
  try { execSync(buildNotifierCommand(harnessDir, event.phase, event.status, event.summary), { cwd: PROJECT_ROOT, stdio: 'ignore' }); } catch {}
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
  log('=== Harness Pipeline Orchestrator v3 ===');
  const config = loadConfig();
  const state = loadState();
  const timestamp = getTimestamp();

  state.taskId = state.taskId || `vibecoding-${timestamp}`;
  state.status = 'running';
  state.phase = 'audit';
  state.maxIterations = config.pipeline?.loop?.max_iterations || 3;
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
  const discovery = mustDiscover ? await runDiscovery(config, timestamp) : '';
  sendPhase(HARNESS_DIR, 'discover', 'completed', 'discovery completed');
  let nextState = loadState();
  nextState = markProgress({ ...nextState, phase: 'plan', activeRole: 'planner' }, 'discovery complete');
  saveState(nextState);
  sendPhase(HARNESS_DIR, 'plan', 'started', 'starting planning');
  sendHeartbeat('plan', 'planning running');

  const plan = await runPlanning(config, timestamp, discovery);
  sendPhase(HARNESS_DIR, 'plan', 'completed', 'Planning completed');
  debug(`plan verdict=${extractVerdict(plan)}`);
  nextState = loadState();
  nextState = markProgress({ ...nextState, phase: 'plan', activeRole: 'planner' }, 'plan complete');
  nextState.lastSuccessfulCheckpoint = 'plan';
  nextState.recommendedIntervention = recommendIntervention(nextState);
  appendCheckpoint(HARNESS_DIR, { timestamp: new Date().toISOString(), phase: 'plan', activeFeature: '', summary: 'plan complete', verdict: 'PASS' });
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
    sendPhase(HARNESS_DIR, 'implement', 'paused', finalState.summary);
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
    loopState.iteration = (loopState.iteration || 0) + 1;
    loopState.phase = 'implement';
    loopState.activeRole = 'implementer';
    debug(`loop iteration=${loopState.iteration}`);
    saveState(loopState);

    const implOutput = await runImplementation(config, getTimestamp(), plan, reviewOutput, gateOutput);
    const implEvent = buildPhaseEvent('implement', 'completed', 'Implementation step finished', { iteration: loopState.iteration, verdict: extractVerdict(implOutput) });
    appendNotification(HARNESS_DIR, implEvent);
    writeLatestNotification(HARNESS_DIR, implEvent);
    try { execSync(buildNotifierCommand(HARNESS_DIR, implEvent.phase, implEvent.status, implEvent.summary), { cwd: PROJECT_ROOT, stdio: 'ignore' }); } catch {}
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
    try { execSync(buildNotifierCommand(HARNESS_DIR, gateEvent.phase, gateEvent.status, gateEvent.summary), { cwd: PROJECT_ROOT, stdio: 'ignore' }); } catch {}

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
      await maybeRunOptimizer(config, getTimestamp(), gateOutput);
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

    reviewOutput = await runReview(config, getTimestamp(), plan, gateOutput);
    const reviewEvent = buildPhaseEvent('review', 'completed', 'Review finished', { verdict: extractVerdict(reviewOutput) });
    appendNotification(HARNESS_DIR, reviewEvent);
    writeLatestNotification(HARNESS_DIR, reviewEvent);
    try { execSync(buildNotifierCommand(HARNESS_DIR, reviewEvent.phase, reviewEvent.status, reviewEvent.summary), { cwd: PROJECT_ROOT, stdio: 'ignore' }); } catch {}
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
      await maybeRunAnalyzer(config, getTimestamp(), 'silent', reviewOutput, gateOutput);
    }
    if (routing.weak_test_signal_requires && (escalateSignal === 'pr_test_analyzer' || reviewLower.includes('test coverage') || reviewLower.includes('regression coverage') || reviewLower.includes('misleading test'))) {
      await maybeRunAnalyzer(config, getTimestamp(), 'test', reviewOutput, gateOutput);
    }
    if (escalateSignal === 'council') {
      await maybeRunCouncil(config, getTimestamp(), loopState, reviewOutput);
    }

    if (verdict === 'PASS' || verdict === 'WARNING_ONLY') break;

    const signature = normalizeFailureSignature(reviewOutput);
    loopState = updateFailureTracking(loadState(), signature);
    saveState(loopState);

    if (shouldInvokeCouncil(config, loopState, reviewOutput)) {
      await maybeRunCouncil(config, getTimestamp(), loopState, reviewOutput);
    }

    if ((loopState.sameFailureCount || 0) >= (config.pipeline?.loop?.max_same_failure || 2)) {
      promotePatternOrInstinct(reviewOutput, loopState.sameFailureCount || 0);
      await maybeRunOptimizer(config, getTimestamp(), reviewOutput);
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
  try { execSync(buildNotifierCommand(HARNESS_DIR, finalEvent.phase, finalEvent.status, finalEvent.summary), { cwd: PROJECT_ROOT, stdio: 'ignore' }); } catch {}

  debug(`final verdict=${effectiveVerdict}`);
  debug(`final status=${finalState.status}`);
  if (finalState.status === 'completed') success(finalState.summary);
  else fail(finalState.summary);
}

main().catch((error) => {
  fail(error.stack || error.message);
  process.exit(1);
});
