#!/bin/bash
# review.sh — Phase 3: Codex 코드 리뷰
# Usage: review.sh <task_template.md> <timestamp>

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ARTIFACTS="$PROJECT_ROOT/.harness/artifacts"
TEMPLATE="$1"
TIMESTAMP="${2:-$(date +%Y%m%d-%H%M)}"
ROLE_FILE="$PROJECT_ROOT/.harness/roles/reviewer.md"
REVIEW_FILE="$ARTIFACTS/review-${TIMESTAMP}.md"

# Codex 설치 확인
if ! command -v codex &>/dev/null; then
    echo "[!] codex CLI가 설치되지 않았습니다."
    exit 1
fi

# 최신 plan 읽기
PLAN_FILE="$ARTIFACTS/plan-latest.md"
if [ ! -f "$PLAN_FILE" ]; then
    echo "[!] plan 파일을 찾을 수 없습니다."
    exit 1
fi

# Git diff 생성 (구현 변경사항)
DIFF=""
if git rev-parse HEAD &>/dev/null 2>&1; then
    # 최근 커밋들의 diff (plan 이후 변경사항)
    DIFF=$(git diff HEAD~5..HEAD 2>/dev/null || git diff --cached 2>/dev/null || echo "No diff available")
fi

# 테스트 실행 결과 캡처
TEST_RESULT=""
if [ -f "$PROJECT_ROOT/package.json" ]; then
    TEST_RESULT=$(cd "$PROJECT_ROOT" && npm test 2>&1 || true)
elif [ -f "$PROJECT_ROOT/Makefile" ]; then
    TEST_RESULT=$(cd "$PROJECT_ROOT" && make test 2>&1 || true)
else
    TEST_RESULT="테스트 러너를 자동 감지하지 못했습니다. 수동 확인 필요."
fi

# 프롬프트 조합
PROMPT="$(cat "$ROLE_FILE")

---

## 요구사항 (task_template.md):
$(cat "$TEMPLATE")

---

## 구현 계획 (plan.md):
$(cat "$PLAN_FILE")

---

## 코드 변경사항 (git diff):
\`\`\`diff
$DIFF
\`\`\`

---

## 테스트 실행 결과:
\`\`\`
$TEST_RESULT
\`\`\`

---

## 지시
위 리뷰 리포트 형식에 따라 리뷰를 작성한다.
반드시 '전체 판정: PASS' 또는 '전체 판정: FAIL' 또는 '전체 판정: WARNING_ONLY'를 포함한다.
"

# Codex 실행
echo "[harness] Codex 코드 리뷰 실행 중..."
cd "$PROJECT_ROOT"

# Codex는 git repo 안에서만 동작
codex exec "$PROMPT" > "$REVIEW_FILE" 2>/dev/null

echo "[✓] 리뷰 완료: $REVIEW_FILE"
