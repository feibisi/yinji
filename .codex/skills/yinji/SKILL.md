# Yinji

用于印迹项目的本地开发和验证。

## 先做什么

1. 先读仓库根目录 `AGENTS.md`
2. 再读 `docs/AI_RUNBOOK.md`
3. 只在任务需要真实界面或交互时再开浏览器验证

## 何时只用 CLI

- 读代码
- 改 JS、HTML、CSS
- 查静态依赖关系
- 跑 `node --check`

## 何时要开浏览器

- 上传、预览、加章、签名、导出
- 左侧缩略图、右侧工具栏、弹窗
- 任何“看起来不对”或“按钮没反应”的问题

## 常用命令

```bash
python3 -m http.server 8123
node tools/ai/yinji-cli.mjs smoke --pdf ./test-fixture.pdf
node tools/ai/yinji-cli.mjs state --pdf ./test-fixture.pdf --seal demo --add-seal
node tools/ai/yinji-cli.mjs state --pdf ./test-fixture.pdf --add-signature-demo
node tools/ai/yinji-cli.mjs state --tab export --batch-pdf ./test-fixture.pdf --batch-pdf ./test-multi.pdf
node tools/ai/yinji-cli.mjs state --seal demo --tab export --batch-pdf ./test-fixture.pdf --process-batch
node tools/ai/yinji-cli.mjs capture --pdf ./test-fixture.pdf --seal demo --add-seal --output ./ui-check.png
```

## 入口

- 页面：`index.html`
- 应用：`src/main.js`
- 样式：`src/style.css` 和 `src/styles/*.css`
- AI 自动化：`tools/ai/`
