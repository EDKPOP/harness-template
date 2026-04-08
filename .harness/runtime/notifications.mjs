import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export function appendNotification(harnessDir, event) {
  const path = join(harnessDir, 'notifications.log');
  const prev = existsSync(path) ? readFileSync(path, 'utf-8') : '';
  writeFileSync(path, prev + JSON.stringify(event) + '\n', 'utf-8');
}

export function writeLatestNotification(harnessDir, event) {
  const path = join(harnessDir, 'notification-latest.json');
  writeFileSync(path, JSON.stringify(event, null, 2), 'utf-8');
}

export function buildPhaseEvent(phase, status, summary, extra = {}) {
  return {
    timestamp: new Date().toISOString(),
    phase,
    status,
    summary,
    ...extra,
  };
}
