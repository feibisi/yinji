# Yinji 兼容性与发布门禁

## 支持定位

Yinji 1.3.0-rc.1 是本地视觉签章候选版。目标运行环境是安装了 Node.js 22 和 Chromium 系浏览器的 macOS、Windows、Linux。正式支持结论只能来自对应系统实际执行生成的兼容性报告，不能由单个平台结果代替。

## 单机兼容检查

先启动静态服务和带 CDP 的 Chrome/Edge，然后运行：

```bash
node tools/tests/compatibility-check.mjs > compatibility-report.json
```

非默认端口通过环境变量指定：`YINJI_APP_URL=http://127.0.0.1:8124/index.html YINJI_CDP_URL=http://127.0.0.1:9223 node tools/tests/compatibility-check.mjs`。

报告包含操作系统、架构、Node 版本、浏览器身份、页面版本、Agent 合约测试、MCP 测试和浏览器单元测试。`ok=false` 的环境不进入试运行。

最低矩阵：

| 系统 | 浏览器 | 状态 |
|---|---|---|
| Linux | Chromium | 自动化主验证环境 |
| macOS 15 ARM64 | Chrome 151、Edge 151 | 已实测通过 |
| Windows 10 19045 x64 | Chrome 151、Edge 151 | 已在 kk-pc 以 Node 22.23.2 实测通过 |
| Windows 11 | Edge 或 Chrome 当前稳定版 | 声明 Windows 11 认证前必须由 Windows 11 实机生成报告 |

kk-pc 额外完成真实 MCP 盖章与 verify、扫描导出回归、PowerShell UTF-8 BOM JSON Task，以及 `rotation=-7`、`brightness=63`、`removeBackground=true` 的 evidence 核对。测试使用确定性候选 ZIP，而不是开发目录。

## 输入和异常边界

- PDF 最大 50 MB、最多 500 页；Agent 预检要求有效 `%PDF-` 头和 `%%EOF`。
- 加密 PDF 失败关闭，用户应提供有权处理的解密副本。
- Agent 印章只接受 PNG、JPEG、GIF、WebP，最大 5 MB。
- 默认不覆盖已有结果；中断或失败不得把半成品报告为成功。
- 100 页、中文文件名、损坏文件、加密文件、重复输出和取消流程属于候选版必测项。

## 可重复候选包

```bash
python3 tools/release/build-release.py --output-dir ./dist
sha256sum -c dist/SHA256SUMS
```

构建器使用 Git 提交时间作为 ZIP 时间戳，按固定白名单和排序生成归档，同时写入：

- `release-manifest.json`：每个文件的大小和 SHA-256；
- `sbom.cdx.json`：CycloneDX 1.6 第三方组件清单；
- 外部 `SHA256SUMS`：整个候选包哈希。

同一提交、相同 `SOURCE_DATE_EPOCH` 连续构建的 ZIP 必须字节一致。

## 许可证门禁

仓库目前只有第三方许可证，Yinji 自身许可证尚未由所有者批准。带预发布后缀的内部候选包允许构建；移除预发布后缀生成稳定版时，如果根目录没有 `LICENSE`，构建器必须拒绝。详见 `LICENSE-STATUS.md`。
