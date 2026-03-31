#!/bin/bash
# unprotect.sh — 하네스 설정 파일 보호 해제
# 사람이 직접 수정할 때만 사용.
# Usage: .harness/scripts/unprotect.sh

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "[harness] 보호 모드 해제..."

chmod 644 "$PROJECT_ROOT/AGENTS.md"
chmod 644 "$PROJECT_ROOT/CLAUDE.md"
chmod 644 "$PROJECT_ROOT/.harness/config.yaml"
chmod 644 "$PROJECT_ROOT/.harness/roles/"*.md
chmod 755 "$PROJECT_ROOT/.harness/scripts/"*.sh
chmod 644 "$PROJECT_ROOT/task_template.md"

rm -f "$PROJECT_ROOT/.harness/.protected"

echo "[✓] 보호 해제 완료. 편집 후 protect.sh를 다시 실행하세요."
