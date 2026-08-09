# Yinji 交接记录

## 2026-08-09 - [CX] 交付收口

- 集成分支：`codex/yinji-delivery`，基于审计加固分支合并扫描件功能。
- 已移除 Canon/扫描仪冒充元数据；扫描件明确为视觉模拟，签名明确为图像而非数字证书签名。
- 扫描导出按页释放临时画布，支持取消；分辨率按 PDF 点尺寸计算，界面 DPI 与实际输出一致。
- 新增批量盖章并转扫描件、水印颜色/角度、主题/关键词、扫描设置导入导出。
- 新增 `THIRD_PARTY_NOTICES.md` 与 `licenses/`；印迹自身代码尚未选择许可证，需仓库所有者决定。
- 验证：全量 JS `node --check` 通过；浏览器单元测试 105/105；smoke 通过；scan-check 17/17；批量扫描 UI 流程通过；桌面与 390px 移动端截图完成。
- Forgejo 直接推分支被策略拒绝，已通过 AGit 更新现有 PR #3：`https://feicode.com/Modiqi-com/yinji/pulls/3`。
