# harness-template v3.0

ECC 교훈이 반영된 멀티 에이전트 하네스 운영 템플릿.

## Core Model

- OpenClaw는 관제자이자 환경 세터다.
- 실제 실행은 프로젝트 내부 하네스와 역할 에이전트가 맡는다.
- 이 템플릿은 새 프로젝트 시작, 기존 프로젝트 도입, 재진입, 마이그레이션의 공통 기반이다.

## Included Capabilities

- Bootstrap / Resume / Adopt / Migrate
- Discovery / Planning / Implementation / Quality Gate / Review / Optimize
- Expanded role system
- Feature-level eval schema
- Loop control and stop-loss
- Native adapter surfaces for Claude, Codex, and Gemini

## Role System

### Core roles

- Initializer
- Planner
- Implementer
- Reviewer

### Conditional roles

- Code Explorer
- Code Architect
- Silent Failure Hunter
- PR Test Analyzer
- Harness Optimizer
- Loop Operator
- Council

## Getting Started

### New project (Bootstrap)

```bash
git clone https://github.com/EDKPOP/harness-template.git my-project
cd my-project
rm -rf .git && git init
```

그 다음 OpenClaw에서 vibecoding을 사용해 환경 세팅과 하네스 초기화를 진행한다.

### Adopt into an existing project

기존 프로젝트 루트에 `.harness/`가 없다면, OpenClaw가 이 템플릿의 하네스 구조를 주입하고 Initializer가 프로젝트에 맞게 채운다.

### Resume an existing harness project

`.harness/config.yaml`, `feature_list.json`, `session-state.json`, 최근 artifacts를 기반으로 현재 상태를 읽고 이어서 진행한다.

### Migrate a legacy harness

이전 하네스 구조가 감지되면 비파괴적으로 v3 구조로 확장한다. 기존 산출물과 학습 로그는 보존한다.

## Directory Structure

```text
project/
├── AGENTS.md
├── GEMINI.md
├── .claude/
│   ├── CLAUDE.md
│   └── agents/
│       ├── planner.md
│       ├── implementer.md
│       ├── reviewer.md
│       ├── code-explorer.md
│       ├── silent-failure-hunter.md
│       ├── pr-test-analyzer.md
│       └── harness-optimizer.md
├── .harness/
│   ├── config.yaml
│   ├── feature_list.json
│   ├── session-state.json
│   ├── progress.txt
│   ├── learnings.md
│   ├── quality-gates.json
│   ├── audit-spec.json
│   ├── patterns/
│   ├── roles/
│   ├── runtime/
│   ├── artifacts/
│   └── legacy/
├── docs/
└── src/
```

## State Surfaces

OpenClaw와 loop operator는 아래를 우선적인 진실로 본다.

- `.harness/session-state.json`
- `.harness/feature_list.json`
- `.harness/artifacts/*`
- `.harness/progress.txt`
- `.harness/learnings.md`
- `.harness/patterns/*`

## Feature Schema

각 feature는 단순한 `passes` 외에도 아래를 가진다.

- `acceptance_checks`
- `regression_checks`
- `grader_type`
- `evidence`
- `status_reason`
- `risk_level`
- `gate_status`
- `review_status`

이 구조 덕분에 Planner, Gate, Reviewer, Optimizer가 같은 진실을 공유할 수 있다.

## Phase Model

```text
[Intake]
  -> [Audit]
  -> [Discover]
  -> [Plan]
  -> [Implement]
  -> [Gate]
  -> [Review]
  -> [Optimize]
  -> [Complete | Retry | Stop]
```

## Quality Gates

Gate는 reviewer와 분리된 first-class 계층이다.

기본적으로 아래 항목을 지원한다.

- format
- lint
- typecheck
- test
- coverage
- security quick checks

필수와 선택 항목은 `.harness/quality-gates.json`에서 정의한다.

## Learning Escalation

- `learnings.md`는 프로젝트 수준의 누적 로그다.
- `patterns/`는 반복되는 실패/교훈을 개별 패턴으로 승격한 공간이다.
- 반복되는 문제는 Harness Optimizer가 더 강한 규칙, gate, 또는 prompt 개선 후보로 승격한다.

## Native Adapter Surfaces

- Codex: `AGENTS.md`
- Gemini: `GEMINI.md`
- Claude: `.claude/CLAUDE.md`, `.claude/agents/*`

canonical role spec은 항상 `.harness/roles/*.md`에 둔다. adapter는 엔진 친화적 진입점일 뿐이다.

## Runtime

템플릿은 프로젝트 내부 실행용 runtime을 제공한다.

```bash
node .harness/runtime/orchestrator.mjs
```

장기적으로는 audit, gate, state, adapters 계층으로 분리된 runtime을 사용한다.

## Migration from v2

v2에서 v3로 올릴 때는 아래를 보존한다.

- 기존 artifacts
- 기존 learnings
- 기존 feature history
- 기존 progress 로그

새로운 schema, adapter, role, gate, runtime surface만 비파괴적으로 추가한다.

## Requirements

- Node.js 20+
- Git
- 하나 이상의 코딩 에이전트 CLI
  - Gemini CLI
  - Claude Code
  - Codex CLI

## License

MIT
