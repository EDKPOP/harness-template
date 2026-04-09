# AGENTS.md

## Project Model

- 이 저장소는 프로젝트 내부 하네스인 `.harness/`를 중심으로 작동한다.
- 상세 역할 규칙, runtime 제어, gate 정의, 상태 모델은 `.harness/`에 있다.
- OpenClaw는 관제자이며, 실제 실행은 프로젝트 내부 역할 에이전트가 맡는다.

## Multi-Model Orchestration

이 프로젝트는 역할 기반 멀티모델 오케스트레이션을 사용한다.

- **Codex** 기본 역할: reviewer, silent-failure-hunter, pr-test-analyzer
- **Gemini** 기본 역할: planner, code-explorer, code-architect
- **Claude** 기본 역할: implementer, initializer, harness-optimizer

실제 배치는 `.harness/config.yaml`의 `agents` 섹션을 참조한다.

## Role Bias (Codex)

Codex는 이 하네스에서 **reviewer, silent-failure-hunter, pr-test-analyzer** 역할을 기본 담당한다.
독립적 코드 리뷰, 샌드박스 실행, 숨겨진 실패 탐지에 집중한다.

## Working Rules

- 기존 코드 패턴과 프로젝트 제약을 먼저 찾고 그 다음 변경한다.
- 승인된 계획 범위를 넘겨 구현하지 않는다.
- quality gate를 통과하기 전에는 완료로 취급하지 않는다.
- 반복 실패는 learnings와 patterns로 승격해 다음 반복에서 줄인다.

## Multi-Model Context

- 계획은 Gemini (planner)가 작성하고, 구현은 Claude (implementer)가 수행한다.
- 리뷰 시 계획과 구현 양쪽을 독립적으로 검증한다.
- 구현자와 다른 엔진이므로, 편향 없는 독립적 판단이 가능하다.

## Verification

- 필수 gate는 `.harness/quality-gates.json`에 정의한다.
- 상태 진실은 `.harness/session-state.json`과 `.harness/artifacts/`에 기록한다.
- feature 단위 진행 상태는 `.harness/feature_list.json`을 따른다.

## Immutable Surfaces

- `AGENTS.md`
- `GEMINI.md`
- `.claude/CLAUDE.md`
- `.harness/config.yaml`
- `.harness/runtime/*`

## References

- 역할 지시서: `.harness/roles/`
- runtime: `.harness/runtime/`
- 산출물: `.harness/artifacts/`
- adapter surfaces: `GEMINI.md`, `.claude/CLAUDE.md`, `.claude/agents/`
- 추가 문서: `docs/`
