#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_DIR="$SCRIPT_DIR"
ROOT_DIR="$(cd "$HARNESS_DIR/.." && pwd)"
CONFIG_PATH="$HARNESS_DIR/config.yaml"
GATES_PATH="$HARNESS_DIR/quality-gates.json"
STATE_PATH="$HARNESS_DIR/session-state.json"

if [[ ! -f "$CONFIG_PATH" ]]; then
  echo "[harness:init] missing config.yaml" >&2
  exit 1
fi

lang="$(awk '/^  language:/{print $2}' "$CONFIG_PATH" | tr -d '"')"
pkg="$(awk '/^  package_manager:/{print $2}' "$CONFIG_PATH" | tr -d '"')"

echo "[harness:init] project root: $ROOT_DIR"
echo "[harness:init] language: ${lang:-unknown}, package manager: ${pkg:-unknown}"

if [[ ! -f "$GATES_PATH" ]]; then
  cat > "$GATES_PATH" <<'JSON'
{
  "required": ["format", "lint", "typecheck", "test"],
  "optional": ["coverage", "security"],
  "commands": {
    "format": "",
    "lint": "",
    "typecheck": "",
    "test": "",
    "coverage": "",
    "security": ""
  },
  "failure_policy": {
    "block_on_required_failure": true,
    "allow_optional_failure_with_warning": true
  }
}
JSON
fi

python3 - <<'PY' "$CONFIG_PATH" "$GATES_PATH"
import json, sys, re
config_path, gates_path = sys.argv[1], sys.argv[2]
config = open(config_path).read()
gates = json.load(open(gates_path))

def get(key):
    m = re.search(rf"^  {re.escape(key)}:\s*\"?([^\n\"]+)\"?", config, re.M)
    return m.group(1).strip() if m else ""

language = get('language').lower()
pkg = get('package_manager').lower()
commands = gates.get('commands', {})

def setdefault(name, value):
    if not str(commands.get(name, '')).strip():
        commands[name] = value

if language in ('typescript', 'javascript', 'node'):
    pm = pkg or 'npm'
    run = 'pnpm' if pm == 'pnpm' else 'yarn' if pm == 'yarn' else 'bun' if pm == 'bun' else 'npm run'
    if pm == 'npm':
        setdefault('format', 'npm run format:check')
        setdefault('lint', 'npm run lint')
        setdefault('typecheck', 'npm run typecheck')
        setdefault('test', 'npm test')
        setdefault('coverage', 'npm run test:coverage')
    elif pm == 'pnpm':
        setdefault('format', 'pnpm format:check')
        setdefault('lint', 'pnpm lint')
        setdefault('typecheck', 'pnpm typecheck')
        setdefault('test', 'pnpm test')
        setdefault('coverage', 'pnpm test:coverage')
    elif pm == 'yarn':
        setdefault('format', 'yarn format:check')
        setdefault('lint', 'yarn lint')
        setdefault('typecheck', 'yarn typecheck')
        setdefault('test', 'yarn test')
        setdefault('coverage', 'yarn test:coverage')
    elif pm == 'bun':
        setdefault('format', 'bun run format:check')
        setdefault('lint', 'bun run lint')
        setdefault('typecheck', 'bun run typecheck')
        setdefault('test', 'bun test')
        setdefault('coverage', 'bun run test:coverage')
elif language == 'python':
    setdefault('format', 'python -m ruff format --check .')
    setdefault('lint', 'python -m ruff check .')
    setdefault('typecheck', 'python -m mypy .')
    setdefault('test', 'python -m pytest')
    setdefault('coverage', 'python -m pytest --cov')
elif language == 'go':
    setdefault('format', 'gofmt -w . && git diff --exit-code')
    setdefault('lint', 'go vet ./...')
    setdefault('typecheck', 'go test ./...')
    setdefault('test', 'go test ./...')
elif language == 'rust':
    setdefault('format', 'cargo fmt --check')
    setdefault('lint', 'cargo clippy --all-targets -- -D warnings')
    setdefault('typecheck', 'cargo check')
    setdefault('test', 'cargo test')
elif language == 'java':
    setdefault('lint', './gradlew check')
    setdefault('typecheck', './gradlew compileJava')
    setdefault('test', './gradlew test')

commands.setdefault('security', '')
gates['commands'] = commands
json.dump(gates, open(gates_path, 'w'), indent=2)
PY

python3 - <<'PY' "$STATE_PATH"
import json, sys, os
path = sys.argv[1]
if os.path.exists(path):
    state = json.load(open(path))
else:
    state = {}
state.setdefault('status', 'idle')
state.setdefault('phase', '')
state.setdefault('activeRole', '')
state.setdefault('activeFeature', '')
state.setdefault('lastGateResult', 'PENDING')
state.setdefault('lastReviewResult', 'PENDING')
state.setdefault('sameFailureCount', 0)
state.setdefault('progressDelta', 0)
state.setdefault('blockers', [])
json.dump(state, open(path, 'w'), indent=2)
PY

python3 - <<'PY2' "$STATE_PATH"
import json, sys
path=sys.argv[1]
state=json.load(open(path))
state["taskId"]=""
state["status"]="idle"
state["phase"]=""
state["activeRole"]=""
state["activeFeature"]=""
state["stopCondition"]=""
state["lastFailureSignature"]=""
state["sameFailureCount"]=0
state["iteration"]=0
state["lastProgressAt"]=""
state["progressDelta"]=0
state["summary"]="초기 상태"
state["lastSuccessfulCheckpoint"]=""
state["recommendedIntervention"]="continue"
json.dump(state, open(path, "w"), indent=2)
PY2

echo "[harness:init] baseline gate defaults and state bootstrap complete"
