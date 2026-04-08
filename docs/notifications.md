# Notifications

The harness should emit phase-level notification events that OpenClaw can read and forward to the originating chat session.

## Surfaces
- `.harness/notifications.log` -> append-only event stream
- `.harness/notification-latest.json` -> latest event snapshot

## Event fields
- timestamp
- phase
- status
- summary
- optional verdict / iteration / topActions / intervention info

## OpenClaw behavior
OpenClaw should watch these surfaces and send concise progress updates to the requesting session whenever phase state materially changes.
