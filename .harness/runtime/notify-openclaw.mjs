#!/usr/bin/env node

import { readFileSync, existsSync } from 'fs';
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
const targetSurface = process.env.OPENCLAW_NOTIFY_SURFACE || '';

let payload = {};
if (payloadPath && existsSync(payloadPath)) {
  try {
    payload = JSON.parse(readFileSync(payloadPath, 'utf-8'));
  } catch {}
}

const envelope = {
  kind: 'vibecoding-phase-notification',
  phase,
  status,
  summary,
  target: {
    chatId: targetChatId,
    channel: targetChannel,
    surface: targetSurface,
  },
  payload,
};

process.stdout.write(JSON.stringify(envelope));
