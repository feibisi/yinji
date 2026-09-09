import { getCurrentPageCanvas } from './canvas-manager.js';
import { getCurrentActivePage } from './canvas-manager.js';
import { loadFabricImage } from '../utils/fabric-helpers.js';

/**
 * 对象剪贴板模块
 * 负责印章/签名对象的复制/粘贴/序列化/反序列化
 */

// 内存剪贴板
const _clipboard = {
  objects: [],
  sourcePage: null,
};



/**
 * 序列化 fabric 对象为纯 JSON（不含引用）
 * @param {fabric.Object} obj
 * @returns {Object}
 */
function _serializeObject(obj) {
  const json = obj.toObject([
    'type',
    'left',
    'top',
    'width',
    'height',
    'scaleX',
    'scaleY',
    'angle',
    'opacity',
    'flipX',
    'flipY',
    'originX',
    'originY',
    'straddleGroup',
    'isLocked',
    'src',
  ]);

  if (!json.src) {
    json.src =
      typeof obj.getSrc === 'function' ? obj.getSrc() : obj.src || null;
  }

  return json;
}

/**
 * 从 JSON 反序列化为 fabric 对象
 * @param {Object} json
 * @param {fabric.Canvas} canvas
 * @returns {Promise<fabric.Object|null>}
 */
async function _deserializeObject(json) {
  if (json.type === 'image' || json.src) {
    try {
      const img = await loadFabricImage(json.src);
      if (!img) return null;

      // Apply serialized properties that fabric doesn't auto-restore
      // (image props are mostly auto-restored)
      img.set({
        left: json.left,
        top: json.top,
        scaleX: json.scaleX,
        scaleY: json.scaleY,
        angle: json.angle,
        opacity: json.opacity,
        originX: 'center',
        originY: 'center',
        cornerSize: 10,
        cornerStyle: 'circle',
        cornerColor: '#007bff',
        transparentCorners: false,
        borderColor: '#007bff',
        isLocked: json.isLocked || false,
      });
      if (json.flipX) img.set({ flipX: true });
      if (json.flipY) img.set({ flipY: true });
      return img;
    } catch (error) {
      console.error('粘贴对象反序列化失败:', error);
      return null;
    }
  }
  return null;
}

/**
 * 复制当前选中对象到剪贴板
 * @returns {boolean} 是否成功复制
 */
export function copySelected() {
  const canvas = getCurrentPageCanvas();
  if (!canvas) return false;

  const activeObject = canvas.getActiveObject();
  if (!activeObject) return false;

  // 不复制锁定的对象
  if (activeObject.isLocked) {
    window.Toast?.warning('锁定的印章不能复制。');
    return false;
  }

  if (activeObject.straddleGroup) {
    window.Toast?.warning('骑缝章不能整组复制，一个一个来。');
    return false;
  }

  _clipboard.objects = [activeObject];
  _clipboard.sourcePage = getCurrentActivePage();

  window.Toast?.success('已复制到剪贴板');
  return true;
}

/**
 * 粘贴剪贴板中的对象（偏移放置）
 * @returns {Promise<boolean>} 是否成功粘贴
 */
export async function pasteClipboard() {
  if (!_clipboard.objects.length) return false;

  const canvas = getCurrentPageCanvas();
  if (!canvas) return false;

  const serialized = _clipboard.objects.map((obj) => _serializeObject(obj));

  const entries = [];
  for (const json of serialized) {
    // Offset pasted objects slightly
    json.left = (json.left || 0) + 20;
    json.top = (json.top || 0) + 20;

    const newObj = await _deserializeObject(json);
    if (newObj) {
      entries.push({
        pageNum: getCurrentActivePage(),
        sealObject: newObj,
      });
    }
  }

  if (entries.length > 0) {
    const command = new window.History.AddSealsCommand(entries);
    window.History.executeCommand(command);
    window.Toast?.success('已粘贴');
    return true;
  }

  return false;
}

/**
 * 检查剪贴板是否有内容
 * @returns {boolean}
 */
export function hasClipboard() {
  return _clipboard.objects.length > 0;
}

