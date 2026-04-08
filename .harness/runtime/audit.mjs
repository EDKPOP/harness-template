import { existsSync, readFileSync } from 'fs';

export function loadAuditSpec(specPath) {
  if (!existsSync(specPath)) return null;
  return JSON.parse(readFileSync(specPath, 'utf-8'));
}

export function runAudit({ spec, projectRoot, harnessDir }) {
  if (!spec) {
    return { verdict: 'FAIL', overall_score: 0, max_score: 0, checks: [], top_actions: ['restore audit spec'] };
  }

  const checks = [
    { category: 'tool_coverage', label: 'AGENTS.md exists', ok: existsSync(`${projectRoot}/AGENTS.md`), path: 'AGENTS.md' },
    { category: 'tool_coverage', label: 'GEMINI.md exists', ok: existsSync(`${projectRoot}/GEMINI.md`), path: 'GEMINI.md' },
    { category: 'tool_coverage', label: 'Claude adapter exists', ok: existsSync(`${projectRoot}/.claude/CLAUDE.md`), path: '.claude/CLAUDE.md' },
    { category: 'quality_gates', label: 'quality-gates.json exists', ok: existsSync(`${harnessDir}/quality-gates.json`), path: '.harness/quality-gates.json' },
    { category: 'memory_persistence', label: 'session-state.json exists', ok: existsSync(`${harnessDir}/session-state.json`), path: '.harness/session-state.json' },
    { category: 'eval_coverage', label: 'feature_list.json exists', ok: existsSync(`${harnessDir}/feature_list.json`), path: '.harness/feature_list.json' },
    { category: 'memory_persistence', label: 'patterns dir exists', ok: existsSync(`${harnessDir}/patterns`), path: '.harness/patterns' },
    { category: 'role_routing_completeness', label: 'orchestration rules documented', ok: existsSync(`${projectRoot}/docs/orchestration-rules.md`), path: 'docs/orchestration-rules.md' },
    { category: 'context_routing_discipline', label: 'context routing documented', ok: existsSync(`${projectRoot}/docs/context-routing.md`), path: 'docs/context-routing.md' },
    { category: 'role_composition_readiness', label: 'role composition documented', ok: existsSync(`${projectRoot}/docs/role-composition.md`), path: 'docs/role-composition.md' },
    { category: 'escalation_graph_completeness', label: 'escalation graph documented', ok: existsSync(`${projectRoot}/docs/escalation-graph.md`), path: 'docs/escalation-graph.md' },
    { category: 'cost_efficiency', label: 'adapter surfaces exist', ok: existsSync(`${projectRoot}/.claude/agents`), path: '.claude/agents' }
  ];

  const categoryScores = {};
  const categoryWeights = spec.scoring || {};
  for (const category of spec.categories || []) {
    const catChecks = checks.filter((c) => c.category === category);
    const passed = catChecks.filter((c) => c.ok).length;
    const total = catChecks.length || 1;
    const weight = categoryWeights[category] || 10;
    categoryScores[category] = Math.round((passed / total) * weight);
  }

  const max_score = Object.values(categoryWeights).reduce((a, b) => a + b, 0) || (spec.categories || []).length * 10;
  const overall_score = Object.values(categoryScores).reduce((a, b) => a + b, 0);
  const failed = checks.filter((c) => !c.ok);
  const top_actions = failed.slice(0, 3).map((c) => `Fix ${c.label} (${c.path})`);

  return {
    verdict: failed.length ? 'FAIL' : 'PASS',
    overall_score,
    max_score,
    category_scores: categoryScores,
    checks,
    top_actions,
  };
}
