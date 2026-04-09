# harness-template v3.1

역할 기반 멀티모델 오케스트레이션이 반영된 멀티 에이전트 하네스 운영 템플릿.

## Principle 0 — Role-Oriented Multi-Model Orchestration

이 템플릿의 첫 번째 원칙은 각 역할을 가장 적합한 모델/엔진에 배치하는 것이다.

### Default Role → Engine Mapping

| Role | Default Engine | Rationale |
|------|---------------|-----------|
| planner | Gemini | 탐색, 아키텍처 트레이드오프, 요구사항 분해 |
| implementer | Claude | 코드 생성, 테스트, 정밀 구현 |
| reviewer | Codex | 독립 리뷰, 샌드박스 검증 |
| initializer | Claude | 하네스 초기화 |
| code-explorer | Gemini | 기존 코드 탐색 |
| code-architect | Gemini | 구조 설계 |
| silent-failure-hunter | Codex | 숨겨진 실패 탐지 |
| pr-test-analyzer | Codex | 테스트 품질 판정 |
| harness-optimizer | Claude | 하네스 개선 |

이 매핑은 기본값이며, Engine Resolution (Phase 0)에서 가용성에 따라 폴백될 수 있다.

### Engine Fallback Chain

| Unavailable | Fallback 1 | Fallback 2 |
|-------------|-----------|-----------|
| Gemini | Claude | Codex |
| Claude | Codex | Gemini |
| Codex | Claude | Gemini |

## Core Model

- OpenClaw는 관제자이자 오케스트레이터/라우터다.
- 실제 실행은 프로젝트 내부 하네스와 역할 에이전트가 맡는다.
- 각 역할은 해당 역할에 가장 적합한 엔진에 매핑된다.
- 이 템플릿은 새 프로젝트 시작, 기존 프로젝트 도입, 재진입, 마이그레이션의 공통 기반이다.

## Included Capabilities

- Engine Resolution / Availability Detection / Fallback
- Bootstrap / Resume / Adopt / Migrate
- Discovery / Planning / Implementation / Quality Gate / Review / Optimize
- Expanded role system with engine affinity
- Feature-level eval schema
- Loop control and stop-loss
- Native adapter surfaces for Claude, Codex, and Gemini

## Role System

### Core roles

| Role | Default Engine |
|------|---------------|
| Initializer | Claude |
| Planner | Gemini |
| Implementer | Claude |
| Reviewer | Codex |

### Conditional roles

| Role | Default Engine |
|------|---------------|
| Code Explorer | Gemini |
| Code Architect | Gemini |
| Silent Failure Hunter | Codex |
| PR Test Analyzer | Codex |
| Harness Optimizer | Claude |
| Loop Operator | (runtime) |
| Council | (multi-engine) |

## Getting Started

### New project (Bootstrap)

```bash
git clone https://github.com/EDKPOP/harness-template.git my-project
cd my-project
rm -rf .git && git init
```

그 다음 OpenClaw에서 vibecoding을 사용해 Engine Resolution과 환경 세팅을 진행한다.

### Adopt into an existing project

기존 프로젝트 루트에 `.harness/`가 없다면, OpenClaw가 이 템플릿의 하네스 구조를 주입하고, Engine Resolution으로 역할-엔진 매핑을 확정한 후, Initializer가 프로젝트에 맞게 채운다.

### Resume an existing harness project

`.harness/config.yaml`의 기존 역할-엔진 매핑이 여전히 유효한지 확인하고, 유효하지 않으면 Engine Resolution을 다시 실행한 후, 기존 상태에서 이어서 진행한다.

### Migrate a legacy harness

이전 하네스 구조가 감지되면 비파괴적으로 v3.1 구조로 확장한다. 기존 산출물과 학습 로그는 보존한다. 새로운 `engine_status`, `engine_fallback`, `engine_overrides` 설정을 추가한다.

## Directory Structure

```text
project/
├── AGENTS.md                      # Codex adapter (reviewer roles)
├── GEMINI.md                      # Gemini adapter (planner roles)
├── .claude/
│   ├── CLAUDE.md                  # Claude adapter (implementer roles)
│   └── agents/
│       ├── planner.md
│       ├── implementer.md
│       ├── reviewer.md
│       ├── code-explorer.md
│       ├── silent-failure-hunter.md
│       ├── pr-test-analyzer.md
│       └── harness-optimizer.md
├── .harness/
│   ├── config.yaml                # includes engine mapping & fallback
│   ├── feature_list.json
│   ├── session-state.json         # includes engineStatus & engineOverrides
│   ├── progress.txt
│   ├── learnings.md
│   ├── quality-gates.json
│   ├── audit-spec.json
│   ├── patterns/
│   ├── roles/                     # canonical role specs
│   ├── runtime/
│   │   ├── state.mjs
│   │   ├── gates.mjs
│   │   ├── engine-resolver.mjs    # engine availability & fallback
│   │   └── orchestrator.mjs
│   ├── artifacts/
│   └── legacy/
├── docs/
└── src/
```

## Phase Model

```text
[Engine Resolution]       ← Phase 0: detect engines, resolve mapping
  -> [Intake]
  -> [Audit]
  -> [Discover]           ← default: Gemini
  -> [Plan]               ← default: Gemini
  -> [Implement]          ← default: Claude
  -> [Gate]               ← runtime scripts
  -> [Review]             ← default: Codex
  -> [Optimize]           ← default: Claude
  -> [Complete | Retry | Stop]
```

## State Surfaces

OpenClaw와 loop operator는 아래를 우선적인 진실로 본다.

- `.harness/session-state.json` (includes `engineStatus`, `engineOverrides`)
- `.harness/config.yaml` (includes `agents` engine mapping)
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

## Quality Gates

Gate는 reviewer와 분리된 first-class 계층이다. Runtime scripts가 실행하며 엔진에 의존하지 않는다.

## Learning Escalation

- `learnings.md`는 프로젝트 수준의 누적 로그다 (엔진 폴백 이벤트 포함).
- `patterns/`는 반복되는 실패/교훈을 개별 패턴으로 승격한 공간이다.
- 반복되는 문제는 Harness Optimizer가 더 강한 규칙, gate, 또는 prompt 개선 후보로 승격한다.

## Native Adapter Surfaces

- Codex: `AGENTS.md` — reviewer, silent-failure-hunter, pr-test-analyzer 진입점
- Gemini: `GEMINI.md` — planner, code-explorer, code-architect 진입점
- Claude: `.claude/CLAUDE.md`, `.claude/agents/*` — implementer, initializer, harness-optimizer 진입점

canonical role spec은 항상 `.harness/roles/*.md`에 둔다. adapter는 엔진 친화적 진입점일 뿐이다.

## Runtime

```bash
node .harness/runtime/orchestrator.mjs
```

Runtime includes:
- `engine-resolver.mjs` — engine availability detection and fallback resolution
- `state.mjs` — state management
- `gates.mjs` — quality gate execution
- `orchestrator.mjs` — phase orchestration

## Migration from v3.0

v3.0에서 v3.1로 올릴 때:
- `config.yaml`에 `engine_status`, `engine_fallback`, `engine_overrides` 추가
- `session-state.json`에 `engineStatus`, `engineOverrides` 필드 추가
- pipeline phases에 `engine-resolution` 추가
- 기존 agents 섹션의 engine 값을 멀티모델 기본값으로 갱신
- `engine-resolver.mjs` runtime 모듈 추가

기존 artifacts, learnings, features, progress는 보존한다.

## Requirements

- Node.js 20+
- Git
- 하나 이상의 코딩 에이전트 CLI (모두 있을 때 최적)
  - Gemini CLI — planner, explorer, architect 역할
  - Claude Code — implementer, initializer, optimizer 역할
  - Codex CLI — reviewer, failure hunter, test analyzer 역할

## License

MIT
