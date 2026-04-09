# Adapter Surfaces

## Canonical source
Canonical role behavior lives under `.harness/roles/`.

## Native adapters (with default role affinity)

| Adapter File | Engine | Default Roles |
|-------------|--------|---------------|
| `AGENTS.md` | Codex | reviewer, silent-failure-hunter, pr-test-analyzer |
| `GEMINI.md` | Gemini | planner, code-explorer, code-architect |
| `.claude/CLAUDE.md` + `.claude/agents/*` | Claude | implementer, initializer, harness-optimizer |

## Principle
Keep adapters thin. Do not fork the canonical role logic into each engine-specific file.
Each adapter should reference the canonical role spec and add only engine-specific entry points and context.

## Multi-model context in adapters
Each adapter file now includes a "Multi-Model Context" section that explains:
- Which roles this engine is expected to fill
- Which other engines handle adjacent roles
- How artifacts flow between engines (plan → implementation → review)

This helps each engine understand its position in the multi-model pipeline.

## Adapter generation after Engine Resolution
When Engine Resolution applies fallbacks, only adapter surfaces for engines actually in use need to be populated. If Codex is unavailable and all its roles fall back to Claude, the `AGENTS.md` adapter can remain minimal.
