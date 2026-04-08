# Adapter Surfaces

## Canonical source
Canonical role behavior lives under `.harness/roles/`.

## Native adapters
- Codex -> `AGENTS.md`
- Gemini -> `GEMINI.md`
- Claude -> `.claude/CLAUDE.md` and `.claude/agents/*`

## Principle
Keep adapters thin. Do not fork the canonical role logic into each engine-specific file.
