# 印迹（Yinji）

印迹是本地运行的 PDF 视觉盖章工具。普通章、骑缝章、手写签名图像和批量处理都在浏览器里完成，文件不会上传到服务器。

手写签名和印章以图像方式叠加，不是数字证书签名，不提供签署者身份验证或文档防篡改能力。扫描件功能是视觉模拟效果，不代表文件由真实扫描设备生成。

常用印章默认只写入当前浏览器会话；关闭整个浏览器后消失。长期保存或迁移使用口令加密的印章库备份。

人工导出下载单个 `.yinji.zip` 证据包，内含结果文件和 `.yinji.json`；Agent CLI 则把两者分别写入输出目录。记录包含输入/输出 SHA-256 和盖章操作摘要，但不等同于数字证书签名。

导出页提供三个一级入口：**普通导出、扫描件、批量处理**。扫描件不再隐藏在普通导出的折叠区中。

## 本地运行

```bash
cd /home/parallels/Projects/yinji
python3 -m http.server 8123
```

打开 `http://127.0.0.1:8123/index.html`。

当前版本：`1.3.0-rc.1`。这是用于跨平台和 Agent 接入验收的候选版本，不是已完成公开发布授权的稳定版。

## 目录

- `index.html`：页面入口
- `src/main.js`：应用入口和装配逻辑
- `src/core/`：状态、设置、印章库、批量处理
- `src/modules/`：PDF、画布、导出、辅助线等功能
- `src/features/`：从入口拆出的业务功能
- `src/ui/`：弹窗、通知、加载等界面模块
- `src/style.css`：样式入口
- `src/styles/`：样式拆分文件
- `tools/ai/`：给 AI 或 CLI 用的自动化脚本
- `schemas/`：Agent 任务、结果和语义盖章模板 JSON Schema
- `agent-manifest.json`：MCP 与 JSON 任务入口的机器可读清单
- `tools/signing/`：可选外部数字签名适配器
- `docs/AGENT_API.md`：AI Agent 无界面操作协议
- `docs/PRODUCT_BOUNDARIES.md`：产品与安全边界
- `docs/AUDIT_AGENT_READINESS_2026-08-09.md`：Agent 可操作性二次审计

## 常用验证

语法检查：

```bash
node --check src/main.js
```

界面冒烟：

```bash
node tools/ai/yinji-cli.mjs smoke --pdf ./test-fixture.pdf
```

扫描件导出回归（三页墨量差异化夹具，校验未访问页内容、页号映射、上下方向、三档元数据）：

```bash
node tools/ai/yinji-cli.mjs scan-check
```

浏览器单元测试：打开 `http://127.0.0.1:8123/tests/index.html`。

批量模板盖章并输出证据记录：

```bash
node tools/ai/yinji-cli.mjs stamp --pdf ./test-fixture.pdf --seal demo --output-dir /tmp/yinji-output
```

导出当前状态快照：

```bash
node tools/ai/yinji-cli.mjs state --pdf ./test-fixture.pdf --seal demo --add-seal
```

验证三个导出入口：

```bash
node tools/ai/yinji-cli.mjs state --pdf ./test-fixture.pdf --tab export --export-mode scan
```

验证手写签名：

```bash
node tools/ai/yinji-cli.mjs state --pdf ./test-fixture.pdf --add-signature-demo
```

验证批量队列：

```bash
node tools/ai/yinji-cli.mjs state --tab export --batch-pdf ./test-fixture.pdf --batch-pdf ./test-multi.pdf
```

验证批量处理界面流程：

```bash
node tools/ai/yinji-cli.mjs state --seal demo --tab export --batch-pdf ./test-fixture.pdf --process-batch
```

验证批量盖章并转扫描件：

```bash
node tools/ai/yinji-cli.mjs state --seal demo --tab export --batch-pdf ./test-fixture.pdf --process-batch-scan
```

截图：

```bash
node tools/ai/yinji-cli.mjs capture --pdf ./test-fixture.pdf --seal demo --add-seal --output ./ui-check.png
```

## AI 协作

支持两种不依赖界面坐标的接入方式：

```bash
# 标准 MCP stdio server
node tools/ai/yinji-mcp-server.mjs

# 任意 Agent 可生成的 JSON 任务
node tools/ai/yinji-task.mjs --task ./task.json
```

可调整 `pages`、`anchor`、偏移、尺寸、透明度、旋转、深浅和自动去背景。操作前运行 `doctor` 与 `inspect`，完成后必须运行 `verify`。详细协议见 `docs/AGENT_API.md`。

- 项目规则看 `AGENTS.md`
- 任务流程和验证路径看 `docs/AI_RUNBOOK.md`
- 用户操作看 `docs/USER_GUIDE.md`
- 格式、加密和 CLI 接口看 `docs/TECHNICAL_GUIDE.md`
- Codex skill 入口在 `.codex/skills/yinji/SKILL.md`

## 夹具

- `test-fixture.pdf`：单文件基本流程
- `test-multi.pdf`：多页或批量流程

## 旧文档

`docs/README.md` 保留旧版对外介绍。当前开发和验证以本文件为准。

## 许可证与第三方代码

第三方库版本、哈希与许可证文本见 `THIRD_PARTY_NOTICES.md` 和 `licenses/`。印迹自身代码目前没有声明开源许可证；状态和发布门禁见 `LICENSE-STATUS.md`。候选包可以用于内部验收，公开或稳定发布仍须仓库所有者批准许可证。
