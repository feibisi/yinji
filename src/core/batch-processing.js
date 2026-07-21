/**
 * Batch Processing System for PDF Stamper
 * Handles multiple PDF files processing
 */

import { getState } from './state.js';
import { dataUrlToUint8Array } from '../utils/data-url.js';
import { generateSafeExportFilename } from '../utils/security.js';

// ==================== State ====================

let batchFiles = [];
let batchProcessing = false;
let batchProgress = {
  currentIndex: 0,
  total: 0,
  currentFileName: '',
};

// ==================== File Management ====================

/**
 * Add files to batch queue
 * @param {FileList} files - Files to add
 */
function addFilesToBatch(files) {
  const validFiles = [];
  const errors = [];

  Array.from(files).forEach(file => {
    const validation = window.Validators.validatePdfFile(file);
    if (validation.valid) {
      // Check if file already exists
      if (!batchFiles.some((item) => item.file.name === file.name && item.file.size === file.size)) {
        batchFiles.push({
          id: Date.now() + Math.random(),
          file: file,
          status: 'pending', // pending, processing, completed, error
          progress: 0,
          error: null,
        });
        validFiles.push(file.name);
      }
    } else {
      errors.push(`${file.name}: ${validation.error}`);
    }
  });

  if (validFiles.length > 0) {
    window.Toast?.success(
      `已加入批量队列：${validFiles.length} 个文件。切到“批量处理”后就能开始。`
    );
    renderBatchFileList();
  }

  if (errors.length > 0) {
    window.Toast?.error(`${errors.length} 个文件验证失败`);
  }
}

/**
 * Remove file from batch queue
 * @param {string} fileId - File ID
 */
function removeFileFromBatch(fileId) {
  batchFiles = batchFiles.filter(f => f.id !== fileId);
  renderBatchFileList();
  window.Toast?.info('已从批量队列移除 1 个文件。');
}

/**
 * Clear all files from batch queue
 */
async function clearBatchQueue() {
  if (batchFiles.length === 0) return;

  const confirmed = await window.Settings.confirmAction({
    title: '清空批量队列',
    message: `确定要清空批量队列吗？（${batchFiles.length} 个文件）`,
    confirmText: '清空',
    cancelText: '取消',
    danger: true,
  });

  if (!confirmed) {
    return;
  }

  batchFiles = [];
  batchProgress = {
    currentIndex: 0,
    total: 0,
    currentFileName: '',
  };
  renderBatchFileList();
  window.Toast?.success('批量队列已清空。');
}

// ==================== Processing ====================

/**
 * Process all files in batch
 */
async function processBatchFiles() {
  if (batchFiles.length === 0) {
    window.Toast?.warning('批量队列还是空的，先添加 PDF。');
    return;
  }

  const { sealImageElement } = getState();

  if (!sealImageElement || !sealImageElement.src) {
    window.Toast?.warning('先去「编辑」选好印章图片，再开始批量处理。');
    return;
  }

  if (batchProcessing) {
    window.Toast?.warning('批量处理还在跑，等跑完再操作。');
    return;
  }

  batchProcessing = true;
  const totalFiles = batchFiles.length;
  batchProgress = {
    currentIndex: 0,
    total: totalFiles,
    currentFileName: '',
  };
  let completed = 0;
  let failed = 0;

  window.Loading.showExportLoading('批量处理中...');
  window.Toast?.info(`开始批量处理，共 ${totalFiles} 个文件。`);

  for (let i = 0; i < batchFiles.length; i++) {
    const fileItem = batchFiles[i];

    if (fileItem.status === 'completed') {
      completed++;
      continue;
    }

    fileItem.status = 'processing';
    batchProgress = {
      currentIndex: i + 1,
      total: totalFiles,
      currentFileName: fileItem.file.name,
    };
    renderBatchFileList();

    try {
      // Update progress
      const progress = ((i + 1) / totalFiles) * 100;
      window.Loading.updateProgress(progress, `处理文件 ${i + 1}/${totalFiles}`);

      // Process file
      await processSingleBatchFile(fileItem);

      fileItem.status = 'completed';
      fileItem.progress = 100;
      completed++;
    } catch (error) {
      console.error('处理文件失败:', error);
      fileItem.status = 'error';
      fileItem.error = error.message || '处理失败';
      failed++;
    }

    renderBatchFileList();
  }

  batchProcessing = false;
  batchProgress = {
    currentIndex: 0,
    total: totalFiles,
    currentFileName: '',
  };
  window.Loading.hide();
  renderBatchFileList();

  // Show summary
  if (failed === 0) {
    window.Toast?.success(`批量处理完成。已处理 ${completed} 个文件。`);
  } else {
    window.Toast?.warning(`批量处理完成。成功 ${completed} 个，失败 ${failed} 个。`);
  }
}

/**
 * Process a single file in batch
 * @param {Object} fileItem - File item object
 */
async function processSingleBatchFile(fileItem) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const pdfBytes = new Uint8Array(e.target.result);
        const { PDFDocument, degrees } = window.PDFLib;

        // Load PDF
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPages();

        // Get seal configuration
        const {
          sealImageElement: sealImage,
          sealRotation = 0,
          sealBrightness = 100,
        } = getState();
        const settings = window.Settings.getSettings();
        const { getRotatedCroppedImage } = await import('../modules/stamp-manager.js');

        const rotatedSealUrl = getRotatedCroppedImage(
          sealImage,
          sealRotation,
          sealBrightness
        );
        const pngImageBytes = dataUrlToUint8Array(rotatedSealUrl);
        const pngImage = await pdfDoc.embedPng(pngImageBytes);

        // Apply seal to all pages (center position)
        for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
          const page = pages[pageIndex];
          const { width: pageWidth, height: pageHeight } = page.getSize();

          // Calculate seal size
          const sealWidth = pageWidth * settings.sealSize;
          const sealHeight = sealWidth * (pngImage.height / pngImage.width);

          // Center position
          const x = (pageWidth - sealWidth) / 2;
          const y = (pageHeight - sealHeight) / 2;

          // Draw seal
          page.drawImage(pngImage, {
            x: x,
            y: y,
            width: sealWidth,
            height: sealHeight,
            rotate: degrees(0),
            opacity: settings.sealOpacity,
          });
        }

        // Save PDF
        const processedPdfBytes = await pdfDoc.save();
        const blob = new Blob([processedPdfBytes], { type: 'application/pdf' });

        // Download file
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        // 统一走 sanitize，并按扩展名（大小写不敏感、仅结尾）正确改名，
        // 避免 "2024.pdf.report.pdf" 错位替换或大写 .PDF 不加后缀导致同名覆盖。
        link.download = generateSafeExportFilename(fileItem.file, '_盖章版');
        link.click();
        // 延迟撤销：部分浏览器在下载真正开始前撤销会导致下载失败/空文件
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);

        resolve();
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(fileItem.file);
  });
}

// ==================== UI Functions ====================

/**
 * Render batch file list
 */
function renderBatchFileList() {
  const container = document.getElementById('batch-file-list');
  if (!container) return;
  const processBatchBtn = document.getElementById('processBatch');
  const clearBatchBtn = document.getElementById('clearBatch');

  const emitQueueUpdate = () => {
    document.dispatchEvent(
      new CustomEvent('pdf-stamper:batch-queue-updated', {
        detail: {
          count: batchFiles.length,
          processing: batchProcessing,
          currentIndex: batchProgress.currentIndex,
          total: batchProgress.total,
          currentFileName: batchProgress.currentFileName,
        },
      })
    );
  };

  if (processBatchBtn) {
    processBatchBtn.disabled = batchFiles.length === 0 || batchProcessing;
  }

  if (clearBatchBtn) {
    clearBatchBtn.disabled = batchFiles.length === 0 || batchProcessing;
  }

  if (batchFiles.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'batch-empty';
    emptyState.innerHTML = `
      <strong>批量队列为空</strong>
      <span>添加多个 PDF 后，会按当前印章设置一个接一个处理。</span>
    `;
    container.replaceChildren(emptyState);

    const emptyCounter = document.getElementById('batch-file-count');
    if (emptyCounter) {
      emptyCounter.textContent = '0 个文件';
    }
    emitQueueUpdate();
    return;
  }

  const fileItems = document.createElement('div');
  fileItems.className = 'batch-file-items';

  batchFiles.forEach((fileItem) => {
    const statusClass = `batch-file-status-${fileItem.status}`;
    const statusText = {
      pending: '等待处理',
      processing: '正在处理',
      completed: '已处理',
      error: '处理失败',
    }[fileItem.status];

    const item = document.createElement('div');
    item.className = `batch-file-item ${statusClass}`;

    const info = document.createElement('div');
    info.className = 'batch-file-info';

    const name = document.createElement('div');
    name.className = 'batch-file-name';
    name.textContent = fileItem.file.name;

    const size = document.createElement('div');
    size.className = 'batch-file-size';
    size.textContent = `${(fileItem.file.size / 1024 / 1024).toFixed(2)} MB`;

    const status = document.createElement('div');
    status.className = 'batch-file-status';
    status.textContent = statusText;

    info.appendChild(name);
    info.appendChild(size);
    item.appendChild(info);
    item.appendChild(status);

    if (fileItem.status === 'pending') {
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'batch-file-remove';
      removeButton.dataset.fileId = fileItem.id;
      removeButton.title = '移除此文件';
      removeButton.setAttribute('aria-label', `移除 ${fileItem.file.name}`);
      removeButton.textContent = '×';
      removeButton.addEventListener('click', () => {
        removeFileFromBatch(fileItem.id);
      });
      item.appendChild(removeButton);
    }

    fileItems.appendChild(item);
  });

  container.replaceChildren(fileItems);

  // Update counter
  const counter = document.getElementById('batch-file-count');
  if (counter) {
    counter.textContent = `${batchFiles.length} 个文件`;
  }

  emitQueueUpdate();
}

// ==================== Exports ====================

window.BatchProcessing = {
  addFilesToBatch,
  removeFileFromBatch,
  clearBatchQueue,
  processBatchFiles,
  renderBatchFileList,
};

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderBatchFileList);
} else {
  renderBatchFileList();
}
