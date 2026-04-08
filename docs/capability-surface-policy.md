# Capability Surface Policy

Use the narrowest surface that preserves correctness and keeps the harness manageable.

## Preferred order
- rule-like deterministic runtime behavior inside `.harness/runtime/` when no model judgment is needed
- role spec under `.harness/roles/` for judgment-heavy behavior
- adapter surface for engine-specific entry only
- CLI/script only for deterministic local execution

## Principle
Do not turn every capability into a role if a deterministic runtime check is enough.
