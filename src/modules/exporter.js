import { getState } from '../core/state.js';
import { generateSafeExportFilename } from '../utils/security.js';

/**
 * PDF 导出模块
 * 负责将带有印章的 PDF 导出并保存
 */

/**
 * 导出带有印章的 PDF 文件
 * @param {File|null} pdfFile - 原始 PDF 文件
 * @returns {Promise<void>}
 */
export async function exportPDF(pdfFile) {
  const originalPdfBytes = getState().originalPdfBytes;

  if (!originalPdfBytes) {
    window.Toast.warning('请先上传 PDF 文件！');
    return;
  }

  window.Loading.showExportLoading('正在导出 PDF...');

  try {
    const { PDFDocument, degrees } = window.PDFLib;

    const pdfDoc = await PDFDocument.load(originalPdfBytes);
    const pages = pdfDoc.getPages();
    const fabricCanvases = getState().fabricCanvases;

    for (let i = 0; i < pages.length; i++) {
      const canvas = fabricCanvases[i];
      if (!canvas) continue;

      const progress = ((i + 1) / pages.length) * 80;
      window.Loading.updateProgress(
        progress,
        `处理第 ${i + 1}/${pages.length} 页`
      );

      const page = pages[i];
      const { width: pageWidth, height: pageHeight } = page.getSize();

      const objects = canvas.getObjects().filter((obj) => !obj.isBackgroundImage);

      for (const obj of objects) {
        const multiplier = 2;

        const imgDataUrl = obj.toDataURL({ format: 'png', multiplier });
        const pngImageBytes = await fetch(imgDataUrl).then((res) =>
          res.arrayBuffer()
        );
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

    window.Loading.updateProgress(90, '正在保存文件...');
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);

    // Use secure filename generation
    const safeFilename = generateSafeExportFilename(pdfFile, '_盖章版');
    link.download = safeFilename;

    window.Loading.updateProgress(100, '完成！');
    link.click();
    URL.revokeObjectURL(link.href);

    window.Loading.hide();
    window.Toast.success('PDF 导出成功！');
  } catch (error) {
    console.error('导出 PDF 时发生错误:', error);
    window.Loading.hide();
    window.Toast.error('导出失败，详情请查看控制台。', 0);
  }
}
