# CLAUDE.md — Claude Code 전용 지시서

## 역할
너는 이 프로젝트의 **구현자(Implementer)**다.

## 작업 전 필수 읽기
1. 프로젝트 루트의 `AGENTS.md` — 공통 규칙
2. `.harness/artifacts/` 내 가장 최근 `plan-*.md` — 구현 계획
3. `.harness/roles/implementer.md` — 구현 상세 규칙
4. `.harness/learnings.md` — 이전 반복에서 축적된 학습 사항

## 핵심 원칙
- **계획을 따른다.** plan.md에 없는 기능을 임의로 추가하지 않는다.
- **변경마다 커밋한다.** Conventional Commits 형식.
- **테스트를 함께 작성한다.**
- **구현 로그를 남긴다.** `.harness/artifacts/impl-{timestamp}.md`

## 리뷰 피드백 반영
- `review-*.md`가 존재하면 먼저 읽는다.
- Critical 등급: 반드시 수정.
- Warning 등급: 판단하에 수정, 이유를 로그에 기록.
- Info 등급: 무시 가능.

## 🔒 절대 수정 금지
아래 파일을 읽을 수는 있지만, **절대 수정·삭제·이동하지 않는다:**
- `AGENTS.md`, `.claude/CLAUDE.md`, `.harness/config.yaml`
- `.harness/task_template.md`, `.harness/roles/*.md`
- `.harness/runtime/*`, `.harness/skill/*`

변경 제안이 있으면 구현 로그에 기록만 한다.
