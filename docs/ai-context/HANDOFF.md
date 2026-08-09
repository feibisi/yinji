# Yinji 交接记录

## 2026-08-09 - [CX] 交付收口

- 集成分支：`codex/yinji-delivery`，基于审计加固分支合并扫描件功能。
- 已移除 Canon/扫描仪冒充元数据；扫描件明确为视觉模拟，签名明确为图像而非数字证书签名。
- 扫描导出按页释放临时画布，支持取消；分辨率按 PDF 点尺寸计算，界面 DPI 与实际输出一致。
- 新增批量盖章并转扫描件、水印颜色/角度、主题/关键词、扫描设置导入导出。
- 新增 `THIRD_PARTY_NOTICES.md` 与 `licenses/`；印迹自身代码尚未选择许可证，需仓库所有者决定。
- 验证：全量 JS `node --check` 通过；浏览器单元测试 105/105；smoke 通过；scan-check 17/17；批量扫描 UI 流程通过；桌面与 390px 移动端截图完成。
- Forgejo 直接推分支被策略拒绝，已通过 AGit 更新现有 PR #3：`https://feicode.com/Modiqi-com/yinji/pulls/3`。

## 2026-08-09 - [CX] 扫描入口体验修正

- 导出页改为“普通导出 / 扫描件 / 批量处理”三个一级入口；扫描参数不再藏在普通导出折叠区。
- 扫描预设增加选中态，模式切换后状态卡给出对应操作提示。
- CLI 新增 `--export-mode normal|scan|batch`；三种面板切换、105/105 单元测试、smoke、scan-check、桌面与 390px 截图均通过。

## 2026-08-09 - [CX] 素材处理、证据记录与自动化接口

- 修复深浅滑块只影响后续印章的问题：选中普通章立即更新，选中骑缝章任意切片时整组同步；批量选页添加的章也使用可重复调整的 Fabric ColorMatrix。
- 新增边缘连通近白背景清除；上传时默认自动处理并保留原始素材，手动“去白底”可从原图重算并更新选中的普通章。非直角旋转按新包围盒输出，长方形签名/印章不再裁切。
- 导出 PDF、扫描件、拆页、批量结果和图片来源 PNG 时生成 `yinji-evidence/v1` 侧车；记录源/结果 SHA-256、页数与盖章操作，并明确它不是数字证书签名。
- 新增 `yinji-stamp-template/v1`：页码表达式、五种锚点、偏移、尺寸和透明度；完整骑缝章被删掉任意页后，整份导出会报出缺页并停止。
- 新增 PBKDF2-SHA-256（250000 次）+ AES-256-GCM 印章库加密备份/恢复；普通 localStorage 仍是明文，用户指南已写共享设备边界。
- CLI 新增 `stamp`（CDP 本机批量盖章并写 PDF+侧车）与外部 `sign` 契约；`tools/signing/pyhanko_signer.py` 只从环境变量取 PKCS#12/口令/TSA，未配置时失败关闭。
- 文档：`docs/IMPLEMENTATION_PLAN_2026-08-09.md`、`docs/USER_GUIDE.md`、`docs/TECHNICAL_GUIDE.md`、`docs/AI_RUNBOOK.md`、`docs/CHANGELOG.md`、根 `README.md`。
- 验证：全量 JS/MJS 语法及 Python 编译通过；浏览器单元测试 121/121；smoke 6/6；scan-check 17/17；批量扫描 UI 通过；真实像素探针确认白底 alpha 255→0、中心保留 255、已放章亮度矩阵 0.35；5 页骑缝章整组亮度 0.42；删第 3 页切片后导出阻止且无产物；批量模板只处理第 1/5 页且 opacity=0.73；PDF、扫描 PDF、PNG 三类侧车重新计算 SHA-256 均匹配；外部 sign dry-run/调用契约通过；桌面 1440×960 与移动 390×844 截图完成。
