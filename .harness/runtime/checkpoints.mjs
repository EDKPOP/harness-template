import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export function appendCheckpoint(harnessDir, checkpoint) {
  const path = join(harnessDir, 'checkpoints.log');
  const line = JSON.stringify(checkpoint) + '\n';
  const prev = existsSync(path) ? readFileSync(path, 'utf-8') : '';
  writeFileSync(path, prev + line, 'utf-8');
}
