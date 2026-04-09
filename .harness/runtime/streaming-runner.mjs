#!/usr/bin/env node

/**
 * Streaming CLI runner with stall detection and real-time output capture.
 *
 * Replaces execFileSync for all CLI agent invocations. Key properties:
 * - Streams stdout/stderr to artifact files in real-time (visible even if process hangs)
 * - Detects output inactivity as a stall signal
 * - Emits heartbeats during execution so the orchestrator/OpenClaw can see liveness
 * - Supports graceful SIGTERM → SIGKILL escalation on timeout
 * - Captures completion signals (magic phrases) to detect done-vs-stuck
 */

import { spawn } from 'child_process';
import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const DEFAULT_TIMEOUT_MS = 600_000;       // 10 minutes total
const DEFAULT_INACTIVITY_MS = 120_000;    // 2 minutes no output = stall
const SIGKILL_GRACE_MS = 10_000;          // 10s after SIGTERM before SIGKILL
const HEARTBEAT_INTERVAL_MS = 30_000;     // heartbeat every 30s

/**
 * @typedef {Object} RunOptions
 * @property {string}   cwd                  - Working directory
 * @property {number}   [timeoutMs]          - Total execution timeout (default 600s)
 * @property {number}   [inactivityMs]       - Stall detection threshold (default 120s)
 * @property {string}   [artifactPath]       - Path to write streaming output (optional)
 * @property {string[]} [completionSignals]  - Phrases that indicate agent is done
 * @property {function} [onHeartbeat]        - Called every heartbeat interval with { elapsed, outputBytes, lastOutputAge }
 * @property {function} [onStall]            - Called when inactivity threshold breached, before kill
 */

/**
 * Run a CLI command with streaming output capture and stall detection.
 * @param {string}    cmd     - Command to run
 * @param {string[]}  args    - Arguments
 * @param {RunOptions} opts   - Options
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number, timedOut: boolean, stalled: boolean }>}
 */
export function streamingRun(cmd, args, opts = {}) {
  const {
    cwd = process.cwd(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    inactivityMs = DEFAULT_INACTIVITY_MS,
    artifactPath = null,
    completionSignals = [],
    onHeartbeat = null,
    onStall = null,
    stdinData = null,
  } = opts;

  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let lastOutputTime = Date.now();
    let timedOut = false;
    let stalled = false;
    let killed = false;
    let completionDetected = false;

    // Initialize artifact file
    if (artifactPath) {
      const dir = artifactPath.substring(0, artifactPath.lastIndexOf('/'));
      if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(artifactPath, `# Streaming output: ${cmd} ${args.join(' ')}\n# Started: ${new Date().toISOString()}\n\n`, 'utf-8');
    }

    const child = spawn(cmd, args, {
      cwd,
      stdio: [stdinData ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    // Write prompt via stdin if provided, then close the stream
    if (stdinData && child.stdin) {
      child.stdin.write(stdinData);
      child.stdin.end();
    }

    function appendToArtifact(chunk) {
      if (artifactPath) {
        try { appendFileSync(artifactPath, chunk, 'utf-8'); } catch {}
      }
    }

    function checkCompletion(text) {
      if (!completionSignals.length) return false;
      const lower = text.toLowerCase();
      return completionSignals.some(sig => lower.includes(sig.toLowerCase()));
    }

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      lastOutputTime = Date.now();
      appendToArtifact(text);
      if (checkCompletion(text)) completionDetected = true;
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      lastOutputTime = Date.now();
      appendToArtifact(`[stderr] ${text}`);
    });

    // Heartbeat interval — report liveness
    const heartbeatTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const lastOutputAge = Date.now() - lastOutputTime;
      if (onHeartbeat) {
        onHeartbeat({ elapsed, outputBytes: stdout.length + stderr.length, lastOutputAge });
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Inactivity watchdog
    const inactivityTimer = setInterval(() => {
      if (killed) return;
      const age = Date.now() - lastOutputTime;
      if (age >= inactivityMs) {
        stalled = true;
        if (onStall) onStall({ lastOutputAge: age, outputBytes: stdout.length });
        appendToArtifact(`\n\n[WATCHDOG] Stall detected: no output for ${Math.round(age / 1000)}s. Sending SIGTERM.\n`);
        gracefulKill();
      }
    }, Math.min(inactivityMs / 3, 30_000));

    // Hard timeout
    const timeoutTimer = setTimeout(() => {
      if (killed) return;
      timedOut = true;
      appendToArtifact(`\n\n[WATCHDOG] Hard timeout after ${Math.round(timeoutMs / 1000)}s. Sending SIGTERM.\n`);
      gracefulKill();
    }, timeoutMs);

    function gracefulKill() {
      if (killed) return;
      killed = true;
      try { child.kill('SIGTERM'); } catch {}
      setTimeout(() => {
        try { child.kill('SIGKILL'); } catch {}
      }, SIGKILL_GRACE_MS);
    }

    child.on('close', (code) => {
      clearInterval(heartbeatTimer);
      clearInterval(inactivityTimer);
      clearTimeout(timeoutTimer);

      if (artifactPath) {
        appendToArtifact(`\n# Finished: ${new Date().toISOString()} exit=${code} timedOut=${timedOut} stalled=${stalled}\n`);
      }

      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
        timedOut,
        stalled,
        completionDetected,
        durationMs: Date.now() - startTime,
      });
    });

    child.on('error', (err) => {
      clearInterval(heartbeatTimer);
      clearInterval(inactivityTimer);
      clearTimeout(timeoutTimer);
      stderr += `\n[spawn error] ${err.message}`;
      resolve({
        stdout,
        stderr,
        exitCode: 1,
        timedOut: false,
        stalled: false,
        completionDetected: false,
        durationMs: Date.now() - startTime,
      });
    });
  });
}
