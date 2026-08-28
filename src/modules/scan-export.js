/**
 * 扫描件导出模块
 * 管线: 页面栅格化(背景+印章) → 扫描效果 → 水印 → pdf-lib 重组为图像 PDF + 写元数据 → 下载
 */

import { getState } from '../core/state.js';
import { generateSafeExportFilename } from '../utils/security.js';
import { dataUrlToUint8Array } from '../utils/data-url.js';
import { parseBoolean } from '../utils/parse-boolean.js';
import {
  cleanupCanvas,
  initializeFabricCanvasForPage,
} from './canvas-manager.js';
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
import {
  collectStampOperations,
  downloadExportArtifacts,
} from './evidence-manifest.js';
import { findIncompleteStraddleGroups } from './stamp-template.js';

export const DEFAULT_SCAN_METADATA = {
  enabled: false,
  title: '',
  author: '',
  subject: '',
  keywords: '',
  includeProcessor: true,
};

// 只写入真实的软件来源，不冒用具体扫描设备或第三方品牌。
const APP_CREATOR = 'Yinji';
const APP_PRODUCER = 'Yinji PDF Processor';

// JPEG 编码质量: 兼顾体积与扫描件可读性
const JPEG_QUALITY = 0.92;
const EDITOR_RENDER_SCALE = 2;

/**
 * 取有限正数, 依次尝试首选值与备选值, 都不合法时返回 0。
 * 用于栅格化尺寸计算, 防止 0/NaN/Infinity/负数传入 toDataURL。
 * @param {*} value
 * @param {*} fallback
 * @returns {number}
 */
function toPositiveNumber(value, fallback) {
  const primary = Number(value);
  if (Number.isFinite(primary) && primary > 0) {
    return primary;
  }

  const spare = Number(fallback);
  return Number.isFinite(spare) && spare > 0 ? spare : 0;
}

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
  metadata.includeProcessor = parseBoolean(
    source.includeProcessor,
    metadata.includeProcessor
  );

  return metadata;
}

function createAbortError() {
  const error = new Error('扫描件导出已取消');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function writeMetadata(outputDoc, safeMetadata) {
  if (!safeMetadata.enabled) return;
  if (safeMetadata.title) outputDoc.setTitle(safeMetadata.title);
  if (safeMetadata.author) outputDoc.setAuthor(safeMetadata.author);
  if (safeMetadata.subject) outputDoc.setSubject(safeMetadata.subject);
  if (safeMetadata.keywords) {
    outputDoc.setKeywords(safeMetadata.keywords.split(/[,，\s]+/).filter(Boolean));
  }
  if (safeMetadata.includeProcessor) {
    outputDoc.setCreator(APP_CREATOR);
    outputDoc.setProducer(APP_PRODUCER);
  }
  const now = new Date();
  outputDoc.setCreationDate(now);
  outputDoc.setModificationDate(now);
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
  // 本函数只读画布状态, 不调用 setZoom/setDimensions —— 导出不应改动用户正在浏览的视图。
  //
  // 前提: 应用只做滚动不做画布平移, viewportTransform 的平移项恒为 [0, 0], 故 left/top 取 0
  // 即页面左上角。若将来新增画布平移(拖拽移动视口)功能, 这个前提被打破, 截取区域就会错位。
  const baseWidth = toPositiveNumber(fabricCanvas.originalWidth, fabricCanvas.width);
  const baseHeight = toPositiveNumber(fabricCanvas.originalHeight, fabricCanvas.height);
  const rawZoom = typeof fabricCanvas.getZoom === 'function' ? fabricCanvas.getZoom() : 1;
  // zoom 为 0/NaN/负数时回落到 1, 避免 multiplier 变成 Infinity/NaN 或截取宽高变成 0
  const zoom = toPositiveNumber(rawZoom, 1);

  const transform = fabricCanvas.viewportTransform;
  if (Array.isArray(transform) && (transform[4] || transform[5])) {
    console.warn(
      '画布 viewportTransform 存在平移, 扫描导出按 left/top=0 截取的前提已被打破, 输出可能错位'
    );
  }

  const pageDataUrl =
    baseWidth > 0 && baseHeight > 0
      ? fabricCanvas.toDataURL({
          format: 'png',
          // 编辑器背景以 2x viewport 建立；除以该倍率后，scale 才真正等于 DPI/72。
          multiplier: safeConfig.scale / EDITOR_RENDER_SCALE / zoom,
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
  const result = target.toDataURL(safeConfig.output_format, quality);
  source.src = '';
  target.width = 0;
  target.height = 0;
  return result;
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
  signal = null,
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
  // pdf-lib 默认在文档创建时立即写入自己的 Producer/Creator 署名与本机当前时间的
  // ModificationDate(CreationDate 视情况而定), 与是否调用 save() 无关。关闭
  // updateMetadata 后这些字段完全不会被自动写入, 之后按需显式设置即可, 不必再靠置空
  // 字符串中和署名, 也避免了 enabled:false 时仍泄漏本机时间的问题。
  const outputDoc = await PDFDocument.create({ updateMetadata: false });

  // 记录未能渲染的页号, 结束时汇总告知用户, 不做静默降级
  const blankPages = [];

  for (let i = 0; i < total; i++) {
    throwIfAborted(signal);
    const pageNum = i + 1;
    onProgress(pageNum, total);

    // 页面尺寸取自 pdf.js viewport: 它已计入 /Rotate, 与 fabric 画布宽高比一致。
    // pdf-lib 的 getSize() 返回未旋转的 MediaBox, 会把横向页压扁成纵向。
    const sourcePage = await pdfDoc.getPage(pageNum);
    const { width, height } = sourcePage.getViewport({ scale: 1 });

    // 画布只在用户翻页时才初始化, 未访问过的页若直接跳过会静默输出纯白页(内容丢失)
    const hadCanvasBeforeExport = Boolean(getState().fabricCanvases[i]);
    if (!hadCanvasBeforeExport) {
      try {
        await initializeFabricCanvasForPage(pageNum);
      } catch (error) {
        console.warn(`第 ${pageNum} 页画布初始化失败:`, error);
      }
    }

    try {
      throwIfAborted(signal);
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

      throwIfAborted(signal);
      const imageBytes = dataUrlToUint8Array(scannedDataUrl);
      const embedded =
        safeConfig.output_format === 'image/jpeg'
          ? await outputDoc.embedJpg(imageBytes)
          : await outputDoc.embedPng(imageBytes);

      page.drawImage(embedded, { x: 0, y: 0, width, height });

      // 让出主线程, 避免长文档卡死 UI，并给取消操作一个检查点。
      await new Promise((resolve) => setTimeout(resolve, 0));
      throwIfAborted(signal);
    } finally {
      // 未访问页只为本次导出临时初始化，导出后立即释放，避免长文档把所有页常驻内存。
      if (!hadCanvasBeforeExport && getState().fabricCanvases[i]) {
        cleanupCanvas(pageNum);
      }
    }
  }

  writeMetadata(outputDoc, safeMetadata);
  // enabled:false 时不写任何元数据字段: 上面的 updateMetadata:false 已确保
  // Producer/Creator/CreationDate/ModificationDate 全部缺失, 无需再置空字符串中和。

  if (blankPages.length > 0) {
    window.Toast?.warning?.(
      `有 ${blankPages.length} 页未能渲染，已输出为空白页：第 ${blankPages.join('、')} 页。`
    );
  }

  return outputDoc.save();
}

/**
 * 把任意 PDF 字节转成扫描视觉效果。供批量管线使用，不依赖编辑器全局画布。
 */
export async function buildScannedPdfFromBytes({
  pdfBytes,
  config,
  watermark,
  metadata,
  onProgress = () => {},
  signal = null,
} = {}) {
  if (!pdfBytes) throw new Error('缺少 PDF 数据');
  const safeConfig = sanitizeScanConfig(config);
  const safeWatermark = sanitizeWatermark(watermark);
  const safeMetadata = sanitizeScanMetadata(metadata);
  const { PDFDocument } = window.PDFLib;
  const input = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
  const sourceDoc = await window.pdfjsLib.getDocument({ data: input.slice() }).promise;
  const outputDoc = await PDFDocument.create({ updateMetadata: false });
  const noiseImage = await createNoiseImage(safeConfig.noise);

  try {
    for (let pageNum = 1; pageNum <= sourceDoc.numPages; pageNum += 1) {
      throwIfAborted(signal);
      onProgress(pageNum, sourceDoc.numPages);
      const sourcePage = await sourceDoc.getPage(pageNum);
      const pdfViewport = sourcePage.getViewport({ scale: 1 });
      const renderViewport = sourcePage.getViewport({ scale: safeConfig.scale });
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = Math.max(1, Math.round(renderViewport.width));
      sourceCanvas.height = Math.max(1, Math.round(renderViewport.height));
      await sourcePage.render({
        canvasContext: sourceCanvas.getContext('2d'),
        viewport: renderViewport,
      }).promise;
      throwIfAborted(signal);

      const target = document.createElement('canvas');
      applyScanEffect(target, sourceCanvas, safeConfig, noiseImage);
      applyWatermark(target, safeWatermark);
      const quality = safeConfig.output_format === 'image/jpeg' ? JPEG_QUALITY : undefined;
      const dataUrl = target.toDataURL(safeConfig.output_format, quality);
      const imageBytes = dataUrlToUint8Array(dataUrl);
      const embedded =
        safeConfig.output_format === 'image/jpeg'
          ? await outputDoc.embedJpg(imageBytes)
          : await outputDoc.embedPng(imageBytes);
      const outputPage = outputDoc.addPage([pdfViewport.width, pdfViewport.height]);
      outputPage.drawImage(embedded, {
        x: 0,
        y: 0,
        width: pdfViewport.width,
        height: pdfViewport.height,
      });
      sourceCanvas.width = 0;
      sourceCanvas.height = 0;
      target.width = 0;
      target.height = 0;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    writeMetadata(outputDoc, safeMetadata);
    throwIfAborted(signal);
    return outputDoc.save();
  } finally {
    await sourceDoc.destroy?.();
  }
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

  const abortController = new AbortController();
  window.Loading.showExportLoading('正在生成扫描件...', {
    cancelable: true,
    onCancel: () => abortController.abort(),
  });

  try {
    const operations = collectStampOperations(getState().fabricCanvases);
    const incomplete = findIncompleteStraddleGroups(operations, getState().totalPages);
    if (incomplete.length > 0) {
      throw new Error(`骑缝章未覆盖全部页面：缺第 ${incomplete[0].missingPages.join('、')} 页`);
    }
    const pdfBytes = await buildScannedPdfBytes({
      config,
      watermark,
      metadata,
      signal: abortController.signal,
      onProgress: (current, total) => {
        window.Loading.updateProgress(
          (current / total) * 90,
          `处理第 ${current}/${total} 页`
        );
      },
    });

    window.Loading.updateProgress(95, '正在保存文件...');

    const safeFilename = generateSafeExportFilename(
      sourceFile || getState().currentPdfFile,
      '_扫描件'
    );

    window.Loading.updateProgress(100, '完成！');
    await downloadExportArtifacts({
      sourceFile: sourceFile || getState().currentPdfFile,
      sourceBytes: getState().originalSourceBytes || getState().originalPdfBytes,
      outputBytes: pdfBytes,
      outputFilename: safeFilename,
      mode: 'scan-simulation',
      pageCount: getState().totalPages,
      operations,
      settings: { config, watermark, metadata },
    });

    window.Toast.success(`扫描件 PDF 已开始下载：${safeFilename}`);
  } catch (error) {
    if (error?.name === 'AbortError') {
      window.Toast.info('已取消扫描件导出。');
      return;
    }
    console.error('导出扫描件失败:', error);
    window.Toast.error(error?.message || '导出扫描件失败，详情请查看控制台。', 0);
  } finally {
    window.Loading.hide();
  }
}
