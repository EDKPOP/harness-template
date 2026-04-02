# AGENTS.md

## 역할

| 에이전트 | 역할 | 엔진 설정 |
|----------|------|-----------|
| Planner | 요구사항 분석, 구현 계획 | `.harness/config.yaml` |
| Implementer | 코드 작성, 테스트 | `.harness/config.yaml` |
| Reviewer | 품질 검증, 테스트 실행 | `.harness/config.yaml` |

## 규칙

- 기술 스택: `.harness/config.yaml`의 `stack` 참조
- 커밋: Conventional Commits (feat:, fix:, docs:, refactor:, test:)
- 시크릿 직접 기입 금지 (환경변수 사용)
- 다른 에이전트의 역할 침범 금지

## 작업 방식

- `feature_list.json`에서 미완료 기능을 하나씩 구현
- 구현 후 반드시 테스트 실행 (코드 재읽기는 검증이 아님)
- 기능 완료 시 `passes: true`로 변경 + git commit + progress.txt 기록
- `feature_list.json`의 description/steps/id 수정 금지, passes만 변경

## 수정 금지 파일 (IMMUTABLE)

- `AGENTS.md`, `.claude/CLAUDE.md`
- `.harness/config.yaml`, `.harness/roles/*.md`
- `.harness/runtime/*`

## 파이프라인

```
feature_list.json (passes: false 항목)
  → [Plan] → artifacts/plan-*.md
  → [Implement] → 코드 + artifacts/impl-*.md ← learnings.md
  → [Review] → artifacts/review-*.md
  → PASS? → learnings.md 갱신 → 커밋
  → FAIL? → Phase 2 복귀 (최대 N회)
```

## 상세 문서

- 아키텍처: `docs/` (프로젝트별 작성)
- 하네스 설정: `.harness/config.yaml`
- 역할 지시서: `.harness/roles/*.md`
