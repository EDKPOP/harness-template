#!/bin/bash
# loop.sh — 리뷰→수정 반복 루프만 실행
# Plan은 이미 존재한다고 가정. implement→review 사이클만 반복.
# Usage: loop.sh <task_template.md> [max_iterations]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ARTIFACTS="$PROJECT_ROOT/.harness/artifacts"
TEMPLATE="${1:-$PROJECT_ROOT/task_template.md}"
MAX_ITERATIONS="${2:-3}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# plan 파일 확인
if [ ! -f "$ARTIFACTS/plan-latest.md" ]; then
    echo -e "${RED}[✗]${NC} plan-latest.md가 없습니다. 먼저 plan.sh를 실행하세요."
    exit 1
fi

ITERATION=0
VERDICT="FAIL"

while [ "$ITERATION" -lt "$MAX_ITERATIONS" ] && [ "$VERDICT" != "PASS" ] && [ "$VERDICT" != "WARNING_ONLY" ]; do
    ITERATION=$((ITERATION + 1))
    ITER_TIMESTAMP=$(date +%Y%m%d-%H%M)

    echo -e "${BLUE}[harness]${NC} === Loop Iteration $ITERATION / $MAX_ITERATIONS ==="

    # Implement
    echo -e "${BLUE}[harness]${NC} Implementing..."
    "$SCRIPT_DIR/implement.sh" "$TEMPLATE" "$ITER_TIMESTAMP"
    ln -sf "impl-${ITER_TIMESTAMP}.md" "$ARTIFACTS/impl-latest.md"

    # Review
    echo -e "${BLUE}[harness]${NC} Reviewing..."
    "$SCRIPT_DIR/review.sh" "$TEMPLATE" "$ITER_TIMESTAMP"
    ln -sf "review-${ITER_TIMESTAMP}.md" "$ARTIFACTS/review-latest.md"

    # 판정
    VERDICT=$(grep -oP '전체 판정:\s*\K\w+' "$ARTIFACTS/review-${ITER_TIMESTAMP}.md" 2>/dev/null || echo "FAIL")

    if [ "$VERDICT" = "PASS" ] || [ "$VERDICT" = "WARNING_ONLY" ]; then
        echo -e "${GREEN}[✓]${NC} 리뷰 통과! ($VERDICT) — $ITERATION iterations"
    elif [ "$ITERATION" -lt "$MAX_ITERATIONS" ]; then
        echo -e "${YELLOW}[!]${NC} 리뷰 미통과. 피드백 반영 후 재시도... (남은: $((MAX_ITERATIONS - ITERATION)))"
    else
        echo -e "${RED}[✗]${NC} 최대 반복 도달. 수동 검토 필요."
        exit 1
    fi
    echo ""
done
