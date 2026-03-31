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

### 2. 전체 파이프라인 실행

```bash
chmod +x .harness/scripts/*.sh
.harness/scripts/orchestrate.sh
```

### 3. 개별 단계 실행

```bash
# 플래닝만
.harness/scripts/plan.sh .harness/task_template.md

# 구현만 (plan이 존재해야 함)
.harness/scripts/implement.sh .harness/task_template.md

# 리뷰만 (구현 후)
.harness/scripts/review.sh .harness/task_template.md

# 구현↔리뷰 반복 루프만
.harness/scripts/loop.sh .harness/task_template.md 3
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
