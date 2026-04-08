import { existsSync, readFileSync } from 'fs';

export function loadAuditSpec(specPath) {
  if (!existsSync(specPath)) return null;
  return JSON.parse(readFileSync(specPath, 'utf-8'));
}

export function runAudit({ spec, projectRoot, harnessDir }) {
  if (!spec) {
    return { verdict: 'FAIL', findings: ['audit spec missing'] };
  }

  const findings = [];

  const checks = [
    ['AGENTS.md exists', existsSync(`${projectRoot}/AGENTS.md`)],
    ['GEMINI.md exists', existsSync(`${projectRoot}/GEMINI.md`)],
    ['Claude adapter exists', existsSync(`${projectRoot}/.claude/CLAUDE.md`)],
    ['quality-gates.json exists', existsSync(`${harnessDir}/quality-gates.json`)],
    ['session-state.json exists', existsSync(`${harnessDir}/session-state.json`)],
    ['feature_list.json exists', existsSync(`${harnessDir}/feature_list.json`)],
    ['patterns dir exists', existsSync(`${harnessDir}/patterns`)],
  ];

  for (const [label, ok] of checks) {
    if (!ok) findings.push(label);
  }

  return {
    verdict: findings.length ? 'FAIL' : 'PASS',
    findings,
    categories: spec.categories || [],
  };
}
