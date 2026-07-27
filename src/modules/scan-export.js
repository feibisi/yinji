/**
 * 扫描件导出模块
 * 管线: 页面栅格化(背景+印章) → 扫描效果 → 水印 → pdf-lib 重组为图像 PDF + 写元数据 → 下载
 */

import { getState } from '../core/state.js';
import { generateSafeExportFilename } from '../utils/security.js';
import { dataUrlToUint8Array } from '../utils/data-url.js';
import {
  applyScanEffect,
  createNoiseImage,
  sanitizeScanConfig,
  DEFAULT_SCAN_CONFIG,
} from './scan-effect.js';
import {
  applyWatermark,
  sanitizeWatermark,
  DEFAULT_WATERMARK,
} from './scan-watermark.js';

export const DEFAULT_SCAN_METADATA = {
  enabled: false,
  title: '',
  author: '',
  subject: '',
  keywords: '',
  scannerStyle: false,
};

// 扫描仪风格: 让 PDF 元数据看起来像扫描设备产出, 增强真实感
const SCANNER_CREATOR = 'Canon DR-C225 TWAIN';
const SCANNER_PRODUCER = 'Canon ScanFront Image Processor';

/**
 * 校验并规范化元数据配置
 * @param {object} raw
 * @returns {object}
 */
export function sanitizeScanMetadata(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const metadata = { ...DEFAULT_SCAN_METADATA };

  ['title', 'author', 'subject', 'keywords'].forEach((key) => {
    if (source[key] !== undefined && source[key] !== null) {
      metadata[key] = String(source[key]).trim().slice(0, 200);
    }
  });

  if (source.enabled !== undefined) {
    metadata.enabled = Boolean(source.enabled);
  }

  if (source.scannerStyle !== undefined) {
    metadata.scannerStyle = Boolean(source.scannerStyle);
  }

  return metadata;
}

/**
 * 渲染单页扫描效果, 返回 dataURL。预览与导出共用同一路径以保证所见即所得。
 * @param {number} pageIndex 0 起
 * @param {object} config
 * @param {object} watermark
 * @param {HTMLImageElement|null} noiseImage
 * @returns {Promise<string|null>}
 */
export async function renderScannedPageDataUrl(pageIndex, config, watermark, noiseImage) {
  const fabricCanvas = getState().fabricCanvases[pageIndex];
  if (!fabricCanvas) {
    return null;
  }

  // 栅格化整页(含 PDF 背景 + 全部印章), multiplier 决定分辨率
  const pageDataUrl = fabricCanvas.toDataURL({
    format: 'png',
    multiplier: config.scale,
  });

  const source = new Image();
  await new Promise((resolve, reject) => {
    source.onload = resolve;
    source.onerror = () => reject(new Error('页面栅格化失败'));
    source.src = pageDataUrl;
  });

  const target = document.createElement('canvas');
  applyScanEffect(target, source, config, noiseImage);
  applyWatermark(target, watermark);

  const quality = config.output_format === 'image/jpeg' ? 0.92 : undefined;
  return target.toDataURL(config.output_format, quality);
}

/**
 * 组装扫描件 PDF 字节
 * @param {{config:object, watermark:object, metadata:object, onProgress?:Function}} options
 * @returns {Promise<Uint8Array>}
 */
export async function buildScannedPdfBytes({
  config,
  watermark,
  metadata,
  onProgress = () => {},
}) {
  const originalPdfBytes = getState().originalPdfBytes;
  if (!originalPdfBytes) {
    throw new Error('还没打开文件');
  }

  const safeConfig = sanitizeScanConfig(config);
  const safeWatermark = sanitizeWatermark(watermark);
  const safeMetadata = sanitizeScanMetadata(metadata);

  const { PDFDocument } = window.PDFLib;
  // 读原始文档只为取每页尺寸, 输出是全新的图像 PDF
  const sourceDoc = await PDFDocument.load(originalPdfBytes);
  const sourcePages = sourceDoc.getPages();
  const total = sourcePages.length;

  const noiseImage = await createNoiseImage(safeConfig.noise);
  const outputDoc = await PDFDocument.create();

  for (let i = 0; i < total; i++) {
    onProgress(i + 1, total);

    const { width, height } = sourcePages[i].getSize();
    const scannedDataUrl = await renderScannedPageDataUrl(
      i,
      safeConfig,
      safeWatermark,
      noiseImage
    );

    const page = outputDoc.addPage([width, height]);

    if (!scannedDataUrl) {
      // 该页没有 canvas(未初始化) 时保留空白页, 保证页数一致
      continue;
    }

    const imageBytes = dataUrlToUint8Array(scannedDataUrl);
    const embedded =
      safeConfig.output_format === 'image/jpeg'
        ? await outputDoc.embedJpg(imageBytes)
        : await outputDoc.embedPng(imageBytes);

    page.drawImage(embedded, { x: 0, y: 0, width, height });

    // 让出主线程, 避免长文档卡死 UI
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  if (safeMetadata.enabled) {
    if (safeMetadata.title) outputDoc.setTitle(safeMetadata.title);
    if (safeMetadata.author) outputDoc.setAuthor(safeMetadata.author);
    if (safeMetadata.subject) outputDoc.setSubject(safeMetadata.subject);
    if (safeMetadata.keywords) {
      outputDoc.setKeywords(safeMetadata.keywords.split(/[,，\s]+/).filter(Boolean));
    }
    if (safeMetadata.scannerStyle) {
      outputDoc.setCreator(SCANNER_CREATOR);
      outputDoc.setProducer(SCANNER_PRODUCER);
    }
    const now = new Date();
    outputDoc.setCreationDate(now);
    outputDoc.setModificationDate(now);
  }

  return outputDoc.save();
}

/**
 * 导出扫描件 PDF(含 Loading/Toast/下载)
 * @param {{config:object, watermark:object, metadata:object, sourceFile?:File|null}} options
 * @returns {Promise<void>}
 */
export async function exportScannedPdf({
  config = DEFAULT_SCAN_CONFIG,
  watermark = DEFAULT_WATERMARK,
  metadata = DEFAULT_SCAN_METADATA,
  sourceFile = null,
} = {}) {
  if (!getState().originalPdfBytes) {
    window.Toast.warning('还没打开文件，先选一个。');
    return;
  }

  window.Loading.showExportLoading('正在生成扫描件...');

  try {
    const pdfBytes = await buildScannedPdfBytes({
      config,
      watermark,
      metadata,
      onProgress: (current, total) => {
        window.Loading.updateProgress(
          (current / total) * 90,
          `处理第 ${current}/${total} 页`
        );
      },
    });

    window.Loading.updateProgress(95, '正在保存文件...');

    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const safeFilename = generateSafeExportFilename(
      sourceFile || getState().currentPdfFile,
      '_扫描件'
    );
    link.download = safeFilename;

    window.Loading.updateProgress(100, '完成！');
    link.click();
    // 延迟撤销: 部分浏览器在下载真正开始前撤销会导致下载失败
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);

    window.Loading.hide();
    window.Toast.success(`已开始下载：${safeFilename}`);
  } catch (error) {
    console.error('导出扫描件失败:', error);
    window.Loading.hide();
    window.Toast.error('导出扫描件失败，详情请查看控制台。', 0);
  }
}
