---
name: harness-pipeline
description: >
  프로젝트 내부 하네스를 통해 discovery, planning, implementation, quality gate,
  review, optimization, loop control을 수행하는 실행 스킬.
  OpenClaw는 관제와 트리거를 맡고, 실제 실행은 project-local harness와 역할 에이전트가 맡는다.
---

# Harness Pipeline

## Core Model
- OpenClaw is the monitor-orchestrator, not the executor.
- This project-local harness is the execution system.
- Canonical role behavior lives under `.harness/roles/`.
- Native adapters exist for Codex, Gemini, and Claude.

## Primary State Surfaces
- `.harness/session-state.json`
- `.harness/feature_list.json`
- `.harness/artifacts/*`
- `.harness/quality-gates.json`
- `.harness/learnings.md`
- `.harness/patterns/*`

## Phase Model
- audit
- discover
- plan
- implement
- gate
- review
- optimize
- loop decision

## Role Model
### Core roles
- initializer
- planner
- implementer
- reviewer

### Conditional roles
- code-explorer
- code-architect
- silent-failure-hunter
- pr-test-analyzer
- harness-optimizer
- loop-operator
- council

## Routing Principles
- search-first before planning
- gate-before-review
- repeated failure triggers optimizer, not blind retry
- ambiguous route or scope triggers council
- weak behavioral signal triggers pr-test-analyzer
- hidden runtime suspicion triggers silent-failure-hunter

## Learning Principles
- one-off issue -> learnings
- repeated issue -> patterns
- repeated issue with clear prevention path -> stronger gate, rule, or prompt
