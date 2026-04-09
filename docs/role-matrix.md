# Role Matrix

## Core roles

| Role | Default Engine | Description |
|------|---------------|-------------|
| Initializer | Claude | prepare or migrate harness state |
| Planner | Gemini | create approved implementation plan |
| Implementer | Claude | change code and tests |
| Reviewer | Codex | judge plan compliance and quality |

## Conditional roles

| Role | Default Engine | Trigger |
|------|---------------|---------|
| Code Explorer | Gemini | search existing code and reuse opportunities |
| Code Architect | Gemini | shape larger technical changes |
| Silent Failure Hunter | Codex | find fake green outcomes |
| PR Test Analyzer | Codex | judge test quality |
| Harness Optimizer | Claude | turn repeated failures into stronger harness rules |
| Loop Operator | (runtime) | control retries, pauses, and stop-loss |
| Council | (multi-engine) | advise on ambiguous structural decisions |

## Engine affinity rationale

- **Gemini** → planning roles: excels at exploration, architecture reasoning, requirement decomposition
- **Claude** → implementation roles: excels at precise code generation, test writing, harness operations
- **Codex** → review roles: excels at sandboxed execution, independent verification, unbiased review

## Fallback behavior

When a role's default engine is unavailable, the fallback chain is applied:
- Gemini → Claude → Codex
- Claude → Codex → Gemini
- Codex → Claude → Gemini

Same engine can fill multiple roles, but each role runs in an independent CLI invocation with separate context.
