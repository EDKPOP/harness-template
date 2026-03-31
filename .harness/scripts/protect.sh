#!/bin/bash
# protect.sh — 하네스 설정 파일 보호
# 파이프라인 실행 전에 호출. 실행 후 unprotect.sh로 해제.
# Usage: .harness/scripts/protect.sh

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "[harness] 보호 모드 활성화..."

# 1. 하네스 설정 파일들을 읽기 전용으로 변경
chmod 444 "$PROJECT_ROOT/AGENTS.md"
chmod 444 "$PROJECT_ROOT/CLAUDE.md"
chmod 444 "$PROJECT_ROOT/.harness/config.yaml"
chmod 444 "$PROJECT_ROOT/.harness/roles/"*.md
chmod 555 "$PROJECT_ROOT/.harness/scripts/"*.sh
chmod 444 "$PROJECT_ROOT/task_template.md"

# 2. 보호 상태 기록
echo "$(date +%Y%m%d-%H%M%S)" > "$PROJECT_ROOT/.harness/.protected"

echo "[✓] 하네스 파일 보호 완료 (읽기 전용)"
echo "    해제: .harness/scripts/unprotect.sh"
