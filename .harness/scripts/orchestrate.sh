#!/bin/bash
# orchestrate.sh — 전체 파이프라인 실행
# Usage: .harness/scripts/orchestrate.sh [task_template.md]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ARTIFACTS="$PROJECT_ROOT/.harness/artifacts"
TEMPLATE="${1:-$PROJECT_ROOT/task_template.md}"
TIMESTAMP=$(date +%Y%m%d-%H%M)
MAX_ITERATIONS=3

# 색상
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[harness]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
fail() { echo -e "${RED}[✗]${NC} $1"; }

# 사전 검증
if [ ! -f "$TEMPLATE" ]; then
    fail "task_template.md를 찾을 수 없습니다: $TEMPLATE"
    exit 1
fi

# 의존성 확인
for cmd in gemini claude codex; do
    if ! command -v "$cmd" &>/dev/null; then
        warn "$cmd CLI가 설치되지 않았습니다. 해당 Phase를 건너뜁니다."
    fi
done

cd "$PROJECT_ROOT"

# ─── 무결성 검증 & 보호 ───
if [ -f "$SCRIPT_DIR/verify-integrity.sh" ] && [ -f "$PROJECT_ROOT/.harness/.checksums" ]; then
    log "하네스 파일 무결성 검증 중..."
    "$SCRIPT_DIR/verify-integrity.sh" --check || {
        fail "하네스 파일이 변조되었습니다. 파이프라인을 중단합니다."
        fail "git checkout -- AGENTS.md CLAUDE.md .harness/roles/ 로 복원하세요."
        exit 1
    }
fi

"$SCRIPT_DIR/protect.sh"

log "=== Harness Pipeline 시작 ==="
log "Template: $TEMPLATE"
log "Timestamp: $TIMESTAMP"
echo ""

# ─── Phase 1: Planning (Gemini) ───
log "Phase 1: Planning (Gemini)"
"$SCRIPT_DIR/plan.sh" "$TEMPLATE" "$TIMESTAMP"
PLAN_FILE="$ARTIFACTS/plan-${TIMESTAMP}.md"

if [ ! -f "$PLAN_FILE" ]; then
    fail "플래닝 산출물이 생성되지 않았습니다"
    exit 1
fi

# latest 심링크
ln -sf "plan-${TIMESTAMP}.md" "$ARTIFACTS/plan-latest.md"
success "Phase 1 완료: $PLAN_FILE"
echo ""

# ─── Phase 2 & 3: Implement → Review 루프 ───
ITERATION=0
VERDICT="FAIL"

while [ "$ITERATION" -lt "$MAX_ITERATIONS" ] && [ "$VERDICT" != "PASS" ] && [ "$VERDICT" != "WARNING_ONLY" ]; do
    ITERATION=$((ITERATION + 1))
    ITER_TIMESTAMP=$(date +%Y%m%d-%H%M)
    log "=== Iteration $ITERATION / $MAX_ITERATIONS ==="
    echo ""

    # Phase 2: Implementation (Claude)
    log "Phase 2: Implementation (Claude) — Iteration $ITERATION"
    "$SCRIPT_DIR/implement.sh" "$TEMPLATE" "$ITER_TIMESTAMP"
    IMPL_FILE="$ARTIFACTS/impl-${ITER_TIMESTAMP}.md"
    ln -sf "impl-${ITER_TIMESTAMP}.md" "$ARTIFACTS/impl-latest.md"
    success "Phase 2 완료: $IMPL_FILE"
    echo ""

    # Phase 3: Review (Codex)
    log "Phase 3: Review (Codex) — Iteration $ITERATION"
    "$SCRIPT_DIR/review.sh" "$TEMPLATE" "$ITER_TIMESTAMP"
    REVIEW_FILE="$ARTIFACTS/review-${ITER_TIMESTAMP}.md"
    ln -sf "review-${ITER_TIMESTAMP}.md" "$ARTIFACTS/review-latest.md"
    success "Phase 3 완료: $REVIEW_FILE"
    echo ""

    # 판정 추출
    VERDICT=$(grep -oP '전체 판정:\s*\K\w+' "$REVIEW_FILE" 2>/dev/null || echo "FAIL")
    log "리뷰 판정: $VERDICT"

    if [ "$VERDICT" = "PASS" ] || [ "$VERDICT" = "WARNING_ONLY" ]; then
        success "리뷰 통과! ($VERDICT)"
    elif [ "$ITERATION" -lt "$MAX_ITERATIONS" ]; then
        warn "리뷰 미통과. 피드백 반영 후 재시도합니다... (남은 시도: $((MAX_ITERATIONS - ITERATION)))"
    else
        fail "최대 반복 횟수 도달. 수동 검토가 필요합니다."
    fi
    echo ""
done

# ─── 완료 처리 ───
if [ "$VERDICT" = "PASS" ] || [ "$VERDICT" = "WARNING_ONLY" ]; then
    log "=== 파이프라인 완료 ==="
    git add -A
    TASK_NAME=$(head -5 "$TEMPLATE" | grep -oP '##\s*프로젝트명\s*\n\K.*' || echo "harness task")
    git commit -m "feat: $TASK_NAME — implemented via harness pipeline (iterations: $ITERATION)" || true
    # 무결성 재검증
    if [ -f "$PROJECT_ROOT/.harness/.checksums" ]; then
        "$SCRIPT_DIR/verify-integrity.sh" --check || {
            warn "파이프라인 중 하네스 파일이 변조되었습니다! 커밋은 했지만 확인이 필요합니다."
        }
    fi
    "$SCRIPT_DIR/unprotect.sh"
    success "커밋 완료. 배포 준비 상태입니다."
else
    fail "=== 파이프라인 실패 ==="
    fail "마지막 리뷰: $ARTIFACTS/review-latest.md 를 확인하세요."
    exit 1
fi
