/**
 * engine-resolver.mjs — Engine availability detection and fallback resolution
 *
 * Implements Principle 0: Role-Oriented Multi-Model Orchestration.
 * This module detects which CLI engines are available, applies
 * the default role-engine mapping, and resolves fallbacks for
 * unavailable engines.
 */

import { execSync } from 'child_process';
import { loadJson, saveJson } from './state.mjs';

// Default role → engine mapping (Principle 0)
const DEFAULT_ENGINE_MAP = {
  initializer: 'claude',
  explorer: 'gemini',
  architect: 'gemini',
  planner: 'gemini',
  implementer: 'claude',
  reviewer: 'codex',
  silent_failure_hunter: 'codex',
  pr_test_analyzer: 'codex',
  harness_optimizer: 'claude',
};

// Fallback chain per engine
const FALLBACK_CHAIN = {
  gemini: ['claude', 'codex'],
  claude: ['codex', 'gemini'],
  codex: ['claude', 'gemini'],
};

/**
 * Check if a CLI engine is available and responsive.
 * @param {'gemini'|'claude'|'codex'} engine
 * @returns {'ready'|'installed-not-authenticated'|'unavailable'|'degraded'}
 */
export function detectEngineStatus(engine) {
  const versionCmd = {
    gemini: 'gemini --version',
    claude: 'claude --version',
    codex: 'codex --version',
  };

  const cmd = versionCmd[engine];
  if (!cmd) return 'unavailable';

  try {
    execSync(cmd, { stdio: 'pipe', timeout: 10_000 });
    return 'ready';
  } catch (err) {
    const stderr = err.stderr?.toString() || '';
    const stdout = err.stdout?.toString() || '';
    const output = stderr + stdout;

    if (output.match(/auth|unauthorized|token|login|credential/i)) {
      return 'installed-not-authenticated';
    }
    if (err.code === 'ENOENT' || output.match(/command not found|not recognized/i)) {
      return 'unavailable';
    }
    return 'degraded';
  }
}

/**
 * Detect availability of all three engines.
 * @returns {{ gemini: string, claude: string, codex: string }}
 */
export function detectAllEngines() {
  return {
    gemini: detectEngineStatus('gemini'),
    claude: detectEngineStatus('claude'),
    codex: detectEngineStatus('codex'),
  };
}

/**
 * Check if an engine status means it can execute roles.
 * @param {string} status
 * @returns {boolean}
 */
function isUsable(status) {
  return status === 'ready';
}

/**
 * Resolve the role-engine mapping given engine availability.
 * Applies fallback chain for unavailable engines.
 *
 * @param {{ gemini: string, claude: string, codex: string }} engineStatus
 * @returns {{ agents: Record<string, string>, overrides: Record<string, string>, warnings: string[] }}
 */
export function resolveEngineMapping(engineStatus) {
  const agents = {};
  const overrides = {};
  const warnings = [];

  for (const [role, defaultEngine] of Object.entries(DEFAULT_ENGINE_MAP)) {
    if (isUsable(engineStatus[defaultEngine])) {
      agents[role] = defaultEngine;
      continue;
    }

    // Default engine unavailable — apply fallback
    const chain = FALLBACK_CHAIN[defaultEngine] || [];
    let resolved = null;

    for (const fallback of chain) {
      if (isUsable(engineStatus[fallback])) {
        resolved = fallback;
        break;
      }
    }

    if (resolved) {
      agents[role] = resolved;
      overrides[role] = resolved;
      warnings.push(
        `Role "${role}": default engine "${defaultEngine}" is ${engineStatus[defaultEngine]}, falling back to "${resolved}"`
      );
    } else {
      agents[role] = defaultEngine; // keep default even if unavailable — will fail at execution
      warnings.push(
        `Role "${role}": no usable engine found. Default "${defaultEngine}" is ${engineStatus[defaultEngine]}, all fallbacks also unavailable.`
      );
    }
  }

  return { agents, overrides, warnings };
}

/**
 * Run full Engine Resolution (Phase 0).
 * Detects engines, resolves mapping, writes to config and state.
 *
 * @param {string} configPath  Path to .harness/config.yaml (for logging; actual YAML write is caller's responsibility)
 * @param {string} statePath   Path to .harness/session-state.json
 * @returns {{ engineStatus: object, agents: object, overrides: object, warnings: string[], needsApproval: boolean }}
 */
export function runEngineResolution(statePath) {
  const engineStatus = detectAllEngines();
  const { agents, overrides, warnings } = resolveEngineMapping(engineStatus);

  const needsApproval = Object.keys(overrides).length > 0;

  // Update session state
  const state = loadJson(statePath, {});
  state.engineStatus = engineStatus;
  state.engineOverrides = overrides;
  state.engineResolutionAt = new Date().toISOString();
  state.phase = needsApproval ? 'engine-resolution-pending-approval' : 'engine-resolution-complete';
  saveJson(statePath, state);

  return { engineStatus, agents, overrides, warnings, needsApproval };
}

/**
 * Re-resolve a single role when its engine fails during execution.
 *
 * @param {string} role            The role that failed
 * @param {string} failedEngine    The engine that failed
 * @param {{ gemini: string, claude: string, codex: string }} currentStatus  Current engine status
 * @returns {{ newEngine: string|null, warning: string }}
 */
export function reResolveRole(role, failedEngine, currentStatus) {
  const chain = FALLBACK_CHAIN[failedEngine] || [];

  for (const fallback of chain) {
    if (isUsable(currentStatus[fallback])) {
      return {
        newEngine: fallback,
        warning: `Runtime re-resolution: role "${role}" failed on "${failedEngine}", switching to "${fallback}"`,
      };
    }
  }

  return {
    newEngine: null,
    warning: `Runtime re-resolution: role "${role}" failed on "${failedEngine}", no fallback available`,
  };
}
