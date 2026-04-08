#!/usr/bin/env node

import { readFileSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { parseArgs } from 'util';

const { values } = parseArgs({
  options: {
    phase: { type: 'string' },
    status: { type: 'string' },
    summary: { type: 'string' },
    payload: { type: 'string' },
  },
  strict: false,
});

const phase = values.phase || '';
const status = values.status || '';
const summary = values.summary || '';
const payloadPath = values.payload || '';

const targetChatId = process.env.OPENCLAW_NOTIFY_CHAT_ID || '';
const targetChannel = process.env.OPENCLAW_NOTIFY_CHANNEL || '';
const targetSurface = process.env.OPENCLAW_NOTIFY_SURFACE || targetChannel || '';
const sendEnabled = (process.env.OPENCLAW_NOTIFY_SEND || '1') !== '0';

let payload = {};
if (payloadPath && existsSync(payloadPath)) {
  try {
    payload = JSON.parse(readFileSync(payloadPath, 'utf-8'));
  } catch {}
}

const phaseNumMap = { intake: '0', audit: '0.5', discover: '1', plan: '2', implement: '3', gate: '4', review: '5', optimize: '6', final: 'done' };
const label = phaseNumMap[phase] || phase;
const message = `phase ${label}. ${summary}`;
const envelope = {
  kind: 'vibecoding-phase-notification',
  phase,
  status,
  summary,
  message,
  target: { chatId: targetChatId, channel: targetChannel, surface: targetSurface },
  payload,
};

if (!targetChatId || !targetSurface || !sendEnabled) {
  process.stdout.write(JSON.stringify(envelope));
  process.exit(0);
}

const result = spawnSync('openclaw', [
  'message', 'send',
  '--channel', targetSurface,
  '--target', targetChatId,
  '--message', message,
], { encoding: 'utf-8' });

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'notify-openclaw failed');
  process.exit(result.status || 1);
}

process.stdout.write(JSON.stringify({ ...envelope, delivered: true, transport: 'openclaw message send' }));
