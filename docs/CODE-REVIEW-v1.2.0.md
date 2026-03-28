# 印迹（YinJi）PDF Stamper v1.2.0 — 代码评审报告

> 评审日期：2026-03-28
> 评审方：Claude Code [CC] + Codex/GPT-5.4 [CX]
> 项目位置：wenpai:~/Projects/yinji/

---

## 综合评分

| 维度 | CC | CX | 共识 |
|------|----|----|------|
| 架构设计 | 3/10 | 4/10 | main.js 1521 行巨型单文件，window.* 全局耦合 |
| 代码质量 | 4/10 | 4/10 | 死代码、DOM 节点缺失、设置项未落地 |
| 安全性 | 3/10 | 3/10 | DOM XSS（innerHTML）、CDN 无 SRI、lucide@latest |
| 性能 | 7/10 | 5/10 | cleanupDistantCanvases 未接入，缩略图全量渲染 |
| 功能完整性 | 8/10 | 6/10 | 印章库状态同步 bug、历史栈跨文档残留 |
| 开发计划 | 5/10 | 3/10 | 文档版本号过时、Phase 顺序不合理 |
| **综合** | **5/10** | **4/10** | **能用，但不适合继续加功能，先还债** |

---

## 问题清单

### P0 — 安全漏洞（必须立即修复）

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| P0-1 | 印章库 DOM XSS | `seal-library.js:137` | `seal.name` 直接拼进 innerHTML |
| P0-2 | 批量列表 DOM XSS | `batch-processing.js:239` | `file.name` 直接拼进 innerHTML |
| P0-3 | 设置导入 schema 注入 | `settings.js:85` | 导入 JSON 值直接插进 HTML 模板，无白名单校验 |

### P1 — 核心功能缺陷

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| P1-1 | 印章库状态不同步 | `seal-library.js:loadAndApplySeal` | 只写 window.sealImageElement，main.js 读局部变量，刷新后取章不可靠 |
| P1-2 | 历史栈跨文档残留 | `main.js:cleanupAllResources` | 切换 PDF 不清空历史，clearHistory 已实现但未接入 |
| P1-3 | 鼠标操作无历史记录 | `main.js:280` | 拖拽/缩放不走 History，只有方向键微调有 |
| P1-4 | 骑缝章删除不可撤销 | `main.js:945` | 直接遍历删除，不经过 History 系统 |
| P1-5 | CDN 无版本锁定和 SRI | `index.html:158` | 4 个 CDN 裸加载，lucide 用 @latest |
| P1-6 | 缩略图全量渲染 | `main.js:renderAllPages` | 大文件首屏慢，cleanupDistantCanvases 未接入 showPage |

### P2 — 功能和质量问题

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| P2-1 | 批量处理只支持居中 | `batch-processing.js:165` | 每页重复编码印章，不复用编辑区布局 |
| P2-2 | 骑缝章位置写死 | `main.js:890` | top=400 不自适应页面尺寸 |
| P2-3 | 设置项未落地 | `settings.js:10` | autoSave/exportFormat/exportQuality/sealRotation 建模未用 |
| P2-4 | 快捷键帮助监听泄漏 | `main.js:1190` | 非 Esc 关闭路径不解绑 keydown |
| P2-5 | 开发计划文档过时 | `DEVELOPMENT_PLAN.md:4` | 版本号还是 v1.0.0，交付清单未更新 |
| P2-6 | confirm/prompt 残留 | 多处 | batch clearQueue、saveSealToLibrary、clearSealLibrary、resetSettings |

### P3 — 代码卫生

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| P3-1 | 死代码 | `main.js:6` | loadScript、sealImage、dropZone 变量未使用 |
| P3-2 | 缩略图拖拽不同步数据 | `main.js:initializeThumbnailDragSort` | 只改 DOM 顺序，不改 fabricCanvases 和导出顺序 |
| P3-3 | DOM 节点缺失 | `history.js:183` | undoBtn/redoBtn/batch-file-count 无对应 HTML |
| P3-4 | 外链缺 rel 属性 | `index.html:153` | target="_blank" 无 noopener noreferrer |
| P3-5 | CSS 单文件 1136 行 | `style.css` | 未按组件拆分 |
| P3-6 | 方向键历史无 debounce | `main.js:280` | 按住方向键产生大量历史条目 |

---

## 推荐开发路线

原计划顺序：Phase 1(性能) → Phase 2(功能) → Phase 3(重构) → Phase 4(移动端+安全)

**修订后顺序：**

### Sprint 1：安全基线（P0 全部 + P1-5）
- innerHTML → createElement + textContent（P0-1/P0-2）
- 设置导入加白名单 schema（P0-3）
- CDN 锁版本 + SRI（P1-5）
- 外链补 rel 属性（P3-4）

### Sprint 2：状态管理重构（P1-1/P1-2/P1-3/P1-4）
- 统一状态对象，干掉 window.* 挂载
- 印章库加载同步主编辑状态
- 切换 PDF 时清空历史栈
- Fabric 事件（拖拽/缩放）接入历史
- 骑缝章删除改为整组命令

### Sprint 3：性能修复 + 代码清理（P1-6 + P2 + P3）
- cleanupDistantCanvases 接入 showPage
- 缩略图渐进渲染
- 批量处理复用编辑区模板
- 清理死代码和未落地设置项
- 快捷键帮助监听泄漏修复
- confirm/prompt 替换为自定义对话框

### Sprint 4：文档对齐 + 产品化
- 开发计划对齐到 v1.2.0 现状
- 重排后续里程碑
- 引入构建工具（Vite）
- 移动端适配

---

## 技术栈现状

| 依赖 | 版本 | 用途 | 风险 |
|------|------|------|------|
| PDF.js | 未锁定 | PDF 渲染 | CDN 无 SRI |
| Fabric.js | 未锁定 | Canvas 操作 | CDN 无 SRI |
| pdf-lib | 未锁定 | PDF 导出 | CDN 无 SRI |
| Lucide | @latest | 图标 | 版本不锁定，最高风险 |

## 文件结构

```
src/
├── main.js              1521 行 — 核心逻辑全在这里（需拆分）
├── style.css            1136 行 — 单文件（需按组件拆分）
├── core/
│   ├── batch-processing.js  283 行
│   ├── history.js           229 行
│   ├── seal-library.js      223 行
│   └── settings.js          266 行
├── ui/
│   ├── loading.js           138 行
│   └── notifications.js     192 行
└── utils/
    └── validators.js        146 行
```

总计：~4,100 行源码
