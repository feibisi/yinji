/**
 * 扫描件导出模块
 * 管线: 页面栅格化(背景+印章) → 扫描效果 → 水印 → pdf-lib 重组为图像 PDF + 写元数据 → 下载
 */

import { getState } from '../core/state.js';
import { generateSafeExportFilename } from '../utils/security.js';
import { dataUrlToUint8Array } from '../utils/data-url.js';
import { parseBoolean } from '../utils/parse-boolean.js';
import { initializeFabricCanvasForPage } from './canvas-manager.js';
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

// JPEG 编码质量: 兼顾体积与扫描件可读性
const JPEG_QUALITY = 0.92;

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

  metadata.enabled = parseBoolean(source.enabled, metadata.enabled);
  metadata.scannerStyle = parseBoolean(source.scannerStyle, metadata.scannerStyle);

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
  // 公共入口(预览与导出共用), 调用方可能直传未清洗的对象, 故此处兜底
  const safeConfig = sanitizeScanConfig(config);
  const safeWatermark = sanitizeWatermark(watermark);

  const fabricCanvas = getState().fabricCanvases[pageIndex];
  if (!fabricCanvas) {
    return null;
  }

  // fabric 的 multiplier 与截取范围都基于 canvas 当前显示尺寸与 zoom, 而两者随窗口宽度、
  // 用户缩放而浮动, 未访问过的页更是停留在 HTML 默认的 300x150。这里显式按原始基准尺寸
  // 截取整页并归一化倍率, 使输出恒为 originalWidth x config.scale, 与视图状态解耦。
  const baseWidth = Number(fabricCanvas.originalWidth) || Number(fabricCanvas.width) || 0;
  const baseHeight = Number(fabricCanvas.originalHeight) || Number(fabricCanvas.height) || 0;
  const zoom = Number(fabricCanvas.getZoom && fabricCanvas.getZoom()) || 1;

  const pageDataUrl =
    baseWidth > 0 && baseHeight > 0
      ? fabricCanvas.toDataURL({
          format: 'png',
          multiplier: safeConfig.scale / zoom,
          left: 0,
          top: 0,
          width: baseWidth * zoom,
          height: baseHeight * zoom,
        })
      : fabricCanvas.toDataURL({ format: 'png', multiplier: safeConfig.scale });

  const source = new Image();
  await new Promise((resolve, reject) => {
    source.onload = resolve;
    source.onerror = () => reject(new Error('页面栅格化失败'));
    source.src = pageDataUrl;
  });

  const target = document.createElement('canvas');
  applyScanEffect(target, source, safeConfig, noiseImage);
  applyWatermark(target, safeWatermark);

  const quality = safeConfig.output_format === 'image/jpeg' ? JPEG_QUALITY : undefined;
  return target.toDataURL(safeConfig.output_format, quality);
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
} = {}) {
  const { originalPdfBytes, pdfDoc } = getState();
  if (!originalPdfBytes || !pdfDoc) {
    throw new Error('还没打开文件');
  }

  const safeConfig = sanitizeScanConfig(config);
  const safeWatermark = sanitizeWatermark(watermark);
  const safeMetadata = sanitizeScanMetadata(metadata);

  const { PDFDocument } = window.PDFLib;
  const total = pdfDoc.numPages;

  const noiseImage = await createNoiseImage(safeConfig.noise);
  const outputDoc = await PDFDocument.create();

  // 记录未能渲染的页号, 结束时汇总告知用户, 不做静默降级
  const blankPages = [];

  for (let i = 0; i < total; i++) {
    const pageNum = i + 1;
    onProgress(pageNum, total);

    // 页面尺寸取自 pdf.js viewport: 它已计入 /Rotate, 与 fabric 画布宽高比一致。
    // pdf-lib 的 getSize() 返回未旋转的 MediaBox, 会把横向页压扁成纵向。
    const sourcePage = await pdfDoc.getPage(pageNum);
    const { width, height } = sourcePage.getViewport({ scale: 1 });

    // 画布只在用户翻页时才初始化, 未访问过的页若直接跳过会静默输出纯白页(内容丢失)
    if (!getState().fabricCanvases[i]) {
      try {
        await initializeFabricCanvasForPage(pageNum);
      } catch (error) {
        console.warn(`第 ${pageNum} 页画布初始化失败:`, error);
      }
    }

    const scannedDataUrl = await renderScannedPageDataUrl(
      i,
      safeConfig,
      safeWatermark,
      noiseImage
    );

    const page = outputDoc.addPage([width, height]);

    if (!scannedDataUrl) {
      // 初始化后仍拿不到画布: 保留空白页维持页数一致, 但必须留痕
      console.warn(`第 ${pageNum} 页画布不可用, 已输出为空白页`);
      blankPages.push(pageNum);
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
  } else {
    // pdf-lib 保存时无条件写入自己的 Producer/Creator 署名。用户没要求写元数据时,
    // 输出不应自报生成工具, 故置空 —— 中和署名而非伪装成任何设备。
    outputDoc.setProducer('');
    outputDoc.setCreator('');
  }

  if (blankPages.length > 0) {
    window.Toast?.warning?.(
      `有 ${blankPages.length} 页未能渲染，已输出为空白页：第 ${blankPages.join('、')} 页。`
    );
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

    window.Toast.success(`已开始下载：${safeFilename}`);
  } catch (error) {
    console.error('导出扫描件失败:', error);
    window.Toast.error('导出扫描件失败，详情请查看控制台。', 0);
  } finally {
    window.Loading.hide();
  }
}
