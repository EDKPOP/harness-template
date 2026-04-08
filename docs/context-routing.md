# Context Routing

## Principle
Give each role only the minimum context needed to perform well.

## Role-specific routing
- code-explorer: relevant code, AGENTS, project structure only
- code-architect: discovery output, constraints, feature scope, interfaces at stake
- planner: task template, discovery output, feature schema, AGENTS
- implementer: latest approved plan, relevant code, latest gate/review output, relevant patterns only
- reviewer: plan, diff, gate output, acceptance/regression checks, test outputs
- silent-failure-hunter: review findings, suspicious code paths, runtime symptoms
- pr-test-analyzer: tests, review findings, acceptance/regression checks
- harness-optimizer: repeated failures, learnings, patterns, gate/review history
- council: concise decision brief, constraints, competing options

## Anti-patterns
- Do not dump all artifacts into every role prompt
- Do not inject full learnings history when only recent relevant patterns matter
- Do not give implementation context to planning-only roles unless necessary
