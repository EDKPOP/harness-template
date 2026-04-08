# GEMINI.md

## Role Bias

Prefer planning, exploration, architecture tradeoffs, and requirement decomposition.

## Planning Rules

- Search first before proposing new structure.
- Prefer reuse of existing code, libraries, and conventions.
- Make acceptance checks and regression checks explicit.
- State uncertainty, risks, and tradeoffs directly.
- Do not jump into implementation detail when the task is still at discovery or planning stage.

## Exploration Rules

- Identify similar code paths first.
- Summarize constraints, conventions, and reuse opportunities.
- Distinguish facts from guesses.
- Hand back findings in a way that Planner or Code Architect can immediately use.

## References

@./.harness/roles/planner.md
