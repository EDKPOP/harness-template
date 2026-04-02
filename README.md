# harness-template v2.0

멀티 에이전트 바이브 코딩 하네스 템플릿.

## 개요

AI 코딩 에이전트들에게 역할을 분리하여 체계적으로 코드를 생성·검증하는 파이프라인 템플릿.

- **Initializer** → 환경 설정, feature list 생성, 프로젝트 부팅
- **Planner** → 요구사항 분석, 구현 계획 수립
- **Implementer** → 한 번에 하나의 기능씩 점진적 구현
- **Reviewer** → 품질 검증, 테스트 실행

## 시작하기

### 새 프로젝트 (Mode A: Bootstrap)

```bash
git clone https://github.com/EDKPOP/harness-template.git my-project
cd my-project
rm -rf .git && git init
```

OpenClaw에서 "바이브코딩" 또는 "harness" 언급하면 자동으로 진행.

### 기존 프로젝트에 도입 (Mode C: Adopt)

OpenClaw에 "이 프로젝트에 하네스 도입해줘"라고 요청.
`.harness/` 디렉터리만 추출하여 기존 프로젝트에 병합됨.

### 기존 하네스 프로젝트 재진입 (Mode B: Resume)

OpenClaw에 수정/추가 요청하면 자동으로 기존 하네스를 인식하고 이어감.

### 레거시 하네스 업그레이드 (Mode D: Migrate)

이전 버전 하네스가 감지되면 자동으로 v2.0으로 비파괴적 마이그레이션.

## 폴더 구조

```
project/
├── AGENTS.md                  ← 공통 규칙 맵 (60줄 이하)
├── .claude/
│   └── CLAUDE.md              ← Claude Code 전용 지시서
├── .harness/
│   ├── config.yaml            ← 하네스 설정 (v2.0)
│   ├── feature_list.json      ← 기능별 진행 추적
│   ├── progress.txt           ← 세션별 작업 내역 로그
│   ├── init.sh                ← 환경 부팅 스크립트
│   ├── session-state.json     ← 파이프라인 상태
│   ├── learnings.md           ← 누적 학습 기록
│   ├── roles/
│   │   ├── planner.md         ← Planner 지시서
│   │   ├── implementer.md     ← Implementer 지시서
│   │   └── reviewer.md        ← Reviewer 지시서
│   ├── runtime/
│   │   └── orchestrator.mjs   ← Node.js 오케스트레이터
│   ├── artifacts/             ← 산출물 (자동 생성)
│   └── legacy/                ← 마이그레이션 시 이전 파일 보관
├── docs/                      ← 상세 문서 (AGENTS.md에서 포인터)
└── src/                       ← 프로젝트 소스코드
```

## 핵심 파일

### feature_list.json

기능별 진행 추적의 핵심. 각 기능이 JSON 객체로 관리됨.

```json
{
  "id": "feat-001",
  "category": "functional",
  "description": "사용자가 로그인할 수 있다",
  "steps": ["로그인 페이지 이동", "이메일/비밀번호 입력", "로그인 확인"],
  "passes": false,
  "priority": 1
}
```

- 에이전트는 `passes` 필드만 변경 가능
- description, steps, id 삭제/수정 금지

### progress.txt

에이전트가 매 세션 종료 시 작업 내역을 기록. 다음 세션이 이 파일을 읽고 이어감.

### init.sh

개발 환경 부팅 스크립트. Initializer Agent가 프로젝트에 맞게 작성.

## 파이프라인 흐름

```
feature_list.json (passes: false)
    ↓
[Plan] → 구현 순서 + 의존관계 정리
    ↓
[Implement] → 기능 하나씩 구현 + 테스트 + commit
    ↓
[Review] → 테스트 실행 + 품질 검증
    ↓
  PASS? ──yes──→ learnings.md 갱신 → 완료
    │
   no (최대 N회)
    │
    └──→ 피드백 반영 → [Implement] → [Review] → ...
```

## 커스터마이징

- **에이전트 엔진 변경**: `config.yaml`의 `agents` 섹션
- **역할 규칙 조정**: `.harness/roles/*.md`
- **반복 횟수**: `config.yaml`의 `pipeline.loop.max_iterations`
- **태스크 규모**: `config.yaml`의 `pipeline.scale` (hotfix / feature / project)

## 사전 요구사항

- Node.js 20+ (orchestrator.mjs 실행용)
- Git
- AI 코딩 에이전트 CLI (하나 이상):
  - [Gemini CLI](https://github.com/google-gemini/gemini-cli)
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code): `npm i -g @anthropic-ai/claude-code`
  - [Codex CLI](https://github.com/openai/codex): `npm i -g @openai/codex`

## 라이선스

MIT
