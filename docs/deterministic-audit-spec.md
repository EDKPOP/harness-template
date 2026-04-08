# Deterministic Audit Spec

The harness audit should not rely on vague scoring. It should use explicit checks and return a reproducible scorecard.

## Suggested categories
- tool coverage
- context efficiency
- quality gates
- memory persistence
- eval coverage
- security guardrails
- cost efficiency

## Output contract
- overall score
- category scores
- failed checks with exact file paths
- top actions
- suggested next roles or harness improvements
