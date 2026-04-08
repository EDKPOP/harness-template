#!/usr/bin/env node

import { resolve, join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { parseArgs } from 'util';
import { buildPhaseEvent, appendNotification, writeLatestNotification } from './notifications.mjs';
import { recommendIntervention } from './status.mjs';

const PROJECT_ROOT = resolve(process.cwd());
const HARNESS_DIR = join(PROJECT_ROOT, '.harness');
const ARTIFACTS_DIR = join(HARNESS_DIR, 'artifacts');

const { positionals } = parseArgs({ allowPositionals: true, strict: false });
const phase = positionals[0];
if (!phase) {
  console.error('Usage: node .harness/runtime/phase-runner.mjs <phase> [artifact-path]');
  process.exit(1);
}
const artifactPath = positionals[1] || '';

function loadState() {
  const path = join(HARNESS_DIR, 'session-state.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) : {};
}

function saveState(state) {
  writeFileSync(join(HARNESS_DIR, 'session-state.json'), JSON.stringify(state, null, 2), 'utf-8');
}

function latestMatching(prefix) {
  if (!existsSync(ARTIFACTS_DIR)) return '';
  const files = require('fs').readdirSync(ARTIFACTS_DIR).filter((f) => f.startsWith(prefix)).sort().reverse();
  return files.length ? join(ARTIFACTS_DIR, files[0]) : '';
}

const pathMap = {
  discover: artifactPath || latestMatching('discover-'),
  plan: artifactPath || latestMatching('plan-'),
  implement: artifactPath || latestMatching('impl-'),
  gate: artifactPath || latestMatching('gate-'),
  review: artifactPath || latestMatching('review-'),
  optimize: artifactPath || latestMatching('optimize-'),
};

const target = pathMap[phase] || artifactPath;
const state = loadState();
state.phase = phase;
state.activeRole = phase === 'plan' ? 'planner' : phase === 'discover' ? 'code-explorer' : phase;
state.summary = `${phase} completed via phase-runner`;
state.status = phase === 'gate' ? state.status || 'running' : 'running';
if (['discover','plan','implement','gate','review','optimize'].includes(phase)) {
  state.lastSuccessfulCheckpoint = phase;
}
state.stopCondition = '';
state.recommendedIntervention = recommendIntervention(state);
saveState(state);

const event = buildPhaseEvent(phase, 'completed', `${phase} completed via phase-runner`, { artifact: target });
appendNotification(HARNESS_DIR, event);
writeLatestNotification(HARNESS_DIR, event);
console.log(JSON.stringify({ ok: true, phase, artifact: target, state }, null, 2));
