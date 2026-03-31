#!/bin/bash
# verify-integrity.sh — 하네스 파일 무결성 검증
# 파이프라인 실행 전후에 호출하여 설정 파일이 변조되지 않았는지 확인
# Usage: verify-integrity.sh [--init | --check]

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CHECKSUM_FILE="$PROJECT_ROOT/.harness/.checksums"

# 보호 대상 파일 목록
PROTECTED_FILES=(
    "AGENTS.md"
    ".claude/CLAUDE.md"
    ".harness/task_template.md"
    ".harness/config.yaml"
    ".harness/roles/planner.md"
    ".harness/roles/implementer.md"
    ".harness/roles/reviewer.md"
)

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

case "${1:---check}" in
    --init)
        echo "[harness] 체크섬 초기화..."
        > "$CHECKSUM_FILE"
        for f in "${PROTECTED_FILES[@]}"; do
            filepath="$PROJECT_ROOT/$f"
            if [ -f "$filepath" ]; then
                shasum -a 256 "$filepath" >> "$CHECKSUM_FILE"
            fi
        done
        echo "[✓] 체크섬 저장 완료: $CHECKSUM_FILE"
        ;;

    --check)
        if [ ! -f "$CHECKSUM_FILE" ]; then
            echo "[!] 체크섬 파일이 없습니다. --init으로 먼저 생성하세요."
            exit 1
        fi

        TAMPERED=0
        while IFS= read -r line; do
            expected_hash=$(echo "$line" | awk '{print $1}')
            filepath=$(echo "$line" | awk '{print $2}')
            filename=$(basename "$filepath")

            if [ ! -f "$filepath" ]; then
                echo -e "${RED}[✗] 삭제됨: $filename${NC}"
                TAMPERED=1
                continue
            fi

            actual_hash=$(shasum -a 256 "$filepath" | awk '{print $1}')
            if [ "$expected_hash" != "$actual_hash" ]; then
                echo -e "${RED}[✗] 변조됨: $filename${NC}"
                TAMPERED=1
            else
                echo -e "${GREEN}[✓] 정상: $filename${NC}"
            fi
        done < "$CHECKSUM_FILE"

        if [ "$TAMPERED" -eq 1 ]; then
            echo ""
            echo -e "${RED}[!] 하네스 파일이 변조되었습니다!${NC}"
            echo "    git diff로 변경 내용을 확인하고, git checkout으로 복원할 수 있습니다."
            exit 1
        else
            echo ""
            echo -e "${GREEN}[✓] 모든 하네스 파일 무결성 확인 완료${NC}"
        fi
        ;;

    *)
        echo "Usage: verify-integrity.sh [--init | --check]"
        exit 1
        ;;
esac
