import { getState } from '../core/state.js';
import { generateSafeExportFilename } from '../utils/security.js';
import { dataUrlToUint8Array } from '../utils/data-url.js';

/**
 * PDF 导出模块
 * 负责将带有印章的文件导出并保存
 */

async function buildStampedPdfBytes({
  onProgress = () => {},
} = {}) {
  const originalPdfBytes = getState().originalPdfBytes;

  if (!originalPdfBytes) {
    throw new Error('请先上传文件！');
  }

  const { PDFDocument, degrees } = window.PDFLib;
  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  const pages = pdfDoc.getPages();
  const fabricCanvases = getState().fabricCanvases;

  for (let i = 0; i < pages.length; i++) {
    const canvas = fabricCanvases[i];
    onProgress(i + 1, pages.length);

    if (!canvas) {
      continue;
    }

    const page = pages[i];
    const { width: pageWidth, height: pageHeight } = page.getSize();

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

      page.drawImage(pngImage, {
        x: pdfX,
        y: pdfY,
        width: (objWidth / canvas.originalWidth) * pageWidth,
        height: (objHeight / canvas.originalHeight) * pageHeight,
        rotate: degrees(0),
      });
    }
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
    window.Toast.warning('请先上传文件！');
    return;
  }

  window.Loading.showExportLoading('正在导出 PDF...');

  try {
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
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);

    const safeFilename = generateSafeExportFilename(sourcePdfFile, '_盖章版');
    link.download = safeFilename;

    window.Loading.updateProgress(100, '完成！');
    link.click();
    URL.revokeObjectURL(link.href);

    window.Loading.hide();
    window.Toast.success(`已开始下载：${safeFilename}`);
  } catch (error) {
    console.error('导出 PDF 时发生错误:', error);
    window.Loading.hide();
    window.Toast.error('导出失败，详情请查看控制台。', 0);
  }
}

export async function exportCurrentPageAsImage(sourceFile) {
  const { currentSourceKind } = getState();

  if (currentSourceKind !== 'image') {
    window.Toast.warning('当前文件不是图片来源。');
    return;
  }

  if (!getState().originalPdfBytes) {
    window.Toast.warning('请先上传文件！');
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

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const safeFilename = generateSafeExportFilename(
      sourceFile || getState().currentPdfFile,
      '_盖章版',
      'png'
    );
    link.download = safeFilename;

    window.Loading.updateProgress(100, '完成！');
    link.click();
    URL.revokeObjectURL(link.href);

    try {
      await pdfDoc.destroy?.();
    } catch (destroyError) {
      console.warn('清理导出图片的 PDF 资源时出错:', destroyError);
    }

    window.Loading.hide();
    window.Toast.success(`已开始下载：${safeFilename}`);
  } catch (error) {
    console.error('导出 PNG 时发生错误:', error);
    window.Loading.hide();
    window.Toast.error('导出 PNG 失败，详情请查看控制台。', 0);
  }
}
