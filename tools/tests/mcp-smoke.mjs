import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import readline from 'node:readline';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const server = spawn(process.execPath, [path.join(root, 'tools/ai/yinji-mcp-server.mjs')], {
  cwd: root, stdio: ['pipe', 'pipe', 'pipe'],
});
const lines = readline.createInterface({ input: server.stdout });
const pending = new Map();
lines.on('line', (line) => {
  const message = JSON.parse(line);
  const callback = pending.get(message.id);
  if (callback) { pending.delete(message.id); callback(message); }
});
let id = 0;
const request = (method, params = {}) => new Promise((resolve, reject) => {
  const requestId = ++id;
  const timer = setTimeout(() => reject(new Error(`MCP timeout: ${method}`)), 120000);
  pending.set(requestId, (message) => { clearTimeout(timer); resolve(message); });
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params })}\n`);
});

try {
  const initialized = await request('initialize', {
    protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'yinji-test', version: '1' },
  });
  assert.equal(initialized.result.protocolVersion, '2025-11-25');
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  const listed = await request('tools/list');
  assert.ok(listed.result.tools.some((tool) => tool.name === 'yinji_stamp'));
  assert.ok(listed.result.tools.some((tool) => tool.name === 'yinji_verify'));
  const called = await request('tools/call', { name: 'yinji_capabilities', arguments: {} });
  assert.equal(called.result.isError, false);
  assert.equal(called.result.structuredContent.ok, true);
  const unknown = await request('tools/call', { name: 'yinji_unknown', arguments: {} });
  assert.equal(unknown.error.code, -32602);
  let e2e = false;
  if (process.env.YINJI_MCP_E2E === '1') {
    const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'yinji-mcp-e2e-'));
    try {
      const stamped = await request('tools/call', {
        name: 'yinji_stamp',
        arguments: {
          input: path.join(root, 'test-fixture.pdf'), seal: 'demo', outputDirectory,
          template: { pages: 'all', anchor: 'top-left', size: 0.12, brightness: 70, removeBackground: true },
        },
      });
      assert.equal(stamped.result.isError, false);
      const manifest = path.join(outputDirectory, 'test-fixture_盖章版.yinji.json');
      const verified = await request('tools/call', { name: 'yinji_verify', arguments: { manifest } });
      assert.equal(verified.result.isError, false);
      e2e = true;
    } finally {
      fs.rmSync(outputDirectory, { recursive: true, force: true });
    }
  }
  console.log(JSON.stringify({ ok: true, suite: 'mcp-smoke', tools: listed.result.tools.length, e2e }));
} finally {
  server.stdin.end();
  server.kill('SIGTERM');
}
