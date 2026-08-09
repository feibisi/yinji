# Yinji Agent 操作协议

## 目标

AI Agent 应通过 `tools/ai/yinji-cli.mjs` 操作 Yinji，而不是依赖坐标点击。所有面向 Agent 的成功和失败结果均使用 JSON；失败退出码为非零。

结果 schema：`yinji-agent-result/v1`。

## 前置检查

```bash
node tools/ai/yinji-cli.mjs capabilities
node tools/ai/yinji-cli.mjs doctor
```

`doctor` 同时检查静态页面和 Chrome CDP。任一失败时不得开始写产物。

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
