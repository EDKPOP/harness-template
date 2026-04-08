# OpenClaw Contract

OpenClaw should treat the project-local harness as the execution authority.

## Read first
- `.harness/session-state.json`
- latest `status-*` artifact
- latest relevant plan / gate / review / optimize artifacts

## Default reactions
- `recommendedIntervention=continue` -> continue normal routing
- `recommendedIntervention=pause for setup` -> ask for environment/tooling setup completion
- `recommendedIntervention=reroute role composition` -> invoke loop-operator / optimizer path
- `recommendedIntervention=stop and request human decision` -> stop and summarize blockers

## Trust model
If project-local state and chat assumptions differ, prefer the project-local state.


## Phase rerun rule
When OpenClaw reruns a single phase outside the full orchestrator, it should use `.harness/runtime/phase-runner.mjs` to sync state and notifications instead of writing artifacts silently.
