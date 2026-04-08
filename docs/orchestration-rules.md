# Orchestration Rules

## Mandatory role routing

### By mode
- Bootstrap -> initializer, planner, implementer, reviewer
- Resume -> initializer or loop-operator first, then selective routing based on current state
- Adopt -> initializer, code-explorer, planner are mandatory before implementation
- Migrate -> initializer is mandatory, harness-optimizer participates when structural gaps repeat

### By task shape
- Existing codebase with unclear structure -> code-explorer required
- Large structural or architectural change -> code-architect required
- Repeated hidden breakage or suspicious green runs -> silent-failure-hunter required
- Reviewer indicates weak behavioral coverage -> pr-test-analyzer required
- Repeated similar failures -> harness-optimizer required
- Ambiguous route or scope decision -> council required

## Escalation rules
- Same failure signature twice -> stop normal retry, invoke harness-optimizer
- Gate failure caused by missing commands/config -> pause and surface setup requirement
- No progress across two checkpoints -> loop-operator must decide continue, escalate, or stop
- Review suggests hidden failure -> run silent-failure-hunter before another implementer retry
- Review suggests misleading or brittle tests -> run pr-test-analyzer before another implementer retry
