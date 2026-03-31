# AGENTS.md — Multi-Agent Harness Template

이 프로젝트는 멀티 에이전트 하네스 구조로 운영된다.
각 AI 에이전트는 명확히 분리된 역할을 수행하며, 산출물을 통해 다음 단계에 컨텍스트를 전달한다.

## 역할 배정

| 에이전트 | 역할 | 설명 |
|----------|------|------|
| Planner | 플래닝 (Plan) | 요구사항 분석, 구현 계획 수립 |
| Implementer | 구현 (Implement) | 계획에 따른 코드 작성 |
| Reviewer | 코드 리뷰 (Review) | 품질 검증, 계획 준수 확인 |

에이전트별 엔진(Gemini, Claude, Codex 등)은 `.harness/config.yaml`에서 설정한다.

## 프로젝트 구조

```
project/
├── AGENTS.md                  ← 공통 규칙 (이 파일)
├── .claude/
│   └── CLAUDE.md              ← Claude Code 전용 지시서
├── .harness/
│   ├── config.yaml            ← 파이프라인 설정 (대화형 생성)
│   ├── task_template.md       ← 요구사항 작성 템플릿
│   ├── learnings.md           ← 누적 학습 기록
│   ├── roles/
│   │   ├── planner.md         ← Planner 지시서
│   │   ├── implementer.md     ← Implementer 지시서
│   │   └── reviewer.md        ← Reviewer 지시서
│   ├── runtime/
│   │   └── orchestrator.mjs   ← Node.js 오케스트레이터
│   ├── skill/
│   │   └── SKILL.md           ← OpenClaw 스킬 정의
│   └── artifacts/             ← 산출물 (자동 생성)
└── src/                       ← 프로젝트 소스코드
```

## 공통 규칙 (모든 에이전트 필수)

### 코드 스타일
- 기술 스택과 스타일은 `.harness/config.yaml`의 `stack` 섹션을 따른다
- 커밋 메시지: Conventional Commits (feat:, fix:, docs:, refactor:, test:)

### 금지 사항
- 시크릿을 코드에 직접 기입 금지 (환경변수 또는 시크릿 매니저 사용)
- 다른 에이전트의 역할을 침범하지 않는다

### 🔒 절대 수정 금지 파일 (IMMUTABLE)
아래 파일들은 **어떤 에이전트도 수정, 삭제, 이동할 수 없다.**
수정이 필요하면 사람에게 요청한다.

- `AGENTS.md`
- `.claude/CLAUDE.md`
- `.harness/config.yaml`
- `.harness/task_template.md`
- `.harness/roles/*.md`
- `.harness/runtime/*`
- `.harness/skill/*`

### 파이프라인 흐름
```
.harness/task_template.md
    ↓
[Phase 1: Plan] → Planner → artifacts/plan-*.md
    ↓
[Phase 2: Implement] → Implementer → 코드 변경 + artifacts/impl-*.md
    ↓                                  ← learnings.md 참조
[Phase 3: Review] → Reviewer → artifacts/review-*.md
    ↓
[Decision] → 통과? → learnings.md 갱신 → 커밋
              실패? → Phase 2로 복귀 (최대 N회, config.yaml에서 설정)
```

### 산출물 규칙
- 모든 산출물은 `.harness/artifacts/`에 저장한다
- 파일명: `{phase}-{timestamp}.md`
- 이전 산출물을 덮어쓰지 않는다 (히스토리 보존)
