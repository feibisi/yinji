import { getCurrentPageCanvas } from './canvas-manager.js';

/**
 * 对齐辅助线模块
 * 拖拽对象时显示水平/垂直对齐参考线（中心线、边缘线、其他对象对齐线）
 */

// ==================== 配置 ====================

const CONFIG = {
  SNAP_THRESHOLD: 5,      // px, 自动吸附容差
  GUIDE_COLOR: '#007bff',
  GUIDE_WIDTH: 1,
  GUIDE_DASH: [5, 5],
};

// ==================== 状态 ====================

let _guides = [];         // 当前画布上的辅助线对象
let _guideObjects = [];   // 对齐用参考对象集合
let _enabled = true;

// ==================== 模块初始化/销毁 ====================

/**
 * 在指定 canvas 上激活对齐辅助线监听
 * @param {fabric.Canvas} canvas
 */
export function initOn(canvas) {
  if (!canvas) return;
  canvas.on('object:moving', _onObjectMoving);
  canvas.on('object:scaling', _onObjectScaling);
  canvas.on('selection:created', _updateGuideObjects);
  canvas.on('selection:updated', _updateGuideObjects);
  canvas.on('selection:cleared', _updateGuideObjects);
  canvas.on('mouse:up', () => _clearGuides());
}

/**
 * 移除对齐辅助线监听
 * @param {fabric.Canvas} canvas
 */
export function destroyOn(canvas) {
  if (!canvas) return;
  canvas.off('object:moving', _onObjectMoving);
  canvas.off('object:scaling', _onObjectScaling);
  canvas.off('selection:created', _updateGuideObjects);
  canvas.off('selection:updated', _updateGuideObjects);
  canvas.off('selection:cleared', _updateGuideObjects);
  canvas.off('mouse:up', _clearGuides);
}

/**
 * 启用/禁用对齐辅助线
 */
export function setEnabled(val) {
  _enabled = val;
  if (!val) _clearGuides();
}

export function isEnabled() {
  return _enabled;
}

// ==================== 内部逻辑 ====================

function _onObjectMoving(e) {
  if (!_enabled) return;
  _snapAndShowGuides(e);
}

function _onObjectScaling() {
  if (!_enabled) return;
  // 缩放时不做吸附，但清除旧辅助线
  _clearGuides();
}

function _updateGuideObjects() {
  const canvas = getCurrentPageCanvas();
  if (!canvas) return;
  _guideObjects = canvas.getObjects().filter((obj) => !obj.isLocked);
}

function _snapAndShowGuides(e) {
  const canvas = getCurrentPageCanvas();
  const target = e.target;
  if (!canvas || !target) return;

  const threshold = CONFIG.SNAP_THRESHOLD / (canvas.getZoom() || 1);
  const guides = [];
  const objBounds = _getObjectBounds(target);

  // --- 画布中心 / 边缘 ---
  const canvasCenterX = canvas.getWidth() / 2 / canvas.getZoom();
  const canvasCenterY = canvas.getHeight() / 2 / canvas.getZoom();
  const canvasLeft = 0;
  const canvasTop = 0;
  const canvasRight = canvas.getWidth() / canvas.getZoom();
  const canvasBottom = canvas.getHeight() / canvas.getZoom();

  // 水平中心对齐
  if (Math.abs(objBounds.centerX - canvasCenterX) < threshold) {
    target.set({ left: canvasCenterX - (target.width * target.scaleX) / 2 });
    guides.push({ type: 'V', x: canvasCenterX });
  }
  // 垂直中心对齐
  if (Math.abs(objBounds.centerY - canvasCenterY) < threshold) {
    target.set({ top: canvasCenterY - (target.height * target.scaleY) / 2 });
    guides.push({ type: 'H', y: canvasCenterY });
  }
  // 左边缘
  if (Math.abs(objBounds.left - canvasLeft) < threshold) {
    target.set({ left: 0 });
    guides.push({ type: 'V', x: 0 });
  }
  // 上边缘
  if (Math.abs(objBounds.top - canvasTop) < threshold) {
    target.set({ top: 0 });
    guides.push({ type: 'H', y: 0 });
  }
  // 右边缘
  if (Math.abs(objBounds.right - canvasRight) < threshold) {
    target.set({ left: canvasRight - target.width * target.scaleX });
    guides.push({ type: 'V', x: canvasRight });
  }
  // 下边缘
  if (Math.abs(objBounds.bottom - canvasBottom) < threshold) {
    target.set({ top: canvasBottom - target.height * target.scaleY });
    guides.push({ type: 'H', y: canvasBottom });
  }

  // --- 对象间对齐（中心对中心、边缘对边缘）---
  for (const other of _guideObjects) {
    if (other === target) continue;
    const otherBounds = _getObjectBounds(other);

    // 水平中心对齐
    if (Math.abs(objBounds.centerX - otherBounds.centerX) < threshold) {
      target.set({ left: otherBounds.centerX - (target.width * target.scaleX) / 2 });
      guides.push({ type: 'V', x: otherBounds.centerX });
    }
    // 垂直中心对齐
    if (Math.abs(objBounds.centerY - otherBounds.centerY) < threshold) {
      target.set({ top: otherBounds.centerY - (target.height * target.scaleY) / 2 });
      guides.push({ type: 'H', y: otherBounds.centerY });
    }
    // 左边缘对齐
    if (Math.abs(objBounds.left - otherBounds.left) < threshold) {
      target.set({ left: otherBounds.left });
      guides.push({ type: 'V', x: otherBounds.left });
    }
    // 右边缘对齐
    if (Math.abs(objBounds.right - otherBounds.right) < threshold) {
      target.set({ left: otherBounds.right - target.width * target.scaleX });
      guides.push({ type: 'V', x: otherBounds.right });
    }
    // 上边缘对齐
    if (Math.abs(objBounds.top - otherBounds.top) < threshold) {
      target.set({ top: otherBounds.top });
      guides.push({ type: 'H', y: otherBounds.top });
    }
    // 下边缘对齐
    if (Math.abs(objBounds.bottom - otherBounds.bottom) < threshold) {
      target.set({ top: otherBounds.bottom - target.height * target.scaleY });
      guides.push({ type: 'H', y: otherBounds.bottom });
    }
  }

  _clearGuides();
  _drawGuides(guides, canvas);
}

function _getObjectBounds(obj) {
  const w = obj.width * obj.scaleX;
  const h = obj.height * obj.scaleY;
  return {
    left: obj.left,
    top: obj.top,
    right: obj.left + w,
    bottom: obj.top + h,
    centerX: obj.left + w / 2,
    centerY: obj.top + h / 2,
  };
}

function _clearGuides() {
  _guides.forEach((guide) => {
    if (guide.canvas) {
      guide.canvas.remove(guide);
    }
  });
  _guides = [];
}

function _drawGuides(guides, canvas) {
  if (guides.length === 0) return;

  const zoom = canvas.getZoom();
  for (const guide of guides) {
    let line;
    if (guide.type === 'V') {
      line = new fabric.Line(
        [guide.x * zoom, -10 * zoom, guide.x * zoom, canvas.getHeight() + 10 * zoom],
        {
          stroke: CONFIG.GUIDE_COLOR,
          strokeWidth: CONFIG.GUIDE_WIDTH,
          strokeDashArray: CONFIG.GUIDE_DASH,
          selectable: false,
          evented: false,
          excludeFromExport: true,
          perPixelTargetFind: false,
        }
      );
    } else {
      line = new fabric.Line(
        [-10 * zoom, guide.y * zoom, canvas.getWidth() + 10 * zoom, guide.y * zoom],
        {
          stroke: CONFIG.GUIDE_COLOR,
          strokeWidth: CONFIG.GUIDE_WIDTH,
          strokeDashArray: CONFIG.GUIDE_DASH,
          selectable: false,
          evented: false,
          excludeFromExport: true,
          perPixelTargetFind: false,
        }
      );
    }
    canvas.add(line);
    _guides.push(line);
  }
  if (guides.length > 0) canvas.requestRenderAll();
}
