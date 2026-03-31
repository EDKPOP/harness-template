# harness-template

멀티 에이전트 바이브 코딩 하네스 템플릿.

## 개요

AI 코딩 에이전트들에게 역할을 분리하여 체계적으로 코드를 생성·검증하는 파이프라인 템플릿.

- **Planner** → 요구사항 분석, 구현 계획 수립
- **Implementer** → 계획에 따른 코드 작성
- **Reviewer** → 품질 검증, 계획 준수 확인

에이전트 엔진(Gemini, Claude, Codex 등)은 자유롭게 설정 가능.

## 시작하기

### 1. 템플릿 복제

```bash
git clone https://github.com/your-org/harness-template.git my-project
cd my-project
```

### 2. 설정 (대화형)

OpenClaw 환경에서:
```
"harness init"
```
→ 프로젝트명, 언어, 프레임워크, 에이전트 엔진 등을 대화형으로 설정
→ `.harness/config.yaml` 자동 생성

또는 `.harness/config.yaml`을 직접 편집해도 됨.

### 3. 요구사항 작성

`.harness/task_template.md`를 편집하여 만들고 싶은 것을 기술한다.

### 4. 파이프라인 실행

**OpenClaw 환경:**
```
"하네스 실행" 또는 "harness run"
```

**CLI 독립 실행:**
```bash
node .harness/runtime/orchestrator.mjs
node .harness/runtime/orchestrator.mjs --dry-run    # 에이전트 없이 흐름 확인
node .harness/runtime/orchestrator.mjs --verbose    # 상세 로그
```

## 폴더 구조

```
project/
├── AGENTS.md                  ← 공통 규칙 (모든 에이전트 공유)
├── .claude/
│   └── CLAUDE.md              ← Claude Code 전용 지시서
├── .harness/
│   ├── config.yaml            ← 파이프라인 설정 (대화형 생성)
│   ├── task_template.md       ← 요구사항 템플릿
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

## 파이프라인 흐름

```
.harness/task_template.md
    ↓
[Plan] Planner → plan.md
    ↓
[Implement] Implementer → 코드 + impl.md  ← learnings.md 참조
    ↓
[Review] Reviewer → review.md
    ↓
  PASS? ──yes──→ learnings.md 갱신 → 커밋
    │
   no (최대 N회)
    │
    └──→ [Implement] 피드백 반영 → [Review] 재검증 → ...
```

## 커스터마이징

- **에이전트 엔진 변경**: `config.yaml`의 `agents` 섹션
- **역할 규칙 조정**: `.harness/roles/*.md`
- **반복 횟수**: `config.yaml`의 `pipeline.loop.max_iterations`
- **기술 스택**: `config.yaml`의 `stack` 섹션

## 사전 요구사항

- Node.js 20+ (orchestrator.mjs 실행용)
- Git
- AI 코딩 에이전트 CLI (하나 이상):
  - [Gemini CLI](https://github.com/google-gemini/gemini-cli)
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code): `npm i -g @anthropic-ai/claude-code`
  - [Codex CLI](https://github.com/openai/codex): `npm i -g @openai/codex`
- 각 서비스의 API 키

## 보호 장치

- **무결성 검증**: SHA-256 체크섬으로 하네스 파일 변조 감지
- **IMMUTABLE 규칙**: AGENTS.md에 절대 수정 금지 파일 목록 명시
- **역할 격리**: 각 에이전트는 자기 역할만 수행, 다른 에이전트의 산출물 수정 금지

## 학습 축적

`.harness/learnings.md`에 리뷰 과정에서 발견된 패턴이 자동 기록됨.
- CRITICAL/WARNING 이슈 자동 추출
- 다음 구현 Phase에 컨텍스트로 주입
- 프로젝트를 거듭할수록 품질 향상

## 라이선스

MIT
