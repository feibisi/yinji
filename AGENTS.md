# 印迹（Yinji）项目说明

## 项目事实
- 这是纯前端静态应用。入口是 `index.html`。
- 仓库没有 `package.json`。不要先假设有 Vite、npm 或构建步骤。
- 本地调试可直接开静态服务，例如：`python3 -m http.server 8123`。
- 浏览器自动化默认连 `http://127.0.0.1:9222` 的 Chrome DevTools。
- 常用夹具文件：`test-fixture.pdf`、`test-multi.pdf`。

## 主要入口
- 页面结构：`index.html`
- 应用入口：`src/main.js`
- 状态与核心逻辑：`src/core/*.js`
- 业务模块：`src/modules/*.js`
- 样式入口：`src/style.css`
- 样式拆分目录：`src/styles/*.css`
- AI 自动化入口：`tools/ai/yinji-cli.mjs`

## 改动约束
- `src/style.css` 只保留导入顺序。具体样式写到 `src/styles/*.css`。
- `src/main.js` 保留页面入口和总装配逻辑。独立功能尽量写到 `src/features/*` 或 `src/ui/*`。
- `auto.html`、`multi.html` 是旧调试页。用户没点名时不要顺手改。

## 验证
- 改了 JS 后，先跑 `node --check` 检查改动文件。
- 改了界面或交互后，再跑 `node tools/ai/yinji-cli.mjs smoke --pdf ./test-fixture.pdf`。
- 需要截图时，用 `node tools/ai/yinji-cli.mjs capture ...`。

## 文档
- 当前开发说明看根目录 `README.md` 和 `docs/AI_RUNBOOK.md`。
- `docs/README.md` 保留旧版对外介绍，不作为当前开发事实源。
