/**
 * Batch Processing System for PDF Stamper
 * Handles multiple PDF files processing
 */

import { getState } from './state.js';
import { dataUrlToUint8Array } from '../utils/data-url.js';
import { generateSafeExportFilename } from '../utils/security.js';
import { buildScannedPdfFromBytes } from '../modules/scan-export.js';
import { downloadExportArtifacts } from '../modules/evidence-manifest.js';
import {
  calculateStampPlacement,
  resolveTemplatePages,
  sanitizeStampTemplate,
} from '../modules/stamp-template.js';

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
async function processBatchFiles(options = {}) {
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

  const scanOptions = options.scan && typeof options.scan === 'object' ? options.scan : null;
  const abortController = new AbortController();
  batchFiles.forEach((item) => {
    item.status = 'pending';
    item.progress = 0;
    item.error = null;
  });
  batchProcessing = true;
  const totalFiles = batchFiles.length;
  batchProgress = {
    currentIndex: 0,
    total: totalFiles,
    currentFileName: '',
  };
  let completed = 0;
  let failed = 0;

  window.Loading.showExportLoading(scanOptions ? '批量生成扫描件...' : '批量处理中...', {
    cancelable: true,
    onCancel: () => abortController.abort(),
  });
  window.Toast?.info(`开始${scanOptions ? '批量生成盖章扫描件' : '批量处理'}，共 ${totalFiles} 个文件。`);

  for (let i = 0; i < batchFiles.length; i++) {
    const fileItem = batchFiles[i];

    if (abortController.signal.aborted) break;

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
      await processSingleBatchFile(fileItem, {
        scan: scanOptions,
        signal: abortController.signal,
        onPageProgress: (current, total) => {
          const fileBase = i / totalFiles;
          const fileShare = total > 0 ? current / total / totalFiles : 0;
          window.Loading.updateProgress(
            (fileBase + fileShare) * 100,
            `${fileItem.file.name} · 扫描第 ${current}/${total} 页`
          );
        },
      });

      fileItem.status = 'completed';
      fileItem.progress = 100;
      completed++;
    } catch (error) {
      if (error?.name === 'AbortError') {
        fileItem.status = 'pending';
        break;
      }
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
  if (abortController.signal.aborted) {
    window.Toast?.info(`已取消批量处理；完成 ${completed} 个，剩余文件仍在队列中。`);
  } else if (failed === 0) {
    window.Toast?.success(`批量处理完成。已处理 ${completed} 个文件。`);
  } else {
    window.Toast?.warning(`批量处理完成。成功 ${completed} 个，失败 ${failed} 个。`);
  }
}

/**
 * Process a single file in batch
 * @param {Object} fileItem - File item object
 */
async function processSingleBatchFile(fileItem, options = {}) {
  const { scan = null, signal, onPageProgress } = options;
  if (signal?.aborted) {
    throw new DOMException('批量处理已取消', 'AbortError');
  }

  const pdfBytes = new Uint8Array(await fileItem.file.arrayBuffer());
  const { PDFDocument, degrees } = window.PDFLib;
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const state = getState();
  const {
    sealImageElement: sealImage,
    sealRotation = 0,
    sealBrightness = 100,
  } = state;
  const settings = window.Settings.getSettings();
  const template = sanitizeStampTemplate(options.template || readTemplateControls());
  const { getRotatedCroppedImage } = await import('../modules/stamp-manager.js');
  const effectiveRotation = template.rotation ?? sealRotation;
  const effectiveBrightness = template.brightness ?? sealBrightness;
  const rotatedSealUrl = getRotatedCroppedImage(
    sealImage,
    effectiveRotation,
    effectiveBrightness
  );
  const pngImageBytes = dataUrlToUint8Array(rotatedSealUrl);
  const pngImage = await pdfDoc.embedPng(pngImageBytes);

  const targetPages = new Set(resolveTemplatePages(template.pages, pages.length));
  if (targetPages.size === 0) {
    throw new Error('批量模板没有匹配到任何页面');
  }
  const operationRecords = [];
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    if (!targetPages.has(pageIndex + 1)) continue;
    if (signal?.aborted) {
      throw new DOMException('批量处理已取消', 'AbortError');
    }
    const page = pages[pageIndex];
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const sealWidth = pageWidth * (template.size ?? settings.sealSize);
    const sealHeight = sealWidth * (pngImage.height / pngImage.width);
    const placement = calculateStampPlacement({
      pageWidth,
      pageHeight,
      stampWidth: sealWidth,
      stampHeight: sealHeight,
      template,
    });
    page.drawImage(pngImage, {
      x: placement.x,
      y: placement.y,
      width: sealWidth,
      height: sealHeight,
      rotate: degrees(0),
      opacity: template.opacity ?? settings.sealOpacity,
    });
    operationRecords.push({
      page: pageIndex + 1,
      kind: 'batch-stamp',
      anchor: template.anchor,
      x: Number(placement.x.toFixed(2)),
      y: Number(placement.y.toFixed(2)),
      width: Number(sealWidth.toFixed(2)),
      height: Number(sealHeight.toFixed(2)),
      opacity: template.opacity ?? settings.sealOpacity,
      brightness: effectiveBrightness,
      rotation: effectiveRotation,
      removeBackground: template.removeBackground ?? state.autoRemoveSealBackground ?? true,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  let processedPdfBytes = await pdfDoc.save();
  if (scan) {
    processedPdfBytes = await buildScannedPdfFromBytes({
      pdfBytes: processedPdfBytes,
      config: scan.config,
      watermark: scan.watermark,
      metadata: scan.metadata,
      signal,
      onProgress: onPageProgress,
    });
  }

  const outputFilename = generateSafeExportFilename(
    fileItem.file,
    scan ? '_盖章扫描件' : '_盖章版'
  );
  await downloadExportArtifacts({
    sourceFile: fileItem.file,
    sourceBytes: pdfBytes,
    outputBytes: processedPdfBytes,
    outputFilename,
    mode: scan ? 'batch-scan-simulation' : 'batch-visual-stamp',
    pageCount: pages.length,
    operations: operationRecords,
    settings: { template, scan: scan || null },
  });
}

function readTemplateControls() {
  const percentageOrNull = (id) => {
    const value = document.getElementById(id)?.value?.trim();
    return value ? Number(value) / 100 : null;
  };
  return sanitizeStampTemplate({
    pages: document.getElementById('batch-template-pages')?.value || 'all',
    anchor: document.getElementById('batch-template-anchor')?.value || 'center',
    offsetX: document.getElementById('batch-template-offset-x')?.value || 0,
    offsetY: document.getElementById('batch-template-offset-y')?.value || 0,
    size: percentageOrNull('batch-template-size'),
    opacity: percentageOrNull('batch-template-opacity'),
    ...(globalThis.__yinjiAgentTemplateOverrides || {}),
  });
}

function processBatchScannedFiles(scan) {
  return processBatchFiles({ scan });
}

// ==================== UI Functions ====================

/**
 * Render batch file list
 */
function renderBatchFileList() {
  const container = document.getElementById('batch-file-list');
  if (!container) return;
  const processBatchBtn = document.getElementById('processBatch');
  const processBatchScanBtn = document.getElementById('processBatchScan');
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

  if (processBatchScanBtn) {
    processBatchScanBtn.disabled = batchFiles.length === 0 || batchProcessing;
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
  processBatchScannedFiles,
  renderBatchFileList,
};

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderBatchFileList);
} else {
  renderBatchFileList();
}
