import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { inspectLocalFile } from '../ai/file-preflight.mjs';
import { buildCliArguments, runAgentTask, validateAgentTask } from '../ai/yinji-task.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'yinji-contract-'));
try {
  const valid = inspectLocalFile(path.join(root, 'test-fixture.pdf'));
  assert.equal(valid.ok, true);
  assert.equal(valid.kind, 'pdf');

  const malformed = path.join(temp, '损坏.pdf');
  fs.writeFileSync(malformed, '%PDF-1.7\nno eof');
  assert.equal(inspectLocalFile(malformed).code, 'PDF_EOF_MISSING');

  const encrypted = path.join(temp, 'encrypted.pdf');
  fs.writeFileSync(encrypted, '%PDF-1.7\n1 0 obj << /Encrypt 2 0 R >>\n%%EOF');
  assert.equal(inspectLocalFile(encrypted).code, 'PDF_ENCRYPTED_UNSUPPORTED');

  const fakeSeal = path.join(temp, 'seal.png');
  fs.writeFileSync(fakeSeal, 'not an image');
  assert.equal(inspectLocalFile(fakeSeal, { expected: 'seal' }).code, 'SEAL_FORMAT_UNSUPPORTED');

  const task = validateAgentTask({ schema: 'yinji-agent-task/v1', operation: 'inspect', input: './test-fixture.pdf' });
  const args = buildCliArguments(task, { baseDirectory: root });
  assert.deepEqual(args, ['inspect', '--input', path.join(root, 'test-fixture.pdf')]);
  assert.throws(
    () => validateAgentTask({ schema: 'yinji-agent-task/v1', operation: 'inspect', input: './test-fixture.pdf', surprise: true }),
    /未知字段/
  );
  assert.throws(
    () => validateAgentTask({
      schema: 'yinji-agent-task/v1', operation: 'stamp', input: './test-fixture.pdf',
      seal: 'demo', outputDirectory: './out', template: { brightnes: 50 },
    }),
    /template 包含未知字段/
  );

  const execution = runAgentTask({ schema: 'yinji-agent-task/v1', operation: 'capabilities' }, { baseDirectory: root });
  assert.equal(execution.exitCode, 0);
  assert.equal(execution.result.schema, 'yinji-agent-result/v1');
  assert.equal(execution.result.ok, true);
  assert.equal(execution.result.contracts.task, 'yinji-agent-task/v1');

  for (const schema of fs.readdirSync(path.join(root, 'schemas'))) {
    JSON.parse(fs.readFileSync(path.join(root, 'schemas', schema), 'utf8'));
  }
  console.log(JSON.stringify({ ok: true, suite: 'agent-contract', checks: 14 }));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
