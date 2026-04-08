# Feature Schema

Each feature item in `.harness/feature_list.json` is the shared truth across planning, implementation, gate, review, and optimization.

## Required fields
- `id`
- `description`
- `steps`
- `acceptance_checks`
- `regression_checks`
- `grader_type`
- `passes`
- `status_reason`
- `gate_status`
- `review_status`

## Update permissions
- Planner / Initializer: can add or reshape feature items
- Implementer: can update `passes`, `status_reason`, `evidence`, `related_files`
- Gate: can update `gate_status`
- Reviewer: can update `review_status`

## Principle
Do not collapse feature truth into a single boolean when richer evidence is available.
