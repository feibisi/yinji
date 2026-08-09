# Yinji Agent 操作协议

## 目标

AI Agent 应通过 MCP、JSON 任务或 `tools/ai/yinji-cli.mjs` 操作 Yinji，而不是依赖坐标点击。所有面向 Agent 的成功和失败结果均使用 JSON；失败退出码为非零。

结果 schema：`yinji-agent-result/v1`。

## MCP 接入（推荐）

MCP 客户端使用 stdio 启动：

```json
{
  "command": "node",
  "args": ["/absolute/path/to/yinji/tools/ai/yinji-mcp-server.mjs"],
  "cwd": "/absolute/path/to/yinji"
}
```

工具：`yinji_capabilities`、`yinji_doctor`、`yinji_inspect`、`yinji_stamp`、`yinji_scan`、`yinji_verify`。MCP 只暴露视觉签章，不暴露外部证书签名器。

## 通用 JSON 任务

不支持 MCP 的 Agent 写入 `yinji-agent-task/v1`：

```json
{
  "schema": "yinji-agent-task/v1",
  "operation": "stamp",
  "input": "./contract.pdf",
  "seal": "./seal.png",
  "outputDirectory": "./out/task-001",
  "template": {
    "schema": "yinji-stamp-template/v1",
    "pages": "1,last",
    "anchor": "bottom-right",
    "offsetX": -16,
    "offsetY": 20,
    "size": 0.18,
    "opacity": 0.82,
    "rotation": -3,
    "brightness": 75,
    "removeBackground": true
  }
}
```

执行：`node tools/ai/yinji-task.mjs --task ./task.json`。相对文件路径以任务文件所在目录解析。JSON Schema 位于 `schemas/`，便携 Agent 指令位于 `integrations/agents/SKILL.md`。

## 前置检查

```bash
node tools/ai/yinji-cli.mjs capabilities
node tools/ai/yinji-cli.mjs doctor
node tools/ai/yinji-cli.mjs inspect --input ./contract.pdf
```

`doctor` 同时检查静态页面、`version.json` 和 Chrome CDP。`inspect` 会拒绝加密、损坏、非 PDF 或超过 50 MB 的输入。任一失败时不得开始写产物。

## 盖章与扫描件

```bash
node tools/ai/yinji-cli.mjs stamp \
  --pdf ./contract.pdf --seal ./seal.png \
  --template ./template.json --output-dir ./out

node tools/ai/yinji-cli.mjs scan \
  --pdf ./contract.pdf --seal ./seal.png \
  --template ./template.json --output-dir ./out
```

两条命令都输出 PDF 和 `.yinji.json`。Agent 完成操作后必须执行：

```bash
node tools/ai/yinji-cli.mjs verify \
  --manifest ./out/contract_盖章版.yinji.json
```

`verify` 对文件名、大小和 SHA-256 三项做确定性检查；任一不符退出码为 1。

默认不覆盖已有产物。只有编排器已核对目标目录并明确接受覆盖时才能传 `--force`；正式任务应优先使用新的隔离输出目录。

语义模板支持页码、五个锚点、偏移、尺寸、透明度、旋转、深浅和自动去背景。Agent 应调整模板并重新生成，不应通过屏幕像素坐标拖拽。

## 数字签名

```bash
node tools/ai/yinji-cli.mjs sign \
  --input ./out/contract_盖章版.pdf \
  --output ./out/contract_signed.pdf \
  --sign-command ./tools/signing/pyhanko_signer.py
```

Agent 不得把 `sign` 命令成功等同于证书有效。必须再调用部署方批准的独立验证器。证书口令只能通过环境变量或受管 secret 注入，不能写入命令、日志、模板或 evidence JSON。

生产环境必须把 `--sign-command` 限制在部署方批准的可执行文件名单中，不能把不可信文件路径或用户输入直接当命令执行。

## 失败处理

1. `doctor` 失败：修复静态服务/CDP，不重试业务命令。
2. `stamp`/`scan` 失败：保留输入，隔离输出目录，读取 JSON error。
3. `verify` 失败：产物判定无效，不继续签名或发送。
4. `sign` 失败：不覆盖视觉盖章结果，不切换到伪签名方案。
5. 任何命令都禁止覆盖输入文件路径。

## Agent 验收最小集合

- `capabilities.ok=true`；
- `doctor.ok=true`；
- dry-run 成功且计划中的绝对路径正确；
- 实际输出包含 PDF 与 `.yinji.json`；
- `verify.ok=true`；
- 篡改结果后 `verify.ok=false` 且退出码非零；
- 未配置签名程序时 `sign` 失败关闭；
- stdout/stderr 不含证书口令或印章原始 base64。
