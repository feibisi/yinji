import { getState, subscribe } from '../core/state.js';
import {
  selectAllPages,
  clearSelection,
  setMultiSelectMode,
  addSealToSelectedPages,
  deleteAllStampsFromSelectedPages,
  exportSelectedPages,
  refreshSelectionUI,
} from '../modules/batch-operations.js';

export function setupBatchUI({ onToolbarStatusChange }) {
  setupBatchProcessing();
  setupBatchOperations(onToolbarStatusChange);
}

function setupBatchProcessing() {
  const uploadBatchBtn = document.getElementById('upload-batch-btn');
  const batchInputElement = document.getElementById('batchInput');
  const processBatchBtn = document.getElementById('processBatch');
  const clearBatchBtn = document.getElementById('clearBatch');

  if (uploadBatchBtn && batchInputElement) {
    uploadBatchBtn.addEventListener('click', () => batchInputElement.click());
    batchInputElement.addEventListener('change', (event) => {
      if (event.target.files.length > 0) {
        window.BatchProcessing.addFilesToBatch(event.target.files);
        event.target.value = '';
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

function setupBatchOperations(onToolbarStatusChange) {
  const batchModeBtn = document.getElementById('batch-mode-btn');
  const selectAllBtn = document.getElementById('select-all-pages-btn');
  const clearSelectionBtn = document.getElementById('clear-selection-btn');
  const batchAddSealBtn = document.getElementById('batch-add-seal-btn');
  const batchDeleteStampsBtn = document.getElementById('batch-delete-stamps-btn');
  const exportSelectedBtn = document.getElementById('export-selected-btn');
  const exportAllBtn = document.getElementById('export-all-btn');
  const exportSplitBtn = document.getElementById('export-split-btn');
  const exportHint = document.getElementById('export-hint');

  if (batchModeBtn) {
    batchModeBtn.addEventListener('click', () => {
      if (getState().isMultiSelectMode || getState().selectedPages.size > 0) {
        clearSelection();
        return;
      }

      setMultiSelectMode(true);
    });
  }

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
        window.Toast.warning('还没选印章图片。');
        return;
      }

      const settings = window.Settings.getSettings();
      await addSealToSelectedPages(sealImageElement, settings);
      onToolbarStatusChange?.();
    });
  }

  if (batchDeleteStampsBtn) {
    batchDeleteStampsBtn.addEventListener('click', async () => {
      await deleteAllStampsFromSelectedPages();
      onToolbarStatusChange?.();
    });
  }

  if (exportSelectedBtn) {
    exportSelectedBtn.addEventListener('click', () => {
      exportSelectedPages(getState().currentPdfFile, 'selected').catch(
        console.error
      );
    });
  }

  if (exportAllBtn) {
    exportAllBtn.addEventListener('click', () => {
      exportSelectedPages(getState().currentPdfFile, 'all').catch(console.error);
    });
  }

  if (exportSplitBtn) {
    exportSplitBtn.addEventListener('click', () => {
      exportSelectedPages(getState().currentPdfFile, 'split').catch(
        console.error
      );
    });
  }

  const updateExportHint = () => {
    if (!exportHint) {
      return;
    }

    const { currentPdfFile, selectedPages, totalPages, currentSourceKind } = getState();

    if (!currentPdfFile) {
      exportHint.textContent = '先打开文件，再选择整份下载或按页面下载。';
      return;
    }

    const sortedPages = Array.from(selectedPages).sort((a, b) => a - b);
    const fileSummary = `${currentPdfFile.name} · 共 ${totalPages || '?'} 页`;
    const imageSourceHint =
      currentSourceKind === 'image' ? '图片来源还可以在上方下载 PNG。' : '';

    if (sortedPages.length === 0) {
      exportHint.textContent = currentSourceKind === 'image'
        ? `${fileSummary}。不选页面时，会直接下载全部页面。${imageSourceHint}`
        : `${fileSummary}。不选页面时，会直接下载全部页面。`;
      return;
    }

    const visiblePages = sortedPages.slice(0, 6).join('、');
    const pageSummary =
      sortedPages.length > 6
        ? `已选 ${sortedPages.length} 页：${visiblePages} 等`
        : `已选页面：${visiblePages}`;

    exportHint.textContent = currentSourceKind === 'image'
      ? `${fileSummary}。${pageSummary}。${imageSourceHint}`
      : `${fileSummary}。${pageSummary}。`;
  };

  subscribe(() => updateExportHint());
  updateExportHint();

  subscribe((state, previousState, updates) => {
    if (
      'selectedPages' in updates ||
      'isMultiSelectMode' in updates ||
      'currentActivePage' in updates ||
      'totalPages' in updates
    ) {
      refreshSelectionUI();
    }
  });

  refreshSelectionUI();
}
