import { getState, setState } from '../core/state.js';
import { getCurrentPageCanvas } from './canvas-manager.js';
import { loadFabricImage } from '../utils/fabric-helpers.js';
import { drawCanvasObjectsToPdfPage } from './exporter.js';
import {
  collectStampOperations,
  downloadExportArtifacts,
} from './evidence-manifest.js';
import { findIncompleteStraddleGroups } from './stamp-template.js';

/**
 * 批量操作模块
 * 负责多页选择、批量添加/删除印章等功能
 */



/**
 * 切换页面选中状态（Ctrl+Click 单个选择）
 * @param {number} pageNum - 页面编号
 */
export function togglePageSelection(pageNum) {
  const selectedPages = new Set(getState().selectedPages);

  if (selectedPages.has(pageNum)) {
    selectedPages.delete(pageNum);
  } else {
    selectedPages.add(pageNum);
  }

  setState({ selectedPages, selectionAnchorPage: pageNum });
  updateSelectionUI();
}

/**
 * 连续选择页面（Shift+Click 范围选择）
 * @param {number} pageNum - 页面编号
 */
export function selectPageRange(pageNum) {
  const anchorPage =
    getState().selectionAnchorPage || getState().currentActivePage || pageNum;
  const selectedPages = new Set(getState().selectedPages);

  const start = Math.min(anchorPage, pageNum);
  const end = Math.max(anchorPage, pageNum);

  for (let i = start; i <= end; i++) {
    selectedPages.add(i);
  }

  setState({ selectedPages, selectionAnchorPage: pageNum });
  updateSelectionUI();
}

/**
 * 选择所有页面
 */
export function selectAllPages() {
  const totalPages = getState().totalPages;
  const selectedPages = new Set();

  for (let i = 1; i <= totalPages; i++) {
    selectedPages.add(i);
  }

  setState({
    selectedPages,
    isMultiSelectMode: true,
    selectionAnchorPage: getState().currentActivePage || 1,
  });
  updateSelectionUI();
}

/**
 * 清除所有选中页面
 */
export function clearSelection() {
  setState({
    selectedPages: new Set(),
    isMultiSelectMode: false,
    selectionAnchorPage: getState().currentActivePage || 1,
  });
  updateSelectionUI();
}

/**
 * 进入/退出批量选择模式
 * @param {boolean} enable
 */
export function setMultiSelectMode(enable) {
  setState({
    isMultiSelectMode: enable,
    selectionAnchorPage: getState().selectionAnchorPage || getState().currentActivePage || 1,
  });
  updateSelectionUI();
}

/**
 * 处理缩略图点击交互
 * @param {number} pageNum
 * @param {MouseEvent} event
 * @returns {boolean}
 */
export function handleThumbnailInteraction(pageNum, event) {
  const isMultiSelectMode = getState().isMultiSelectMode;

  if (event.shiftKey) {
    if (!isMultiSelectMode) {
      setMultiSelectMode(true);
    }
    event.preventDefault();
    event.stopPropagation();
    selectPageRange(pageNum);
    return true;
  }

  if (event.ctrlKey || event.metaKey) {
    if (!isMultiSelectMode) {
      setMultiSelectMode(true);
    }
    event.preventDefault();
    event.stopPropagation();
    togglePageSelection(pageNum);
    return true;
  }

  if (isMultiSelectMode) {
    event.preventDefault();
    event.stopPropagation();
    togglePageSelection(pageNum);
    return true;
  }

  return false;
}

export function refreshSelectionUI() {
  updateSelectionUI();
}

/**
 * 更新UI显示选中页面状态
 */
function updateSelectionUI() {
  const selectedPages = getState().selectedPages;
  const isMultiSelectMode = getState().isMultiSelectMode;
  const totalPages = getState().totalPages;
  const selectedCount = document.getElementById('selected-count');
  const batchBtn = document.getElementById('batch-mode-btn');

  // 更新页面指示器
  const pageIndicator = document.getElementById('page-indicator');
  if (pageIndicator && totalPages === 0) {
    pageIndicator.textContent = '第 - / - 页';
  } else if (pageIndicator && selectedPages.size > 0) {
    pageIndicator.textContent = `选中 ${selectedPages.size}/${totalPages} 页`;
  } else if (pageIndicator) {
    const currentPage = getState().currentActivePage;
    pageIndicator.textContent = `第 ${currentPage} / ${totalPages} 页`;
  }

  if (batchBtn) {
    batchBtn.classList.toggle('active', isMultiSelectMode);
    batchBtn.textContent = isMultiSelectMode ? '结束多页选择' : '选多页';
    batchBtn.disabled = totalPages === 0;
  }

  if (selectedCount) {
    selectedCount.textContent = String(selectedPages.size);
  }

  // 更新缩略图视觉反馈
  document.querySelectorAll('.thumbnail-item').forEach((item) => {
    const pageNum = parseInt(item.dataset.pageNumber);
    if (selectedPages.has(pageNum)) {
      item.classList.add('selected');
      item.style.border = '2px solid #3b82f6';
      item.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
    } else {
      item.classList.remove('selected');
      item.style.border = '';
      item.style.backgroundColor = '';
    }
  });

  // 更新批量操作按钮状态
  const batchActions = document.getElementById('batch-toolbar');
  if (batchActions) {
    batchActions.style.display =
      isMultiSelectMode || selectedPages.size > 0 ? 'flex' : 'none';
  }

  // 更新选中页面列表显示
  const selectedPagesList = document.getElementById('selected-pages-list');
  if (selectedPagesList) {
    if (selectedPages.size > 0) {
      const pages = Array.from(selectedPages).sort((a, b) => a - b);
      selectedPagesList.textContent = pages.join(', ');
    } else if (isMultiSelectMode) {
      selectedPagesList.textContent = '点击页面选择';
    } else {
      selectedPagesList.textContent = '';
    }
  }

  [
    document.getElementById('batch-add-seal-btn'),
    document.getElementById('batch-delete-stamps-btn'),
    document.getElementById('export-selected-btn'),
  ].forEach((button) => {
    if (button) {
      button.disabled = selectedPages.size === 0;
    }
  });
}

/**
 * 批量添加印章到选中页面
 * @param {HTMLImageElement} sealImageElement - 印章图片元素
 * @param {Object} settings - 印章设置
 */
export async function addSealToSelectedPages(sealImageElement, settings) {
  const selectedPages = getState().selectedPages;
  if (selectedPages.size === 0) {
    window.Toast.warning('先选中要盖章的页面。');
    return false;
  }

  const pdfDoc = getState().pdfDoc;
  if (!pdfDoc) {
    window.Toast.warning('先加载文件。');
    return false;
  }

  if (!sealImageElement || !sealImageElement.src) {
    window.Toast.warning('先选择印章图片。');
    return false;
  }

  window.Loading.showExportLoading('正在批量添加印章...');

  try {
    const { initializeFabricCanvasForPage } = await import('./canvas-manager.js');
    const {
      applyBrightnessToFabricImage,
      getRotatedCroppedImage,
    } = await import('./stamp-manager.js');

    // 处理印章图片（旋转和亮度调整）
    const imageToProcess = new Image();
    imageToProcess.src = sealImageElement.src;

    await new Promise((resolve, reject) => {
      imageToProcess.onload = resolve;
      imageToProcess.onerror = reject;
    });

    const rotatedSealUrl = getRotatedCroppedImage(
      imageToProcess,
      getState().sealRotation,
      100
    );

    const pages = Array.from(selectedPages).sort((a, b) => a - b);
    const entries = [];

    for (let i = 0; i < pages.length; i++) {
      const pageNum = pages[i];
      window.Loading.updateProgress(
        ((i + 1) / pages.length) * 80,
        `处理第 ${i + 1}/${pages.length} 页`
      );

      const canvas = await initializeFabricCanvasForPage(pageNum);
      if (!canvas) continue;

      // 创建印章图片对象
      const img = await loadFabricImage(rotatedSealUrl);
      img.scaleToWidth(canvas.originalWidth * settings.sealSize);

      img.set({
        left: canvas.originalWidth / 2,
        top: canvas.originalHeight / 2,
        originX: 'center',
        originY: 'center',
        cornerSize: 10,
        cornerStyle: 'circle',
        cornerColor: '#007bff',
        transparentCorners: false,
        borderColor: '#3b82f6',
        lockRotation: true,
        angle: 0,
        opacity: settings.sealOpacity,
        yinjiKind: 'stamp',
        yinjiBrightness: getState().sealBrightness,
      });
      applyBrightnessToFabricImage(img, getState().sealBrightness);

      entries.push({ pageNum, sealObject: img });
    }

    if (entries.length === 0) {
      window.Loading.hide();
      window.Toast.error('所选页都没盖上，再试一次。');
      return false;
    }

    const command = new window.History.AddSealsCommand(entries);
    window.History.executeCommand(command);

    window.Loading.updateProgress(100, '完成！');
    if (entries.length < pages.length) {
      window.Toast.warning(
        `只在 ${entries.length}/${pages.length} 页盖上了章。第一页是第 ${pages[0]} 页。`
      );
    } else {
      window.Toast.success(`已在 ${entries.length} 页盖章。第一页是第 ${pages[0]} 页。`);
    }

    // 返回第一页被选中的页面
    window.showPage(pages[0]);
    window.Loading.hide();
    return true;
  } catch (error) {
    console.error('批量添加印章失败:', error);
    window.Toast.error('批量添加失败，详情请查看控制台');
    window.Loading.hide();
    return false;
  }
}

/**
 * 批量删除选中页面上的所有印章
 * @returns {Promise<boolean>}
 */
export async function deleteAllStampsFromSelectedPages() {
  const selectedPages = getState().selectedPages;
  if (selectedPages.size === 0) {
    window.Toast.warning('先选中要删章的页面。');
    return false;
  }

  window.Loading.showExportLoading('正在批量删除印章...');

  try {
    const { getFabricCanvases, initializeFabricCanvasForPage } = await import('./canvas-manager.js');
    const pages = Array.from(selectedPages).sort((a, b) => a - b);
    let totalDeleted = 0;
    const entries = [];

    for (let i = 0; i < pages.length; i++) {
      const pageNum = pages[i];
      const canvas = await initializeFabricCanvasForPage(pageNum);
      if (!canvas) continue;

      const objects = canvas.getObjects().filter((obj) => !obj.isBackgroundImage);
      objects.forEach((sealObject) => {
        entries.push({ pageNum, sealObject });
      });
      totalDeleted += objects.length;

      window.Loading.updateProgress(
        ((i + 1) / pages.length) * 100,
        `清理第 ${i + 1}/${pages.length} 页`
      );
    }

    if (entries.length > 0) {
      const command = new window.History.DeleteSealsCommand(entries);
      window.History.executeCommand(command);
    }

    window.Toast.success(`已从 ${pages.length} 页删掉 ${totalDeleted} 个印章。`);
    window.Loading.hide();
    return true;
  } catch (error) {
    console.error('批量删除印章失败:', error);
    window.Toast.error('批量删除失败');
    window.Loading.hide();
    return false;
  }
}

/**
 * 导出选中页面为 PDF
 * @param {File|null} originalFile - 原始文件
 * @param {string} exportMode - 'selected' (仅选中页) | 'all' (全部) | 'split' (分别导出)
 * @returns {Promise<boolean>}
 */
export async function exportSelectedPages(originalFile, exportMode = 'selected') {
  const selectedPages = getState().selectedPages;
  const pdfDoc = getState().pdfDoc;
  const originalPdfBytes = getState().originalPdfBytes;
  const sourceBytes = getState().originalSourceBytes || originalPdfBytes;
  const sourcePdfFile = originalFile || getState().currentPdfFile;

  if (!pdfDoc || !originalPdfBytes) {
    window.Toast.warning('先加载文件。');
    return false;
  }

  // 确定要导出的页面
  let pagesToExport = [];
  if (exportMode === 'selected' && selectedPages.size > 0) {
    pagesToExport = Array.from(selectedPages).sort((a, b) => a - b);
  } else if (exportMode === 'all' || exportMode === 'split') {
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      pagesToExport.push(i);
    }
  } else {
    window.Toast.warning('先选中要下载的页面。');
    return false;
  }

  if (pagesToExport.length === 0) {
    window.Toast.warning('没有可下载的页面。');
    return false;
  }

  window.Loading.showExportLoading('正在准备导出 PDF...');

  try {
    const { PDFDocument } = window.PDFLib;
    const allOperations = collectStampOperations(getState().fabricCanvases);
    if (exportMode === 'all' || exportMode === 'split') {
      const incomplete = findIncompleteStraddleGroups(allOperations, pdfDoc.numPages);
      if (incomplete.length > 0) {
        throw new Error(`骑缝章未覆盖全部页面：缺第 ${incomplete[0].missingPages.join('、')} 页`);
      }
    }

    // Load PDF with PDFLib (pdfDoc from state is PDF.js PDFDocumentProxy)
    const pdfLibDoc = await PDFDocument.load(originalPdfBytes);

    if (exportMode === 'split') {
      // 分别导出每个页面为独立文件
      const fabricCanvases = getState().fabricCanvases;
      const { sanitizeFilename } = await import('../utils/security.js');
      const rawBaseName =
        sourcePdfFile?.name?.replace(/\.(pdf|png|jpe?g)$/i, '') || 'document';
      const baseName = sanitizeFilename(rawBaseName);

      for (let i = 0; i < pagesToExport.length; i++) {
        const pageNum = pagesToExport[i];
        const newPdf = await PDFDocument.create();
        const [copiedPage] = await newPdf.copyPages(pdfLibDoc, [pageNum - 1]);
        newPdf.addPage(copiedPage);

        const canvas = fabricCanvases[pageNum - 1];
        if (canvas) {
          await drawCanvasObjectsToPdfPage(newPdf, newPdf.getPages()[0], canvas);
        }

        const bytes = await newPdf.save();
        const filename = `${baseName}_page${pageNum}.pdf`;
        await downloadExportArtifacts({
          sourceFile: sourcePdfFile,
          sourceBytes,
          outputBytes: bytes,
          outputFilename: filename,
          mode: 'split-page-visual-stamp',
          pageCount: 1,
          operations: allOperations.filter((operation) => operation.page === pageNum),
          settings: { sourcePage: pageNum },
        });

        window.Loading.updateProgress(
          ((i + 1) / pagesToExport.length) * 100,
          `导出第 ${i + 1}/${pagesToExport.length} 页`
        );
      }
      window.Toast.success(`已开始下载 ${pagesToExport.length} 个独立 PDF 文件。`);
    } else {
      // 合并导出为一个 PDF（含 Fabric.js 印章渲染）
      const newPdf = await PDFDocument.create();
      const pageIndices = pagesToExport.map(p => p - 1);
      const copiedPages = await newPdf.copyPages(pdfLibDoc, pageIndices);

      copiedPages.forEach(page => newPdf.addPage(page));

      // 渲染 Fabric.js 印章到对应页面
      const fabricCanvases = getState().fabricCanvases;
      for (let i = 0; i < pagesToExport.length; i++) {
        const pageNum = pagesToExport[i];
        const canvas = fabricCanvases[pageNum - 1];
        if (!canvas) continue;

        const pdfPage = newPdf.getPages()[i];
        await drawCanvasObjectsToPdfPage(newPdf, pdfPage, canvas);

        const progress = ((i + 1) / pagesToExport.length) * 80;
        window.Loading.updateProgress(progress, `处理第 ${i + 1}/${pagesToExport.length} 页`);
      }

      window.Loading.updateProgress(90, '正在保存文件...');
      const bytes = await newPdf.save();
      const { generateSafeExportFilename } = await import('../utils/security.js');
      const suffix = exportMode === 'selected' ? `_选中${pagesToExport.length}页` : '';
      const filename = generateSafeExportFilename(sourcePdfFile, suffix);

      window.Loading.updateProgress(100, '完成！');
      await downloadExportArtifacts({
        sourceFile: sourcePdfFile,
        sourceBytes,
        outputBytes: bytes,
        outputFilename: filename,
        mode: exportMode === 'selected' ? 'selected-pages-visual-stamp' : 'visual-stamp',
        pageCount: pagesToExport.length,
        operations: allOperations.filter((operation) => pagesToExport.includes(operation.page)),
        settings: { sourcePages: pagesToExport },
      });
      window.Toast.success(`已开始下载包含 ${pagesToExport.length} 页的 PDF 文件。`);
    }

    window.Loading.hide();
    return true;
  } catch (error) {
    console.error('导出 PDF 失败:', error);
    window.Toast.error('导出失败，详情请查看控制台');
    window.Loading.hide();
    return false;
  }
}
