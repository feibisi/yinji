import { getState } from '../core/state.js';
import {
  getCurrentActivePage,
  getCurrentPageCanvas,
  initializeFabricCanvasForPage,
} from '../modules/canvas-manager.js';

const signaturePad = {
  canvas: null,
  ctx: null,
  isDrawing: false,
  lastX: 0,
  lastY: 0,
  initialized: false,

  init() {
    if (this.initialized) return;

    this.canvas = document.getElementById('signature-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
    this.canvas.addEventListener('mousemove', this.draw.bind(this));
    this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
    this.canvas.addEventListener('mouseout', this.stopDrawing.bind(this));

    this.canvas.addEventListener(
      'touchstart',
      (event) => {
        event.preventDefault();
        const touch = event.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        this.startDrawing({
          offsetX: touch.clientX - rect.left,
          offsetY: touch.clientY - rect.top,
        });
      }
    );

    this.canvas.addEventListener(
      'touchmove',
      (event) => {
        event.preventDefault();
        const touch = event.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        this.draw({
          offsetX: touch.clientX - rect.left,
          offsetY: touch.clientY - rect.top,
        });
      }
    );

    this.canvas.addEventListener('touchend', this.stopDrawing.bind(this));

    this.initialized = true;
  },

  startDrawing(event) {
    this.isDrawing = true;
    [this.lastX, this.lastY] = [event.offsetX, event.offsetY];
  },

  draw(event) {
    if (!this.isDrawing) return;
    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
    this.ctx.lineTo(event.offsetX, event.offsetY);
    this.ctx.stroke();
    [this.lastX, this.lastY] = [event.offsetX, event.offsetY];
  },

  stopDrawing() {
    this.isDrawing = false;
  },

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  },

  isEmpty() {
    const pixelBuffer = new Uint32Array(
      this.ctx
        .getImageData(0, 0, this.canvas.width, this.canvas.height)
        .data.buffer
    );
    return !pixelBuffer.some((color) => color !== 0);
  },

  toDataURL() {
    return this.canvas.toDataURL('image/png');
  },
};

export async function openSignatureModal() {
  if (!getState().pdfDoc) {
    window.Toast.warning('先选文件，再打开手写签名。');
    return;
  }

  const currentPage = getCurrentActivePage();
  const canvas =
    getCurrentPageCanvas() ||
    (await initializeFabricCanvasForPage(currentPage));

  if (!canvas) {
    window.Toast.warning('当前页面还没准备好，稍等一下。');
    return;
  }

  const modal = document.getElementById('signature-modal');
  if (modal) {
    modal.classList.remove('hidden');
    signaturePad.init();
    signaturePad.clear();
  }
}

export function closeSignatureModal() {
  const modal = document.getElementById('signature-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

async function addSignatureToPage() {
  if (signaturePad.isEmpty()) {
    window.Toast.warning('签名还是空的，先写几笔吧。');
    return;
  }

  const signatureDataUrl = signaturePad.toDataURL();
  const currentPage = getCurrentActivePage();
  const canvas =
    getCurrentPageCanvas() ||
    (await initializeFabricCanvasForPage(currentPage));

  if (!canvas) {
    window.Toast.warning('当前页面还没准备好，稍等一下。');
    return;
  }

  try {
    const img = await fabric.Image.fromURL(signatureDataUrl);
    img.scaleToWidth(200);
    img.set({
      left: canvas.originalWidth / 2,
      top: canvas.originalHeight / 2,
      originX: 'center',
      originY: 'center',
      borderColor: '#007bff',
      cornerColor: '#007bff',
      cornerSize: 10,
      transparentCorners: false,
    });

    const command = new window.History.AddSealCommand(currentPage, img);
    window.History.executeCommand(command);

    canvas.setActiveObject(img);
    canvas.renderAll();

    closeSignatureModal();
    window.Toast.success(`手写签名已插入第 ${currentPage} 页。`);
  } catch (error) {
    console.error('添加签名失败:', error);
    window.Toast.error('签名没放上去，再试一次。');
  }
}

export function setupSignatureModal() {
  const closeSignatureBtn = document.querySelector('.modal-close');
  const clearSignatureBtn = document.getElementById('clear-signature-btn');
  const confirmSignatureBtn = document.getElementById('confirm-signature-btn');

  if (closeSignatureBtn) {
    closeSignatureBtn.addEventListener('click', closeSignatureModal);
  }
  if (clearSignatureBtn) {
    clearSignatureBtn.addEventListener('click', () => signaturePad.clear());
  }
  if (confirmSignatureBtn) {
    confirmSignatureBtn.addEventListener('click', addSignatureToPage);
  }
}
