# 设计规格：导出为扫描件 + 高级功能

> **历史规格，已由当前实现修订（2026-08-09）**：扫描件仅是视觉模拟的图片版 PDF，不代表真实扫描设备产出；不得写入冒用硬件品牌的 Creator/Producer。当前批量扫描、水印颜色/角度、真实软件来源、取消和资源释放行为以根目录 `README.md`、`src/modules/scan-export.js` 及 `tools/ai/yinji-cli.mjs scan-check` 为准。

> 日期：2026-07-24 | 状态：2026-08-09 交付收口修订
> 来源：集成 [lookscanned.io](https://github.com/lookscanned/lookscanned.io)（MIT）的"做旧成扫描件"能力，并自主实现其客户端可行的高级/付费功能。
> 分支：`feat/scan-effect`（基于 master；实现前若审计 PR #1 已合并，需 rebase 到 master）

## 1. 目标与范围

给印迹新增「导出为扫描件」能力：把（已盖章的）PDF/图片处理成看起来像真实打印后扫描的文档。**100% 纯前端、文件不离开浏览器**，与印迹现有隐私定位一致。

同时自主实现 lookscanned 客户端可行的高级功能，**全部解锁、无付费门槛**。

### 范围内
- 扫描效果（全参数）+ 当前页实时预览
- 与盖章叠加：扫描作用于"背景页 + 印章"的合成结果
- 自定义文字水印
- 自定义 PDF 元数据；可选择写入真实的 Yinji Creator/Producer
- 分辨率/DPI 控制
- 批量：现有批量队列扩展支持"导出为扫描件"

### 范围外（架构性排除）
- Developer API / Email-to-scan / 聊天集成 —— 需后端服务器，与"文件不离开设备"的纯前端模型冲突。经用户确认不做。

### 已由印迹覆盖
- 签名 & 盖章（印迹核心功能）
- 批量处理（现有队列）

## 2. 架构与新增文件（零新依赖、零构建）

```
src/modules/scan-effect.js   移植 scanCanvas 核心 + feTurbulence 噪点生成 + 默认config/预设（顶部 MIT 署名）
src/modules/scan-export.js   扫描导出管线：整页栅格化(背景+印章) → scanCanvas → 水印 → pdf-lib 重组 + 元数据
src/features/scan-ui.js      扫描设置面板接线 + 预设 + 实时预览(防抖) + 触发导出（单份/批量）
src/styles/scan.css          扫描面板样式（经 style.css 导入）
```

- index.html：导出 tab 的「单份文件」区新增「导出为扫描件」按钮 + 可折叠扫描设置面板；批量区增加"批量导出为扫描件"入口。
- 不改动现有盖章/导出逻辑；沿用现有 `window.Loading`（进度）、`window.Toast`（提示）、`window.Settings`（持久化）、`generateSafeExportFilename`（安全文件名）。

## 3. 扫描算法（移植 canvas-scan，纯 canvas）

`applyScanEffect(canvas, pageImageBitmap, config, noiseImage)`：
1. 填白底。
2. `ctx.filter` 组合：`blur(${blur}px)` + （colorspace==='gray' 时 `grayscale(1)`）+ `brightness(${brightness})` + `sepia(${yellowish})` + `contrast(${contrast})`。
3. 绕中心旋转 `(rotate + rotate_var * (random*2-1)) 度`。
4. `drawImage(page)`。
5. 叠加噪点图（feTurbulence fractalNoise SVG → Image → drawImage）。
6. `border` 为真时描 1px 黑边。

噪点：`getNoiseSVG(noise)` 生成 feTurbulence SVG（specularConstant ∝ noise），转 Image 后按页面尺寸绘制；noise=0 时跳过。噪点图按 noise 值缓存。

## 4. 配置参数（范围/默认取自 lookscanned）

| 参数 | 含义 | 范围 | 步长 | 默认 |
|------|------|------|------|------|
| rotate | 旋转基准角 | -10 ~ 10 | 0.1 | 1 |
| rotate_var | 旋转随机抖动 | 0 ~ 10 | 0.1 | 0.5 |
| colorspace | 色彩空间 gray/sRGB | 枚举 | — | gray |
| blur | 模糊 | 0 ~ 1 | 0.01 | 0.5 |
| noise | 噪点强度 | 0 ~ 1 | 0.01 | 0.25 |
| border | 黑边框 | bool | — | false |
| scale | 分辨率(DPI=scale×72) | 1 ~ 3 | 0.5 | 2 |
| brightness | 亮度 | 0 ~ 2 | 0.01 | 1 |
| yellowish | 泛黄(sepia) | 0 ~ 2 | 0.01 | 0 |
| contrast | 对比度 | 0 ~ 2 | 0.01 | 1 |
| output_format | 输出格式 | png/jpeg | — | jpeg |

**预设**：轻度做旧 / 标准扫描 / 黑白复印（各预设一组参数）。config 持久化到 `window.Settings`。

## 5. 与盖章叠加的导出管线

`exportAsScannedPdf(config, watermark, metadata)`：
1. 遍历每页：取该页 fabric canvas 的**完整栅格合成图** `canvas.toDataURL({ format:'image/png', multiplier: scale })`（含 PDF 背景 + 所有印章）。
2. 该图 → `createImageBitmap` → `applyScanEffect` → 扫描效果图。
3. 若有水印：在扫描图上叠加文字水印（见 §6）。
4. `pdf-lib`：每页 `embedJpg/embedPng` 扫描图，按**原始页面尺寸**新建页并 `drawImage`。
5. 写入 PDF 元数据（见 §6）。
6. 保存：`Blob` → 下载，文件名 `generateSafeExportFilename(file, '_扫描件')`。

进度：`window.Loading.updateProgress`；逐页 `await` 让出主线程避免卡死。多页 Web Worker 优化列为 v2（YAGNI，先不做）。

## 6. 高级功能

### 6.1 自定义文字水印
- 配置：文本内容、字号、颜色、透明度、旋转角、平铺(repeat) 或 单个居中。
- 实现：在 `applyScanEffect` 之后、embed 之前，于扫描图 canvas 上 `fillText` 叠加；平铺模式按网格重复。
- 预览可见。

### 6.2 自定义 PDF 元数据
- 字段：Title / Author / Subject / Keywords + 创建/修改时间；Creator/Producer 只使用真实的 Yinji 软件标识。
- pdf-lib：`setTitle/setAuthor/setSubject/setKeywords/setCreator/setProducer/setCreationDate/setModificationDate`。
- 禁止冒用真实扫描设备或第三方品牌作为 Creator/Producer。视觉扫描效果不声明真实设备来源。

### 6.3 分辨率/DPI
- 由 scale 参数驱动（ppi = scale×72，范围 72~216）。栅格化 multiplier 与 pdf-lib 页面尺寸映射一致，保证清晰度与体积平衡。

### 6.4 批量扫描
- 复用现有批量队列（batch-processing）。批量导出时对每个文件套用同一 config + 水印 + 元数据，逐文件下载（沿用现有延迟 revoke）。

## 7. UI/交互

- 导出 tab「单份文件」区：新增主按钮「导出为扫描件」+ 可折叠「扫描设置」面板。
- 面板分层：常用（预设 / 噪点 / 旋转抖动 / 泛黄 / 对比度 / 边框 / 水印）直出；「更多」折叠（模糊 / 亮度 / 色彩空间 / DPI / 旋转基准 / 元数据）。
- 实时预览：主预览区叠一层预览 canvas，显示**当前页**扫描效果；滑块 `input` 事件防抖(~150ms)重渲当前页。仅当前页，导出才全量。
- 批量区：新增「批量导出为扫描件」。

## 8. 错误处理与边界

- 未打开文件：提示先打开。
- 扫描件本质是**图像 PDF**（文字变图、体积增大、不可选/不可搜索）——这是"像扫描"的固有属性，UI 以一句说明告知，非缺陷。
- 多页/大文件：进度条 + 可取消（沿用 exporter 模式）。
- 图片来源文件同样适用（印迹支持图片来源）。
- 预览与导出共用同一 `applyScanEffect`，保证所见即所得（旋转随机项在预览与导出各自独立取样，属预期）。

## 9. 测试与验收（CDP + headless chromium 闭环）

- **单元/视觉**：给定 config 对夹具页跑 `applyScanEffect`，断言输出尺寸正确、与原图像素差异落在预期区间（噪点/旋转/泛黄生效），noise=0 与 noise>0 有可测差异。
- **端到端**：打开 test-fixture.pdf → 盖章 → 导出为扫描件（含水印 + 元数据）→ 校验输出 PDF 页数一致、为图像 PDF、元数据字段正确、文件可打开。
- **水印**：断言水印像素出现在预期位置。
- **预览**：拖滑块预览更新、防抖生效。
- **批量**：批量队列导出多份扫描件成功。
- **回归**：现有 `yinji-cli smoke/state` 全绿；`node --check` 全通过。

## 10. 署名与合规

- `scan-effect.js` 顶部注明：算法移植自 lookscanned.io（MIT License）+ 灵感来源 baicunko/scanyourpdf。
- docs 记录来源与许可证。
- Pro 等价功能（水印/元数据/DPI/批量）均为**独立实现**，不含 lookscanned 专有代码或资产，无 IP 风险；建议由 modiqi（知识产权）最终把关。

## 11. 分期（建议）

- **Phase 1**：扫描效果核心 + 全参数 + 实时预览 + 与盖章叠加的单份导出。
- **Phase 2**：自定义水印 + 真实 PDF 元数据。
- **Phase 3**：批量导出为扫描件。

（是否分期实现或一次做完，由实现计划阶段决定。）
