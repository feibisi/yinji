# Changelog

All notable changes to PDF Stamper will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2026-08-09

### Added
- MCP 2025-11-25 stdio server、`yinji-agent-task/v1` JSON 任务入口和便携 Agent skill
- `inspect` 输入预检，拒绝加密、损坏、超限 PDF 和伪造印章格式
- Agent 模板支持旋转、深浅和自动去背景
- `version.json`、确定性候选包、发布 manifest、CycloneDX SBOM 和兼容性报告
- 自适应纸张底色清除，支持米白、浅灰扫描底色、封闭区域和抗锯齿边缘，并保留原始素材
- 导出 PDF 的 `yinji-evidence/v1` SHA-256 证据记录
- `yinji-stamp-template/v1` 批量页码、位置、偏移、尺寸和透明度模板
- 骑缝章导出前完整页覆盖校验
- PBKDF2 + AES-GCM 加密印章库备份和恢复
- `stamp` CLI 以及隔离的外部 `sign` 命令契约
- `scan`、`verify`、`doctor`、`capabilities` Agent 命令及 `yinji-agent-result/v1`
- Agent CLI 输出结果文件与同名 `.yinji.json` 校验记录

### Fixed
- 人工下载恢复 PDF/PNG 原格式，不再把所有导出结果强制包装成 `.yinji.zip`
- 印章深浅低值不再将彩色印章压黑；调浅改为降低印泥密度，调深限制最大暗化幅度
- 深浅滑块现在立即更新已放置的普通章或整组骑缝章
- 非直角旋转长方形印章/签名不再被原画布边界裁切
- 印章库恢复后正确保留数值 0，损坏图像不会提前替换预览
- 设置导入和持久化会限制尺寸、旋转和透明度范围

### Security
- 新保存的印章改为 sessionStorage；旧 localStorage 只迁入会话并由用户主动清理
- 浏览器端明确拒绝证书和私钥材料，数字签名只允许外部程序契约

## [1.2.0] - 2026-01-09

### Added
- **Tab-based Interface**: Reorganized toolbar into three intuitive tabs (印章/编辑/批量)
- **Undo/Redo System**: Full history management with Command pattern (up to 50 steps)
- **Keyboard Shortcuts**: Comprehensive keyboard shortcuts for all major operations
  - Editing: Ctrl+Z (undo), Ctrl+Y (redo), Delete (remove seal)
  - Navigation: PageUp/Down, Home/End, Arrow keys
  - Zoom: +/- keys, 0 (reset)
  - Export: Ctrl+S
  - Help: ? (show shortcuts)
- **Seal Library**: Save and manage up to 20 seals with localStorage persistence
- **Batch Processing**: Process multiple PDF files at once with progress tracking
- **Settings Panel**: User preferences for seal size, rotation, and opacity
  - Export/import settings as JSON
  - Persistent settings across sessions
- **Lucide Icons**: Professional icon system replacing emojis
- **Help System**: Interactive keyboard shortcuts guide

### Changed
- **UI Refactoring**: Complete toolbar redesign with tab-based navigation
- **Improved UX**: Better visual hierarchy and feature organization
- **Icon System**: Replaced emoji with Lucide Icons for professional appearance
- **Settings Integration**: Seal operations now respect user-defined defaults

### Fixed
- Page navigation closure bug (thumbnails now correctly navigate to selected page)

### Technical Improvements
- Modular architecture with separate modules for history, seal library, batch processing, and settings
- Improved code organization and maintainability
- Better separation of concerns

## [1.1.0] - 2025-12-XX

### Added
- File validation system
- Lazy loading for PDF pages
- Memory management optimizations
- Toast notification system
- Loading indicators with progress tracking

### Changed
- Improved PDF rendering performance
- Better error handling

### Fixed
- Memory leaks in PDF rendering
- Performance issues with large files

## [1.0.0] - 2025-11-XX

### Added
- Initial release
- PDF upload and preview
- Seal image upload and rotation
- Normal seal placement
- Straddle seal (骑缝章) support
- PDF export with seals
- Sidebar with page thumbnails
- Zoom controls
- Drag-and-drop support

---

## Release Notes

### v1.2.0 Highlights

This is a major feature release that significantly improves the user experience and adds powerful new capabilities:

**🎨 Modern UI**: The new tab-based interface makes it easy to find and use features without cluttering the workspace.

**⚡ Productivity**: Keyboard shortcuts and undo/redo make editing faster and more efficient.

**📚 Seal Library**: Save frequently used seals for quick access.

**📦 Batch Processing**: Process multiple PDFs at once, saving time on repetitive tasks.

**⚙️ Customization**: Settings panel allows you to customize default seal properties.

**🎯 Professional Icons**: Lucide Icons provide a clean, modern look.

### Migration Notes

- Settings are stored in localStorage and will persist across sessions
- Seal library is stored in localStorage (max 20 seals)
- No breaking changes from v1.1.0

### Known Limitations

- Batch processing applies seals to center position only
- Maximum 50 undo/redo steps
- Maximum 20 seals in library
- Settings stored in localStorage (browser-specific)

---

[1.2.0]: https://github.com/ssfun/pdf-stamper/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/ssfun/pdf-stamper/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ssfun/pdf-stamper/releases/tag/v1.0.0
