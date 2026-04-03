/**
 * 虚拟滚动缩略图模块
 * 只渲染可见区域内的缩略图，优化大文件性能
 */

import { getState, setState } from '../core/state.js';
import { togglePageSelection, selectPageRange } from './batch-operations.js';

const SCROLL_BUFFER = 2; // 额外渲染前后各 2 页
const THUMBNAIL_HEIGHT = 120; // 缩略图高度（含间距）
const THUMBNAIL_WIDTH = 85; // 缩略图宽度

let virtualScrollerState = null;

/**
 * 初始化虚拟滚动
 * @param {HTMLElement} container - 缩略图容器
 * @returns {Object} 虚拟滚动状态
 */
export function initVirtualScroller(container) {
  if (!container) return null;

  virtualScrollerState = {
    container,
    visibleRange: { start: 1, end: 10 },
    renderedPages: new Set(),
    pageHeights: new Array(getState().totalPages || 0).fill(THUMBNAIL_HEIGHT),
  };

  // 滚动监听
  container.addEventListener('scroll', () => {
    requestAnimationFrame(() => updateVisibleRange(virtualScrollerState));
  }, { passive: true });

  // 窗口大小变化
  window.addEventListener('resize', () => {
    requestAnimationFrame(() => updateVisibleRange(virtualScrollerState));
  });

  // 初次渲染
  setTimeout(() => updateVisibleRange(virtualScrollerState), 100);

  return virtualScrollerState;
}

/**
 * 更新可见范围
 * @param {Object} state - 虚拟滚动状态
 */
function updateVisibleRange(state) {
  const { container } = state;
  const scrollTop = container.scrollTop;
  const viewportHeight = container.clientHeight;
  const totalPages = getState().totalPages;

  if (!totalPages) return;

  // 计算可见的页面范围
  let accumulatedHeight = 0;
  let startIndex = 1;
  let endIndex = totalPages;

  for (let i = 1; i <= totalPages; i++) {
    const pageHeight = state.pageHeights[i - 1] || THUMBNAIL_HEIGHT;

    if (accumulatedHeight + pageHeight < scrollTop) {
      accumulatedHeight += pageHeight;
      continue;
    }

    if (startIndex === 1 && accumulatedHeight >= scrollTop - THUMBNAIL_HEIGHT * SCROLL_BUFFER) {
      startIndex = i;
    }

    accumulatedHeight += pageHeight;

    if (accumulatedHeight >= scrollTop + viewportHeight + THUMBNAIL_HEIGHT * SCROLL_BUFFER) {
      endIndex = Math.min(i + SCROLL_BUFFER, totalPages);
      break;
    }

    endIndex = i;
  }

  // 限制范围
  startIndex = Math.max(1, startIndex - SCROLL_BUFFER);
  endIndex = Math.min(totalPages, endIndex + SCROLL_BUFFER);

  state.visibleRange = { start: startIndex, end: endIndex };

  // 更新渲染
  renderVisibleThumbnails(state);
}

/**
 * 渲染可见的缩略图
 * @param {Object} state - 虚拟滚动状态
 */
function renderVisibleThumbnails(state) {
  const { container, visibleRange, renderedPages } = state;
  const totalPages = getState().totalPages;

  if (!totalPages) return;

  // 找到或创建 items 容器
  let itemsContainer = container.querySelector('.virtual-thumbnail-items');
  if (!itemsContainer) {
    itemsContainer = document.createElement('div');
    itemsContainer.className = 'virtual-thumbnail-items';
    itemsContainer.style.position = 'relative';
    itemsContainer.style.width = '100%';

    // 清空旧内容（保留空状态提示）
    Array.from(container.children).forEach(child => {
      if (!child.classList.contains('empty-state')) {
        child.remove();
      }
    });

    container.appendChild(itemsContainer);
  }

  // 计算每页的偏移量
  const offsets = [];
  let offsetSum = 0;
  for (let i = 1; i <= totalPages; i++) {
    offsets[i - 1] = offsetSum;
    offsetSum += state.pageHeights[i - 1];
  }

  // 设置总高度
  itemsContainer.style.height = `${offsetSum}px`;

  // 移除不可见的缩略图
  renderedPages.forEach(pageNum => {
    if (pageNum < visibleRange.start || pageNum > visibleRange.end) {
      const thumb = itemsContainer.querySelector(`[data-page-number="${pageNum}"]`);
      if (thumb) {
        thumb.remove();
        renderedPages.delete(pageNum);
      }
    }
  });

  // 渲染可见的缩略图
  for (let pageNum = visibleRange.start; pageNum <= visibleRange.end; pageNum++) {
    if (renderedPages.has(pageNum)) continue;

    const thumb = createThumbnailElement(pageNum);
    const offsetY = offsets[pageNum - 1];

    thumb.style.position = 'absolute';
    thumb.style.top = `${offsetY}px`;
    thumb.style.left = '0';
    thumb.style.width = '100%';

    itemsContainer.appendChild(thumb);
    renderedPages.add(pageNum);

    // 异步加载缩略图
    loadThumbnailImage(pageNum, thumb, state);
  }
}

/**
 * 创建缩略图元素
 * @param {number} pageNum - 页面编号
 * @returns {HTMLElement}
 */
function createThumbnailElement(pageNum) {
  const div = document.createElement('div');
  div.className = 'thumbnail-item';
  div.dataset.pageNumber = pageNum;

  const canvas = document.createElement('canvas');
  canvas.className = 'thumbnail-canvas';
  canvas.width = THUMBNAIL_WIDTH;
  canvas.height = THUMBNAIL_HEIGHT;

  const label = document.createElement('p');
  label.textContent = `${pageNum}`;

  div.appendChild(canvas);
  div.appendChild(label);

  // 点击事件
  div.addEventListener('click', (e) => {
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+Click: 批量选择
      e.preventDefault();
      togglePageSelection(pageNum);
    } else if (e.shiftKey) {
      // Shift+Click: 范围选择
      e.preventDefault();
      selectPageRange(pageNum);
    } else {
      // 普通点击：切换页面
      if (window.showPage) {
        window.showPage(pageNum);
      }
    }
  });

  return div;
}

/**
 * 异步加载缩略图
 * @param {number} pageNum - 页面编号
 * @param {HTMLElement} thumb - 缩略图元素
 * @param {Object} state - 虚拟滚动状态
 */
async function loadThumbnailImage(pageNum, thumb, state) {
  try {
    const pdfDoc = getState().pdfDoc;
    if (!pdfDoc) return;

    const canvas = thumb.querySelector('canvas');
    if (!canvas) return;

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 0.2 });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: canvas.getContext('2d'),
      viewport: viewport,
    }).promise;

    // 缓存高度
    state.pageHeights[pageNum - 1] = viewport.height + 20; // 含间距

    // 更新位置（因为高度可能变化）
    renderVisibleThumbnails(state);

    // 触发选中状态更新
    const selectedPages = getState().selectedPages;
    if (selectedPages.has(pageNum)) {
      thumb.classList.add('selected');
    }

    page.cleanup();

  } catch (error) {
    console.error(`加载缩略图 ${pageNum} 失败:`, error);
  }
}

/**
 * 刷新虚拟滚动（当 PDF 加载完成后调用）
 */
export function refreshVirtualScroller() {
  if (!virtualScrollerState) return;

  const totalPages = getState().totalPages;
  if (!totalPages) return;

  // 重置页面高度数组
  virtualScrollerState.pageHeights = new Array(totalPages).fill(THUMBNAIL_HEIGHT);
  virtualScrollerState.renderedPages.clear();

  // 强制重新渲染
  const itemsContainer = virtualScrollerState.container.querySelector('.virtual-thumbnail-items');
  if (itemsContainer) {
    itemsContainer.remove();
  }

  updateVisibleRange(virtualScrollerState);
}

/**
 * 清理虚拟滚动资源
 */
export function cleanupVirtualScroller() {
  if (virtualScrollerState && virtualScrollerState.container) {
    const itemsContainer = virtualScrollerState.container.querySelector('.virtual-thumbnail-items');
    if (itemsContainer) {
      itemsContainer.remove();
    }
    virtualScrollerState = null;
  }
}

/**
 * 获取当前虚拟滚动状态
 * @returns {Object|null}
 */
export function getVirtualScrollerState() {
  return virtualScrollerState;
}
