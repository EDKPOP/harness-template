#!/bin/bash
# plan.sh — Phase 1: Gemini 플래닝
# Usage: plan.sh <task_template.md> <timestamp>

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ARTIFACTS="$PROJECT_ROOT/.harness/artifacts"
TEMPLATE="$1"
TIMESTAMP="${2:-$(date +%Y%m%d-%H%M)}"
ROLE_FILE="$PROJECT_ROOT/.harness/roles/planner.md"
OUTPUT="$ARTIFACTS/plan-${TIMESTAMP}.md"

# Gemini 설치 확인
if ! command -v gemini &>/dev/null; then
    echo "[!] gemini CLI가 설치되지 않았습니다."
    echo "[!] 수동으로 plan 파일을 작성해주세요: $OUTPUT"
    exit 1
fi

# 기존 소스코드 파악을 위한 트리
SRC_TREE=""
if [ -d "$PROJECT_ROOT/src" ] && [ "$(ls -A "$PROJECT_ROOT/src" 2>/dev/null)" ]; then
    SRC_TREE=$(find "$PROJECT_ROOT/src" -type f | head -50)
fi

# 프롬프트 조합
PROMPT="$(cat "$ROLE_FILE")

---

## 요구사항 (task_template.md):
$(cat "$TEMPLATE")

---

## 프로젝트 공통 규칙 (AGENTS.md):
$(cat "$PROJECT_ROOT/AGENTS.md")
"

if [ -n "$SRC_TREE" ]; then
    PROMPT="$PROMPT

---

## 현재 소스 파일 목록:
$SRC_TREE
"
fi

# Gemini 실행 (plan 모드 = read-only)
echo "[harness] Gemini 플래닝 실행 중..."
gemini --approval-mode plan \
    -p "$PROMPT" \
    --output-format text \
    > "$OUTPUT" 2>/dev/null

echo "[✓] Plan 생성 완료: $OUTPUT"
