import { getState } from '../core/state.js';
import { generateSafeExportFilename } from '../utils/security.js';
import { dataUrlToUint8Array } from '../utils/data-url.js';
import {
  collectStampOperations,
  downloadExportArtifacts,
} from './evidence-manifest.js';
import { findIncompleteStraddleGroups } from './stamp-template.js';

/**
 * PDF 导出模块
 * 负责将带有印章的文件导出并保存
 */

/**
 * 将 Fabric canvas 上的对象嵌入到 PDF 页面
 * @param {PDFDocument} pdfDoc - pdf-lib PDFDocument 实例
 * @param {PDFPage} pdfPage - 目标 PDF 页面
 * @param {fabric.Canvas} canvas - Fabric canvas 实例
 */
export async function drawCanvasObjectsToPdfPage(pdfDoc, pdfPage, canvas) {
  if (!canvas) return;

  const { width: pageWidth, height: pageHeight } = pdfPage.getSize();
  const objects = canvas.getObjects().filter((obj) => !obj.isBackgroundImage);

  for (const obj of objects) {
    const multiplier = 2;
    const imgDataUrl = obj.toDataURL({ format: 'png', multiplier });
    const pngImageBytes = dataUrlToUint8Array(imgDataUrl);
    const pngImage = await pdfDoc.embedPng(pngImageBytes);

    const objWidth = obj.getScaledWidth();
    const objHeight = obj.getScaledHeight();
    let objLeft = obj.left;
    let objTop = obj.top;

    if (obj.originX === 'center') objLeft -= objWidth / 2;
    if (obj.originY === 'center') objTop -= objHeight / 2;

    const pdfX = (objLeft / canvas.originalWidth) * pageWidth;
    const pdfY =
      pageHeight - ((objTop + objHeight) / canvas.originalHeight) * pageHeight;

    pdfPage.drawImage(pngImage, {
      x: pdfX,
      y: pdfY,
      width: (objWidth / canvas.originalWidth) * pageWidth,
      height: (objHeight / canvas.originalHeight) * pageHeight,
      rotate: window.PDFLib.degrees(0),
    });
  }
}

async function buildStampedPdfBytes({
  onProgress = () => {},
} = {}) {
  const originalPdfBytes = getState().originalPdfBytes;

  if (!originalPdfBytes) {
    throw new Error('请先上传文件！');
  }

  const { PDFDocument } = window.PDFLib;
  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  const pages = pdfDoc.getPages();
  const fabricCanvases = getState().fabricCanvases;

  for (let i = 0; i < pages.length; i++) {
    onProgress(i + 1, pages.length);
    await drawCanvasObjectsToPdfPage(pdfDoc, pages[i], fabricCanvases[i]);
  }

  return pdfDoc.save();
}

/**
 * 导出带有印章的 PDF 文件
 * @param {File|null} pdfFile - 原始文件
 * @returns {Promise<void>}
 */
export async function exportPDF(pdfFile) {
  const sourcePdfFile = pdfFile || getState().currentPdfFile;

  if (!getState().originalPdfBytes) {
    window.Toast.warning('还没打开文件，先选一个。');
    return;
  }

  window.Loading.showExportLoading('正在导出 PDF...');

  try {
    const operations = collectStampOperations(getState().fabricCanvases);
    const incomplete = findIncompleteStraddleGroups(operations, getState().totalPages);
    if (incomplete.length > 0) {
      throw new Error(`骑缝章未覆盖全部页面：缺第 ${incomplete[0].missingPages.join('、')} 页`);
    }
    const pdfBytes = await buildStampedPdfBytes({
      onProgress: (current, total) => {
        const progress = (current / total) * 80;
        window.Loading.updateProgress(
          progress,
          `处理第 ${current}/${total} 页`
        );
      },
    });

    window.Loading.updateProgress(90, '正在保存文件...');
    const safeFilename = generateSafeExportFilename(sourcePdfFile, '_盖章版');

    window.Loading.updateProgress(100, '完成！');
    await downloadExportArtifacts({
      sourceFile: sourcePdfFile,
      sourceBytes: getState().originalSourceBytes || getState().originalPdfBytes,
      outputBytes: pdfBytes,
      outputFilename: safeFilename,
      mode: 'visual-stamp',
      pageCount: getState().totalPages,
      operations,
    });

    window.Loading.hide();
    window.Toast.success(`已开始下载 PDF 和证据记录：${safeFilename}`);
  } catch (error) {
    console.error('导出 PDF 时发生错误:', error);
    window.Loading.hide();
    window.Toast.error(error?.message || '导出失败，详情请查看控制台。', 0);
  }
}

export async function exportCurrentPageAsImage(sourceFile) {
  const { currentSourceKind } = getState();

  if (currentSourceKind !== 'image') {
    window.Toast.warning('这个文件不是图片来源，用不了这个功能。');
    return;
  }

  if (!getState().originalPdfBytes) {
    window.Toast.warning('还没打开文件，先选一个。');
    return;
  }

  window.Loading.showExportLoading('正在导出 PNG...');

  try {
    window.Loading.updateProgress(20, '正在生成盖章结果...');
    const pdfBytes = await buildStampedPdfBytes({
      onProgress: (current, total) => {
        const progress = 20 + (current / total) * 45;
        window.Loading.updateProgress(progress, `整理第 ${current}/${total} 页`);
      },
    });

    window.Loading.updateProgress(72, '正在渲染图片...');
    const pdfDoc = await pdfjsLib.getDocument({
      data: pdfBytes,
    }).promise;

    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = viewport.width;
    tempCanvas.height = viewport.height;

    await page.render({
      canvasContext: tempCanvas.getContext('2d'),
      viewport,
    }).promise;

    const blob = await new Promise((resolve) => {
      tempCanvas.toBlob(resolve, 'image/png');
    });

    if (!blob) {
      throw new Error('PNG 导出失败');
    }

    const safeFilename = generateSafeExportFilename(
      sourceFile || getState().currentPdfFile,
      '_盖章版',
      'png'
    );
    window.Loading.updateProgress(100, '完成！');
    const pngBytes = new Uint8Array(await blob.arrayBuffer());
    await downloadExportArtifacts({
      sourceFile: sourceFile || getState().currentPdfFile,
      sourceBytes: getState().originalSourceBytes || getState().originalPdfBytes,
      outputBytes: pngBytes,
      outputFilename: safeFilename,
      outputMime: 'image/png',
      mode: 'image-visual-stamp',
      pageCount: 1,
      operations: collectStampOperations(getState().fabricCanvases),
    });

    try {
      await pdfDoc.destroy?.();
    } catch (destroyError) {
      console.warn('清理导出图片的 PDF 资源时出错:', destroyError);
    }

    window.Loading.hide();
    window.Toast.success(`已开始下载图片和证据记录：${safeFilename}`);
  } catch (error) {
    console.error('导出 PNG 时发生错误:', error);
    window.Loading.hide();
    window.Toast.error('导出 PNG 失败，详情请查看控制台。', 0);
  }
}
