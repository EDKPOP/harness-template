export function recommendIntervention(state) {
  if (state.stopCondition === 'gate-commands-unconfigured') return 'pause for setup';
  if ((state.sameFailureCount || 0) >= 2) return 'reroute role composition';
  if (state.stopCondition) return 'stop and request human decision';
  if (state.phase === 'review' && state.lastReviewResult === 'FAIL') return 'reroute role composition';
  return 'continue';
}
