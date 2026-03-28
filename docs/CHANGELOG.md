# Changelog

All notable changes to PDF Stamper will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
