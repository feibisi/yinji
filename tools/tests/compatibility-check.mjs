import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function run(script, args = []) {
  const result = spawnSync(process.execPath, [path.join(root, script), ...args], { cwd: root, encoding: 'utf8' });
  let payload = null;
  try { payload = JSON.parse(String(result.stdout || '').trim()); } catch {}
  return { ok: result.status === 0 && payload?.ok === true, exitCode: result.status, payload, stderr: String(result.stderr || '').trim() };
}

const report = {
  schema: 'yinji-compatibility-report/v1',
  environment: { platform: process.platform, release: os.release(), arch: process.arch, node: process.version },
  checks: {
    doctor: run('tools/ai/yinji-cli.mjs', ['doctor']),
    agentContract: run('tools/tests/agent-contract.test.mjs'),
    mcp: run('tools/tests/mcp-smoke.mjs'),
    browserUnit: run('tools/tests/browser-unit.mjs'),
  },
};
report.ok = Object.values(report.checks).every((check) => check.ok);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
