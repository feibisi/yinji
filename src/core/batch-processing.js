/**
 * Batch Processing System for PDF Stamper
 * Handles multiple PDF files processing
 */

const { getState } = window.AppState;

// ==================== State ====================

let batchFiles = [];
let batchProcessing = false;

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
      if (!batchFiles.some(f => f.name === file.name && f.size === file.size)) {
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
    window.Toast?.success(`已添加 ${validFiles.length} 个文件到批量队列`);
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
  window.Toast?.info('文件已移除');
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
  renderBatchFileList();
  window.Toast?.success('批量队列已清空');
}

// ==================== Processing ====================

/**
 * Process all files in batch
 */
async function processBatchFiles() {
  if (batchFiles.length === 0) {
    window.Toast?.warning('批量队列为空');
    return;
  }

  const { sealImageElement } = getState();

  if (!sealImageElement || !sealImageElement.src) {
    window.Toast?.warning('请先选择印章图片');
    return;
  }

  if (batchProcessing) {
    window.Toast?.warning('批量处理正在进行中');
    return;
  }

  batchProcessing = true;
  const totalFiles = batchFiles.length;
  let completed = 0;
  let failed = 0;

  window.Loading.showExportLoading('批量处理中...');

  for (let i = 0; i < batchFiles.length; i++) {
    const fileItem = batchFiles[i];

    if (fileItem.status === 'completed') {
      completed++;
      continue;
    }

    fileItem.status = 'processing';
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
  window.Loading.hide();

  // Show summary
  if (failed === 0) {
    window.Toast?.success(`批量处理完成！成功处理 ${completed} 个文件`);
  } else {
    window.Toast?.warning(`批量处理完成！成功 ${completed} 个，失败 ${failed} 个`);
  }
}

/**
 * Process a single file in batch
 * @param {Object} fileItem - File item object
 */
async function processSingleBatchFile(fileItem) {
  return new Promise(async (resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const pdfBytes = new Uint8Array(e.target.result);
        const { PDFDocument, degrees } = window.PDFLib;

        // Load PDF
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPages();

        // Get seal configuration
        const { sealImageElement: sealImage, sealRotation } = getState();
        const rotation = sealRotation || 0;

        // Apply seal to all pages (center position)
        for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
          const page = pages[pageIndex];
          const { width: pageWidth, height: pageHeight } = page.getSize();

          // Get rotated seal image
          const rotatedSealUrl = window.getRotatedCroppedImage(sealImage, rotation);
          const pngImageBytes = await fetch(rotatedSealUrl).then(res => res.arrayBuffer());
          const pngImage = await pdfDoc.embedPng(pngImageBytes);

          // Calculate seal size (1/5 of page width)
          const sealWidth = pageWidth / 5;
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
          });
        }

        // Save PDF
        const processedPdfBytes = await pdfDoc.save();
        const blob = new Blob([processedPdfBytes], { type: 'application/pdf' });

        // Download file
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileItem.file.name.replace('.pdf', '_盖章版.pdf');
        link.click();
        URL.revokeObjectURL(link.href);

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

  if (batchFiles.length === 0) {
    const emptyState = document.createElement('p');
    emptyState.className = 'batch-empty';
    emptyState.textContent = '暂无文件，请添加 PDF 文件';
    container.replaceChildren(emptyState);

    const emptyCounter = document.getElementById('batch-file-count');
    if (emptyCounter) {
      emptyCounter.textContent = '0 个文件';
    }
    return;
  }

  const fileItems = document.createElement('div');
  fileItems.className = 'batch-file-items';

  batchFiles.forEach((fileItem) => {
    const statusClass = `batch-file-status-${fileItem.status}`;
    const statusText = {
      pending: '等待中',
      processing: '处理中...',
      completed: '已完成',
      error: '失败',
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
      removeButton.className = 'batch-file-remove';
      removeButton.dataset.fileId = fileItem.id;
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
