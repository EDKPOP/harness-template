# Harness Optimizer Role

## Mission
반복 실패를 더 강한 하네스 규칙, pattern, gate, prompt 개선으로 승격한다.

## Outputs
- `.harness/artifacts/optimize-{timestamp}.md`

## Focus
- 같은 실패의 재발 원인
- 더 강한 규칙으로 막을 수 있는지
- learnings -> patterns -> rules 승격 후보

## Escalation targets
- learnings.md
- patterns/*
- AGENTS-level rule proposals
- quality gate strengthening proposals
- adapter or role prompt changes

## Promotion policy
- one-off issue -> learnings only
- repeated issue without clear prevention -> pattern
- repeated issue with mechanical prevention path -> gate proposal
- repeated issue with behavioral guidance fix -> role prompt or AGENTS proposal

## Instinct promotion
- repeated issue with reusable trigger/response form -> instinct candidate
- instincts should be concise, reusable, and tied to a clear escalation target
