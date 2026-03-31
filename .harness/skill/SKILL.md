---
name: harness-pipeline
description: >
  멀티 에이전트 바이브 코딩 파이프라인 오케스트레이터.
  config.yaml을 파싱하여 Gemini(플래닝) → Claude(구현) → Codex(리뷰) 순서로
  에이전트 세션을 spawn하고, 산출물을 실시간 전달하며, 리뷰 결과에 따라
  자동 반복 루프를 실행한다. 학습 사항을 자동 축적하여 반복 품질을 향상시킨다.
---

# Harness Pipeline Skill

## 트리거
- 사용자가 "하네스 실행", "파이프라인 실행", "바이브코딩 시작" 등을 요청할 때
- `.harness/config.yaml`이 존재하는 프로젝트에서 태스크 실행 요청 시

## 사전 조건
- 프로젝트 루트에 `AGENTS.md` 존재
- `.harness/config.yaml` 존재
- `.harness/task_template.md` 작성 완료
- Gemini CLI, Claude Code, Codex CLI 중 최소 하나 설치

## 실행 방법

오케스트레이터 스크립트를 Node.js로 실행:
```bash
node .harness/runtime/orchestrator.mjs [task_template_path]
```

또는 OpenClaw에서 직접 오케스트레이션:

### Phase 1: Planning (Gemini)
```
sessions_spawn(
  runtime: "acp" 또는 subagent,
  task: planner.md + task_template.md 내용,
  label: "harness-plan"
)
```

### Phase 2: Implementation (Claude)
```
sessions_spawn(
  runtime: "acp",
  agentId: "claude-code",
  task: implementer.md + plan.md + learnings.md 내용,
  label: "harness-impl",
  cwd: 프로젝트 루트
)
```

### Phase 3: Review (Codex)
```
sessions_spawn(
  runtime: "acp",
  agentId: "codex",
  task: reviewer.md + plan.md + git diff,
  label: "harness-review",
  cwd: 프로젝트 루트
)
```

### Loop
- review 산출물에서 판정(PASS/FAIL/WARNING_ONLY) 추출
- FAIL → Phase 2로 복귀 (review 피드백 + learnings 주입)
- 최대 config.yaml의 `pipeline.loop.max_iterations`회 반복
- 완료 시 learnings.md 자동 갱신

## 산출물
- `.harness/artifacts/plan-{timestamp}.md`
- `.harness/artifacts/impl-{timestamp}.md`
- `.harness/artifacts/review-{timestamp}.md`
- `.harness/learnings.md` (자동 갱신)
- `.harness/session-state.json` (파이프라인 상태)

## 무결성
- 실행 전 `verify-integrity.sh --check` 호출
- 실행 중 하네스 파일 변조 감지 시 즉시 중단
