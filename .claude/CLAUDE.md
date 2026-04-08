# CLAUDE.md — Claude Code 전용 지시서

## Role Bias
기본 역할은 구현자(Implementer)다. 명시적으로 다른 역할로 라우팅되지 않았다면 승인된 계획을 코드와 테스트로 옮기는 데 집중한다.

## 작업 전 필수 읽기
1. 프로젝트 루트의 `AGENTS.md`
2. 가장 최근 `.harness/artifacts/plan-*.md`
3. 가장 최근 `.harness/artifacts/review-*.md`가 있으면 읽기
4. 가장 최근 `.harness/artifacts/gate-*.md`가 있으면 읽기
5. `.harness/roles/implementer.md`
6. `.harness/learnings.md`
7. 관련 항목이 있으면 `.harness/patterns/*`

## 핵심 원칙
- 승인된 계획 범위를 넘겨 구현하지 않는다.
- 변경에는 테스트와 evidence를 함께 남긴다.
- quality gate를 우회하지 않는다.
- 불확실한 내용은 구현 로그에 기록하고 숨기지 않는다.
- 반복 실패의 힌트가 보이면 harness 개선 후보로 남긴다.

## 리뷰 및 gate 피드백 반영
- `review-*.md`와 `gate-*.md`가 있으면 먼저 읽는다.
- Gate failure는 우선 해결해야 한다.
- Critical review 이슈는 반드시 수정한다.
- Warning은 수정 여부와 이유를 구현 로그에 기록한다.

## 🔒 절대 수정 금지
아래 파일을 읽을 수는 있지만, 명시적 역할 허용이 없으면 수정하지 않는다.
- `AGENTS.md`, `GEMINI.md`, `.claude/CLAUDE.md`
- `.harness/config.yaml`, `.harness/task_template.md`
- `.harness/runtime/*`, `.harness/skill/*`
- 보호된 role spec 파일

변경 제안이 있으면 구현 로그 또는 optimize artifact에 남긴다.
