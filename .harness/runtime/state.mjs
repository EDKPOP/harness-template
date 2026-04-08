import { existsSync, readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';

export function loadJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function saveJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf-8');
}

export function normalizeFailureSignature(input) {
  if (!input) return '';
  return createHash('sha1').update(String(input).trim().toLowerCase()).digest('hex').slice(0, 12);
}

export function updateFailureTracking(state, signature) {
  const next = { ...state };
  if (!signature) return next;
  if (next.lastFailureSignature === signature) {
    next.sameFailureCount = (next.sameFailureCount || 0) + 1;
  } else {
    next.lastFailureSignature = signature;
    next.sameFailureCount = 1;
  }
  return next;
}

export function markProgress(state, summary = '') {
  return {
    ...state,
    lastProgressAt: new Date().toISOString(),
    progressDelta: (state.progressDelta || 0) + 1,
    summary: summary || state.summary || '',
  };
}
