# Runner Contracts

## Rule
OpenClaw should not execute role CLIs directly when a harness-managed runner exists.

## Use
- full pipeline -> `orchestrator.mjs`
- single phase or single role -> `role-runner.mjs`
- state/notification sync for existing artifact -> `phase-runner.mjs`

## Why
This preserves state, notifications, checkpoints, and consistent operator visibility.
