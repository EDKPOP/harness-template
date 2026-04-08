# Escalation Graph

## Failure to escalation flow
- warning or fail -> append to `learnings.md`
- repeated similar warning/fail -> create or update a file in `.harness/patterns/`
- repeated pattern with clear prevention path -> propose stronger rule, gate, or adapter/prompt change

## Escalation targets
- implementation mistake repeated -> role prompt or AGENTS rule candidate
- missing mechanical verification -> quality gate candidate
- hidden runtime breakage -> silent-failure-hunter route
- weak behavioral coverage -> pr-test-analyzer route
- structural repeat failure -> planner/code-architect/harness-optimizer route

## Optimizer output classes
- pattern proposal
- gate strengthening
- role routing adjustment
- adapter prompt adjustment
- AGENTS-level rule proposal
