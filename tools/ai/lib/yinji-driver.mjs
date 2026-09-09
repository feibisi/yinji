import fs from 'node:fs';
import path from 'node:path';

import { createBrowserSession, sleep } from './cdp-client.mjs';

const DEFAULT_APP_URL = 'http://127.0.0.1:8123/index.html';

// scan-check 判定阈值。扫描效果带随机小角度旋转与噪点, 单次输出会有几个灰阶的抖动,
// 阈值按夹具的设计墨量差(约 100+ 灰阶)留足余量, 既能证伪缺陷又不会偶发变红。
const SCAN_CHECK_BLANK_MEAN = 250; // 页面平均灰度高于此值即视为纯白页(内容丢失)
const SCAN_CHECK_PAGE_GAP = 20; // 相邻页墨量差下限, 用于抓页号映射错误
const SCAN_CHECK_HALF_GAP = 40; // 第 2 页上下半区亮度差下限, 用于抓上下颠倒

// 与 src/modules/scan-export.js 的真实软件署名保持一致
const APP_CREATOR = 'Yinji';
const APP_PRODUCER = 'Yinji PDF Processor';

// scan-check 夹具: 三页 A4(612x792), 墨量刻意拉开差距。
// 每页显式指定 color, 不依赖 pdf-lib 的默认填充色 —— 三页墨量相同的夹具会让
// "三页都渲染第 1 页" 这类页号映射错误照样全绿(历史上真出过这种假绿护栏)。
const SCAN_CHECK_FIXTURE_SCRIPT = `(async () => {
  const { PDFDocument, rgb } = window.PDFLib;
  const black = rgb(0, 0, 0);
  const doc = await PDFDocument.create();

  // 第 1 页: 近乎全白, 只有居中一小块黑 —— 墨量最少, 最亮
  const first = doc.addPage([612, 792]);
  first.drawRectangle({ x: 196, y: 286, width: 220, height: 220, color: black });

  // 第 2 页: 下半页全黑 —— 墨量居中, 同时用于验证上下方向没被翻转
  const second = doc.addPage([612, 792]);
  second.drawRectangle({ x: 0, y: 0, width: 612, height: 396, color: black });

  // 第 3 页: 整页全黑 —— 墨量最多, 最暗
  const third = doc.addPage([612, 792]);
  third.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: black });

  const bytes = await doc.save();
  const file = new File([bytes], 'scan-check-3p.pdf', { type: 'application/pdf' });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  const input = document.getElementById('pdfInput');
  if (!input) {
    throw new Error('找不到 #pdfInput');
  }

  input.files = transfer.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  return true;
})()`;

// 导出扫描件并逐页量化墨量。before 记录导出前各页画布是否已初始化,
// 用于确认第 2、3 页确实没被访问过 —— 否则这条护栏测的就不是"未访问页"场景。
const SCAN_CHECK_EXPORT_SCRIPT = `(async () => {
  const before = (window.AppState.getState().fabricCanvases || []).map(
    (item) => Boolean(item)
  );

  const scanExport = await import('/src/modules/scan-export.js');
  const scanEffect = await import('/src/modules/scan-effect.js');
  const scanWatermark = await import('/src/modules/scan-watermark.js');

  const bytes = await scanExport.buildScannedPdfBytes({
    config: scanEffect.DEFAULT_SCAN_CONFIG,
    watermark: scanWatermark.DEFAULT_WATERMARK,
    metadata: { enabled: false },
  });
  const after = (window.AppState.getState().fabricCanvases || []).map(
    (item) => Boolean(item)
  );

  const pdf = await window.pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const pages = [];

  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const viewport = page.getViewport({ scale: 0.5 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const middle = Math.floor(canvas.height / 2);
    let sum = 0;
    let topSum = 0;
    let topCount = 0;
    let bottomSum = 0;
    let bottomCount = 0;

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const gray = data[(y * canvas.width + x) * 4];
        sum += gray;
        if (y < middle) {
          topSum += gray;
          topCount += 1;
        } else {
          bottomSum += gray;
          bottomCount += 1;
        }
      }
    }

    pages.push({
      page: index,
      mean: Number((sum / (canvas.width * canvas.height)).toFixed(1)),
      topMean: Number((topSum / topCount).toFixed(1)),
      bottomMean: Number((bottomSum / bottomCount).toFixed(1)),
    });
  }

  return { before, after, byteLength: bytes.length, pageCount: pdf.numPages, pages };
})()`;

const SCAN_CHECK_CANCEL_SCRIPT = `(async () => {
  const scanExport = await import('/src/modules/scan-export.js');
  const controller = new AbortController();
  controller.abort();
  try {
    await scanExport.buildScannedPdfBytes({ signal: controller.signal });
    return { cancelled: false, name: '' };
  } catch (error) {
    return { cancelled: error?.name === 'AbortError', name: error?.name || '' };
  }
})()`;

const SCAN_CHECK_STANDALONE_SCRIPT = `(async () => {
  const scanExport = await import('/src/modules/scan-export.js');
  const scanEffect = await import('/src/modules/scan-effect.js');
  const input = window.AppState.getState().originalPdfBytes;
  const bytes = await scanExport.buildScannedPdfFromBytes({
    pdfBytes: input,
    config: { ...scanEffect.DEFAULT_SCAN_CONFIG, scale: 1, noise: 0 },
    watermark: { enabled: false },
    metadata: { enabled: true, title: '批量扫描校验', includeProcessor: true },
  });
  const rendered = await window.pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const metadataDoc = await window.PDFLib.PDFDocument.load(bytes, { updateMetadata: false });
  return {
    pageCount: rendered.numPages,
    title: metadataDoc.getTitle() || '',
    producer: metadataDoc.getProducer() || '',
  };
})()`;

// 三档元数据(关闭 / 开启但不写处理软件 / 开启并写真实处理软件)。元数据与画质无关, 这里降到
// scale:1、noise:0 只为跑得快。读回必须带 updateMetadata:false, 否则 load 自身
// 会重写 Producer, 校验"不含 pdf-lib"就成了自证。
const SCAN_CHECK_METADATA_SCRIPT = `(async () => {
  const scanExport = await import('/src/modules/scan-export.js');
  const scanEffect = await import('/src/modules/scan-effect.js');
  const scanWatermark = await import('/src/modules/scan-watermark.js');
  const { PDFDocument } = window.PDFLib;

  const config = { ...scanEffect.DEFAULT_SCAN_CONFIG, scale: 1, noise: 0 };
  const cases = [
    { name: 'disabled', metadata: { enabled: false } },
    {
      name: 'enabled-plain',
      metadata: {
        enabled: true,
        title: '扫描件校验',
        author: '印迹',
        includeProcessor: false,
      },
    },
    {
      name: 'enabled-processor',
      metadata: { enabled: true, title: '扫描件校验', includeProcessor: true },
    },
  ];

  const results = [];

  for (const item of cases) {
    const bytes = await scanExport.buildScannedPdfBytes({
      config,
      watermark: scanWatermark.DEFAULT_WATERMARK,
      metadata: item.metadata,
    });
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });

    results.push({
      name: item.name,
      producer: doc.getProducer() || '',
      creator: doc.getCreator() || '',
      title: doc.getTitle() || '',
      author: doc.getAuthor() || '',
    });
  }

  return results;
})()`;

function asJson(value) {
  return JSON.stringify(value);
}

function toAbsolutePath(filePath) {
  return path.resolve(filePath);
}

function toAbsolutePaths(filePaths = []) {
  return filePaths.map((filePath) => toAbsolutePath(filePath));
}

export class YinjiDriver {
  constructor({
    appUrl = DEFAULT_APP_URL,
    cdpBaseUrl = 'http://127.0.0.1:9222',
    width = 1440,
    height = 960,
  } = {}) {
    this.appUrl = appUrl;
    this.cdpBaseUrl = cdpBaseUrl;
    this.width = width;
    this.height = height;
    this.client = null;
  }

  async open() {
    const pageUrl = `${this.appUrl}?ts=${Date.now()}`;
    this.client = await createBrowserSession({
      pageUrl,
      cdpBaseUrl: this.cdpBaseUrl,
      width: this.width,
      height: this.height,
    });

    await this.client.send('Page.navigate', { url: pageUrl });
    await sleep(800);
    await this.waitForAppReady();
  }

  async close() {
    await this.client?.close();
  }

  async evaluate(expression) {
    if (!this.client) {
      throw new Error('浏览器会话还没打开');
    }

    return this.client.evaluate(expression);
  }

  async wait(ms) {
    await sleep(ms);
  }

  async waitFor(predicateExpression, message, timeout = 15000, interval = 100) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const value = await this.evaluate(predicateExpression);
      if (value) {
        return value;
      }
      await sleep(interval);
    }

    throw new Error(message);
  }

  async waitForAppReady() {
    await this.waitFor(
      `Boolean(window.AppState && window.History && document.getElementById('pdfInput'))`,
      '印迹应用没有完成初始化'
    );
  }

  async setInputFiles(selector, filePaths) {
    const absolutePaths = toAbsolutePaths(filePaths);
    await this.client.setInputFiles(selector, absolutePaths);

    return this.evaluate(`(() => {
      const input = document.querySelector(${asJson(selector)});
      if (!input) {
        throw new Error('找不到元素: ' + ${asJson(selector)});
      }

      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      return Array.from(input.files || []).map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type,
      }));
    })()`);
  }

  async loadPdf(filePath) {
    await this.evaluate(`(() => {
      document.querySelectorAll('#toast-container .toast-message').forEach((item) => item.closest('.toast')?.remove?.() || item.remove());
      return true;
    })()`);
    await this.setInputFiles('#pdfInput', [filePath]);
    const outcome = await this.waitFor(
      `(() => {
        const state = window.AppState?.getState?.();
        const loading = document.getElementById('loading-overlay')?.classList.contains('loading-show');
        if (
          !loading &&
          state &&
          state.currentPdfFile &&
          state.currentSourceKind &&
          state.totalPages > 0 &&
          !document.getElementById('app')?.classList.contains('no-pdf-loaded')
        ) return { ok: true, totalPages: state.totalPages };
        const toast = Array.from(document.querySelectorAll('#toast-container .toast-message')).at(-1)?.textContent?.trim() || '';
        return !loading && toast ? { ok: false, message: toast } : false;
      })()`,
      '文件加载超时',
      35000
    );
    if (!outcome.ok) {
      const error = new Error(outcome.message || '文件打开失败');
      error.code = 'PDF_BROWSER_PREFLIGHT_FAILED';
      throw error;
    }
    return outcome;
  }

  async loadSeal(filePath) {
    await this.setInputFiles('#sealInput', [filePath]);
    await this.waitFor(
      `(() => {
        const seal = window.AppState?.getState?.()?.sealImageElement;
        return Boolean(seal?.src && seal.naturalWidth > 0 && seal.naturalHeight > 0);
      })()`,
      '印章素材加载超时',
      15000
    );
  }

  async loadDemoSeal() {
    await this.evaluate(`(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#c53030';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.arc(120, 120, 84, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#c53030';
      ctx.font = 'bold 54px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('印', 120, 102);
      ctx.fillText('迹', 120, 158);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const file = new File([blob], 'yinji-demo-seal.png', { type: 'image/png' });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const input = document.getElementById('sealInput');
      input.files = transfer.files;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);

    await this.waitFor(
      `(() => {
        const seal = window.AppState?.getState?.()?.sealImageElement;
        return Boolean(seal?.src && seal.naturalWidth > 0 && seal.naturalHeight > 0);
      })()`,
      '演示印章生成超时',
      15000
    );
  }

  async loadBatchPdfs(filePaths) {
    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      return [];
    }

    await this.setInputFiles('#batchInput', filePaths);
    await this.waitFor(
      `(() => {
        const expected = ${asJson(filePaths.length)};
        const items = document.querySelectorAll('.batch-file-item').length;
        const label = document.getElementById('batch-file-count')?.textContent || '';
        return items >= expected || label.includes(String(expected) + ' 个文件');
      })()`,
      '批量队列加载超时',
      15000
    );

    return this.snapshotState();
  }

  async configureDownloads(outputDirectory) {
    const options = {
      behavior: 'allow',
      downloadPath: path.resolve(outputDirectory),
    };
    // Page.setDownloadBehavior applies to the target session used by this
    // lightweight CDP client. Browser.setDownloadBehavior can silently apply
    // to a different browser context when several headless contexts coexist.
    await this.client.send('Page.setDownloadBehavior', options);
  }

  async enableArtifactCapture() {
    await this.evaluate(`(() => {
      window.__yinjiCliCapture = true;
      window.__yinjiCapturedArtifacts = [];
      return true;
    })()`);
  }

  async configureSealProcessing(template = {}) {
    await this.evaluate(`(() => {
      const template = ${asJson(template)};
      const patch = {};
      if (Number.isFinite(Number(template.rotation))) patch.sealRotation = Math.min(180, Math.max(-180, Number(template.rotation)));
      if (Number.isFinite(Number(template.brightness))) patch.sealBrightness = Math.min(200, Math.max(0, Number(template.brightness)));
      if (typeof template.removeBackground === 'boolean') patch.autoRemoveSealBackground = template.removeBackground;
      window.AppState?.setState?.(patch);
      window.__yinjiAgentTemplateOverrides = {
        ...(Number.isFinite(Number(template.rotation)) ? { rotation: patch.sealRotation } : {}),
        ...(Number.isFinite(Number(template.brightness)) ? { brightness: patch.sealBrightness } : {}),
        ...(typeof template.removeBackground === 'boolean' ? { removeBackground: template.removeBackground } : {}),
      };
      const checkbox = document.getElementById('auto-remove-bg');
      if (checkbox && typeof template.removeBackground === 'boolean') checkbox.checked = template.removeBackground;
      return { patch, overrides: window.__yinjiAgentTemplateOverrides };
    })()`);
  }

  async writeCapturedArtifacts(outputDirectory, { force = false } = {}) {
    const artifacts = await this.evaluate(`(() => {
      const captured = window.__yinjiCapturedArtifacts || [];
      window.__yinjiCapturedArtifacts = [];
      return captured;
    })()`);
    for (const artifact of artifacts) {
      for (const name of [artifact.outputFilename, artifact.sidecarName]) {
        if (!name || path.basename(name) !== name) {
          throw new Error('浏览器返回了不安全的输出文件名');
        }
      }
    }
    const targets = artifacts.flatMap((artifact) => [
      path.join(outputDirectory, artifact.outputFilename),
      path.join(outputDirectory, artifact.sidecarName),
    ]);
    const conflicts = targets.filter((target) => fs.existsSync(target));
    if (conflicts.length > 0 && !force) {
      throw new Error(`输出文件已存在；明确使用 --force 才能覆盖：${conflicts.map((target) => path.basename(target)).join(', ')}`);
    }
    const written = [];
    for (const artifact of artifacts) {
      const pdfPath = path.join(outputDirectory, artifact.outputFilename);
      const sidecarPath = path.join(outputDirectory, artifact.sidecarName);
      fs.writeFileSync(pdfPath, Buffer.from(artifact.outputBase64, 'base64'));
      fs.writeFileSync(sidecarPath, JSON.stringify(artifact.manifest, null, 2));
      written.push(path.basename(pdfPath), path.basename(sidecarPath));
    }
    return written;
  }

  async setBatchTemplate(template = {}) {
    await this.evaluate(`(() => {
      const template = ${asJson(template)};
      const set = (id, value) => {
        const node = document.getElementById(id);
        if (!node || value === undefined || value === null) return;
        node.value = String(value);
        node.dispatchEvent(new Event('change', { bubbles: true }));
      };
      set('batch-template-pages', template.pages || 'all');
      set('batch-template-anchor', template.anchor || 'center');
      set('batch-template-offset-x', template.offsetX || 0);
      set('batch-template-offset-y', template.offsetY || 0);
      set('batch-template-size', template.size == null ? '' : Number(template.size) * 100);
      set('batch-template-opacity', template.opacity == null ? '' : Number(template.opacity) * 100);
      return true;
    })()`);
  }

  async click(elementId) {
    await this.evaluate(`(() => {
      const node = document.getElementById(${asJson(elementId)});
      if (!node) {
        throw new Error('找不到元素: ' + ${asJson(elementId)});
      }
      node.click();
      return true;
    })()`);
  }

  async clickSelector(selector) {
    await this.evaluate(`(() => {
      const node = document.querySelector(${asJson(selector)});
      if (!node) {
        throw new Error('找不到元素: ' + ${asJson(selector)});
      }
      node.click();
      return true;
    })()`);
  }

  async switchTab(tabName) {
    await this.clickSelector(`.tab-btn[data-tab="${tabName}"]`);
    await sleep(200);
  }

  async switchExportMode(mode) {
    const normalized = mode === 'normal' ? 'single' : mode;
    await this.clickSelector(`.export-mode-btn[data-export-mode="${normalized}"]`);
    await sleep(200);
  }

  async collapseSidebar() {
    await this.click('sidebar-toggle');
    await sleep(500);
  }

  async openSettings() {
    await this.click('settingsBtn');
    await this.waitFor(
      `Boolean(document.getElementById('settings-modal'))`,
      '设置弹窗没有打开'
    );
  }

  async openHelp() {
    await this.click('helpBtn');
    await this.waitFor(
      `Boolean(document.getElementById('shortcut-help-modal'))`,
      '快捷键弹窗没有打开'
    );
  }

  async openSignatureModal() {
    await this.click('quick-signature-btn');
    await this.waitFor(
      `(() => {
        const modal = document.getElementById('signature-modal');
        return Boolean(modal && !modal.classList.contains('hidden'));
      })()`,
      '签名弹窗没有打开'
    );
  }

  async addNormalSeal() {
    await this.click('addSeal');
    await this.waitFor(
      `(() => {
        const state = window.AppState?.getState?.();
        const canvas = state?.fabricCanvases?.[state.currentActivePage - 1];
        if (!canvas) {
          return false;
        }
        return canvas
          .getObjects()
          .some((item) => !item.isBackgroundImage && !item.excludeFromExport);
      })()`,
      '添加普通章超时'
    );
  }

  async addDemoSignature() {
    const beforeCount = await this.evaluate(`(() => {
      const state = window.AppState?.getState?.();
      const canvas = state?.fabricCanvases?.[state.currentActivePage - 1];
      if (!canvas) {
        return 0;
      }

      return canvas
        .getObjects()
        .filter((item) => !item.isBackgroundImage && !item.excludeFromExport)
        .length;
    })()`);

    await this.openSignatureModal();
    await this.evaluate(`(() => {
      const canvas = document.getElementById('signature-canvas');
      if (!canvas) {
        throw new Error('找不到签名画布');
      }

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(86, 176);
      ctx.bezierCurveTo(136, 72, 214, 72, 236, 170);
      ctx.bezierCurveTo(250, 226, 296, 232, 340, 120);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(334, 120);
      ctx.bezierCurveTo(372, 66, 422, 72, 446, 152);
      ctx.bezierCurveTo(460, 204, 508, 208, 544, 104);
      ctx.stroke();

      return true;
    })()`);

    await this.click('confirm-signature-btn');
    await this.waitFor(
      `(() => {
        const modal = document.getElementById('signature-modal');
        const hidden = Boolean(modal?.classList.contains('hidden'));
        const state = window.AppState?.getState?.();
        const canvas = state?.fabricCanvases?.[state.currentActivePage - 1];
        const count = canvas
          ? canvas
              .getObjects()
              .filter((item) => !item.isBackgroundImage && !item.excludeFromExport)
              .length
          : 0;

        return hidden && count > ${asJson(beforeCount)};
      })()`,
      '添加签名超时',
      15000
    );
  }

  async processBatchQueue(timeout = 60000, scan = false) {
    await this.click(scan ? 'processBatchScan' : 'processBatch');
    await this.waitFor(
      `(() => {
        const items = Array.from(document.querySelectorAll('.batch-file-item'));
        if (items.length === 0) {
          return false;
        }

        const hasPending = items.some((item) =>
          item.className.includes('batch-file-status-pending')
        );
        const hasProcessing = items.some((item) =>
          item.className.includes('batch-file-status-processing')
        );
        const loadingVisible = Boolean(
          document.getElementById('loading-overlay')?.classList.contains('loading-show')
        );

        return !hasPending && !hasProcessing && !loadingVisible;
      })()`,
      '批量处理超时',
      timeout,
      250
    );
  }

  async captureScreenshot(outputPath) {
    const screenshot = await this.client.send('Page.captureScreenshot', {
      format: 'png',
    });
    fs.writeFileSync(
      path.resolve(outputPath),
      Buffer.from(screenshot.data, 'base64')
    );
  }

  async snapshotState() {
    return this.evaluate(`(() => {
      const state = window.AppState?.getState?.();
      const currentCanvas = state?.fabricCanvases?.[state.currentActivePage - 1];
      const currentObjects = currentCanvas
        ? currentCanvas
            .getObjects()
            .filter((item) => !item.isBackgroundImage && !item.excludeFromExport)
        : [];
      const batchItems = Array.from(document.querySelectorAll('.batch-file-item')).map(
        (item) => ({
          name: item.querySelector('.batch-file-name')?.textContent?.trim() || '',
          status: item.querySelector('.batch-file-status')?.textContent?.trim() || '',
        })
      );
      const toasts = Array.from(document.querySelectorAll('#toast-container .toast-message'));
      const textOf = (selector) => document.querySelector(selector)?.textContent?.trim() || '';
      const signatureModal = document.getElementById('signature-modal');

      return {
        appClass: document.getElementById('app')?.className || '',
        currentTab: document.querySelector('.tab-btn.active')?.dataset.tab || '',
        exportMode: document.querySelector('.export-mode-btn.active')?.dataset.exportMode || '',
        visibleExportPanel: document.querySelector('.export-mode-panel:not([hidden])')?.dataset.exportModePanel || '',
        sidebarCollapsed: document.getElementById('app')?.classList.contains('sidebar-collapsed') || false,
        pdfLoaded: Boolean(state?.currentPdfFile),
        fileName: state?.currentPdfFile?.name || '',
        sourceKind: state?.currentSourceKind || '',
        page: state ? String(state.currentActivePage) + '/' + String(state.totalPages) : '',
        objectCount: currentObjects.length,
        activeObjectLocked: Boolean(currentCanvas?.getActiveObject?.()?.isLocked),
        sealReady: Boolean(state?.sealImageElement?.src && state?.sealImageElement?.naturalWidth > 0),
        batchQueueCount: batchItems.length,
        batchQueueLabel: textOf('#batch-file-count'),
        batchItems,
        selectionText: textOf('#edit-selection-chip'),
        guidelineText: textOf('#edit-guideline-chip'),
        collapsedSummary: textOf('#collapsed-sidebar-primary'),
        editStatusFile: textOf('#edit-status-file'),
        editStatusSummary: textOf('#edit-status-summary'),
        exportStatusFile: textOf('#export-status-file'),
        exportStatusSummary: textOf('#export-status-summary'),
        exportStatusNote: textOf('#export-status-note'),
        exportImageVisible: !document.getElementById('exportImage')?.hidden,
        exportHint: textOf('#export-hint'),
        signatureModalOpen: Boolean(signatureModal && !signatureModal.classList.contains('hidden')),
        settingsOpen: Boolean(document.getElementById('settings-modal')),
        helpOpen: Boolean(document.getElementById('shortcut-help-modal')),
        loadingVisible: Boolean(
          document.getElementById('loading-overlay')?.classList.contains('loading-show')
        ),
        lastToast: toasts.at(-1)?.textContent?.trim() || '',
      };
    })()`);
  }

  async prepare({
    pdf,
    seal,
    addSeal = false,
    addSignatureDemo = false,
    batchPdfs = [],
    processBatch = false,
    processBatchScan = false,
    tab = '',
    exportMode = '',
    collapseSidebar = false,
    modal = '',
  } = {}) {
    if (pdf) {
      await this.loadPdf(pdf);
    }

    if (seal === 'demo') {
      await this.loadDemoSeal();
    } else if (seal) {
      await this.loadSeal(seal);
    }

    if (addSeal) {
      await this.addNormalSeal();
    }

    if (addSignatureDemo) {
      await this.addDemoSignature();
    }

    if (tab) {
      await this.switchTab(tab);
    }

    if (exportMode) {
      await this.switchExportMode(exportMode);
    }

    if (batchPdfs.length > 0) {
      await this.loadBatchPdfs(batchPdfs);
    }

    if (processBatch || processBatchScan) {
      await this.processBatchQueue(60000, processBatchScan);
    }

    if (collapseSidebar) {
      await this.collapseSidebar();
    }

    if (modal === 'settings') {
      await this.openSettings();
    }

    if (modal === 'help') {
      await this.openHelp();
    }
  }

  async runSmoke({ pdf, seal = 'demo' } = {}) {
    const steps = [];

    const record = (step, ok, detail = '') => {
      steps.push({ step, ok, detail });
      if (!ok) {
        throw new Error(detail || step);
      }
    };

    record('app-ready', true, '应用已加载');

    await this.loadPdf(pdf);
    const afterPdf = await this.snapshotState();
    record('load-pdf', afterPdf.pdfLoaded, afterPdf.fileName || 'PDF 没有加载');

    if (seal === 'demo') {
      await this.loadDemoSeal();
    } else {
      await this.loadSeal(seal);
    }

    const afterSealReady = await this.snapshotState();
    record(
      'load-seal',
      afterSealReady.sealReady,
      afterSealReady.sealReady ? '印章素材已就绪' : '印章素材没有就绪'
    );

    await this.addNormalSeal();
    const afterSeal = await this.snapshotState();
    record(
      'add-seal',
      afterSeal.objectCount > 0,
      afterSeal.objectCount > 0
        ? `当前页对象 ${afterSeal.objectCount} 个`
        : '当前页没有可导出的印章对象'
    );

    await this.switchTab('export');
    const afterExport = await this.snapshotState();
    record(
      'switch-export',
      afterExport.currentTab === 'export',
      afterExport.currentTab === 'export' ? '已切到导出页' : '没有切到导出页'
    );
    record(
      'export-hint',
      Boolean(afterExport.exportHint),
      afterExport.exportHint || '导出提示为空'
    );

    return {
      ok: true,
      steps,
      snapshot: afterExport,
    };
  }

  /**
   * 载入 scan-check 的三页墨量差异化夹具, 只翻到第 1 页(其余页保持未访问)
   */
  async loadScanCheckFixture() {
    await this.evaluate(SCAN_CHECK_FIXTURE_SCRIPT);
    await this.waitFor(
      `(() => {
        const state = window.AppState?.getState?.();
        return Boolean(
          state &&
          state.currentPdfFile &&
          state.totalPages === 3 &&
          state.fabricCanvases?.[0]
        );
      })()`,
      'scan-check 夹具加载超时',
      35000
    );
  }

  /**
   * 扫描件导出回归检查: 未访问页内容丢失(纯白页)、页号映射、上下方向、三档元数据。
   * 不抛出首个失败, 收齐全部结论再返回, 便于一眼看出是哪一页坏了。
   * @returns {Promise<object>}
   */
  async runScanCheck() {
    const checks = [];

    const record = (check, ok, detail) => {
      checks.push({ check, ok, detail });
    };

    await this.loadScanCheckFixture();

    const result = await this.evaluate(SCAN_CHECK_EXPORT_SCRIPT);
    const { before = [], after = [], pageCount, pages = [] } = result;

    record(
      'fixture-pages',
      pageCount === 3,
      `导出结果 ${pageCount} 页，期望 3 页`
    );

    // 前提校验: 第 2、3 页必须处于未访问状态, 否则测的不是"未访问页"这个场景
    const unvisited = before[1] === false && before[2] === false;
    record(
      'pages-unvisited',
      unvisited,
      `导出前画布状态 [${before.map((item) => (item ? 'canvas' : 'null')).join(', ')}]，期望第 2、3 页为 null`
    );

    record(
      'temporary-canvases-released',
      after[0] === true && after[1] === false && after[2] === false,
      `导出后画布状态 [${after.map((item) => (item ? 'canvas' : 'null')).join(', ')}]，期望只保留用户已访问的第 1 页`
    );

    pages.forEach((page) => {
      record(
        `page-${page.page}-not-blank`,
        page.mean < SCAN_CHECK_BLANK_MEAN,
        `第 ${page.page} 页平均灰度 ${page.mean}，阈值 < ${SCAN_CHECK_BLANK_MEAN}`
      );
    });

    // 墨量必须与各页应有内容相符, 否则"三页都渲染第 1 页"也会蒙混过关
    const [first, second, third] = pages;
    if (first && second) {
      record(
        'ink-order-page1-brighter-than-page2',
        first.mean - second.mean > SCAN_CHECK_PAGE_GAP,
        `第 1 页 ${first.mean} 应比第 2 页 ${second.mean} 亮 ${SCAN_CHECK_PAGE_GAP} 以上，实际差 ${Number((first.mean - second.mean).toFixed(1))}`
      );
    }

    if (second && third) {
      record(
        'ink-order-page2-brighter-than-page3',
        second.mean - third.mean > SCAN_CHECK_PAGE_GAP,
        `第 2 页 ${second.mean} 应比第 3 页 ${third.mean} 亮 ${SCAN_CHECK_PAGE_GAP} 以上，实际差 ${Number((second.mean - third.mean).toFixed(1))}`
      );
    }

    if (second) {
      record(
        'page2-orientation',
        second.topMean - second.bottomMean > SCAN_CHECK_HALF_GAP,
        `第 2 页上半 ${second.topMean} 应比下半 ${second.bottomMean} 亮 ${SCAN_CHECK_HALF_GAP} 以上，实际差 ${Number((second.topMean - second.bottomMean).toFixed(1))}`
      );
    }

    const metadata = await this.evaluate(SCAN_CHECK_METADATA_SCRIPT);

    metadata.forEach((item) => {
      const signature = `${item.producer} ${item.creator}`.toLowerCase();
      record(
        `metadata-${item.name}-no-pdf-lib`,
        !signature.includes('pdf-lib'),
        `Producer="${item.producer}" Creator="${item.creator}"`
      );
    });

    const disabled = metadata.find((item) => item.name === 'disabled');
    if (disabled) {
      record(
        'metadata-disabled-empty',
        !disabled.producer && !disabled.creator && !disabled.title,
        `关闭元数据时应全部缺失，实际 Producer="${disabled.producer}" Creator="${disabled.creator}" Title="${disabled.title}"`
      );
    }

    const plain = metadata.find((item) => item.name === 'enabled-plain');
    if (plain) {
      record(
        'metadata-plain-written',
        plain.title === '扫描件校验' && plain.author === '印迹',
        `Title="${plain.title}" Author="${plain.author}"`
      );
    }

    const processor = metadata.find((item) => item.name === 'enabled-processor');
    if (processor) {
      record(
        'metadata-truthful-processor',
        processor.creator === APP_CREATOR &&
          processor.producer === APP_PRODUCER,
        `Producer="${processor.producer}" Creator="${processor.creator}"`
      );
    }

    const cancellation = await this.evaluate(SCAN_CHECK_CANCEL_SCRIPT);
    record(
      'scan-export-cancellable',
      cancellation.cancelled === true,
      `预先取消的导出应抛出 AbortError，实际 ${cancellation.name || '未抛错'}`
    );

    const standalone = await this.evaluate(SCAN_CHECK_STANDALONE_SCRIPT);
    record(
      'standalone-batch-scan-pipeline',
      standalone.pageCount === 3 &&
        standalone.title === '批量扫描校验' &&
        standalone.producer === APP_PRODUCER,
      `页数=${standalone.pageCount} Title="${standalone.title}" Producer="${standalone.producer}"`
    );

    const failures = checks.filter((item) => !item.ok);

    return {
      ok: failures.length === 0,
      pages,
      canvasesBeforeExport: before.map((item) => (item ? 'canvas' : 'null')),
      canvasesAfterExport: after.map((item) => (item ? 'canvas' : 'null')),
      metadata,
      checks,
      failures: failures.map((item) => `${item.check}: ${item.detail}`),
    };
  }
}
