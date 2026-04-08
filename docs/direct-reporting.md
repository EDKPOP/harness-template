# Direct Reporting

The harness must attempt direct OpenClaw-facing reporting whenever a phase event is emitted.

## Mechanism
- notification surfaces are still written locally
- runtime then calls `.harness/runtime/notify-openclaw.mjs`
- the notifier reads environment variables that identify the active OpenClaw session target

## Required environment variables
- `OPENCLAW_NOTIFY_CHAT_ID`
- `OPENCLAW_NOTIFY_CHANNEL`
- `OPENCLAW_NOTIFY_SURFACE`

## Principle
If OpenClaw monitoring dies unexpectedly, the harness should still attempt to send phase updates through the direct notifier path.
