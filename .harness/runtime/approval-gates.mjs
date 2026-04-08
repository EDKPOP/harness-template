export function requiresApproval(state, phase) {
  if (phase === 'implement') return { required: true, gate: 'plan-approved' };
  if (state.stopCondition === 'destructive-migration') return { required: true, gate: 'destructive-migration' };
  if (state.stopCondition === 'public-deploy') return { required: true, gate: 'public-deploy' };
  if (state.stopCondition === 'cli-fallback') return { required: true, gate: 'cli-fallback' };
  return { required: false, gate: '' };
}
