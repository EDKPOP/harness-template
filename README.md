# harness-template

멀티 에이전트 바이브 코딩 하네스 템플릿.

## 구조

- **Gemini CLI** → 플래닝 (요구사항 분석, 구현 계획 수립)
- **Claude Code** → 구현 (코드 작성, 테스트 작성)
- **Codex** → 코드 리뷰 (품질 검증, 계획 준수 확인)
- **OpenClaw** → 오케스트레이션 (파이프라인 관리, 레포 관리, 배포)

## 폴더 구조

```
project/
├── AGENTS.md                  ← 공통 규칙 (유일한 루트 노출 파일)
├── .claude/
│   └── CLAUDE.md              ← Claude Code 전용 지시서
├── .harness/
│   ├── config.yaml            ← 파이프라인 설정
│   ├── task_template.md       ← 요구사항 작성 템플릿
│   ├── learnings.md           ← 누적 학습 기록
│   ├── roles/
│   │   ├── planner.md         ← Gemini 전용
│   │   ├── implementer.md     ← Claude 전용
│   │   └── reviewer.md        ← Codex 전용
│   ├── scripts/
│   │   ├── orchestrate.sh     ← 전체 파이프라인
│   │   ├── plan.sh            ← Phase 1
│   │   ├── implement.sh       ← Phase 2
│   │   ├── review.sh          ← Phase 3
│   │   ├── loop.sh            ← 반복 루프
│   │   ├── protect.sh         ← 파일 보호
│   │   ├── unprotect.sh       ← 보호 해제
│   │   └── verify-integrity.sh ← 무결성 검증
│   └── artifacts/             ← 산출물 (타임스탬프별)
└── src/                       ← 프로젝트 소스코드
```

## 사용법

### 1. 요구사항 작성

`.harness/task_template.md`를 편집하여 만들고 싶은 것을 기술한다.

### 2. 파이프라인 실행

**방법 A: Node.js 런타임 (권장)**
```bash
node .harness/runtime/orchestrator.mjs
```

옵션:
```bash
# 커스텀 템플릿
node .harness/runtime/orchestrator.mjs -t path/to/template.md

# 드라이런 (실제 에이전트 호출 없이 흐름 확인)
node .harness/runtime/orchestrator.mjs --dry-run

# 상세 로그
node .harness/runtime/orchestrator.mjs --verbose
```

**방법 B: OpenClaw 오케스트레이션**
OpenClaw 환경에서 "하네스 실행"을 요청하면 `.harness/skill/SKILL.md`에 따라
`sessions_spawn`으로 각 에이전트 세션을 관리한다.
에이전트 간 실시간 메시지 전달과 학습 주입이 자동으로 이루어진다.

**방법 C: sh 스크립트 (레거시)**
```bash
chmod +x .harness/scripts/*.sh
.harness/scripts/orchestrate.sh
```

### 4. 무결성 관리

```bash
# 체크섬 초기화 (하네스 파일 변경 후)
.harness/scripts/verify-integrity.sh --init

# 무결성 검증
.harness/scripts/verify-integrity.sh --check

# 수동 편집 시
.harness/scripts/unprotect.sh   # 잠금 해제
# ... 편집 ...
.harness/scripts/protect.sh     # 다시 잠금
.harness/scripts/verify-integrity.sh --init  # 체크섬 갱신
```

## 사전 요구사항

- [Gemini CLI](https://github.com/google-gemini/gemini-cli) 설치
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 설치: `npm install -g @anthropic-ai/claude-code`
- [Codex CLI](https://github.com/openai/codex) 설치: `npm install -g @openai/codex`
- Git
- 각 서비스의 API 키 설정

## 파이프라인 흐름

```
.harness/task_template.md
    ↓
[Plan] Gemini → plan.md
    ↓
[Implement] Claude → 코드 + impl.md  ← learnings.md 참조
    ↓
[Review] Codex → review.md
    ↓
  PASS? ──yes──→ learnings.md 갱신 → 커밋 & 배포
    │
   no (최대 3회)
    │
    └──→ [Implement] 피드백 반영 → [Review] 재검증 → ...
```

## 보호 장치

- **파일 권한**: 파이프라인 중 하네스 파일 읽기 전용 (chmod 444)
- **체크섬 검증**: SHA-256으로 변조 감지, 변조 시 파이프라인 중단
- **규칙 명시**: AGENTS.md에 절대 수정 금지 파일 목록 명시

## 학습 축적

`.harness/learnings.md`에 리뷰 반복 과정에서 발견된 패턴이 자동 기록된다.
- 리뷰의 CRITICAL/WARNING 이슈를 자동 추출
- 다음 구현 Phase에 컨텍스트로 주입
- 프로젝트를 거듭할수록 품질이 향상되는 구조

## 실행 모드

| 모드 | 명령 | 에이전트 소통 | 학습 전달 |
|------|------|---------------|-----------|
| Node.js | `node .harness/runtime/orchestrator.mjs` | 파일 기반 | 자동 |
| OpenClaw | 스킬 시스템 | 실시간 (sessions_send) | 자동 + 실시간 |
| sh 스크립트 | `.harness/scripts/orchestrate.sh` | 파일 기반 | 수동 |
