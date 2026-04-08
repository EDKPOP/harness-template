import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

export function loadQualityGates(gatesPath) {
  if (!existsSync(gatesPath)) return null;
  return JSON.parse(readFileSync(gatesPath, 'utf-8'));
}

export function runQualityGates({ gates, cwd, dryRun = false }) {
  const results = [];
  if (!gates) {
    return { verdict: 'FAIL', results: [{ name: 'config', status: 'fail', output: 'quality gates config missing' }] };
  }

  const required = gates.required || [];
  const optional = gates.optional || [];
  const commands = gates.commands || {};

  function runOne(name, requiredFlag) {
    const command = commands[name];
    if (!command || !String(command).trim()) {
      return { name, status: requiredFlag ? 'pending' : 'warning', output: 'command not configured' };
    }
    if (dryRun) {
      return { name, status: 'pass', output: `[DRY RUN] ${command}` };
    }
    try {
      const output = execSync(command, {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 300000,
      });
      return { name, status: 'pass', output };
    } catch (error) {
      return {
        name,
        status: requiredFlag ? 'fail' : 'warning',
        output: error.stdout || error.stderr || error.message,
      };
    }
  }

  for (const name of required) results.push(runOne(name, true));
  for (const name of optional) results.push(runOne(name, false));

  const hasRequiredFail = results.some((r) => required.includes(r.name) && r.status === 'fail');
  const hasRequiredPending = results.some((r) => required.includes(r.name) && r.status === 'pending');
  const hasWarning = results.some((r) => r.status === 'warning');

  return {
    verdict: hasRequiredFail ? 'FAIL' : hasRequiredPending ? 'PENDING' : hasWarning ? 'WARNING_ONLY' : 'PASS',
    results,
  };
}
