# Instinct Schema

## Fields
- title
- trigger
- observed_pattern
- recommended_response
- escalation_target
- confidence
- source
- promoted_from

## Principle
An instinct should be reusable across future similar failures, not just descriptive of one incident.

## Suggested metadata values
- confidence: low | medium | high
- escalation_target: learning | pattern | instinct | gate | rule | adapter
- source: review | gate | optimizer | manual
