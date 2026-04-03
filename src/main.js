import { getState, setState } from './core/state.js';
import {
  handlePdfFile,
  scheduleVisibleThumbnailRender,
} from './modules/pdf-loader.js';
import {
  getCurrentPageCanvas,
  getCurrentActivePage,
  applyZoom,
  handleSidebarToggle,
} from './modules/canvas-manager.js';
import {
  handleSealFile,
  addNormalSeal,
  addStraddleSeal,
  deleteSelectedObject,
  toggleLockSelected,
} from './modules/stamp-manager.js';
import { exportPDF } from './modules/exporter.js';
import { initResponsive } from './modules/responsive.js';
import { initSecurity } from './utils/security.js';
import {
  initOn as initGuidelines,
  setEnabled as setGuidelinesEnabled,
  isEnabled as isGuidelinesEnabled,
} from './modules/guideline-manager.js';
import {
  copySelected,
  pasteClipboard,
  hasClipboard,
} from './modules/object-clipboard.js';
import {
  togglePageSelection,
  selectPageRange,
  selectAllPages,
  clearSelection,
  setMultiSelectMode,
  addSealToSelectedPages,
  deleteAllStampsFromSelectedPages,
  exportSelectedPages,
} from './modules/batch-operations.js';

// ==================== DOM Elements ====================

const appContainer = document.getElementById('app');
const sidebarToggleBtn = document.getElementById('sidebar-toggle');
const mainContent = document.getElementById('main-content');
const pdfInputElement = document.getElementById('pdfInput');
const sealInputElement = document.getElementById('sealInput');
const mainUploadBtn = document.getElementById('upload-pdf-btn-main');
const sealUploadBtn = document.getElementById('upload-seal-btn');
const sealPreviewImg = document.getElementById('seal-preview');
const thumbnailContainer = document.getElementById('thumbnail-container');
const addSealBtn = document.getElementById('addSeal');
const addStraddleBtn = document.getElementById('addStraddle');
const exportPdfBtn = document.getElementById('exportPDF');
const zoomSlider = document.getElementById('zoom-slider');
const pageSelector = document.getElementById('page-selector');
const rotationSlider = document.getElementById('rotation-slider');
const rotationInput = document.getElementById('rotation-input');
const coordXInput = document.getElementById('coord-x');
const coordYInput = document.getElementById('coord-y');
const copyStampBtn = document.getElementById('copy-stamp-btn');
const pasteStampBtn = document.getElementById('paste-stamp-btn');
const lockStampBtn = document.getElementById('lock-stamp-btn');
const guidelineToggleBtn = document.getElementById('guideline-toggle-btn');

// ==================== Initialization ====================

async function main() {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

  // Initialize security measures (CSP, clickjacking prevention)
  initSecurity();

  // Initialize responsive layout for mobile
  initResponsive();

  initializeEventListeners();
  initContextMenu();

  // Wrap showPage to init guidelines on page switch
  const origShowPage = window.showPage;
  window.showPage = async function (pageNum, forceRecalculate) {
    if (origShowPage) {
      await origShowPage(pageNum, forceRecalculate);
    }
    initGuidelinesOnCurrentCanvas();
    setupCoordinateInputs();
  };

  console.log('PDF Stamper initialized');
}

// ==================== Event Listeners ====================

function initializeEventListeners() {
  // Sidebar toggle
  sidebarToggleBtn.addEventListener('click', () => {
    appContainer.classList.toggle('sidebar-collapsed');
    handleSidebarToggle(appContainer.classList.contains('sidebar-collapsed'));
  });

  // Drag and drop
  let dragCounter = 0;

  mainContent.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    mainContent.classList.add('dragover');
  });

  mainContent.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  mainContent.addEventListener('dragleave', (e) => {
    dragCounter--;
    if (dragCounter === 0) {
      mainContent.classList.remove('dragover');
    }
  });

  mainContent.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    mainContent.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === 'application/pdf') {
      handlePdfFileWithCallbacks(files[0]);
    }
  });

  // File upload buttons
  mainUploadBtn.addEventListener('click', () => pdfInputElement.click());
  pdfInputElement.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handlePdfFileWithCallbacks(e.target.files[0]);
    }
  });
  sealUploadBtn.addEventListener('click', () => sealInputElement.click());
  sealInputElement.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleSealFile(e.target.files[0]);
    }
  });

  // Stamp operation buttons
  addSealBtn.addEventListener('click', addNormalSeal);
  addStraddleBtn.addEventListener('click', addStraddleSeal);
  exportPdfBtn.addEventListener('click', () =>
    exportPDF(pdfInputElement.files[0])
  );

  // Copy / Paste buttons
  if (copyStampBtn) {
    copyStampBtn.addEventListener('click', () => copySelected());
  }
  if (pasteStampBtn) {
    pasteStampBtn.addEventListener('click', async () => {
      if (!hasClipboard()) {
        window.Toast.warning('剪贴板为空');
        return;
      }
      await pasteClipboard();
    });
  }

  // Lock button
  if (lockStampBtn) {
    lockStampBtn.addEventListener('click', () => toggleLockSelected());
  }

  // Guideline toggle button
  if (guidelineToggleBtn) {
    guidelineToggleBtn.addEventListener('click', () => {
      setGuidelinesEnabled(!isGuidelinesEnabled());
      guidelineToggleBtn.classList.toggle('active', isGuidelinesEnabled());
      guidelineToggleBtn.textContent = isGuidelinesEnabled() ? '辅助线 ON' : '辅助线';
    });
    guidelineToggleBtn.classList.add('active');
    guidelineToggleBtn.textContent = '辅助线 ON';
  }

  // Coordinate input events
  setupCoordinateInputs();

  // Help button
  const helpBtn = document.getElementById('helpBtn');
  if (helpBtn) {
    helpBtn.addEventListener('click', showShortcutsHelp);
  }

  // Settings button
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () =>
      window.Settings.showSettingsModal()
    );
  }

  // Save seal to library
  const saveSealBtn = document.getElementById('save-seal-btn');
  if (saveSealBtn) {
    saveSealBtn.addEventListener('click', saveSealToLibrary);
  }

  // Batch processing
  setupBatchProcessing();

  // Tab switching
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;

      tabBtns.forEach((b) => b.classList.remove('active'));
      tabPanels.forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPanel = document.getElementById(`tab-${targetTab}`);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
    });
  });

  // Batch operations
  setupBatchOperations();

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboardShortcuts);

  // Page navigation
  if (pageSelector) {
    pageSelector.addEventListener('change', (e) => {
      const newPage = parseInt(e.target.value, 10);
      const currentPage = getCurrentActivePage();
      if (newPage !== currentPage && window.showPage) {
        window.showPage(newPage);
      }
    });
  }

  // Zoom control
  if (zoomSlider) {
    zoomSlider.addEventListener('input', (e) => {
      setState({ globalZoomMultiplier: parseFloat(e.target.value) });
      applyZoom();
    });
  }

  // Rotation control
  if (rotationSlider && rotationInput) {
    rotationSlider.addEventListener('input', (e) => {
      const angle = parseInt(e.target.value, 10);
      rotationInput.value = angle;
      setState({ sealRotation: angle });
      if (sealPreviewImg) {
        sealPreviewImg.style.transform = `rotate(${angle}deg)`;
      }
    });
    rotationInput.addEventListener('input', (e) => {
      const angle = parseInt(e.target.value, 10);
      if (!isNaN(angle) && angle >= -180 && angle <= 180) {
        rotationSlider.value = angle;
        setState({ sealRotation: angle });
        if (sealPreviewImg) {
          sealPreviewImg.style.transform = `rotate(${angle}deg)`;
        }
      }
    });
  }

  // Brightness control
  const brightnessSlider = document.getElementById('brightness-slider');
  const brightnessValue = document.getElementById('brightness-value');
  if (brightnessSlider && brightnessValue) {
    brightnessSlider.addEventListener('input', (e) => {
      const brightness = parseInt(e.target.value, 10);
      setState({ sealBrightness: brightness });
      brightnessValue.textContent = `${brightness}%`;
      updateSealPreviewBrightness();
    });
  }

  // Remove white background
  const removeBgBtn = document.getElementById('remove-bg-btn');
  if (removeBgBtn) {
    removeBgBtn.addEventListener('click', removeWhiteBackground);
  }

  // Handwritten signature
  const addSignatureBtn = document.getElementById('addSignature');
  if (addSignatureBtn) {
    addSignatureBtn.addEventListener('click', openSignatureModal);
  }

  setupSignatureModal();

  // Thumbnail scrolling
  if (thumbnailContainer) {
    thumbnailContainer.addEventListener('scroll', scheduleVisibleThumbnailRender, {
      passive: true,
    });
    window.addEventListener('resize', scheduleVisibleThumbnailRender);
  }
}

/**
 * Handle PDF file upload with callbacks
 * @param {File} file
 */
function handlePdfFileWithCallbacks(file) {
  handlePdfFile(file, {
    onLoadingStart: (message) => {
      window.Loading.showPdfLoading(message);
    },
    onLoadingEnd: () => {
      window.Loading.hide();
      appContainer.classList.remove('no-pdf-loaded');
      initGuidelinesOnCurrentCanvas();
    },
    onError: (message) => {
      window.Toast.error(message);
      appContainer.classList.add('no-pdf-loaded');
      window.Loading.hide();
    },
    onPagesRendered: (pageNum) => {
      // Page rendered callback
    },
  });
}

/**
 * Setup batch processing
 */
function setupBatchProcessing() {
  const uploadBatchBtn = document.getElementById('upload-batch-btn');
  const batchInputElement = document.getElementById('batchInput');
  const processBatchBtn = document.getElementById('processBatch');
  const clearBatchBtn = document.getElementById('clearBatch');

  if (uploadBatchBtn && batchInputElement) {
    uploadBatchBtn.addEventListener('click', () => batchInputElement.click());
    batchInputElement.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        window.BatchProcessing.addFilesToBatch(e.target.files);
        e.target.value = '';
      }
    });
  }

  if (processBatchBtn) {
    processBatchBtn.addEventListener('click', () =>
      window.BatchProcessing.processBatchFiles()
    );
  }
  if (clearBatchBtn) {
    clearBatchBtn.addEventListener('click', () =>
      window.BatchProcessing.clearBatchQueue()
    );
  }
}

/**
 * Setup batch operations (multi-page selection)
 */
function setupBatchOperations() {
  const selectAllBtn = document.getElementById('select-all-pages-btn');
  const clearSelectionBtn = document.getElementById('clear-selection-btn');
  const batchAddSealBtn = document.getElementById('batch-add-seal-btn');
  const batchDeleteStampsBtn = document.getElementById('batch-delete-stamps-btn');
  const thumbnailContainer = document.getElementById('thumbnail-container');

  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => selectAllPages());
  }
  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener('click', () => clearSelection());
  }
  if (batchAddSealBtn) {
    batchAddSealBtn.addEventListener('click', async () => {
      const sealImageElement = getState().sealImageElement;
      if (!sealImageElement || !sealImageElement.src) {
        window.Toast.warning('请先选择印章图片');
        return;
      }
      const settings = window.Settings.getSettings();
      await addSealToSelectedPages(sealImageElement, settings);
    });
  }
  if (batchDeleteStampsBtn) {
    batchDeleteStampsBtn.addEventListener('click', async () => {
      await deleteAllStampsFromSelectedPages();
    });
  }

  // Export buttons
  const exportSelectedBtn = document.getElementById('export-selected-btn');
  const exportAllBtn = document.getElementById('export-all-btn');
  const exportSplitBtn = document.getElementById('export-split-btn');
  const exportHint = document.getElementById('export-hint');

  if (exportSelectedBtn) {
    exportSelectedBtn.addEventListener('click', async () => {
      await exportSelectedPages(pdfInputElement.files[0], 'selected');
    });
  }
  if (exportAllBtn) {
    exportAllBtn.addEventListener('click', async () => {
      await exportSelectedPages(pdfInputElement.files[0], 'all');
    });
  }
  if (exportSplitBtn) {
    exportSplitBtn.addEventListener('click', async () => {
      await exportSelectedPages(pdfInputElement.files[0], 'split');
    });
  }

  // Update export hint based on selection
  function updateExportHint() {
    const selectedPages = getState().selectedPages;
    if (exportHint) {
      if (selectedPages.size > 0) {
        const pages = Array.from(selectedPages).sort((a, b) => a - b).join(', ');
        exportHint.textContent = `当前选中: ${pages} 页`;
      } else {
        exportHint.textContent = '未选择页面，将导出全部页面';
      }
    }
  }

  // Observe state changes to update hint
  const { subscribe } = await import('./core/state.js');
  subscribe(() => updateExportHint());
  updateExportHint();

  // Thumbnail click for multi-select (Shift/Ctrl)
  if (thumbnailContainer) {
    thumbnailContainer.addEventListener('click', (e) => {
      const thumb = e.target.closest('.thumbnail-item');
      if (!thumb) return;

      const pageNum = parseInt(thumb.dataset.pageNumber);
      if (!pageNum) return;

      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Click: Toggle single page
        e.preventDefault();
        togglePageSelection(pageNum);
      } else if (e.shiftKey) {
        // Shift+Click: Select range
        e.preventDefault();
        selectPageRange(pageNum);
      }
    });
  }
}

/**
 * Handle keyboard shortcuts
 * @param {KeyboardEvent} e
 */
function handleKeyboardShortcuts(e) {
  const canvas = getCurrentPageCanvas();
  const activeObject = canvas?.getActiveObject();

  // Ctrl+Z: Undo
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    window.History.undo();
    return;
  }

  // Ctrl+Y or Ctrl+Shift+Z: Redo
  if (
    (e.ctrlKey || e.metaKey) &&
    (e.key === 'y' || (e.key === 'z' && e.shiftKey))
  ) {
    e.preventDefault();
    window.History.redo();
    return;
  }

  // Ctrl+C: Copy
  if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
    e.preventDefault();
    copySelected();
    return;
  }

  // Ctrl+V: Paste
  if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
    e.preventDefault();
    if (!hasClipboard()) {
      window.Toast.warning('剪贴板为空');
      return;
    }
    pasteClipboard();
    return;
  }

  // Ctrl+L: Lock/Unlock
  if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
    e.preventDefault();
    toggleLockSelected();
    return;
  }

  // Ctrl+S: Export PDF
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    exportPDF(pdfInputElement.files[0]);
    return;
  }

  // Delete/Backspace: Delete selected object
  if ((e.key === 'Delete' || e.key === 'Backspace') && activeObject) {
    e.preventDefault();
    deleteSelectedObject();
    return;
  }

  // Escape: Deselect
  if (e.key === 'Escape' && activeObject) {
    canvas.discardActiveObject();
    canvas.renderAll();
    return;
  }

  // Arrow keys: Move selected object
  if (
    activeObject &&
    ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
  ) {
    if (activeObject.isLocked) {
      window.Toast?.warning('此印章已锁定');
      return;
    }
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const oldState = window.History.getObjectState(activeObject);

    switch (e.key) {
      case 'ArrowUp':
        activeObject.top -= step;
        break;
      case 'ArrowDown':
        activeObject.top += step;
        break;
      case 'ArrowLeft':
        activeObject.left -= step;
        break;
      case 'ArrowRight':
        activeObject.left += step;
        break;
    }

    canvas.renderAll();
    const newState = window.History.getObjectState(activeObject);
    const command = new window.History.ModifySealCommand(
      getCurrentActivePage(),
      activeObject,
      oldState,
      newState
    );
    window.History.executeCommand(command);
    return;
  }

  // +/-: Zoom
  if ((e.key === '+' || e.key === '=') && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    const globalZoomMultiplier = Math.min(
      2,
      getState().globalZoomMultiplier + 0.1
    );
    setState({ globalZoomMultiplier });
    const slider = document.getElementById('zoom-slider');
    if (slider) {
      slider.value = globalZoomMultiplier;
    }
    applyZoom();
    return;
  }

  if ((e.key === '-' || e.key === '_') && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    const globalZoomMultiplier = Math.max(
      0.5,
      getState().globalZoomMultiplier - 0.1
    );
    setState({ globalZoomMultiplier });
    const slider = document.getElementById('zoom-slider');
    if (slider) {
      slider.value = globalZoomMultiplier;
    }
    applyZoom();
    return;
  }

  // PageUp/PageDown: Page navigation
  if (e.key === 'PageUp') {
    const currentPage = getCurrentActivePage();
    if (currentPage > 1) {
      e.preventDefault();
      if (window.showPage) {
        window.showPage(currentPage - 1);
      }
    }
    return;
  }

  if (e.key === 'PageDown') {
    const currentPage = getCurrentActivePage();
    const totalPages = getState().totalPages;
    if (currentPage < totalPages) {
      e.preventDefault();
      if (window.showPage) {
        window.showPage(currentPage + 1);
      }
    }
    return;
  }

  // ?: Show keyboard shortcuts help
  if (e.key === '?' && e.shiftKey) {
    e.preventDefault();
    showShortcutsHelp();
    return;
  }
}

/**
 * Update seal preview brightness
 */
function updateSealPreviewBrightness() {
  const brightness = getState().sealBrightness;
  if (sealPreviewImg && sealPreviewImg.src) {
    sealPreviewImg.style.filter = `brightness(${brightness / 100})`;
  }
}

/**
 * Save seal to library
 */
async function saveSealToLibrary() {
  const sealImageElement = getState().sealImageElement;

  if (
    !sealImageElement ||
    !sealImageElement.src ||
    sealImageElement.naturalWidth === 0
  ) {
    window.Toast.warning('请先选择一个有效的印章图片！');
    return;
  }

  const sealName = await window.Settings.promptInput({
    title: '保存到印章库',
    message: '请输入印章名称：',
    defaultValue: '印章' + (window.SealLibrary.getSavedSeals().length + 1),
    placeholder: '请输入印章名称',
    confirmText: '保存',
    cancelText: '取消',
  });

  if (!sealName) return;
  if (sealName.trim().length === 0) {
    window.Toast.warning('印章名称不能为空');
    return;
  }

  const success = window.SealLibrary.addSealToLibrary(
    sealName.trim(),
    sealImageElement.src,
    getState().sealRotation
  );

  if (success) {
    window.SealLibrary.renderSealLibrary();
  }
}

/**
 * Show keyboard shortcuts help
 */
function showShortcutsHelp() {
  const shortcuts = [
    {
      category: '编辑',
      items: [
        { keys: 'Ctrl+Z', desc: '撤销' },
        { keys: 'Ctrl+Y', desc: '重做' },
        { keys: 'Delete', desc: '删除选中印章' },
        { keys: 'Esc', desc: '取消选择' },
        { keys: 'Ctrl+C', desc: '复制选中印章' },
        { keys: 'Ctrl+V', desc: '粘贴印章' },
        { keys: 'Ctrl+L', desc: '锁定/解锁印章' },
      ],
    },
    {
      category: '移动',
      items: [
        { keys: '\u2191\u2193\u2190\u2192', desc: '移动印章 (1px)' },
        { keys: 'Shift+\u2191\u2193\u2190\u2192', desc: '快速移动 (10px)' },
      ],
    },
    {
      category: '视图',
      items: [
        { keys: '+/-', desc: '缩放' },
        { keys: 'PageUp/Down', desc: '切换页面' },
      ],
    },
    {
      category: '操作',
      items: [
        { keys: 'Ctrl+S', desc: '导出PDF' },
        { keys: '?', desc: '显示此帮助' },
      ],
    },
  ];

  let container = document.createElement('div');
  container.style.fontFamily = 'sans-serif';

  let title = document.createElement('h2');
  title.style.marginTop = '0';
  title.textContent = '键盘快捷键';
  container.appendChild(title);

  shortcuts.forEach((cat) => {
    let heading = document.createElement('h3');
    heading.style.margin = '1rem 0 0.5rem';
    heading.style.color = '#007bff';
    heading.textContent = cat.category;
    container.appendChild(heading);

    let table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';

    cat.items.forEach((item) => {
      let row1 = document.createElement('tr');
      let cell1 = document.createElement('td');
      cell1.style.padding = '0.5rem';
      cell1.style.borderBottom = '1px solid #eee';
      cell1.style.fontWeight = '600';
      cell1.textContent = item.keys;
      row1.appendChild(cell1);

      let cell2 = document.createElement('td');
      cell2.style.padding = '0.5rem';
      cell2.style.borderBottom = '1px solid #eee';
      cell2.textContent = item.desc;
      row1.appendChild(cell2);

      table.appendChild(row1);
    });

    container.appendChild(table);
  });

  const modal = document.createElement('div');
  modal.style.cssText =
    'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:30000; display:flex; align-items:center; justify-content:center;';

  const content = document.createElement('div');
  content.style.cssText =
    'background:white; padding:2rem; border-radius:8px; max-width:600px; max-height:80vh; overflow-y:auto;';
  content.appendChild(container);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '关闭 (Esc)';
  closeBtn.style.cssText =
    'margin-top:1rem; padding:0.75rem 1.5rem; background:#007bff; color:white; border:none; border-radius:4px; cursor:pointer; font-size:1rem;';
  closeBtn.onclick = () => modal.remove();
  content.appendChild(closeBtn);

  modal.appendChild(content);
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', escHandler);
    }
  });

  document.body.appendChild(modal);
}

/**
 * Initialize context menu
 */
function initContextMenu() {
  const contextMenu = document.getElementById('context-menu');
  if (!contextMenu) return;

  document.addEventListener('contextmenu', (e) => {
    const canvasWrapper = e.target.closest('.canvas-wrapper');
    if (!canvasWrapper) {
      hideContextMenu();
      return;
    }

    const canvas = getCurrentPageCanvas();
    const activeObject = canvas?.getActiveObject();

    if (activeObject) {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY);
    }
  });

  contextMenu.addEventListener('click', (e) => {
    const menuItem = e.target.closest('.context-menu-item');
    if (!menuItem) return;

    const action = menuItem.dataset.action;
    handleContextMenuAction(action);
    hideContextMenu();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#context-menu')) {
      hideContextMenu();
    }
  });
}

/**
 * Show context menu
 */
function showContextMenu(x, y) {
  const contextMenu = document.getElementById('context-menu');
  if (!contextMenu) return;

  contextMenu.classList.remove('hidden');
  contextMenu.style.left = x + 'px';
  contextMenu.style.top = y + 'px';

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

/**
 * Hide context menu
 */
function hideContextMenu() {
  const contextMenu = document.getElementById('context-menu');
  if (contextMenu) {
    contextMenu.classList.add('hidden');
  }
}

/**
 * Handle context menu action
 */
function handleContextMenuAction(action) {
  switch (action) {
    case 'delete':
      deleteSelectedObject();
      break;
    case 'copy':
      copySelected();
      break;
    case 'paste':
      if (hasClipboard()) {
        pasteClipboard();
      }
      break;
    case 'toggle-lock':
      toggleLockSelected();
      break;
    case 'undo':
      window.History.undo();
      break;
    case 'redo':
      window.History.redo();
      break;
  }
}

/**
 * Setup X/Y coordinate inputs to update selected object position
 */
function setupCoordinateInputs() {
  const canvas = getCurrentPageCanvas();

  // Update inputs when selection changes
  if (canvas) {
    canvas.on('selection:created', _updateCoordInputs);
    canvas.on('selection:updated', _updateCoordInputs);
    canvas.on('object:moving', _updateCoordInputs);
    canvas.on('selection:cleared', _clearCoordInputs);
  }

  // Listen for input changes
  if (coordXInput) {
    coordXInput.addEventListener('change', _applyCoordInputs);
  }
  if (coordYInput) {
    coordYInput.addEventListener('change', _applyCoordInputs);
  }
}

function _updateCoordInputs(e) {
  const obj = e?.target || getCurrentPageCanvas()?.getActiveObject();
  if (!obj) return;
  if (coordXInput) coordXInput.value = Math.round(obj.left || 0);
  if (coordYInput) coordYInput.value = Math.round(obj.top || 0);
}

function _clearCoordInputs() {
  if (coordXInput) coordXInput.value = '';
  if (coordYInput) coordYInput.value = '';
}

function _applyCoordInputs() {
  const canvas = getCurrentPageCanvas();
  if (!canvas) return;
  const activeObject = canvas.getActiveObject();
  if (!activeObject || activeObject.isLocked) return;

  const x = parseFloat(coordXInput.value);
  const y = parseFloat(coordYInput.value);

  if (isNaN(x) && isNaN(y)) return;

  const oldState = window.History.getObjectState(activeObject);

  if (!isNaN(x)) activeObject.set({ left: x });
  if (!isNaN(y)) activeObject.set({ top: y });

  canvas.renderAll();

  const newState = window.History.getObjectState(activeObject);
  const command = new window.History.ModifySealCommand(
    getCurrentActivePage(),
    activeObject,
    oldState,
    newState
  );
  window.History.executeCommand(command);
}

/**
 * Toggle alignment guidelines on/off
 */
function toggleGuidelines() {
  const enabled = !isGuidelinesEnabled();
  setGuidelinesEnabled(enabled);
  if (guidelineToggleBtn) {
    guidelineToggleBtn.classList.toggle('active', enabled);
    guidelineToggleBtn.textContent = enabled ? '辅助线 ON' : '辅助线';
  }
}

/**
 * Initialize guidelines on the current page canvas
 */
function initGuidelinesOnCurrentCanvas() {
  const canvas = getCurrentPageCanvas();
  if (!canvas) return;
  initGuidelines(canvas);
}

// ==================== Remove White Background ====================

/**
 * Remove white background from image
 */
function removeWhiteBackground() {
  const sealImageElement = getState().sealImageElement;

  if (
    !sealImageElement ||
    !sealImageElement.src ||
    sealImageElement.naturalWidth === 0
  ) {
    window.Toast.warning('请先选择一个有效的印章图片！');
    return;
  }

  const img = new Image();
  img.src = sealImageElement.src;
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const threshold = 200;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      if (r > threshold && g > threshold && b > threshold) {
        data[i + 3] = 0;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    const newSrc = canvas.toDataURL('image/png');
    sealImageElement.src = newSrc;
    setState({ sealImageElement });
    if (sealPreviewImg) {
      sealPreviewImg.src = newSrc;
    }

    window.Toast.success('已成功去除白色背景！');
  };
  img.onerror = () => {
    window.Toast.error('处理图片时发生错误。');
  };
}

// ==================== Handwritten Signature ====================

let signaturePad = {
  canvas: null,
  ctx: null,
  isDrawing: false,
  lastX: 0,
  lastY: 0,
  initialized: false,

  init: function () {
    if (this.initialized) return;

    this.canvas = document.getElementById('signature-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
    this.canvas.addEventListener('mousemove', this.draw.bind(this));
    this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
    this.canvas.addEventListener('mouseout', this.stopDrawing.bind(this));

    this.canvas.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        this.startDrawing({
          offsetX: touch.clientX - rect.left,
          offsetY: touch.clientY - rect.top,
        });
      }
    );

    this.canvas.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        this.draw({
          offsetX: touch.clientX - rect.left,
          offsetY: touch.clientY - rect.top,
        });
      }
    );

    this.canvas.addEventListener('touchend', this.stopDrawing.bind(this));

    this.initialized = true;
  },

  startDrawing: function (e) {
    this.isDrawing = true;
    [this.lastX, this.lastY] = [e.offsetX, e.offsetY];
  },

  draw: function (e) {
    if (!this.isDrawing) return;
    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
    this.ctx.lineTo(e.offsetX, e.offsetY);
    this.ctx.stroke();
    [this.lastX, this.lastY] = [e.offsetX, e.offsetY];
  },

  stopDrawing: function () {
    this.isDrawing = false;
  },

  clear: function () {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  },

  isEmpty: function () {
    const pixelBuffer = new Uint32Array(
      this.ctx
        .getImageData(0, 0, this.canvas.width, this.canvas.height)
        .data.buffer
    );
    return !pixelBuffer.some((color) => color !== 0);
  },

  toDataURL: function () {
    return this.canvas.toDataURL('image/png');
  },
};

/**
 * Open signature modal
 */
function openSignatureModal() {
  const modal = document.getElementById('signature-modal');
  if (modal) {
    modal.classList.remove('hidden');
    signaturePad.init();
    signaturePad.clear();
  }
}

/**
 * Close signature modal
 */
function closeSignatureModal() {
  const modal = document.getElementById('signature-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

/**
 * Add signature to current page
 */
function addSignatureToPage() {
  if (signaturePad.isEmpty()) {
    window.Toast.warning('请先书写签名！');
    return;
  }

  const signatureDataUrl = signaturePad.toDataURL();
  const canvas = getCurrentPageCanvas();

  if (!canvas) return;

  fabric.Image.fromURL(signatureDataUrl, (img) => {
    img.scaleToWidth(200);
    img.set({
      left: canvas.originalWidth / 2,
      top: canvas.originalHeight / 2,
      originX: 'center',
      originY: 'center',
      borderColor: '#007bff',
      cornerColor: '#007bff',
      cornerSize: 10,
      transparentCorners: false,
    });

    const command = new window.History.AddSealCommand(
      getCurrentActivePage(),
      img
    );
    window.History.executeCommand(command);

    canvas.setActiveObject(img);
    canvas.renderAll();

    closeSignatureModal();
    window.Toast.success('签名已添加');
  });
}

/**
 * Setup signature modal
 */
function setupSignatureModal() {
  const closeSignatureBtn = document.querySelector('.modal-close');
  const clearSignatureBtn = document.getElementById('clear-signature-btn');
  const confirmSignatureBtn = document.getElementById('confirm-signature-btn');

  if (closeSignatureBtn) {
    closeSignatureBtn.addEventListener('click', closeSignatureModal);
  }
  if (clearSignatureBtn) {
    clearSignatureBtn.addEventListener('click', () => signaturePad.clear());
  }
  if (confirmSignatureBtn) {
    confirmSignatureBtn.addEventListener('click', addSignatureToPage);
  }
}

// Start application
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
