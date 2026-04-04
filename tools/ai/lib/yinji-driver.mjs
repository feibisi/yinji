import fs from 'node:fs';
import path from 'node:path';

import { createBrowserSession, sleep } from './cdp-client.mjs';

const DEFAULT_APP_URL = 'http://127.0.0.1:8123/index.html';

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
    await this.setInputFiles('#pdfInput', [filePath]);
    await this.waitFor(
      `(() => {
        const state = window.AppState?.getState?.();
        return Boolean(
          state &&
          state.currentPdfFile &&
          state.currentSourceKind &&
          state.totalPages > 0 &&
          !document.getElementById('app')?.classList.contains('no-pdf-loaded')
        );
      })()`,
      '文件加载超时',
      35000
    );
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

  async processBatchQueue(timeout = 60000) {
    await this.click('processBatch');
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
    tab = '',
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

    if (batchPdfs.length > 0) {
      await this.loadBatchPdfs(batchPdfs);
    }

    if (processBatch) {
      await this.processBatchQueue();
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
}
