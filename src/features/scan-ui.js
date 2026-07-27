/**
 * 扫描件 UI 模块
 * 设置面板读写 + 预设 + 当前页实时预览(防抖) + 导出接线 + 配置持久化
 */

import { getState, subscribe } from '../core/state.js';
import { getCurrentActivePage } from '../modules/canvas-manager.js';
import {
  DEFAULT_SCAN_CONFIG,
  SCAN_PRESETS,
  sanitizeScanConfig,
  createNoiseImage,
} from '../modules/scan-effect.js';
import {
  DEFAULT_WATERMARK,
  sanitizeWatermark,
} from '../modules/scan-watermark.js';
import {
  DEFAULT_SCAN_METADATA,
  sanitizeScanMetadata,
  renderScannedPageDataUrl,
  exportScannedPdf,
} from '../modules/scan-export.js';

const STORAGE_KEY = 'yinji-scan-config';
const PREVIEW_DEBOUNCE_MS = 150;
// 预览固定用最低分辨率, 保证拖动滑块时也能跟手; 导出仍按用户选的 scale
const PREVIEW_SCALE = 1;

let initialized = false;
let scanConfig = { ...DEFAULT_SCAN_CONFIG };
let watermarkConfig = { ...DEFAULT_WATERMARK };
let metadataConfig = { ...DEFAULT_SCAN_METADATA };
let previewTimer = null;
let previewLayer = null;
// 渲染令牌: 防止先发的慢渲染后到, 把新参数的预览图覆盖回旧的
let previewToken = 0;
let lastPreviewPage = 0;
let lastPreviewZoom = 0;
let exporting = false;

export function getScanConfig() {
  return { ...scanConfig };
}

export function getScanWatermark() {
  return { ...watermarkConfig };
}

export function getScanMetadata() {
  return { ...metadataConfig };
}

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return;
    }
    // localStorage 内容可被手工编辑, 一律过清洗函数(内部已处理脏布尔值与越界数字)
    scanConfig = sanitizeScanConfig(parsed.config);
    watermarkConfig = sanitizeWatermark(parsed.watermark);
    metadataConfig = sanitizeScanMetadata(parsed.metadata);
  } catch (error) {
    console.warn('读取扫描配置失败，使用默认值:', error);
  }
}

function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        config: scanConfig,
        watermark: watermarkConfig,
        metadata: metadataConfig,
      })
    );
  } catch (error) {
    console.warn('保存扫描配置失败:', error);
  }
}

function el(id) {
  return document.getElementById(id);
}

function setValueText(id, text) {
  const node = el(id);
  if (node) {
    node.textContent = String(text);
  }
}

/**
 * 回写控件的值。正在编辑的控件跳过: 它本身就是数据来源,
 * 重新赋值会把文本框光标弹到末尾, 导致中间插字改不了。
 * @param {string} id
 * @param {string|number} value
 */
function setControlValue(id, value) {
  const input = el(id);
  if (input && input !== document.activeElement) {
    input.value = String(value);
  }
}

function setControlChecked(id, checked) {
  const input = el(id);
  if (input && input !== document.activeElement) {
    input.checked = Boolean(checked);
  }
}

/** 把内存配置同步到界面控件 */
function syncControlsFromConfig() {
  setControlValue('scan-noise', scanConfig.noise);
  setControlValue('scan-rotate-var', scanConfig.rotate_var);
  setControlValue('scan-yellowish', scanConfig.yellowish);
  setControlValue('scan-contrast', scanConfig.contrast);
  setControlValue('scan-blur', scanConfig.blur);
  setControlValue('scan-brightness', scanConfig.brightness);
  setControlValue('scan-rotate', scanConfig.rotate);
  setControlValue('scan-scale', scanConfig.scale);

  setValueText('scan-noise-value', scanConfig.noise.toFixed(2));
  setValueText('scan-rotate-var-value', scanConfig.rotate_var.toFixed(1));
  setValueText('scan-yellowish-value', scanConfig.yellowish.toFixed(2));
  setValueText('scan-contrast-value', scanConfig.contrast.toFixed(2));
  setValueText('scan-blur-value', scanConfig.blur.toFixed(2));
  setValueText('scan-brightness-value', scanConfig.brightness.toFixed(2));
  setValueText('scan-rotate-value', scanConfig.rotate.toFixed(1));
  setValueText('scan-scale-value', `${Math.round(scanConfig.scale * 72)} DPI`);

  setControlChecked('scan-border', scanConfig.border);
  setControlChecked('scan-gray', scanConfig.colorspace === 'gray');

  setControlChecked('scan-watermark-enabled', watermarkConfig.enabled);
  setControlValue('scan-watermark-text', watermarkConfig.text);
  setControlValue('scan-watermark-opacity', watermarkConfig.opacity);
  setValueText('scan-watermark-opacity-value', watermarkConfig.opacity.toFixed(2));
  setControlValue('scan-watermark-size', watermarkConfig.fontSize);
  setValueText('scan-watermark-size-value', String(watermarkConfig.fontSize));
  setControlChecked('scan-watermark-repeat', watermarkConfig.repeat);

  setControlChecked('scan-meta-enabled', metadataConfig.enabled);
  setControlValue('scan-meta-title', metadataConfig.title);
  setControlValue('scan-meta-author', metadataConfig.author);
  setControlChecked('scan-meta-scanner', metadataConfig.scannerStyle);
}

function removePreviewLayer() {
  if (previewLayer && previewLayer.parentElement) {
    previewLayer.parentElement.removeChild(previewLayer);
  }
  previewLayer = null;
  lastPreviewPage = 0;
  lastPreviewZoom = 0;
}

function isPreviewOn() {
  const toggle = el('scan-preview-toggle');
  return Boolean(toggle && toggle.checked);
}

/** 渲染当前页扫描预览到覆盖层 */
async function renderPreview() {
  if (!isPreviewOn()) {
    removePreviewLayer();
    return;
  }

  const pageNum = getCurrentActivePage();
  const wrapper = document.getElementById(`page-wrapper-${pageNum}`);
  const fabricCanvas = getState().fabricCanvases[pageNum - 1];

  if (!wrapper || !fabricCanvas) {
    removePreviewLayer();
    return;
  }

  // 挂到 fabric 的 .canvas-container 上: 只有它是定位元素, 且尺寸与画布严格一致。
  // .canvas-wrapper 自带 2rem 内边距又非定位元素, 直接挂上去会错位。
  const mount = wrapper.querySelector('.canvas-container') || wrapper;
  const token = ++previewToken;

  try {
    const noiseImage = await createNoiseImage(scanConfig.noise);
    const previewConfig = {
      ...scanConfig,
      scale: PREVIEW_SCALE,
      output_format: 'image/png',
    };
    const dataUrl = await renderScannedPageDataUrl(
      pageNum - 1,
      previewConfig,
      watermarkConfig,
      noiseImage
    );

    // 期间又发起了新一轮渲染, 本次结果作废
    if (token !== previewToken) {
      return;
    }

    if (!dataUrl) {
      removePreviewLayer();
      return;
    }

    if (!previewLayer) {
      previewLayer = document.createElement('img');
      previewLayer.className = 'scan-preview-layer';
      previewLayer.alt = '扫描效果预览';
    }

    previewLayer.src = dataUrl;
    // 页面切换途中挂载点可能还是 display:none(无布局), 此时写 0px 会得到一张看不见的图,
    // 宁可先按原始尺寸显示, 等下一次状态变化重新量。
    if (mount.clientWidth > 0 && mount.clientHeight > 0) {
      previewLayer.style.width = `${mount.clientWidth}px`;
      previewLayer.style.height = `${mount.clientHeight}px`;
    }

    if (previewLayer.parentElement !== mount) {
      mount.appendChild(previewLayer);
    }

    lastPreviewPage = pageNum;
    lastPreviewZoom = getState().globalZoomMultiplier;
  } catch (error) {
    console.error('扫描预览失败:', error);
    if (token === previewToken) {
      removePreviewLayer();
    }
  }
}

function schedulePreview() {
  if (previewTimer) {
    clearTimeout(previewTimer);
  }
  previewTimer = setTimeout(() => {
    previewTimer = null;
    renderPreview();
  }, PREVIEW_DEBOUNCE_MS);
}

/** 从界面控件收集到内存配置 */
function collectFromControls() {
  const numeric = [
    ['scan-noise', 'noise'],
    ['scan-rotate-var', 'rotate_var'],
    ['scan-yellowish', 'yellowish'],
    ['scan-contrast', 'contrast'],
    ['scan-blur', 'blur'],
    ['scan-brightness', 'brightness'],
    ['scan-rotate', 'rotate'],
    ['scan-scale', 'scale'],
  ];

  const next = { ...scanConfig };
  numeric.forEach(([id, key]) => {
    const input = el(id);
    if (input) {
      next[key] = Number(input.value);
    }
  });

  const borderInput = el('scan-border');
  if (borderInput) {
    next.border = borderInput.checked;
  }

  const grayInput = el('scan-gray');
  if (grayInput) {
    next.colorspace = grayInput.checked ? 'gray' : 'sRGB';
  }

  scanConfig = sanitizeScanConfig(next);

  watermarkConfig = sanitizeWatermark({
    enabled: el('scan-watermark-enabled')?.checked,
    text: el('scan-watermark-text')?.value,
    opacity: el('scan-watermark-opacity')?.value,
    fontSize: el('scan-watermark-size')?.value,
    repeat: el('scan-watermark-repeat')?.checked,
    color: watermarkConfig.color,
    angle: watermarkConfig.angle,
  });

  metadataConfig = sanitizeScanMetadata({
    enabled: el('scan-meta-enabled')?.checked,
    title: el('scan-meta-title')?.value,
    author: el('scan-meta-author')?.value,
    subject: metadataConfig.subject,
    keywords: metadataConfig.keywords,
    scannerStyle: el('scan-meta-scanner')?.checked,
  });
}

function handleControlChange() {
  collectFromControls();
  syncControlsFromConfig();
  persist();
  schedulePreview();
}

function applyPreset(presetKey) {
  const preset = SCAN_PRESETS[presetKey];
  if (!preset) {
    return;
  }
  scanConfig = sanitizeScanConfig({ ...scanConfig, ...preset });
  syncControlsFromConfig();
  persist();
  schedulePreview();
  window.Toast?.success('已应用预设。');
}

function handleExportClick() {
  if (exporting) {
    window.Toast?.warning('扫描件正在生成，稍等一下。');
    return;
  }

  exporting = true;
  const button = el('export-scan-btn');
  if (button) {
    button.disabled = true;
  }

  Promise.resolve(
    exportScannedPdf({
      config: scanConfig,
      watermark: watermarkConfig,
      metadata: metadataConfig,
      sourceFile: getState().currentPdfFile,
    })
  )
    .catch((error) => {
      console.error('导出扫描件失败:', error);
      window.Toast?.error('导出扫描件失败，详情请查看控制台。', 0);
    })
    .finally(() => {
      exporting = false;
      if (button) {
        button.disabled = false;
      }
    });
}

/** 翻页或缩放后预览会挂在错误的页/尺寸上, 需要重渲染 */
function handleStateChange() {
  if (!isPreviewOn()) {
    return;
  }

  const { globalZoomMultiplier } = getState();
  const pageNum = getCurrentActivePage();
  if (pageNum === lastPreviewPage && globalZoomMultiplier === lastPreviewZoom) {
    return;
  }

  schedulePreview();
}

export function setupScanUI() {
  const section = document.querySelector('[data-section-key="export-scan"]');
  if (!section || initialized) {
    return;
  }

  loadStored();
  syncControlsFromConfig();

  const controlIds = [
    'scan-noise',
    'scan-rotate-var',
    'scan-yellowish',
    'scan-contrast',
    'scan-blur',
    'scan-brightness',
    'scan-rotate',
    'scan-scale',
    'scan-border',
    'scan-gray',
    'scan-watermark-enabled',
    'scan-watermark-text',
    'scan-watermark-opacity',
    'scan-watermark-size',
    'scan-watermark-repeat',
    'scan-meta-enabled',
    'scan-meta-title',
    'scan-meta-author',
    'scan-meta-scanner',
  ];

  controlIds.forEach((id) => {
    const input = el(id);
    if (input) {
      input.addEventListener('input', handleControlChange);
    }
  });

  section.querySelectorAll('[data-scan-preset]').forEach((button) => {
    button.addEventListener('click', () => applyPreset(button.dataset.scanPreset));
  });

  const previewToggle = el('scan-preview-toggle');
  if (previewToggle) {
    previewToggle.addEventListener('change', () => {
      if (previewToggle.checked) {
        schedulePreview();
      } else {
        removePreviewLayer();
      }
    });
  }

  const exportBtn = el('export-scan-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', handleExportClick);
  }

  subscribe(handleStateChange);

  initialized = true;
}
