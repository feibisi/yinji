#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

import {
  AGENT_TASK_SCHEMA,
  MCP_PROTOCOL_VERSION,
  MCP_TOOLS,
  findMcpTool,
} from './agent-contract.mjs';
import { runAgentTask } from './yinji-task.mjs';

const SUPPORTED_PROTOCOLS = new Set(['2025-11-25', '2025-06-18', '2024-11-05']);
const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const VERSION_INFO = JSON.parse(fs.readFileSync(path.resolve(MODULE_DIRECTORY, '../../version.json'), 'utf8'));

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function response(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function rpcError(id, code, message, data) {
  send({ jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } });
}

function taskFromTool(tool, args = {}) {
  return {
    schema: AGENT_TASK_SCHEMA,
    operation: tool.operation,
    input: args.input,
    seal: args.seal,
    outputDirectory: args.outputDirectory,
    manifest: args.manifest,
    template: args.template,
    force: args.force === true,
    appUrl: args.appUrl,
    cdpUrl: args.cdpUrl,
  };
}

async function handle(message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    if (message?.id !== undefined) rpcError(message.id, -32600, 'Invalid Request');
    return;
  }
  const { id, method, params = {} } = message;
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') return;
  if (method === 'initialize') {
    const requested = params.protocolVersion;
    response(id, {
      protocolVersion: SUPPORTED_PROTOCOLS.has(requested) ? requested : MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: 'yinji', title: 'Yinji Visual Stamping', version: VERSION_INFO.version },
      instructions: '先调用 yinji_doctor；视觉盖章不是数字签名；默认使用新输出目录，完成后调用 yinji_verify。',
    });
    return;
  }
  if (method === 'ping') {
    response(id, {});
    return;
  }
  if (method === 'tools/list') {
    response(id, { tools: MCP_TOOLS.map(({ operation, ...tool }) => tool) });
    return;
  }
  if (method === 'tools/call') {
    const tool = findMcpTool(params.name);
    if (!tool) {
      rpcError(id, -32602, `Unknown tool: ${params.name || ''}`);
      return;
    }
    const execution = runAgentTask(taskFromTool(tool, params.arguments || {}), { baseDirectory: process.cwd() });
    const payload = execution.result;
    response(id, {
      content: [{ type: 'text', text: JSON.stringify(payload) }],
      structuredContent: payload,
      isError: execution.exitCode !== 0 || payload.ok !== true,
    });
    if (execution.diagnostics) process.stderr.write(`${execution.diagnostics}\n`);
    return;
  }
  if (id !== undefined) rpcError(id, -32601, `Method not found: ${method}`);
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    rpcError(null, -32700, 'Parse error');
    return;
  }
  Promise.resolve(handle(message)).catch((error) => {
    if (message.id !== undefined) rpcError(message.id, -32603, error.message || 'Internal error');
  });
});
