import { getState, setState, subscribe } from './core/state.js';
import { handlePdfFile } from './modules/pdf-loader.js';
import {
  getCurrentPageCanvas,
  getCurrentActivePage,
  applyZoom,
  handleSidebarToggle,
  showPage as showCanvasPage,
} from './modules/canvas-manager.js';
import {
  handleSealFile,
  addNormalSeal,
  addStraddleSeal,
  deleteSelectedObject,
  toggleLockSelected,
  clearSelectedSeal,
} from './modules/stamp-manager.js';
import { exportPDF, exportCurrentPageAsImage } from './modules/exporter.js';
import { initResponsive } from './modules/responsive.js';
import { initSecurity } from './utils/security.js';
import { showShortcutsHelp } from './ui/shortcut-help.js';
import {
  openSignatureModal,
  setupSignatureModal,
} from './ui/signature-modal.js';
import { isEnabled as isGuidelinesEnabled } from './modules/guideline-manager.js';
import {
  copySelected,
  pasteClipboard,
  hasClipboard,
} from './modules/object-clipboard.js';
import {
  initVirtualScroller,
} from './modules/thumbnail-virtual-scroller.js';
import {
  removeWhiteBackground,
  saveSealToLibrary,
  updateSealPreviewBrightness,
} from './features/seal-tools.js';
import { setupBatchUI } from './features/batch-ui.js';
import {
  setupSelectionControls,
  syncSelectionCanvasState,
} from './features/selection-controls.js';
import { setupContextMenu } from './ui/context-menu.js';
import { setupToolbarSections } from './ui/toolbar-sections.js';

// ==================== DOM Elements ====================

const appContainer = document.getElementById('app');
const sidebarToggleBtn = document.getElementById('sidebar-toggle');
const mainContent = document.getElementById('main-content');
const pdfInputElement = document.getElementById('pdfInput');
const sealInputElement = document.getElementById('sealInput');
const mainUploadBtn = document.getElementById('upload-pdf-btn-main');
const samplePdfButtons = document.querySelectorAll('[data-load-sample-pdf]');
const sealUploadBtn = document.getElementById('upload-seal-btn');
const sealPreviewImg = document.getElementById('seal-preview');
const sealPreviewTrigger = document.getElementById('seal-preview-trigger');
const sealPreviewOverlay = document.getElementById('seal-preview-overlay');
const clearSealBtn = document.getElementById('clear-seal-btn');
const thumbnailContainer = document.getElementById('thumbnail-container');
const addSealBtn = document.getElementById('addSeal');
const addStraddleBtn = document.getElementById('addStraddle');
const exportPdfBtn = document.getElementById('exportPDF');
const exportImageBtn = document.getElementById('exportImage');
const zoomSlider = document.getElementById('zoom-slider');
const pageSelector = document.getElementById('page-selector');
const rotationSlider = document.getElementById('rotation-slider');
const rotationInput = document.getElementById('rotation-input');
const coordXInput = document.getElementById('coord-x');
const coordYInput = document.getElementById('coord-y');
const removeBgBtn = document.getElementById('remove-bg-btn');
const copyStampBtn = document.getElementById('copy-stamp-btn');
const pasteStampBtn = document.getElementById('paste-stamp-btn');
const lockStampBtn = document.getElementById('lock-stamp-btn');
const guidelineToggleBtn = document.getElementById('guideline-toggle-btn');
const saveSealBtn = document.getElementById('save-seal-btn');
const quickSignatureBtn = document.getElementById('quick-signature-btn');
const collapsedSidebarPill = document.querySelector('.collapsed-sidebar-pill');
const collapsedSidebarPrimary = document.getElementById('collapsed-sidebar-primary');
const collapsedSidebarSecondary = document.getElementById('collapsed-sidebar-secondary');
const guideSecondaryBtn = document.getElementById('guide-secondary-btn');
const guidePrimaryBtn = document.getElementById('guide-primary-btn');
const editNextStep = document.getElementById('edit-next-step');
const editLastAction = document.getElementById('edit-last-action');
const exportNextStep = document.getElementById('export-next-step');
const exportLastAction = document.getElementById('export-last-action');
const exportModeButtons = document.querySelectorAll('.export-mode-btn');
const exportModePanels = document.querySelectorAll('.export-mode-panel');
const togglePrecisionControlsBtn = document.getElementById('toggle-precision-controls');
const precisionToggleRow = togglePrecisionControlsBtn?.closest('.button-group') || null;
const precisionControls = document.getElementById('precision-controls');
const precisionCoordinateFields = document.getElementById('precision-coordinate-fields');
const workflowActions = document.querySelector('.workflow-actions');

const EXPORT_MODE_STORAGE_KEY = 'yinji-export-mode';
const SAMPLE_PDF_PATH = 'test-fixture.pdf';

let lastBatchQueueState = {
  count: 0,
  processing: false,
  currentIndex: 0,
  total: 0,
  currentFileName: '',
};

let lastUserFeedback = '最近结果会显示在这里。';
let currentExportMode = getStoredExportMode();

function getStoredExportMode() {
  try {
    const savedMode = window.localStorage?.getItem(EXPORT_MODE_STORAGE_KEY);
    return savedMode === 'batch' ? 'batch' : 'single';
  } catch (error) {
    return 'single';
  }
}

function setWorkflowFeedback(message) {
  if (!message) {
    return;
  }

  lastUserFeedback = message;
  const isDefault = message === '最近结果会显示在这里。';
  const text = isDefault ? message : `最近结果：${message}`;

  if (editLastAction) {
    editLastAction.textContent = text;
    editLastAction.hidden = isDefault;
  }

  if (exportLastAction) {
    exportLastAction.textContent = text;
    exportLastAction.hidden = isDefault;
  }
}

function switchToolbarTab(targetTab) {
  if (!targetTab) {
    return;
  }

  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === targetTab);
  });

  tabPanels.forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tab-${targetTab}`);
  });
}

function setExportMode(mode, { save = true } = {}) {
  currentExportMode = mode === 'batch' ? 'batch' : 'single';

  exportModeButtons.forEach((button) => {
    const isActive = button.dataset.exportMode === currentExportMode;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  exportModePanels.forEach((panel) => {
    const isActive = panel.dataset.exportModePanel === currentExportMode;
    panel.hidden = !isActive;
  });

  if (save) {
    try {
      window.localStorage?.setItem(EXPORT_MODE_STORAGE_KEY, currentExportMode);
    } catch (error) {
      // Ignore localStorage write failures
    }
  }

  updateToolbarStatus();
}

function getPlacedStampCount() {
  const { fabricCanvases = [] } = getState();
  return fabricCanvases.reduce((count, canvas) => {
    if (!canvas) {
      return count;
    }

    const objectCount = canvas
      .getObjects()
      .filter((obj) => !obj.isBackgroundImage).length;

    return count + objectCount;
  }, 0);
}

function updatePrecisionControlsButton() {
  if (!togglePrecisionControlsBtn || !precisionControls) {
    return;
  }

  const expanded = !precisionControls.hidden;
  togglePrecisionControlsBtn.textContent = expanded
    ? '收起微调'
    : '微调位置';
  togglePrecisionControlsBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function updateWorkflowGuidance({
  hasPdf,
  hasSeal,
  currentActivePage,
  placedStampCount,
  savedSealCount,
} = {}) {
  const { currentSourceKind } = getState();
  const isImageSource = currentSourceKind === 'image';

  if (guidePrimaryBtn) {
    let label = '选择文件';
    let action = 'open-file';

    if (hasPdf && !hasSeal) {
      label = '选择印章图片';
      action = 'open-seal';
    } else if (hasPdf && hasSeal && placedStampCount === 0) {
      label = '盖到当前页';
      action = 'add-seal';
    } else if (hasPdf && placedStampCount > 0) {
      label = '立即下载';
      action = 'download-now';
    }

    guidePrimaryBtn.textContent = label;
    guidePrimaryBtn.dataset.action = action;
  }

  if (guideSecondaryBtn) {
    guideSecondaryBtn.hidden = true;
    guideSecondaryBtn.dataset.action = '';

    if (!hasPdf) {
      guideSecondaryBtn.textContent = '加载示例';
      guideSecondaryBtn.dataset.action = 'load-sample';
      guideSecondaryBtn.hidden = false;
    } else if (placedStampCount > 0) {
      guideSecondaryBtn.textContent = '页面导出';
      guideSecondaryBtn.dataset.action = 'go-export';
      guideSecondaryBtn.hidden = false;
    } else if (!hasSeal && savedSealCount > 0) {
      guideSecondaryBtn.textContent = '查看印章库';
      guideSecondaryBtn.dataset.action = 'open-library';
      guideSecondaryBtn.hidden = false;
    }
  }

  if (workflowActions) {
    workflowActions.classList.toggle(
      'has-secondary',
      Boolean(guideSecondaryBtn && !guideSecondaryBtn.hidden)
    );
  }

  if (editNextStep) {
    let text = '打开一个文件试试。';

    if (hasPdf && !hasSeal) {
      text = '接下来选个印章，或打开手写签名。';
    } else if (hasPdf && hasSeal && placedStampCount === 0) {
      text = `印章准备好了，点上面的按钮放到第 ${currentActivePage} 页。`;
    } else if (hasPdf && placedStampCount > 0) {
      text = `已放置 ${placedStampCount} 个对象。可以直接下载，或去页面导出。`;
    }

    editNextStep.textContent = text;
  }

  if (exportNextStep) {
    let text = '去「编辑」盖好章后回来就好。';

    if (currentExportMode === 'batch') {
      if (lastBatchQueueState.processing) {
        const progressText = lastBatchQueueState.total > 0
          ? `${lastBatchQueueState.currentIndex}/${lastBatchQueueState.total}`
          : `${lastBatchQueueState.count} 个文件`;
        text = lastBatchQueueState.currentFileName
          ? `正在处理 ${progressText}：${lastBatchQueueState.currentFileName}。`
          : `正在处理 ${progressText}。`;
      } else if (lastBatchQueueState.count === 0) {
        text = '先添加要处理的 PDF。';
      } else if (!hasSeal) {
        text = '文件已添加，先回「编辑」选好印章再开始。';
      } else {
        text = `队列里有 ${lastBatchQueueState.count} 个文件，可以开始批量处理。`;
      }
    } else if (!hasPdf) {
      text = '先去「编辑」打开文件。';
    } else if (placedStampCount === 0) {
      text = '文件已打开，去「编辑」盖好章再来下载。';
    } else if (isImageSource) {
      text = '可以下载盖章后的 PDF，也可以导出 PNG 图片。';
    } else {
      text = '可以直接下载整份文件，或按页面下载。';
    }

    exportNextStep.textContent = text;
  }

  setWorkflowFeedback(lastUserFeedback);
}

async function loadSamplePdf() {
  samplePdfButtons.forEach((button) => {
    button.disabled = true;
  });

  try {
    const response = await fetch(new URL(SAMPLE_PDF_PATH, window.location.href));
    if (!response.ok) {
      throw new Error('示例文件加载失败');
    }

    const blob = await response.blob();
    const file = new File([blob], '印迹示例.pdf', {
      type: blob.type || 'application/pdf',
    });

    handlePdfFileWithCallbacks(file);
  } catch (error) {
    console.error('加载示例文件失败:', error);
    window.Toast.error('示例文件没找到，可能文件不在了。');
  } finally {
    samplePdfButtons.forEach((button) => {
      button.disabled = false;
    });
  }
}

function openSealLibrarySection() {
  switchToolbarTab('edit');

  window.requestAnimationFrame(() => {
    const section = document.querySelector('[data-section-key="edit-library"]');
    if (!section) {
      return;
    }

    const toggle = section.querySelector('.tool-section-toggle');
    if (section.classList.contains('is-collapsed')) {
      toggle?.click();
    }

    section.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  });
}

// ==================== Initialization ====================

async function main() {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.mjs';

  // Initialize security measures (CSP, clickjacking prevention)
  initSecurity();

  // Initialize responsive layout for mobile
  initResponsive();

  // Initialize virtual scroller for thumbnails (will be activated after PDF load)
  const thumbnailContainer = document.getElementById('thumbnail-container');
  const virtualScroller = initVirtualScroller(thumbnailContainer);
  if (virtualScroller) {
    setState({ virtualScroller });
  }

  initializeEventListeners();
  setupToolbarSections();
  setupContextMenu({ onToolbarStatusChange: updateToolbarStatus });
  applyToolbarSettings(window.Settings.getSettings());
  updatePrecisionControlsButton();
  setWorkflowFeedback(lastUserFeedback);
  setExportMode(currentExportMode, { save: false });
  updateToolbarAvailability();
  updateToolbarStatus();
  updateSidebarCollapsedStatus();
  subscribe(() => {
    updateToolbarAvailability();
    updateToolbarStatus();
    updateSidebarCollapsedStatus();
  });

  document.addEventListener('pdf-stamper:batch-queue-updated', (event) => {
    lastBatchQueueState = {
      count: event.detail?.count || 0,
      processing: Boolean(event.detail?.processing),
      currentIndex: event.detail?.currentIndex || 0,
      total: event.detail?.total || event.detail?.count || 0,
      currentFileName: event.detail?.currentFileName || '',
    };
    updateToolbarStatus();
  });

  document.addEventListener('pdf-stamper:seal-library-updated', () => {
    updateToolbarStatus();
  });

  window.addEventListener('pdf-stamper:settings-updated', (event) => {
    applyToolbarSettings(event.detail);
  });

  document.addEventListener('pdf-stamper:toast-shown', (event) => {
    const message = event.detail?.message;
    if (message) {
      setWorkflowFeedback(message);
    }
  });

  window.showPage = async function (pageNum, forceRecalculate = false) {
    await showCanvasPage(pageNum, forceRecalculate);
    syncSelectionCanvasState();
  };
}

function applyToolbarSettings(settings) {
  if (!settings) return;

  const rotation = Number.isFinite(settings.sealRotation)
    ? settings.sealRotation
    : 0;

  setState({ sealRotation: rotation });

  if (rotationSlider) {
    rotationSlider.value = String(rotation);
  }

  if (rotationInput) {
    rotationInput.value = String(rotation);
  }

  if (sealPreviewImg && sealPreviewImg.src) {
    sealPreviewImg.style.transform = `rotate(${rotation}deg)`;
  }
}

function updateToolbarAvailability() {
  const { currentPdfFile, sealImageElement, currentSourceKind } = getState();
  const hasPdf = Boolean(currentPdfFile);
  const hasSeal = Boolean(sealImageElement?.src);
  const exportSelectedBtn = document.getElementById('export-selected-btn');
  const exportAllBtn = document.getElementById('export-all-btn');
  const exportSplitBtn = document.getElementById('export-split-btn');

  if (removeBgBtn) {
    removeBgBtn.disabled = !hasSeal;
  }

  if (saveSealBtn) {
    saveSealBtn.disabled = !hasSeal;
  }

  if (clearSealBtn) {
    clearSealBtn.disabled = !hasSeal;
    clearSealBtn.hidden = !hasSeal;
  }

  if (sealPreviewOverlay) {
    sealPreviewOverlay.hidden = !hasSeal;
  }

  if (sealPreviewTrigger) {
    sealPreviewTrigger.setAttribute(
      'aria-label',
      hasSeal ? '点击更换印章图片' : '点击选择印章图片'
    );
  }

  if (addSealBtn) {
    addSealBtn.disabled = !hasPdf || !hasSeal;
  }

  if (addStraddleBtn) {
    addStraddleBtn.disabled = !hasPdf || !hasSeal;
  }

  if (quickSignatureBtn) {
    quickSignatureBtn.disabled = !hasPdf;
  }

  if (exportPdfBtn) {
    exportPdfBtn.disabled = !hasPdf;
  }

  if (exportImageBtn) {
    exportImageBtn.hidden = currentSourceKind !== 'image';
    exportImageBtn.disabled = !hasPdf || currentSourceKind !== 'image';
  }

  if (exportSelectedBtn) {
    exportSelectedBtn.disabled = !hasPdf;
  }

  if (exportAllBtn) {
    exportAllBtn.disabled = !hasPdf;
  }

  if (exportSplitBtn) {
    exportSplitBtn.disabled = !hasPdf;
  }

  if (guidePrimaryBtn) {
    guidePrimaryBtn.disabled =
      guidePrimaryBtn.dataset.action !== 'open-file' && !hasPdf;
  }

  if (togglePrecisionControlsBtn) {
    togglePrecisionControlsBtn.disabled = !hasPdf;
  }

  if (guidelineToggleBtn) {
    guidelineToggleBtn.disabled = !hasPdf;
  }
}

function updateToolbarStatus() {
  const state = getState();
  const {
    currentPdfFile,
    currentActivePage,
    totalPages,
    sealImageElement,
    selectedPages,
    currentSourceKind,
  } = state;
  const hasPdf = Boolean(currentPdfFile);
  const hasSeal = Boolean(sealImageElement?.src);
  const isImageSource = currentSourceKind === 'image';
  const canvas = getCurrentPageCanvas();
  const activeObject = canvas?.getActiveObject();
  const savedSealCount = window.SealLibrary?.getSavedSeals?.().length || 0;
  const placedStampCount = getPlacedStampCount();

  const editStatusFile = document.getElementById('edit-status-file');
  const editStatusPage = document.getElementById('edit-status-page');
  const editStatusSummary = document.getElementById('edit-status-summary');
  const placePageChip = document.getElementById('place-page-chip');
  const placeSealChip = document.getElementById('place-seal-chip');
  const editSelectionChip = document.getElementById('edit-selection-chip');
  const editGuidelineChip = document.getElementById('edit-guideline-chip');
  const sealLibraryCountChip = document.getElementById('seal-library-count-chip');
  const exportStatusFile = document.getElementById('export-status-file');
  const exportStatusSummary = document.getElementById('export-status-summary');
  const exportStatusNote = document.getElementById('export-status-note');

  const pageText = hasPdf ? `第 ${currentActivePage} / ${totalPages} 页` : '第 - / - 页';
  const hasActiveObject = Boolean(activeObject);
  const selectionText = activeObject
    ? activeObject.isLocked
      ? '已选中，已锁定。'
      : '已选中，可拖动。'
    : !hasPdf
      ? '先选择文件。'
    : placedStampCount > 0
      ? '点一下页面上的印章。'
      : '盖章后，点一下页面上的印章。';
  const guidelineText = isGuidelinesEnabled() ? '对齐辅助线：已开启' : '对齐辅助线：已关闭';

  if (editStatusFile) {
    editStatusFile.textContent = hasPdf ? currentPdfFile.name : '还没打开文件';
  }
  if (editStatusPage) {
    editStatusPage.textContent = pageText;
  }
  if (editStatusSummary) {
    if (!hasPdf) {
      editStatusSummary.textContent = '打开一个文件试试。';
    } else if (!hasSeal) {
      editStatusSummary.textContent = '文件已打开，接下来选个印章或手写签名。';
    } else if (activeObject) {
      editStatusSummary.textContent = activeObject.isLocked
        ? '已选中，已锁定。'
        : '已选中，可拖动。';
    } else if (placedStampCount > 0) {
      editStatusSummary.textContent = `已放置 ${placedStampCount} 个对象。点一下印章可继续调整。`;
    } else {
      editStatusSummary.textContent = '印章准备好了，点「盖到当前页」放上去。';
    }
  }
  if (placePageChip) {
    placePageChip.textContent = hasPdf ? `当前页 ${currentActivePage} / ${totalPages}` : '当前页 - / -';
  }
  if (placeSealChip) {
    placeSealChip.textContent = hasSeal ? '印章或签名已就绪' : '选个印章或签名';
  }
  if (sealUploadBtn) {
    sealUploadBtn.textContent = hasSeal ? '更换印章图片' : '选择印章图片';
  }
  if (editSelectionChip) {
    editSelectionChip.textContent = selectionText;
  }
  if (editGuidelineChip) {
    editGuidelineChip.textContent = guidelineText;
  }
  if (precisionToggleRow) {
    precisionToggleRow.hidden = !hasActiveObject;
  }
  if (!hasActiveObject && precisionControls && !precisionControls.hidden) {
    precisionControls.hidden = true;
  }
  if (precisionCoordinateFields) {
    precisionCoordinateFields.hidden = !hasActiveObject;
  }
  if (togglePrecisionControlsBtn) {
    togglePrecisionControlsBtn.hidden = !hasActiveObject;
    togglePrecisionControlsBtn.disabled = !hasActiveObject;
    updatePrecisionControlsButton();
  }
  if (sealLibraryCountChip) {
    sealLibraryCountChip.textContent = `已保存 ${savedSealCount} 个印章`;
  }
  if (exportStatusFile) {
    exportStatusFile.textContent = hasPdf ? currentPdfFile.name : '还没打开文件';
  }
  if (exportStatusSummary) {
    exportStatusSummary.textContent = pageText;
  }
  if (exportStatusNote) {
    if (currentExportMode === 'batch') {
      exportStatusNote.textContent = lastBatchQueueState.processing
        ? lastBatchQueueState.total > 0
          ? `正在处理 ${lastBatchQueueState.currentIndex}/${lastBatchQueueState.total}。`
          : '正在批量处理。'
        : lastBatchQueueState.count > 0
          ? `队列里有 ${lastBatchQueueState.count} 个文件。`
          : '先添加要处理的 PDF。';
    } else if (!hasPdf) {
      exportStatusNote.textContent = '先去「编辑」打开文件。';
    } else if (placedStampCount === 0) {
      exportStatusNote.textContent = isImageSource
        ? '文件已打开，还没盖章。导出时可选 PDF 或 PNG。'
        : '文件已打开，还没盖章。';
    } else if (selectedPages.size > 0) {
      exportStatusNote.textContent = `已放置 ${placedStampCount} 个对象，已选 ${selectedPages.size} 页。`;
    } else if (isImageSource) {
      exportStatusNote.textContent = `已放置 ${placedStampCount} 个对象，可以下载 PDF，也可以导出 PNG 图片。`;
    } else {
      exportStatusNote.textContent = `已放置 ${placedStampCount} 个对象，不选页面就下载全部。`;
    }
  }

  updateWorkflowGuidance({
    hasPdf,
    hasSeal,
    currentActivePage,
    placedStampCount,
    savedSealCount,
  });
}

function updateSidebarCollapsedStatus() {
  if (!collapsedSidebarPrimary || !collapsedSidebarSecondary) {
    return;
  }

  const { currentPdfFile, currentActivePage, totalPages } = getState();
  const isCollapsed = appContainer.classList.contains('sidebar-collapsed');

  if (sidebarToggleBtn) {
    sidebarToggleBtn.title = isCollapsed ? '展开页面预览' : '收起页面预览';
    sidebarToggleBtn.setAttribute(
      'aria-label',
      isCollapsed ? '展开页面预览' : '收起页面预览'
    );
  }

  if (!currentPdfFile) {
    collapsedSidebarPrimary.textContent = '空闲';
    collapsedSidebarSecondary.textContent = '还没打开文件';
    if (collapsedSidebarPill) {
      collapsedSidebarPill.title = '还没打开文件';
      collapsedSidebarPill.setAttribute('aria-label', '还没打开文件');
    }
    return;
  }

  collapsedSidebarPrimary.textContent = `${currentActivePage}/${totalPages}`;
  collapsedSidebarSecondary.textContent = '当前页';
  if (collapsedSidebarPill) {
    const fileName = currentPdfFile.name || '已加载文件';
    const summary = `${fileName}，当前第 ${currentActivePage} / ${totalPages} 页`;
    collapsedSidebarPill.title = summary;
    collapsedSidebarPill.setAttribute('aria-label', summary);
  }
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
    if (files.length > 0) {
      handlePdfFileWithCallbacks(files[0]);
    }
  });

  mainContent.addEventListener(
    'wheel',
    (event) => {
      if ((!event.ctrlKey && !event.metaKey) || !getState().pdfDoc) {
        return;
      }

      event.preventDefault();

      const currentZoom = getState().globalZoomMultiplier;
      const zoomStep = Math.min(
        0.18,
        Math.max(0.04, Math.abs(event.deltaY) / 480)
      );
      const nextZoom = Math.min(
        2,
        Math.max(0.5, currentZoom + (event.deltaY < 0 ? zoomStep : -zoomStep))
      );

      if (nextZoom === currentZoom) {
        return;
      }

      setState({ globalZoomMultiplier: nextZoom });
      if (zoomSlider) {
        zoomSlider.value = String(nextZoom);
      }
      applyZoom({
        clientX: event.clientX,
        clientY: event.clientY,
      });
    },
    { passive: false }
  );

  // File upload buttons
  mainUploadBtn.addEventListener('click', () => pdfInputElement.click());
  samplePdfButtons.forEach((button) => {
    button.addEventListener('click', loadSamplePdf);
  });
  pdfInputElement.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handlePdfFileWithCallbacks(e.target.files[0]);
      e.target.value = '';
    }
  });
  sealUploadBtn.addEventListener('click', () => sealInputElement.click());
  if (sealPreviewTrigger) {
    sealPreviewTrigger.addEventListener('click', () => {
      sealInputElement.click();
    });
    sealPreviewTrigger.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      event.preventDefault();
      sealInputElement.click();
    });
  }
  if (clearSealBtn) {
    clearSealBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      clearSelectedSeal();
      updateToolbarStatus();
    });
  }
  sealInputElement.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleSealFile(e.target.files[0]);
      e.target.value = '';
    }
  });

  if (guidePrimaryBtn) {
    guidePrimaryBtn.addEventListener('click', () => {
      switch (guidePrimaryBtn.dataset.action) {
        case 'open-seal':
          sealInputElement.click();
          break;
        case 'add-seal':
          addNormalSeal();
          break;
        case 'download-now':
          exportPDF(getState().currentPdfFile);
          break;
        case 'go-export':
          switchToolbarTab('export');
          setExportMode('single');
          break;
        case 'open-file':
        default:
          pdfInputElement.click();
          break;
      }
    });
  }

  if (guideSecondaryBtn) {
    guideSecondaryBtn.addEventListener('click', () => {
      switch (guideSecondaryBtn.dataset.action) {
        case 'load-sample':
          loadSamplePdf();
          break;
        case 'open-library':
          openSealLibrarySection();
          break;
        case 'go-export':
          switchToolbarTab('export');
          setExportMode('single');
          break;
        case 'download-now':
          exportPDF(getState().currentPdfFile);
          break;
        default:
          break;
      }
    });
  }

  // Stamp operation buttons
  addSealBtn.addEventListener('click', addNormalSeal);
  addStraddleBtn.addEventListener('click', addStraddleSeal);
  exportPdfBtn.addEventListener('click', () =>
    exportPDF(getState().currentPdfFile)
  );

  if (exportImageBtn) {
    exportImageBtn.addEventListener('click', () =>
      exportCurrentPageAsImage(getState().currentPdfFile)
    );
  }

  // Copy / Paste buttons
  if (copyStampBtn) {
    copyStampBtn.addEventListener('click', () => {
      copySelected();
      updateToolbarStatus();
    });
  }
  if (pasteStampBtn) {
    pasteStampBtn.addEventListener('click', async () => {
      if (!hasClipboard()) {
        window.Toast.warning('剪贴板为空');
        return;
      }
      await pasteClipboard();
      updateToolbarStatus();
    });
  }

  // Lock button
  if (lockStampBtn) {
    lockStampBtn.addEventListener('click', () => {
      toggleLockSelected();
      updateToolbarStatus();
    });
  }

  setupSelectionControls({
    coordXInput,
    coordYInput,
    guidelineToggleBtn,
    onToolbarStatusChange: updateToolbarStatus,
  });

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
  if (saveSealBtn) {
    saveSealBtn.addEventListener('click', async () => {
      await saveSealToLibrary();
      updateToolbarStatus();
    });
  }

  setupBatchUI({ onToolbarStatusChange: updateToolbarStatus });

  exportModeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      switchToolbarTab('export');
      setExportMode(button.dataset.exportMode);
    });
  });

  // Tab switching
  const tabBtns = document.querySelectorAll('.tab-btn');

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      switchToolbarTab(btn.dataset.tab);
    });
  });


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
      updateSealPreviewBrightness(sealPreviewImg);
    });
  }

  // Remove white background
  if (removeBgBtn) {
    removeBgBtn.addEventListener('click', () => {
      removeWhiteBackground(sealPreviewImg);
      updateToolbarStatus();
    });
  }

  // Handwritten signature
  if (quickSignatureBtn) {
    quickSignatureBtn.addEventListener('click', openSignatureModal);
  }

  if (togglePrecisionControlsBtn && precisionControls) {
    togglePrecisionControlsBtn.addEventListener('click', () => {
      precisionControls.hidden = !precisionControls.hidden;
      updatePrecisionControlsButton();
    });
  }

  setupSignatureModal();

  // Virtual scroller handles thumbnail rendering automatically
  // No need for manual scroll listeners - handled by initVirtualScroller()
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
    onLoadingEnd: (success) => {
      window.Loading.hide();
      appContainer.classList.toggle('no-pdf-loaded', !success);
      if (success) {
        syncSelectionCanvasState();
        const { totalPages, currentSourceKind } = getState();
        window.Toast.success(
          currentSourceKind === 'image'
            ? `${file.name} 已加载为 ${totalPages} 页。现在可以盖章，导出时可选 PDF 或 PNG。`
            : `${file.name} 已加载，共 ${totalPages} 页。下一步请选印章。`
        );
      }
    },
    onError: (message) => {
      window.Toast.error(message);
    },
    onPagesRendered: (pageNum) => {
      // Page rendered callback
    },
  }).catch((error) => {
    console.error('处理 PDF 上传失败:', error);
    window.Loading.hide();
    appContainer.classList.add('no-pdf-loaded');
    window.Toast.error('文件打开失败，再试一次。');
  });
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
    updateToolbarStatus();
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
    updateToolbarStatus();
    return;
  }

  // Ctrl+L: Lock/Unlock
  if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
    e.preventDefault();
    toggleLockSelected();
    updateToolbarStatus();
    return;
  }

  // Ctrl+S: Export PDF
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    exportPDF(getState().currentPdfFile);
    return;
  }

  // Delete/Backspace: Delete selected object
  if ((e.key === 'Delete' || e.key === 'Backspace') && activeObject) {
    e.preventDefault();
    deleteSelectedObject();
    updateToolbarStatus();
    return;
  }

  // Escape: Deselect
  if (e.key === 'Escape' && activeObject) {
    canvas.discardActiveObject();
    canvas.renderAll();
    updateToolbarStatus();
    return;
  }

  // Arrow keys: Move selected object
  if (
    activeObject &&
    ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
  ) {
    if (activeObject.isLocked) {
      window.Toast?.warning('这个印章已锁定。');
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

// Start application
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
