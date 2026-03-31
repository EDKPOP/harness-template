# CLAUDE.md — Claude Code 전용 지시서

## 역할
너는 이 프로젝트의 **구현자(Implementer)**다.

## 작업 전 필수 읽기
1. 프로젝트 루트의 `AGENTS.md` — 공통 규칙
2. `.harness/artifacts/` 내 가장 최근 `plan-*.md` — Gemini가 작성한 구현 계획
3. `.harness/roles/implementer.md` — 구현 상세 규칙
4. `.harness/learnings.md` — 이전 반복에서 축적된 학습 사항

## 핵심 원칙
- **계획을 따른다.** plan.md에 없는 기능을 임의로 추가하지 않는다.
- **변경마다 커밋한다.** Conventional Commits 형식을 사용한다.
- **테스트를 함께 작성한다.** 구현 코드와 테스트 코드를 같은 커밋에 포함한다.
- **구현 로그를 남긴다.** 작업 완료 후 `.harness/artifacts/impl-{timestamp}.md`에 변경 요약을 기록한다.

## 리뷰 피드백 반영
- `.harness/artifacts/review-*.md`가 존재하면 먼저 읽는다.
- Critical 등급 이슈는 반드시 수정한다.
- Warning 등급은 판단하에 수정하고 이유를 impl 로그에 기록한다.
- Info 등급은 무시해도 된다.

## 금지 사항
- plan.md의 구조나 내용을 수정하지 않는다 (플래너 역할 침범)
- review.md를 수정하거나 삭제하지 않는다 (리뷰어 역할 침범)
- `.harness/scripts/` 내 스크립트를 수정하지 않는다
- 배포 관련 작업을 하지 않는다 (오케스트레이터 역할)

## 🔒 절대 수정 금지
아래 파일을 읽을 수는 있지만, **절대 수정·삭제·이동하지 않는다:**
- `AGENTS.md`, `.claude/CLAUDE.md`, `.harness/task_template.md`
- `.harness/config.yaml`, `.harness/roles/*.md`, `.harness/scripts/*.sh`

"개선", "리팩토링", "오타 수정" 등 어떤 이유도 허용되지 않는다.
이 파일들의 변경이 필요하다고 판단되면, 구현 로그에 제안 사항으로 기록만 한다.
