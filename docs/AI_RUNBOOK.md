# 印迹 AI 任务手册

## 启动

1. 在仓库根目录启动静态服务：

   ```bash
   python3 -m http.server 8123
   ```

2. 需要浏览器自动化时，准备带远程调试端口的 Chrome，默认端口 `9222`。

3. 常用命令：

   ```bash
   node tools/ai/yinji-cli.mjs smoke --pdf ./test-fixture.pdf
   node tools/ai/yinji-cli.mjs state --pdf ./test-fixture.pdf --seal demo --add-seal
   node tools/ai/yinji-cli.mjs state --pdf ./test-fixture.pdf --add-signature-demo
   node tools/ai/yinji-cli.mjs state --tab export --batch-pdf ./test-fixture.pdf --batch-pdf ./test-multi.pdf
   node tools/ai/yinji-cli.mjs state --seal demo --tab export --batch-pdf ./test-fixture.pdf --process-batch
   node tools/ai/yinji-cli.mjs state --seal demo --tab export --batch-pdf ./test-fixture.pdf --process-batch-scan
   node tools/ai/yinji-cli.mjs scan-check
   node tools/ai/yinji-cli.mjs capture --pdf ./test-fixture.pdf --seal demo --add-seal --output ./ui-check.png
   ```

## 先读哪些文件

- 页面和 DOM：`index.html`
- 总入口：`src/main.js`
- PDF 与画布：`src/modules/pdf-loader.js`、`src/modules/canvas-manager.js`
- 印章逻辑：`src/modules/stamp-manager.js`
- 导出：`src/modules/exporter.js`
- 设置、印章库、批量：`src/core/settings.js`、`src/core/seal-library.js`、`src/core/batch-processing.js`
- 样式入口：`src/style.css`
- 分拆样式：`src/styles/*.css`

## 常见任务

### 查上传

先看：
- `#pdfInput`
- `#upload-pdf-btn-main`
- `src/main.js`
- `src/modules/pdf-loader.js`

浏览器里确认：
- `#app` 是否去掉 `no-pdf-loaded`
- 左侧是否出现缩略图
- `window.AppState.getState().currentPdfFile` 是否有值

通过标准：
- PDF 或 PNG/JPG 成功载入
- 页数正确
- 右侧状态卡显示文件名和页码

### 查加章

先看：
- `#sealInput`
- `#addSeal`
- `src/modules/stamp-manager.js`
- `src/features/seal-tools.js`

浏览器里确认：
- `window.AppState.getState().sealImageElement.src` 有值
- 当前画布出现可选中的对象
- 右侧状态从“未选中对象”变成对象坐标或锁定状态

通过标准：
- 能上传印章
- 能添加普通章
- 印章可选中、移动、锁定

### 查签名

先看：
- `#quick-signature-btn`
- `#signature-modal`
- `src/ui/signature-modal.js`

浏览器里确认：
- 弹窗能打开
- 画布能书写
- 点击确认后当前页出现签名对象
- CLI 快照里的 `objectCount` 会增加

通过标准：
- 打开正常
- 保存后对象出现在当前页

### 查导出

先看：
- `#exportPDF`
- `#export-selected-btn`
- `#export-all-btn`
- `src/modules/exporter.js`
- `src/modules/batch-operations.js`

浏览器里确认：
- 导出页状态卡显示文件和页数
- `#export-hint` 有内容
- 当前文件导出按钮在 PDF 载入后可用

通过标准：
- 当前文件可导出
- 选页与全页导出文案正确

### 查批量处理

先看：
- `#batchInput`
- `#processBatch`
- `#processBatchScan`
- `src/core/batch-processing.js`

浏览器里确认：
- 队列数量更新
- 空队列提示和按钮禁用态正确
- 处理中状态文本变化正确
- CLI 快照里的 `batchQueueCount`、`batchQueueLabel` 和 `batchItems` 正确

通过标准：
- 能加入文件
- 队列数量和状态正确
- 能批量盖章并按当前扫描、水印和 PDF 信息设置转成图片版 PDF
- 处理中可取消，未完成文件仍留在队列

### 查本地存储

先看：
- `src/core/settings.js`
- `src/core/seal-library.js`
- `src/features/scan-ui.js`

浏览器里确认：
- `localStorage.getItem('pdf-stamper-settings')`
- `localStorage.getItem('pdf-stamper-seal-library')`
- `localStorage.getItem('yinji-scan-config')`

通过标准：
- 设置保存后刷新仍在
- 印章库刷新后仍在

## 改完后怎么验

1. `node --check` 跑改动过的 JS 文件
2. `node tools/ai/yinji-cli.mjs smoke --pdf ./test-fixture.pdf`
   - 单页图片也可以直接传给 `--pdf`，例如 `./ui-main-flow-cleanup.png`
3. 改了 UI 再补一张 `capture`
4. 涉及设置、印章库、批量处理时，再用 `state` 命令看关键状态
5. 涉及扫描件时，跑 `node tools/ai/yinji-cli.mjs scan-check`
6. 浏览器单元测试打开 `http://127.0.0.1:8123/tests/index.html`，失败数必须为 0
