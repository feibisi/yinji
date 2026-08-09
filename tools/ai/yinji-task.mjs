#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { AGENT_TASK_SCHEMA, TASK_OPERATIONS } from './agent-contract.mjs';

const MODULE_PATH = fileURLToPath(import.meta.url);
const CLI_PATH = path.resolve(path.dirname(MODULE_PATH), 'yinji-cli.mjs');
const ALLOWED_TASK_KEYS = new Set([
  'schema', 'operation', 'input', 'seal', 'outputDirectory', 'output', 'manifest',
  'signCommand', 'template', 'force', 'dryRun', 'appUrl', 'cdpUrl',
]);
const ALLOWED_TEMPLATE_KEYS = new Set([
  'schema', 'pages', 'anchor', 'offsetX', 'offsetY', 'size', 'opacity',
  'rotation', 'brightness', 'removeBackground',
]);
const TEMPLATE_RANGES = {
  offsetX: [-2000, 2000], offsetY: [-2000, 2000], size: [0.05, 1],
  opacity: [0.05, 1], rotation: [-180, 180], brightness: [0, 200],
};
const TEMPLATE_ANCHORS = new Set(['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right']);

function taskError(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function requireString(task, key) {
  if (typeof task[key] !== 'string' || !task[key].trim()) taskError('TASK_INVALID', `任务缺少 ${key}`);
}

function validateTemplate(template) {
  if (!template || typeof template !== 'object' || Array.isArray(template)) taskError('TASK_INVALID', 'template 必须是 JSON 对象');
  const unknownKeys = Object.keys(template).filter((key) => !ALLOWED_TEMPLATE_KEYS.has(key));
  if (unknownKeys.length > 0) taskError('TASK_INVALID', `template 包含未知字段：${unknownKeys.join(', ')}`);
  if (template.schema !== undefined && template.schema !== 'yinji-stamp-template/v1') taskError('TASK_INVALID', 'template schema 必须是 yinji-stamp-template/v1');
  if (template.pages !== undefined && (typeof template.pages !== 'string' || template.pages.length > 200)) taskError('TASK_INVALID', 'template.pages 必须是不超过 200 字符的字符串');
  if (template.anchor !== undefined && !TEMPLATE_ANCHORS.has(template.anchor)) taskError('TASK_INVALID', `不支持的 template.anchor：${template.anchor}`);
  for (const [key, [minimum, maximum]] of Object.entries(TEMPLATE_RANGES)) {
    if (template[key] !== undefined && (typeof template[key] !== 'number' || !Number.isFinite(template[key]) || template[key] < minimum || template[key] > maximum)) {
      taskError('TASK_INVALID', `template.${key} 必须在 ${minimum} 到 ${maximum} 之间`);
    }
  }
  if (template.removeBackground !== undefined && typeof template.removeBackground !== 'boolean') taskError('TASK_INVALID', 'template.removeBackground 必须是布尔值');
}

export function validateAgentTask(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) taskError('TASK_INVALID', '任务必须是 JSON 对象');
  const unknownKeys = Object.keys(task).filter((key) => !ALLOWED_TASK_KEYS.has(key));
  if (unknownKeys.length > 0) taskError('TASK_INVALID', `任务包含未知字段：${unknownKeys.join(', ')}`);
  if (task.schema !== AGENT_TASK_SCHEMA) taskError('TASK_SCHEMA_UNSUPPORTED', `任务 schema 必须是 ${AGENT_TASK_SCHEMA}`);
  if (!TASK_OPERATIONS.includes(task.operation)) taskError('TASK_OPERATION_UNSUPPORTED', `不支持操作：${task.operation}`);
  if (['inspect', 'stamp', 'scan', 'sign'].includes(task.operation)) requireString(task, 'input');
  if (['stamp', 'scan'].includes(task.operation)) {
    requireString(task, 'seal');
    requireString(task, 'outputDirectory');
  }
  if (task.operation === 'verify') requireString(task, 'manifest');
  if (task.operation === 'sign') {
    requireString(task, 'output');
    requireString(task, 'signCommand');
  }
  if (task.template !== undefined) validateTemplate(task.template);
  return task;
}

function resolveTaskPath(value, baseDirectory) {
  if (!value || value === 'demo') return value;
  return path.isAbsolute(value) ? value : path.resolve(baseDirectory, value);
}

export function buildCliArguments(task, { baseDirectory = process.cwd(), temporaryFiles = [] } = {}) {
  validateAgentTask(task);
  const args = [task.operation];
  const add = (flag, value) => { if (value !== undefined && value !== null && value !== '') args.push(flag, String(value)); };
  add('--input', resolveTaskPath(task.input, baseDirectory));
  if (task.operation === 'stamp' || task.operation === 'scan') {
    add('--pdf', resolveTaskPath(task.input, baseDirectory));
    add('--seal', resolveTaskPath(task.seal, baseDirectory));
    add('--output-dir', resolveTaskPath(task.outputDirectory, baseDirectory));
  }
  add('--output', resolveTaskPath(task.output, baseDirectory));
  add('--manifest', resolveTaskPath(task.manifest, baseDirectory));
  add('--sign-command', resolveTaskPath(task.signCommand, baseDirectory));
  add('--app-url', task.appUrl);
  add('--cdp-url', task.cdpUrl);
  if (task.template) {
    const templatePath = path.join(os.tmpdir(), `yinji-template-${process.pid}-${Date.now()}.json`);
    fs.writeFileSync(templatePath, JSON.stringify(task.template, null, 2));
    temporaryFiles.push(templatePath);
    add('--template', templatePath);
  }
  if (task.force === true) args.push('--force');
  if (task.dryRun === true) args.push('--dry-run');
  return args;
}

export function runAgentTask(task, { baseDirectory = process.cwd() } = {}) {
  const temporaryFiles = [];
  try {
    const args = buildCliArguments(task, { baseDirectory, temporaryFiles });
    const child = spawnSync(process.execPath, [CLI_PATH, ...args], {
      cwd: baseDirectory,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    const stdout = String(child.stdout || '').trim();
    const stderr = String(child.stderr || '').trim();
    let result;
    try {
      result = JSON.parse(stdout);
    } catch {
      result = {
        schema: 'yinji-agent-result/v1',
        ok: false,
        error: { code: 'AGENT_OUTPUT_INVALID', message: 'Yinji CLI 没有返回有效 JSON' },
        diagnostics: stderr.slice(0, 4000),
      };
    }
    return { exitCode: child.status ?? 1, result, diagnostics: stderr };
  } finally {
    for (const file of temporaryFiles) {
      try { fs.unlinkSync(file); } catch {}
    }
  }
}

async function main() {
  const index = process.argv.indexOf('--task');
  if (index < 0 || !process.argv[index + 1]) taskError('TASK_PATH_REQUIRED', '用法：node tools/ai/yinji-task.mjs --task ./task.json');
  const taskPath = path.resolve(process.argv[index + 1]);
  // Windows PowerShell 5 的 Set-Content -Encoding UTF8 会写入 BOM；
  // Agent 生成的合法 JSON 不应因此无法执行。
  const task = JSON.parse(fs.readFileSync(taskPath, 'utf8').replace(/^\uFEFF/, ''));
  const execution = runAgentTask(task, { baseDirectory: path.dirname(taskPath) });
  if (execution.diagnostics) process.stderr.write(`${execution.diagnostics}\n`);
  process.stdout.write(`${JSON.stringify(execution.result, null, 2)}\n`);
  process.exitCode = execution.exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(MODULE_PATH)) {
  main().catch((error) => {
    process.stdout.write(`${JSON.stringify({
      schema: 'yinji-agent-result/v1', ok: false,
      error: { code: error.code || 'TASK_ERROR', message: error.message || String(error) },
    }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
