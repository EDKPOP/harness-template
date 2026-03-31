#!/usr/bin/env node
/**
 * Harness Pipeline Orchestrator
 *
 * config.yaml을 파싱하여 멀티 에이전트 파이프라인을 실행한다.
 * Gemini(플래닝) → Claude(구현) → Codex(리뷰) → 반복 루프
 *
 * Usage: node .harness/runtime/orchestrator.mjs [task_template_path]
 */

import { readFileSync, writeFileSync, existsSync, symlinkSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { execSync, spawn } from 'child_process';
import { parseArgs } from 'util';
import { createHash } from 'crypto';

// ─── Config ───

const PROJECT_ROOT = resolve(process.cwd());
const HARNESS_DIR = join(PROJECT_ROOT, '.harness');
const ARTIFACTS_DIR = join(HARNESS_DIR, 'artifacts');
const RUNTIME_DIR = join(HARNESS_DIR, 'runtime');

const { values: flags, positionals } = parseArgs({
  options: {
    template: { type: 'string', short: 't' },
    'dry-run': { type: 'boolean' },
    verbose: { type: 'boolean', short: 'v' },
  },
  strict: false,
  allowPositionals: true,
});

const TEMPLATE_PATH = flags.template
  || (positionals.length > 0 ? positionals[0] : null)
  || join(HARNESS_DIR, 'task_template.md');

const DRY_RUN = flags['dry-run'] || false;
const VERBOSE = flags.verbose || false;

// ─── Colors ───

const c = {
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

const log = (msg) => console.log(`${c.blue('[harness]')} ${msg}`);
const success = (msg) => console.log(`${c.green('[✓]')} ${msg}`);
const warn = (msg) => console.log(`${c.yellow('[!]')} ${msg}`);
const fail = (msg) => console.log(`${c.red('[✗]')} ${msg}`);
const debug = (msg) => VERBOSE && console.log(`${c.dim('[debug]')} ${msg}`);

// ─── YAML Parser (lightweight, no deps) ───

function parseYaml(text) {
  // 간이 YAML 파서: config.yaml의 간단한 구조만 처리
  const result = {};
  const lines = text.split('\n');
  const stack = [{ indent: -1, obj: result }];

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const indent = line.search(/\S/);
    const content = line.trim();

    // Pop stack to correct level
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].obj;

    if (content.startsWith('- ')) {
      // Array item
      const val = content.slice(2).trim();
      const key = Object.keys(parent).pop();
      if (key && !Array.isArray(parent[key])) {
        parent[key] = [];
      }
      if (key) {
        parent[key].push(val.replace(/^["']|["']$/g, ''));
      }
    } else if (content.includes(':')) {
      const colonIdx = content.indexOf(':');
      const key = content.slice(0, colonIdx).trim();
      const val = content.slice(colonIdx + 1).trim();

      if (val === '' || val === '|' || val === '>') {
        parent[key] = {};
        stack.push({ indent, obj: parent[key] });
      } else {
        // Parse value
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

// ─── File Helpers ───

function readFile(path) {
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf-8');
}

function writeArtifact(prefix, timestamp, content) {
  const filename = `${prefix}-${timestamp}.md`;
  const filepath = join(ARTIFACTS_DIR, filename);
  writeFileSync(filepath, content, 'utf-8');

  // Update latest symlink
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

// ─── Agent Execution ───

function runAgent(agent, prompt, cwd = PROJECT_ROOT) {
  const commands = {
    gemini: `gemini --approval-mode plan -p`,
    claude: `claude --permission-mode bypassPermissions --print`,
    codex: `codex exec`,
  };

  const cmd = commands[agent];
  if (!cmd) {
    fail(`Unknown agent: ${agent}`);
    return null;
  }

  // Check if CLI is available
  try {
    execSync(`which ${agent}`, { stdio: 'ignore' });
  } catch {
    fail(`${agent} CLI가 설치되지 않았습니다.`);
    return null;
  }

  if (DRY_RUN) {
    log(`[DRY RUN] ${agent}: ${prompt.slice(0, 100)}...`);
    return `[DRY RUN] ${agent} output placeholder`;
  }

  debug(`Running ${agent}...`);
  debug(`Command: ${cmd}`);

  try {
    const result = execSync(`${cmd} ${JSON.stringify(prompt)}`, {
      cwd,
      encoding: 'utf-8',
      timeout: 600_000, // 10 min
      maxBuffer: 10 * 1024 * 1024, // 10MB
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result;
  } catch (err) {
    fail(`${agent} 실행 실패: ${err.message}`);
    return null;
  }
}

// ─── State Management ───

function loadState() {
  const statePath = join(HARNESS_DIR, 'session-state.json');
  if (existsSync(statePath)) {
    return JSON.parse(readFileSync(statePath, 'utf-8'));
  }
  return {
    status: 'idle',
    currentPhase: null,
    iteration: 0,
    startedAt: null,
    artifacts: [],
  };
}

function saveState(state) {
  const statePath = join(HARNESS_DIR, 'session-state.json');
  writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

// ─── Phase Execution ───

function buildPrompt(roleFile, extras = {}) {
  const parts = [];

  // Role instructions
  const role = readFile(join(HARNESS_DIR, 'roles', roleFile));
  if (role) parts.push(role);

  // AGENTS.md
  const agents = readFile(join(PROJECT_ROOT, 'AGENTS.md'));
  if (agents) parts.push(`\n---\n## 프로젝트 공통 규칙 (AGENTS.md):\n${agents}`);

  // Task template
  const template = readFile(TEMPLATE_PATH);
  if (template) parts.push(`\n---\n## 요구사항 (task_template.md):\n${template}`);

  // Plan (for impl & review)
  if (extras.plan) parts.push(`\n---\n## 구현 계획 (plan.md):\n${extras.plan}`);

  // Review feedback (for impl retry)
  if (extras.review) parts.push(`\n---\n## 이전 리뷰 피드백 (review.md):\n${extras.review}\n\nCRITICAL 이슈는 반드시 수정하고, WARNING은 판단하에 처리한다.`);

  // Learnings
  if (extras.learnings) parts.push(`\n---\n## 누적 학습 사항 (learnings.md):\n${extras.learnings}`);

  // Git diff (for review)
  if (extras.diff) parts.push(`\n---\n## 코드 변경사항 (git diff):\n\`\`\`diff\n${extras.diff}\n\`\`\``);

  // Test results (for review)
  if (extras.testResult) parts.push(`\n---\n## 테스트 실행 결과:\n\`\`\`\n${extras.testResult}\n\`\`\``);

  return parts.join('\n');
}

function executePlan(timestamp) {
  log('Phase 1: Planning (Gemini)');
  const prompt = buildPrompt('planner.md');
  const output = runAgent('gemini', prompt);

  if (!output) {
    fail('플래닝 실패');
    return null;
  }

  const filepath = writeArtifact('plan', timestamp, output);
  success(`Plan 생성: ${filepath}`);
  return output;
}

function executeImplement(timestamp, plan, review = null) {
  log(`Phase 2: Implementation (Claude)`);

  const learnings = readFile(join(HARNESS_DIR, 'learnings.md'));

  const prompt = buildPrompt('implementer.md', {
    plan,
    review,
    learnings,
  });

  // Claude는 프로젝트 루트에서 실행 (파일 수정 권한)
  const output = runAgent('claude', prompt, PROJECT_ROOT);

  if (!output) {
    fail('구현 실패');
    return null;
  }

  const filepath = writeArtifact('impl', timestamp, output);
  success(`Implementation 완료: ${filepath}`);
  return output;
}

function executeReview(timestamp, plan) {
  log('Phase 3: Review (Codex)');

  // Git diff
  let diff = '';
  try {
    diff = execSync('git diff HEAD~5..HEAD 2>/dev/null || git diff --cached 2>/dev/null || echo "No diff"', {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
    });
  } catch {
    diff = 'Git diff를 가져올 수 없습니다.';
  }

  // Test results
  let testResult = '';
  try {
    if (existsSync(join(PROJECT_ROOT, 'package.json'))) {
      testResult = execSync('npm test 2>&1 || true', {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
        timeout: 120_000,
      });
    } else {
      testResult = '테스트 러너 미감지. 수동 확인 필요.';
    }
  } catch {
    testResult = '테스트 실행 실패';
  }

  const prompt = buildPrompt('reviewer.md', {
    plan,
    diff,
    testResult,
  });

  const output = runAgent('codex', prompt, PROJECT_ROOT);

  if (!output) {
    fail('리뷰 실패');
    return null;
  }

  const filepath = writeArtifact('review', timestamp, output);
  success(`Review 완료: ${filepath}`);
  return output;
}

// ─── Verdict Extraction ───

function extractVerdict(reviewContent) {
  if (!reviewContent) return 'FAIL';

  const match = reviewContent.match(/전체 판정:\s*(PASS|FAIL|WARNING_ONLY)/i);
  return match ? match[1].toUpperCase() : 'FAIL';
}

// ─── Learning Extraction (C단계) ───

function extractAndAppendLearnings(reviewContent, timestamp) {
  if (!reviewContent) return;

  const learningsPath = join(HARNESS_DIR, 'learnings.md');
  let existing = readFile(learningsPath) || '';

  // CRITICAL과 WARNING 이슈 추출
  const criticals = [];
  const warnings = [];

  const lines = reviewContent.split('\n');
  let section = '';

  for (const line of lines) {
    if (line.includes('CRITICAL')) section = 'critical';
    else if (line.includes('WARNING')) section = 'warning';
    else if (line.includes('INFO') || line.includes('##')) section = '';

    if (section === 'critical' && line.trim().startsWith('- ')) {
      criticals.push(line.trim().slice(2));
    }
    if (section === 'warning' && line.trim().startsWith('- ')) {
      warnings.push(line.trim().slice(2));
    }
  }

  if (criticals.length === 0 && warnings.length === 0) return;

  // 학습 항목 생성
  let entry = `\n### [${timestamp}] 자동 추출\n`;

  for (const issue of criticals) {
    entry += `- **문제**: ${issue}\n`;
    entry += `- **등급**: CRITICAL\n`;
    entry += `- **규칙**: 동일 패턴 반복 금지\n\n`;
  }

  for (const issue of warnings) {
    entry += `- **문제**: ${issue}\n`;
    entry += `- **등급**: WARNING\n\n`;
  }

  writeFileSync(learningsPath, existing + entry, 'utf-8');
  success(`Learnings 갱신: ${criticals.length} critical, ${warnings.length} warning 항목 추가`);
}

// ─── Integrity Check (pure Node.js) ───

function checkIntegrity() {
  const checksumFile = join(HARNESS_DIR, '.checksums');
  if (!existsSync(checksumFile)) return true;

  const lines = readFileSync(checksumFile, 'utf-8').trim().split('\n');
  let allGood = true;

  for (const line of lines) {
    if (!line.trim()) continue;
    const [expectedHash, filepath] = line.trim().split(/\s+/);
    if (!filepath || !expectedHash) continue;

    if (!existsSync(filepath)) {
      fail(`삭제됨: ${filepath}`);
      allGood = false;
      continue;
    }

    const content = readFileSync(filepath);
    const actualHash = createHash('sha256').update(content).digest('hex');

    if (expectedHash !== actualHash) {
      fail(`변조됨: ${filepath}`);
      allGood = false;
    } else {
      debug(`정상: ${filepath}`);
    }
  }

  return allGood;
}

function initChecksums() {
  const protectedFiles = [
    join(PROJECT_ROOT, 'AGENTS.md'),
    join(PROJECT_ROOT, '.claude', 'CLAUDE.md'),
    join(HARNESS_DIR, 'task_template.md'),
    join(HARNESS_DIR, 'config.yaml'),
    join(HARNESS_DIR, 'roles', 'planner.md'),
    join(HARNESS_DIR, 'roles', 'implementer.md'),
    join(HARNESS_DIR, 'roles', 'reviewer.md'),
  ];

  const lines = [];
  for (const filepath of protectedFiles) {
    if (!existsSync(filepath)) continue;
    const content = readFileSync(filepath);
    const hash = createHash('sha256').update(content).digest('hex');
    lines.push(`${hash}  ${filepath}`);
  }

  writeFileSync(join(HARNESS_DIR, '.checksums'), lines.join('\n') + '\n', 'utf-8');
  success('체크섬 초기화 완료');
}

// ─── Main Pipeline ───

async function main() {
  log('=== Harness Pipeline Orchestrator ===');
  log(`Project: ${PROJECT_ROOT}`);
  log(`Template: ${TEMPLATE_PATH}`);
  if (DRY_RUN) warn('DRY RUN 모드');
  console.log('');

  // Validation
  if (!existsSync(TEMPLATE_PATH)) {
    fail(`task_template.md를 찾을 수 없습니다: ${TEMPLATE_PATH}`);
    process.exit(1);
  }

  if (!existsSync(join(PROJECT_ROOT, 'AGENTS.md'))) {
    fail('AGENTS.md가 프로젝트 루트에 없습니다.');
    process.exit(1);
  }

  // Integrity check
  log('무결성 검증 중...');
  if (!checkIntegrity()) {
    fail('하네스 파일이 변조되었습니다. 파이프라인을 중단합니다.');
    fail('git checkout -- AGENTS.md .claude/ .harness/roles/ 로 복원하세요.');
    process.exit(1);
  }
  success('무결성 확인 완료');
  console.log('');

  // Load config
  const configPath = join(HARNESS_DIR, 'config.yaml');
  const configText = readFile(configPath);
  let maxIterations = 3;

  if (configText) {
    const config = parseYaml(configText);
    debug(`Config loaded: ${JSON.stringify(config).slice(0, 200)}`);
    if (config.pipeline?.loop?.max_iterations) {
      maxIterations = config.pipeline.loop.max_iterations;
    }
  }

  // State
  const state = loadState();
  state.status = 'running';
  state.startedAt = new Date().toISOString();
  state.iteration = 0;
  saveState(state);

  const startTimestamp = getTimestamp();

  // ─── Phase 1: Plan ───
  state.currentPhase = 'plan';
  saveState(state);

  const plan = executePlan(startTimestamp);
  if (!plan) {
    state.status = 'failed';
    state.currentPhase = 'plan';
    saveState(state);
    process.exit(1);
  }

  state.artifacts.push(`plan-${startTimestamp}.md`);
  saveState(state);
  console.log('');

  // ─── Phase 2 & 3: Implement → Review Loop ───
  let verdict = 'FAIL';
  let lastReview = null;

  while (state.iteration < maxIterations && verdict !== 'PASS' && verdict !== 'WARNING_ONLY') {
    state.iteration++;
    const iterTimestamp = getTimestamp();

    log(`=== Iteration ${state.iteration} / ${maxIterations} ===`);
    console.log('');

    // Phase 2: Implement
    state.currentPhase = 'implement';
    saveState(state);

    const impl = executeImplement(iterTimestamp, plan, lastReview);
    if (!impl) {
      state.status = 'failed';
      saveState(state);
      process.exit(1);
    }

    state.artifacts.push(`impl-${iterTimestamp}.md`);
    saveState(state);
    console.log('');

    // Phase 3: Review
    state.currentPhase = 'review';
    saveState(state);

    const review = executeReview(iterTimestamp, plan);
    if (!review) {
      state.status = 'failed';
      saveState(state);
      process.exit(1);
    }

    state.artifacts.push(`review-${iterTimestamp}.md`);
    saveState(state);

    // Verdict
    verdict = extractVerdict(review);
    log(`리뷰 판정: ${verdict}`);

    if (verdict === 'PASS' || verdict === 'WARNING_ONLY') {
      success(`리뷰 통과! (${verdict})`);
    } else if (state.iteration < maxIterations) {
      warn(`리뷰 미통과. 피드백 반영 후 재시도... (남은: ${maxIterations - state.iteration})`);
      lastReview = review;
    } else {
      fail('최대 반복 횟수 도달. 수동 검토가 필요합니다.');
    }

    // C: Extract learnings
    extractAndAppendLearnings(review, iterTimestamp);
    console.log('');
  }

  // ─── Completion ───
  if (verdict === 'PASS' || verdict === 'WARNING_ONLY') {
    log('=== 파이프라인 완료 ===');

    if (!DRY_RUN) {
      try {
        execSync('git add -A', { cwd: PROJECT_ROOT, stdio: 'ignore' });
        execSync(
          `git commit -m "feat: harness pipeline complete (iterations: ${state.iteration})"`,
          { cwd: PROJECT_ROOT, stdio: 'ignore' }
        );
        success('커밋 완료');
      } catch {
        warn('커밋할 변경사항이 없거나 커밋 실패');
      }
    }

    // Post-pipeline integrity check
    if (!checkIntegrity()) {
      warn('파이프라인 중 하네스 파일이 변조되었습니다! 확인 필요.');
    }

    state.status = 'completed';
    state.currentPhase = null;
    state.completedAt = new Date().toISOString();
    saveState(state);

    success(`파이프라인 성공. ${state.iteration}회 반복.`);
  } else {
    state.status = 'failed';
    state.completedAt = new Date().toISOString();
    saveState(state);

    fail('파이프라인 실패. .harness/artifacts/review-latest.md 확인.');
    process.exit(1);
  }
}

main().catch((err) => {
  fail(`예상치 못한 에러: ${err.message}`);
  process.exit(1);
});
