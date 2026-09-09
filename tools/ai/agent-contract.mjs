export const AGENT_TASK_SCHEMA = 'yinji-agent-task/v1';
export const AGENT_RESULT_SCHEMA = 'yinji-agent-result/v1';
export const MCP_PROTOCOL_VERSION = '2025-11-25';

export const TASK_OPERATIONS = Object.freeze([
  'capabilities',
  'doctor',
  'inspect',
  'stamp',
  'scan',
  'verify',
  'sign',
]);

const templateSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    schema: { const: 'yinji-stamp-template/v1' },
    pages: { type: 'string', description: 'all、first、last、1,3-5 等页码表达式' },
    anchor: { enum: ['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'] },
    offsetX: { type: 'number', minimum: -2000, maximum: 2000 },
    offsetY: { type: 'number', minimum: -2000, maximum: 2000 },
    size: { type: 'number', minimum: 0.05, maximum: 1 },
    opacity: { type: 'number', minimum: 0.05, maximum: 1 },
    rotation: { type: 'number', minimum: -180, maximum: 180 },
    brightness: { type: 'number', minimum: 0, maximum: 200 },
    removeBackground: { type: 'boolean' },
  },
};

const fileResultSchema = {
  type: 'object',
  properties: {
    schema: { const: AGENT_RESULT_SCHEMA },
    ok: { type: 'boolean' },
  },
  required: ['schema', 'ok'],
};

export const MCP_TOOLS = Object.freeze([
  {
    name: 'yinji_capabilities',
    title: 'Yinji capabilities',
    description: '发现 Yinji 版本、协议、能力和安全边界。只读。',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    outputSchema: fileResultSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    operation: 'capabilities',
  },
  {
    name: 'yinji_doctor',
    title: 'Check Yinji runtime',
    description: '在写文件前检查 Yinji 页面和 Chrome CDP 是否为可用实例。只读。',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: { appUrl: { type: 'string' }, cdpUrl: { type: 'string' } },
    },
    outputSchema: fileResultSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    operation: 'doctor',
  },
  {
    name: 'yinji_inspect',
    title: 'Inspect a local PDF',
    description: '读取本地 PDF 的格式、大小和 SHA-256；加密、损坏或超限文件失败关闭。只读。',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: { input: { type: 'string', description: '本地 PDF 绝对路径' } }, required: ['input'],
    },
    outputSchema: fileResultSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    operation: 'inspect',
  },
  {
    name: 'yinji_stamp',
    title: 'Apply a visual stamp',
    description: '按语义页码、锚点、偏移、大小、透明度、旋转、深浅和去背景设置生成视觉盖章 PDF；不等于数字签名。',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        input: { type: 'string', description: '本地 PDF 绝对路径' },
        seal: { type: 'string', description: '本地栅格印章绝对路径，或 demo' },
        outputDirectory: { type: 'string', description: '隔离输出目录绝对路径' },
        template: templateSchema,
        force: { type: 'boolean', default: false, description: '明确允许覆盖已有产物' },
        appUrl: { type: 'string' }, cdpUrl: { type: 'string' },
      },
      required: ['input', 'seal', 'outputDirectory'],
    },
    outputSchema: fileResultSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    operation: 'stamp',
  },
  {
    name: 'yinji_scan',
    title: 'Apply a visual stamp and scan effect',
    description: '生成视觉盖章扫描件 PDF 和 evidence；不等于真实扫描仪原件或数字签名。',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        input: { type: 'string' }, seal: { type: 'string' }, outputDirectory: { type: 'string' },
        template: templateSchema, force: { type: 'boolean', default: false },
        appUrl: { type: 'string' }, cdpUrl: { type: 'string' },
      },
      required: ['input', 'seal', 'outputDirectory'],
    },
    outputSchema: fileResultSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    operation: 'scan',
  },
  {
    name: 'yinji_verify',
    title: 'Verify a Yinji evidence record',
    description: '验证产物文件名、大小和 SHA-256。只读；不等于证书验签。',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: { manifest: { type: 'string' }, input: { type: 'string' } }, required: ['manifest'],
    },
    outputSchema: fileResultSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    operation: 'verify',
  },
]);

export function findMcpTool(name) {
  return MCP_TOOLS.find((tool) => tool.name === name) || null;
}
