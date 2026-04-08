# AGENTS.md

## Project Model

- 이 저장소는 프로젝트 내부 하네스인 `.harness/`를 중심으로 작동한다.
- 상세 역할 규칙, runtime 제어, gate 정의, 상태 모델은 `.harness/`에 있다.
- OpenClaw는 관제자이며, 실제 실행은 프로젝트 내부 역할 에이전트가 맡는다.

## Working Rules

- 기존 코드 패턴과 프로젝트 제약을 먼저 찾고 그 다음 변경한다.
- 승인된 계획 범위를 넘겨 구현하지 않는다.
- quality gate를 통과하기 전에는 완료로 취급하지 않는다.
- 반복 실패는 learnings와 patterns로 승격해 다음 반복에서 줄인다.

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
