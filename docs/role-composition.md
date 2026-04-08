# Role Composition

## Mandatory compositions
- Bootstrap -> initializer + planner + implementer + reviewer
- Adopt -> initializer + code-explorer + planner + implementer + reviewer
- Migrate -> initializer + reviewer baseline + harness-optimizer when drift repeats
- Resume -> loop-operator + whichever role is required by current state

## Structural change composition
- code-explorer + code-architect + planner before implementation

## Suspicion-driven composition
- reviewer + silent-failure-hunter when hidden failure is suspected
- reviewer + pr-test-analyzer when tests are behaviorally weak

## Repeated failure composition
- loop-operator + harness-optimizer before another implementer retry

## Ambiguous decision composition
- council joins before route or scope is finalized
