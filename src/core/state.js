/**
 * 全局状态管理
 * 使用单例模式统一管理应用运行时状态
 */

// ==================== State Definition ====================

const appState = {
  /** @type {PDFDocumentProxy|null} PDF文档对象 */
  pdfDoc: null,

  /** @type {Uint8Array|null} 原始PDF字节数据 */
  originalPdfBytes: null,

  /** @type {Uint8Array|null} 用户选择的原始文件字节（图片来源时不同于内部 PDF） */
  originalSourceBytes: null,

  /** @type {File|null} 当前 PDF 文件 */
  currentPdfFile: null,

  /** @type {'pdf'|'image'|null} 当前文件来源类型 */
  currentSourceKind: null,

  /** @type {fabric.Canvas[]} Fabric画布数组，每个页面一个 */
  fabricCanvases: [],

  /** @type {HTMLImageElement|null} 印章图片元素 */
  sealImageElement: null,

  /** @type {string} 未经破坏性处理的原始印章图片 */
  sealOriginalImageSrc: '',

  /** @type {boolean} 选择图片后是否自动去除边缘白底 */
  autoRemoveSealBackground: true,

  /** @type {number} 当前活动页面编号 */
  currentActivePage: 1,

  /** @type {number} PDF总页数 */
  totalPages: 0,

  /** @type {number[]} 页面适配缩放比例缓存 */
  pageFitScales: [],

  /** @type {number} 全局缩放倍数 */
  globalZoomMultiplier: 1.0,

  /** @type {number} 印章旋转角度（度） */
  sealRotation: 0,

  /** @type {number} 印章亮度（0-200，100为正常） */
  sealBrightness: 100,

  /** @type {Set<number>} 批量操作：选中的页面编号集合 */
  selectedPages: new Set(),

  /** @type {boolean} 是否处于批量选择模式 */
  isMultiSelectMode: false,

  /** @type {number} 批量选择时的范围锚点页 */
  selectionAnchorPage: 1,
};

const stateListeners = new Set();

// ==================== State Functions ====================

/**
 * 获取当前状态
 * @returns {Object} 当前状态对象
 */
function getState() {
  return appState;
}

/**
 * 更新状态
 * @param {Object} updates - 要更新的状态片段
 * @returns {Object} 更新后的状态对象
 */
function setState(updates) {
  const previousState = { ...appState };
  Object.assign(appState, updates);

  stateListeners.forEach((listener) => {
    listener(appState, previousState, updates);
  });

  return appState;
}

/**
 * 订阅状态变化
 * @param {Function} listener - 状态变化回调
 * @returns {Function} 取消订阅函数
 */
function subscribe(listener) {
  stateListeners.add(listener);

  return () => {
    stateListeners.delete(listener);
  };
}

// ==================== Exports ====================

export { getState, setState, subscribe };

// Keep window.AppState for backwards compatibility
window.AppState = {
  getState,
  setState,
  subscribe,
};
