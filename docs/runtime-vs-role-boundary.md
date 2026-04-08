# Runtime vs Role Boundary

## Script-owned (mjs)
- phase transitions
- state reset and mutation
- notification emit and direct reporting attempt
- checkpoint append
- audit execution and scorecard generation
- quality gate execution
- auto-advance default behavior
- approval gate detection and pause

## Role-owned
- discovery and exploration
- architecture decisions
- implementation work
- review judgment
- hidden failure interpretation
- test quality interpretation
- harness improvement judgment
- ambiguous decision arbitration

## Rule
If the behavior must be deterministic, replayable, and identical across projects, prefer runtime scripts.
If the behavior depends on judgment or interpretation, keep it in role specs.
