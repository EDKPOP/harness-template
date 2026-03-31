---
name: harness-pipeline
description: >
  멀티 에이전트 바이브 코딩 하네스. config.yaml 기반으로
  Planner → Implementer → Reviewer 파이프라인을 실행한다.
  대화형 설정, 에이전트 세션 관리, 학습 축적을 처리한다.
---

# Harness Pipeline Skill

## 트리거

- `harness init` — 대화형으로 config.yaml 생성
- `harness run` — 파이프라인 실행
- `harness status` — 현재 파이프라인 상태 확인
- "하네스 실행", "파이프라인 실행", "바이브코딩 시작" 등 자연어 요청

## harness init — 대화형 설정

사용자에게 아래 항목을 순서대로 질문하여 `.harness/config.yaml`을 생성한다:

1. **프로젝트명**: "프로젝트 이름이 뭐야?"
2. **프로그래밍 언어**: "어떤 언어를 사용해? (typescript, python, go, rust, java, ...)"
3. **런타임/버전**: "런타임 버전은? (예: node 20+, python 3.12+)"
4. **프레임워크**: "프레임워크는? (예: next.js, fastapi, gin, 없음)"
5. **테스트 도구**: "테스트 도구는? (예: vitest, pytest, go test)"
6. **패키지 매니저**: "패키지 매니저는? (예: pnpm, pip, cargo)"
7. **Planner 엔진**: "플래닝은 어떤 에이전트로? (기본: gemini)"
8. **Implementer 엔진**: "구현은 어떤 에이전트로? (기본: claude)"
9. **Reviewer 엔진**: "리뷰는 어떤 에이전트로? (기본: codex)"
10. **반복 횟수**: "리뷰 실패 시 최대 몇 회 반복? (기본: 3)"

답변을 바탕으로 `.harness/config.yaml`을 작성한다.
이미 config.yaml이 존재하면 "기존 설정을 덮어쓸까?" 확인 후 진행.

## harness run — 파이프라인 실행

### 사전 조건
- `.harness/config.yaml` 존재 (없으면 `harness init` 먼저 실행)
- `.harness/task_template.md` 작성 완료

### 실행 흐름

#### Phase 1: Planning
```
config.yaml에서 planner 엔진 확인
→ .harness/roles/planner.md + task_template.md + AGENTS.md로 프롬프트 조립
→ 에이전트 세션 spawn (sessions_spawn)
→ 결과를 .harness/artifacts/plan-{timestamp}.md에 저장
→ 사용자에게 계획 요약 보고
```

#### Phase 2: Implementation
```
config.yaml에서 implementer 엔진 확인
→ .harness/roles/implementer.md + plan.md + learnings.md로 프롬프트 조립
→ 이전 review.md가 있으면 피드백도 포함
→ 에이전트 세션 spawn (프로젝트 루트를 cwd로)
→ 결과를 .harness/artifacts/impl-{timestamp}.md에 저장
→ 사용자에게 구현 요약 보고
```

#### Phase 3: Review
```
config.yaml에서 reviewer 엔진 확인
→ .harness/roles/reviewer.md + plan.md + git diff + 테스트 결과로 프롬프트 조립
→ 에이전트 세션 spawn
→ 결과를 .harness/artifacts/review-{timestamp}.md에 저장
→ 판정 추출 (PASS / FAIL / WARNING_ONLY)
```

#### Loop
```
판정이 FAIL이고 반복 횟수 미달:
  → review 피드백에서 CRITICAL/WARNING 추출
  → learnings.md에 자동 추가
  → Phase 2로 복귀 (피드백 + learnings 주입)

판정이 PASS 또는 WARNING_ONLY:
  → learnings.md 최종 갱신
  → git commit
  → 사용자에게 완료 보고
```

### 에이전트 간 소통
- `sessions_spawn`으로 각 에이전트를 독립 세션으로 생성
- `sessions_send`로 이전 Phase의 산출물을 다음 에이전트에 실시간 전달
- 에이전트가 질문을 하면 오케스트레이터가 중계하거나 사용자에게 전달

### 학습 축적
- 리뷰의 CRITICAL/WARNING 이슈를 자동 추출하여 `.harness/learnings.md`에 추가
- 다음 구현 Phase 시작 시 learnings.md를 컨텍스트로 주입
- 프로젝트를 거듭할수록 같은 실수가 줄어드는 구조

## harness status

현재 파이프라인 상태를 보고한다:
- 진행 중인 Phase
- 반복 횟수
- 최근 산출물 목록
- config.yaml 설정 요약

## 폴백

- Gemini CLI가 없으면 → Claude로 플래닝 시도
- Codex CLI가 없으면 → Claude로 리뷰 시도
- 모든 CLI가 없으면 → Node.js 런타임(`orchestrator.mjs`) 사용 안내

## Node.js 런타임 (CLI 독립 실행)

OpenClaw 없이도 실행 가능:
```bash
node .harness/runtime/orchestrator.mjs
node .harness/runtime/orchestrator.mjs --dry-run
node .harness/runtime/orchestrator.mjs --verbose
```
