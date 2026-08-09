# Yinji AI 原生与发布候选审计（2026-08-09）

## 结论

`1.3.0-rc.1` 已具备可由第三方 Agent 调用的本地视觉签章闭环，但仍是发布候选，不应标为稳定生产版。稳定版目前有两个明确门槛：项目所有者确认开源许可证并补入 `LICENSE`；Windows 实机完成兼容验收。

Yinji 生成的是视觉盖章或扫描效果文件，不是具有证书、私钥、时间戳和验签链的数字签名。MCP 不暴露数字签名工具；CLI 的 `sign` 只允许调用用户自行配置的外部签名程序。

## 本次补齐

- MCP stdio：能力发现、运行环境检查、文件检查、视觉盖章、扫描件导出、证据校验。
- JSON Task：固定 `yinji-agent-task/v1` 输入和 `yinji-agent-result/v1` 输出。
- Agent Skill：规定 doctor → inspect → stamp/scan → verify 的标准操作顺序。
- 文件预检：50 MB PDF、5 MB 印章素材、PDF 头尾、典型加密标记、栅格图片签名。
- 浏览器预检：复用人工界面加载路径，验证 PDF 解析、加密拒绝和最多 500 页限制。
- 可审计调整：页码、锚点、偏移、大小、透明度、旋转、深浅和自动去背景进入模板和 evidence。
- 写入保护：默认拒绝覆盖，只有调用方明确传入 `force` 才覆盖已有产物。
- 发布工件：确定性 ZIP、SHA-256 清单、CycloneDX 1.6 SBOM、组件清单、版本真源。

## Agent 安全边界

1. 输入和输出都是本机路径，不要求上传文件。
2. Agent 必须由用户明确选择印章素材；Yinji 不代管证书、私钥或账户凭据。
3. 任务协议拒绝未知字段和未知操作，避免静默忽略调用方拼写错误。
4. MCP 不提供删除、目录遍历或任意命令执行工具。
5. `force=false` 是默认值；现有产物冲突时失败关闭。
6. evidence 记录输入和产物哈希以及实际模板，但它是审计记录，不是证书验签结果。

## 验收结果

| 范围 | 环境 | 结果 |
|---|---|---|
| 浏览器单元测试 | Linux ARM64 / Chrome 150 | 125/125 通过 |
| Agent 合约 | Linux / Node 22 | 14 项通过 |
| MCP smoke | Linux / Node 22 | 6 个工具发现通过 |
| MCP 真实盖章和 verify | Linux / Chrome 150 | 通过 |
| 扫描回归 | Linux / Chrome 150 | 未访问页、页码、方向、三档和取消通过 |
| 501 页边界 | Linux / Chrome 150 | 正确拒绝，未生成产物 |
| 浏览器兼容 | macOS ARM64 / Chrome 151 | 125/125 通过 |
| 浏览器兼容 | macOS ARM64 / Edge 151 | 125/125 通过 |
| Windows | 未取得实机 | 未验证，不算通过 |

测试稳定性说明：连续串行执行多个 CDP 套件时，`scan-check` 曾出现一次夹具加载超时；清理前序浏览器会话后独立复跑通过，随后 Linux compatibility、MCP E2E、macOS Chrome/Edge 均通过。该现象没有形成稳定复现，但在升为 stable 前应继续观察长链测试是否再次出现。

测试命令：

```bash
node tools/tests/browser-unit.mjs
node tools/tests/agent-contract.test.mjs
node tools/tests/mcp-smoke.mjs
YINJI_MCP_E2E=1 node tools/tests/mcp-smoke.mjs
node tools/ai/yinji-cli.mjs scan-check
node tools/tests/compatibility-check.mjs
python3 tools/release/build-release.py --output-dir dist
```

## 二次审计发现与处置

- 已修复：Agent 模板中的深浅和自动去背景只改状态、没有稳定进入批量 evidence。现在通过显式 Agent override 传入批量处理并记录。
- 已修复：Agent 批量路径曾绕过 UI 的 500 页限制。现在盖章和扫描先经过浏览器 PDF 加载验证。
- 已修复：Windows 路径可能因 `import.meta.url` 百分号编码而失效。现在使用 `fileURLToPath`。
- 已修复：MCP 服务器版本曾硬编码。现在统一读取 `version.json`。
- 已修复：JSON Task 曾允许未知字段。现在失败关闭。
- 已修复：`inspect` 失败结构与其他 Agent 操作不一致。现在统一返回 `error.code` 和 `error.message`。

## 发布门槛

- **必须补齐**：项目所有者选择并批准许可证，在仓库根目录提交真实 `LICENSE`。
- **必须补齐**：Windows 11 上以 Chrome 或 Edge 跑 `compatibility-check.mjs` 和一次真实 MCP 盖章/verify。
- **按部署场景决定**：如果未来变为共享服务，再增加身份认证、租户隔离、速率限制、任务队列和集中日志。当前本地单用户工具没有必要预埋这些服务端复杂度。
- **不纳入视觉签章核心**：KMS/HSM、CA 证书链、可信时间戳和长期验证。需要法律数字签名时应接入独立合规签名器，不应把视觉印章包装成数字签名。
