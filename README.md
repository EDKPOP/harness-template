# harness-template

멀티 에이전트 바이브 코딩 하네스 템플릿.

## 구조

- **Gemini CLI** → 플래닝 (요구사항 분석, 구현 계획 수립)
- **Claude Code** → 구현 (코드 작성, 테스트 작성)
- **Codex** → 코드 리뷰 (품질 검증, 계획 준수 확인)
- **OpenClaw** → 오케스트레이션 (파이프라인 관리, 레포 관리, 배포)

## 사용법

### 1. 요구사항 작성

`task_template.md`를 편집하여 만들고 싶은 것을 기술한다.

### 2. 전체 파이프라인 실행

```bash
chmod +x .harness/scripts/*.sh
.harness/scripts/orchestrate.sh
```

### 3. 개별 단계 실행

```bash
# 플래닝만
.harness/scripts/plan.sh task_template.md

# 구현만 (plan이 존재해야 함)
.harness/scripts/implement.sh task_template.md

# 리뷰만 (구현 후)
.harness/scripts/review.sh task_template.md

# 구현↔리뷰 반복 루프만
.harness/scripts/loop.sh task_template.md 3
```

### 4. 산출물 확인

`.harness/artifacts/` 폴더에 각 단계의 산출물이 타임스탬프와 함께 저장된다.

## 사전 요구사항

- [Gemini CLI](https://github.com/google-gemini/gemini-cli) 설치
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 설치: `npm install -g @anthropic-ai/claude-code`
- [Codex CLI](https://github.com/openai/codex) 설치: `npm install -g @openai/codex`
- Git
- 각 서비스의 API 키 설정

## 커스터마이징

1. `AGENTS.md`의 기술 스택 섹션을 프로젝트에 맞게 수정
2. `.harness/roles/*.md`에서 각 에이전트의 세부 규칙 조정
3. `.harness/config.yaml`에서 타임아웃, 반복 횟수 등 설정
4. `CLAUDE.md`에 Claude 전용 추가 지시 작성

## 파이프라인 흐름

```
task_template.md
    ↓
[Plan] Gemini → plan.md
    ↓
[Implement] Claude → 코드 + impl.md
    ↓
[Review] Codex → review.md
    ↓
  PASS? ──yes──→ 커밋 & 배포
    │
   no (최대 3회)
    │
    └──→ [Implement] 피드백 반영 → [Review] 재검증 → ...
```
