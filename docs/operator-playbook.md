# Operator Playbook

## If audit fails
- inspect failed checks
- apply top actions
- do not continue into implementation

## If gates are pending
- complete environment setup first
- rerun init/bootstrap logic if required

## If sameFailureCount >= 2
- stop blind retry
- reroute role composition
- involve harness-optimizer

## If review escalates to council
- do not continue with default loop until ambiguity is resolved
