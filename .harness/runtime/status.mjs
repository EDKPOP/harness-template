export function recommendIntervention(state) {
  if (state.stopCondition === 'gate-commands-unconfigured') return 'pause for setup';
  if (state.stopCondition === 'budget-exhausted') return 'stop and request human decision';
  if (state.stopCondition === 'no-progress-timeout') return 'stop and request human decision';
  if (state.stopCondition === 'cli-stall-detected') return 'reroute role composition';
  if (state.stopCondition === 'plan-failed') return 'reroute role composition';
  if ((state.sameFailureCount || 0) >= 3) return 'stop and request human decision';
  if ((state.sameFailureCount || 0) >= 2) return 'reroute role composition';
  if (state.phase === 'review' && state.lastReviewResult === 'FAIL') return 'reroute role composition';
  if (state.phase === 'audit' && state.status === 'failed') return 'stop and request human decision';
  return 'continue';
}

export function summarizeStatus(state) {
  return {
    phase: state.phase || '',
    activeRole: state.activeRole || '',
    activeFeature: state.activeFeature || '',
    lastSuccessfulCheckpoint: state.lastSuccessfulCheckpoint || '',
    lastGateResult: state.lastGateResult || 'PENDING',
    lastReviewResult: state.lastReviewResult || 'PENDING',
    sameFailureCount: state.sameFailureCount || 0,
    stopCondition: state.stopCondition || '',
    recommendedIntervention: state.recommendedIntervention || recommendIntervention(state),
    budgetUsed: state.budgetUsed || { durationMs: 0, agentCalls: 0 },
  };
}


export function autoAdvanceEnabled(config) {
  return Boolean(config?.pipeline?.auto_advance);
}
