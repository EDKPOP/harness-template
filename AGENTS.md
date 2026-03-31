# AGENTS.md — Multi-Agent Harness Template

이 프로젝트는 멀티 에이전트 하네스 구조로 운영된다.
각 AI 에이전트는 명확히 분리된 역할을 수행하며, 파일 기반 산출물로 다음 단계에 컨텍스트를 전달한다.

## 역할 배정

| 에이전트 | 역할 | 실행 방식 |
|----------|------|-----------|
| Gemini CLI | 플래닝 (Plan) | `gemini --approval-mode plan` |
| Claude Code | 구현 (Implement) | `claude --permission-mode bypassPermissions --print` |
| Codex | 코드 리뷰 (Review) | `codex exec` |
| OpenClaw | 오케스트레이션, 레포 관리, 배포 | 파이프라인 스크립트 실행 |

## 프로젝트 구조

```
harness-template/
├── AGENTS.md              ← 이 파일 (공통 규칙)
├── .claude/
│   └── CLAUDE.md          ← Claude Code 전용 지시서
├── .harness/
│   ├── task_template.md   ← 사용자가 작성하는 요구사항 정의서
│   ├── config.yaml        ← 파이프라인 설정
│   ├── learnings.md       ← 누적 학습 (에이전트 패턴/실수 기록)
│   ├── roles/
│   │   ├── planner.md     ← Gemini 플래닝 지시서
│   │   ├── implementer.md ← Claude 구현 지시서
│   │   └── reviewer.md    ← Codex 리뷰 지시서
│   ├── scripts/
│   │   ├── orchestrate.sh ← 전체 파이프라인 실행
│   │   ├── plan.sh        ← Phase 1: 플래닝
│   │   ├── implement.sh   ← Phase 2: 구현
│   │   ├── review.sh      ← Phase 3: 리뷰
│   │   └── loop.sh        ← 리뷰→수정 반복 루프
│   └── artifacts/         ← 각 단계 산출물 (자동 생성)
│       ├── .gitkeep
│       └── (plan.md, impl-log.md, review.md 등)
└── src/                   ← 실제 프로젝트 소스코드
    └── .gitkeep
```

## 공통 규칙 (모든 에이전트 필수)

### 기술 스택
- 이 파일에 명시된 기술 스택을 사용한다
- 프로젝트별로 아래 섹션을 수정할 것

### 코드 스타일
- 들여쓰기: 2 spaces
- 파일 끝 개행: 필수
- 주석: 한국어 허용, 변수/함수명은 영어
- 커밋 메시지: Conventional Commits (feat:, fix:, docs:, refactor:, test:)

### 금지 사항
- `.env` 파일에 시크릿 직접 기입 금지 (환경변수 또는 시크릿 매니저 사용)
- `node_modules/`, `vendor/`, `.harness/artifacts/` 내부 파일 수동 수정 금지
- 다른 에이전트의 역할을 침범하지 않는다 (플래너는 코드 작성 금지, 리뷰어는 코드 수정 금지)

### 🔒 절대 수정 금지 파일 (IMMUTABLE)
아래 파일들은 **어떤 에이전트도 수정, 삭제, 이동할 수 없다.**
"개선", "업데이트", "최적화" 등 어떤 명목이든 불가.
수정이 필요하면 사람에게 요청한다.

- `AGENTS.md`
- `.claude/CLAUDE.md`
- `.harness/task_template.md`
- `.harness/config.yaml`
- `.harness/roles/*.md` (planner.md, implementer.md, reviewer.md)
- `.harness/scripts/*.sh`

이 규칙을 위반하면 파이프라인이 무결성 검증에서 실패하고 중단된다.

### 산출물 규칙
- 모든 산출물은 `.harness/artifacts/`에 저장한다
- 파일명 규칙: `{phase}-{timestamp}.md` (예: `plan-20260331-1200.md`)
- 이전 산출물을 덮어쓰지 않고 새로 생성한다 (히스토리 보존)

### 파이프라인 흐름
```
.harness/task_template.md
    ↓
[Phase 1: Plan] → Gemini → artifacts/plan-*.md
    ↓
[Phase 2: Implement] → Claude → 코드 변경 + artifacts/impl-*.md
    ↓
[Phase 3: Review] → Codex → artifacts/review-*.md
    ↓
[Decision] → 통과? → 커밋 & 배포
              실패? → Phase 2로 복귀 (최대 3회)
```

## 기술 스택 (프로젝트별 수정)

```yaml
language: typescript
runtime: node 20+
framework: # 프로젝트에 맞게 수정
test: vitest
package_manager: pnpm
```
