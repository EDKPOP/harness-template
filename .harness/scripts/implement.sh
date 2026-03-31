#!/bin/bash
# implement.sh — Phase 2: Claude Code 구현
# Usage: implement.sh <task_template.md> <timestamp>

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ARTIFACTS="$PROJECT_ROOT/.harness/artifacts"
TEMPLATE="$1"
TIMESTAMP="${2:-$(date +%Y%m%d-%H%M)}"
ROLE_FILE="$PROJECT_ROOT/.harness/roles/implementer.md"
IMPL_LOG="$ARTIFACTS/impl-${TIMESTAMP}.md"

# Claude 설치 확인
if ! command -v claude &>/dev/null; then
    echo "[!] claude CLI가 설치되지 않았습니다."
    exit 1
fi

# 최신 plan 읽기
PLAN_FILE="$ARTIFACTS/plan-latest.md"
if [ ! -f "$PLAN_FILE" ]; then
    echo "[!] plan 파일을 찾을 수 없습니다. Phase 1을 먼저 실행하세요."
    exit 1
fi

# 최신 review 읽기 (반복 루프 시)
REVIEW_CONTEXT=""
REVIEW_FILE="$ARTIFACTS/review-latest.md"
if [ -f "$REVIEW_FILE" ]; then
    REVIEW_CONTEXT="

---

## 이전 리뷰 피드백 (review.md):
$(cat "$REVIEW_FILE")

위 리뷰의 CRITICAL 이슈는 반드시 수정하고, WARNING은 판단하에 처리한다.
"
fi

# 프롬프트 조합
PROMPT="$(cat "$ROLE_FILE")

---

## 구현 계획 (plan.md):
$(cat "$PLAN_FILE")

---

## 요구사항 (task_template.md):
$(cat "$TEMPLATE")

---

## 프로젝트 공통 규칙 (AGENTS.md):
$(cat "$PROJECT_ROOT/AGENTS.md")
$REVIEW_CONTEXT

---

## 지시
1. 위 계획의 각 Step을 순서대로 구현한다.
2. 각 Step 완료 시 git commit한다 (Conventional Commits).
3. 테스트 코드를 함께 작성한다.
4. 완료 후 구현 로그를 stdout으로 출력한다 (위 형식 준수).
"

# Claude 실행
echo "[harness] Claude Code 구현 실행 중..."
cd "$PROJECT_ROOT"
claude --permission-mode bypassPermissions --print "$PROMPT" > "$IMPL_LOG" 2>/dev/null

echo "[✓] 구현 완료. 로그: $IMPL_LOG"
