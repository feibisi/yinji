/**
 * 虚拟滚动缩略图模块
 * PC 纵向：spacer 高度 + position:absolute
 * 窄屏横向：文档流 flex，只保留当前可见附近页
 */

import { getState } from '../core/state.js';
import { handleThumbnailInteraction } from './batch-operations.js';

const SCROLL_BUFFER = 2; // 纵向额外渲染前后各 2 页
const HORIZONTAL_WINDOW = 6; // 横向额外渲染前后各 6 页
const THUMBNAIL_HEIGHT = 120; // 纵向缩略图高度（含间距）
const THUMBNAIL_WIDTH = 85; // 缩略图宽度
const HORIZONTAL_ITEM_STRIDE = 88;
const HORIZONTAL_MEDIA_QUERY = '(max-width: 768px)';
const THUMBNAIL_SCALE_DESKTOP = 0.2;
const THUMBNAIL_SCALE_MOBILE = 0.13;

let virtualScrollerState = null;
let viewportChangeBound = false;
let mediaQueryList = null;
const pendingRenders = new Map();

/**
 * 当前是否为窄屏横向缩略图
 * @returns {boolean}
 */
function isHorizontalThumbnailMode() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(HORIZONTAL_MEDIA_QUERY).matches;
}

function getThumbnailScale() {
  return isHorizontalThumbnailMode() ? THUMBNAIL_SCALE_MOBILE : THUMBNAIL_SCALE_DESKTOP;
}

function isRenderCancelled(error) {
  const name = error?.name || '';
  const message = String(error?.message || '');
  return (
    name === 'RenderingCancelledException' ||
    name === 'AbortException' ||
    /cancel/i.test(message)
  );
}

/**
 * 取消未完成的 pdf.js 缩略图渲染，避免滚动排队
 * @param {number} [pageNum]
 */
export function abortThumbnailRenders(pageNum) {
  if (Number.isFinite(pageNum)) {
    const task = pendingRenders.get(pageNum);
    if (!task) return;
    try {
      task.cancel();
    } catch (error) {
      // 任务可能已结束
    }
    pendingRenders.delete(pageNum);
    return;
  }

  pendingRenders.forEach((task) => {
    try {
      task.cancel();
    } catch (error) {
      // 任务可能已结束
    }
  });
  pendingRenders.clear();
}

function onContainerScroll() {
  if (!virtualScrollerState) return;
  requestAnimationFrame(() => {
    if (virtualScrollerState) {
      updateVisibleRange(virtualScrollerState);
    }
  });
}

function onViewportChange() {
  requestAnimationFrame(() => {
    if (!virtualScrollerState) return;
    const horizontal = isHorizontalThumbnailMode();
    if (virtualScrollerState.horizontal !== horizontal) {
      refreshVirtualScroller();
      return;
    }
    updateVisibleRange(virtualScrollerState);
  });
}

function bindViewportListeners() {
  if (viewportChangeBound || typeof window === 'undefined') return;

  window.addEventListener('resize', onViewportChange);
  mediaQueryList = window.matchMedia(HORIZONTAL_MEDIA_QUERY);
  if (mediaQueryList.addEventListener) {
    mediaQueryList.addEventListener('change', onViewportChange);
  } else if (mediaQueryList.addListener) {
    mediaQueryList.addListener(onViewportChange);
  }
  viewportChangeBound = true;
}

/**
 * 初始化虚拟滚动
 * @param {HTMLElement} container - 缩略图容器
 * @returns {Object} 虚拟滚动状态
 */
export function initVirtualScroller(container) {
  if (!container) return null;

  if (virtualScrollerState?.container === container) {
    return virtualScrollerState;
  }

  virtualScrollerState = {
    container,
    visibleRange: { start: 1, end: 10 },
    renderedPages: new Set(),
    pageHeights: new Array(getState().totalPages || 0).fill(THUMBNAIL_HEIGHT),
    horizontal: isHorizontalThumbnailMode(),
    itemStride: HORIZONTAL_ITEM_STRIDE,
    generation: 0,
  };

  container.addEventListener('scroll', onContainerScroll, { passive: true });
  bindViewportListeners();

  setTimeout(() => {
    if (virtualScrollerState) {
      updateVisibleRange(virtualScrollerState);
    }
  }, 100);

  return virtualScrollerState;
}

/**
 * 更新可见范围
 * @param {Object} state - 虚拟滚动状态
 */
function updateVisibleRange(state) {
  const totalPages = getState().totalPages;
  if (!totalPages) return;

  state.horizontal = isHorizontalThumbnailMode();

  if (state.horizontal) {
    updateHorizontalVisibleRange(state, totalPages);
    return;
  }

  const { container } = state;
  const scrollTop = container.scrollTop;
  const viewportHeight = container.clientHeight;

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
  renderVisibleThumbnails(state);
}

function updateHorizontalVisibleRange(state, totalPages) {
  const stride = state.itemStride || HORIZONTAL_ITEM_STRIDE;
  const scrollLeft = state.container.scrollLeft || 0;
  const viewportWidth = state.container.clientWidth || 0;
  const firstVisible = Math.max(1, Math.floor(scrollLeft / stride) + 1);
  const visibleCount = Math.max(1, Math.ceil((viewportWidth || stride) / stride));
  const lastVisible = firstVisible + visibleCount - 1;

  const startIndex = Math.max(1, firstVisible - HORIZONTAL_WINDOW);
  const endIndex = Math.min(totalPages, lastVisible + HORIZONTAL_WINDOW);

  state.visibleRange = { start: startIndex, end: endIndex };
  renderVisibleThumbnails(state);
}

function applyItemsContainerLayout(itemsContainer, horizontal) {
  if (horizontal) {
    itemsContainer.style.position = 'static';
    itemsContainer.style.height = '';
    itemsContainer.style.width = 'auto';
    itemsContainer.style.display = 'flex';
    itemsContainer.style.flexDirection = 'row';
    itemsContainer.style.alignItems = 'stretch';
    itemsContainer.classList.add('is-horizontal');
    return;
  }

  itemsContainer.style.position = 'relative';
  itemsContainer.style.width = '100%';
  itemsContainer.style.display = '';
  itemsContainer.style.flexDirection = '';
  itemsContainer.style.alignItems = '';
  itemsContainer.classList.remove('is-horizontal');
}

function syncFlowSpacers(itemsContainer, state, totalPages) {
  const start = itemsContainer.querySelector('.virtual-thumbnail-spacer-start');
  const end = itemsContainer.querySelector('.virtual-thumbnail-spacer-end');

  if (!state.horizontal) {
    start?.remove();
    end?.remove();
    return;
  }

  const stride = state.itemStride || HORIZONTAL_ITEM_STRIDE;
  const { start: rangeStart, end: rangeEnd } = state.visibleRange;
  const startEl = start || document.createElement('div');
  const endEl = end || document.createElement('div');

  startEl.className = 'virtual-thumbnail-spacer-start';
  endEl.className = 'virtual-thumbnail-spacer-end';
  startEl.setAttribute('aria-hidden', 'true');
  endEl.setAttribute('aria-hidden', 'true');
  startEl.style.flex = `0 0 ${(rangeStart - 1) * stride}px`;
  endEl.style.flex = `0 0 ${Math.max(0, totalPages - rangeEnd) * stride}px`;

  if (!start) {
    itemsContainer.prepend(startEl);
  }
  if (!end) {
    itemsContainer.appendChild(endEl);
  } else if (endEl.nextSibling) {
    itemsContainer.appendChild(endEl);
  }
}

function layoutThumbnailItem(thumb, pageNum, state, offsets) {
  if (state.horizontal) {
    thumb.style.position = '';
    thumb.style.top = '';
    thumb.style.left = '';
    thumb.style.width = '';
    thumb.style.flex = '0 0 auto';
    return;
  }

  const offsetY = offsets[pageNum - 1] || 0;
  thumb.style.position = 'absolute';
  thumb.style.top = `${offsetY}px`;
  thumb.style.left = '0';
  thumb.style.width = '100%';
  thumb.style.flex = '';
}

function insertThumbnailInOrder(itemsContainer, thumb, pageNum) {
  const endSpacer = itemsContainer.querySelector('.virtual-thumbnail-spacer-end');
  const items = itemsContainer.querySelectorAll('.thumbnail-item');
  let next = null;

  items.forEach((el) => {
    if (!next && Number(el.dataset.pageNumber) > pageNum) {
      next = el;
    }
  });

  if (next) {
    itemsContainer.insertBefore(thumb, next);
  } else if (endSpacer) {
    itemsContainer.insertBefore(thumb, endSpacer);
  } else {
    itemsContainer.appendChild(thumb);
  }
}

function getVerticalOffsets(state, totalPages) {
  const offsets = [];
  let offsetSum = 0;
  for (let i = 1; i <= totalPages; i++) {
    offsets[i - 1] = offsetSum;
    offsetSum += state.pageHeights[i - 1];
  }
  return { offsets, offsetSum };
}

/**
 * 渲染可见的缩略图
 * @param {Object} state - 虚拟滚动状态
 */
function renderVisibleThumbnails(state) {
  const { container, visibleRange, renderedPages } = state;
  const totalPages = getState().totalPages;
  let shouldRerender = false;

  if (!totalPages) return;

  let itemsContainer = container.querySelector('.virtual-thumbnail-items');
  if (!itemsContainer) {
    itemsContainer = document.createElement('div');
    itemsContainer.className = 'virtual-thumbnail-items';

    Array.from(container.children).forEach((child) => {
      if (!child.classList.contains('empty-state')) {
        child.remove();
      }
    });

    container.appendChild(itemsContainer);
  }

  applyItemsContainerLayout(itemsContainer, state.horizontal);

  const emptyState = container.querySelector('.empty-state');
  if (emptyState) {
    emptyState.style.display = 'none';
  }

  const { offsets, offsetSum } = getVerticalOffsets(state, totalPages);

  if (state.horizontal) {
    itemsContainer.style.height = '';
  } else {
    itemsContainer.style.height = `${offsetSum}px`;
  }

  syncFlowSpacers(itemsContainer, state, totalPages);

  renderedPages.forEach((pageNum) => {
    if (pageNum < visibleRange.start || pageNum > visibleRange.end) {
      abortThumbnailRenders(pageNum);
      const thumb = itemsContainer.querySelector(`[data-page-number="${pageNum}"]`);
      if (thumb) {
        thumb.remove();
      }
      renderedPages.delete(pageNum);
    }
  });

  for (let pageNum = visibleRange.start; pageNum <= visibleRange.end; pageNum++) {
    if (renderedPages.has(pageNum)) {
      const existingThumb = itemsContainer.querySelector(
        `[data-page-number="${pageNum}"]`
      );
      if (existingThumb) {
        layoutThumbnailItem(existingThumb, pageNum, state, offsets);
        syncThumbnailVisualState(existingThumb, pageNum);
        if (state.horizontal) {
          shouldRerender =
            updateHorizontalStrideFromElement(existingThumb, state) || shouldRerender;
        } else {
          shouldRerender =
            updatePageHeightFromElement(pageNum, existingThumb, state) || shouldRerender;
        }
      }
      continue;
    }

    const thumb = createThumbnailElement(pageNum);
    layoutThumbnailItem(thumb, pageNum, state, offsets);
    insertThumbnailInOrder(itemsContainer, thumb, pageNum);
    renderedPages.add(pageNum);
    syncThumbnailVisualState(thumb, pageNum);

    if (state.horizontal) {
      shouldRerender =
        updateHorizontalStrideFromElement(thumb, state) || shouldRerender;
    } else {
      shouldRerender =
        updatePageHeightFromElement(pageNum, thumb, state) || shouldRerender;
    }

    loadThumbnailImage(pageNum, thumb, state);
  }

  if (shouldRerender) {
    requestAnimationFrame(() => renderVisibleThumbnails(state));
  }
}

function syncThumbnailVisualState(thumb, pageNum) {
  const selectedPages = getState().selectedPages;
  const currentPage = getState().currentActivePage;

  thumb.classList.toggle('selected', selectedPages.has(pageNum));
  thumb.classList.toggle('active', currentPage === pageNum);
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
  const horizontal = isHorizontalThumbnailMode();
  canvas.width = horizontal ? 72 : THUMBNAIL_WIDTH;
  canvas.height = horizontal ? 96 : THUMBNAIL_HEIGHT;

  const label = document.createElement('p');
  label.textContent = `${pageNum}`;

  div.appendChild(canvas);
  div.appendChild(label);

  div.addEventListener('click', (e) => {
    if (handleThumbnailInteraction(pageNum, e)) {
      return;
    }

    if (window.showPage) {
      e.stopPropagation();
      window.showPage(pageNum);
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
  const generation = state.generation;
  abortThumbnailRenders(pageNum);

  try {
    const pdfDoc = getState().pdfDoc;
    if (!pdfDoc) return;

    const canvas = thumb.querySelector('canvas');
    if (!canvas) return;

    const page = await pdfDoc.getPage(pageNum);
    if (
      !virtualScrollerState ||
      virtualScrollerState.generation !== generation ||
      !thumb.isConnected
    ) {
      return;
    }

    const viewport = page.getViewport({ scale: getThumbnailScale() });
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));

    const task = page.render({
      canvasContext: canvas.getContext('2d'),
      viewport,
    });
    pendingRenders.set(pageNum, task);

    try {
      await task.promise;
    } finally {
      if (pendingRenders.get(pageNum) === task) {
        pendingRenders.delete(pageNum);
      }
    }

    if (
      !virtualScrollerState ||
      virtualScrollerState.generation !== generation ||
      !thumb.isConnected
    ) {
      return;
    }

    if (state.horizontal) {
      if (updateHorizontalStrideFromElement(thumb, state)) {
        renderVisibleThumbnails(state);
      }
    } else if (updatePageHeightFromElement(pageNum, thumb, state)) {
      renderVisibleThumbnails(state);
    }

    syncThumbnailVisualState(thumb, pageNum);
    page.cleanup();
  } catch (error) {
    if (isRenderCancelled(error)) {
      return;
    }
    console.error(`加载缩略图 ${pageNum} 失败:`, error);
  }
}

function updatePageHeightFromElement(pageNum, thumb, state) {
  const nextHeight = measureThumbnailHeight(thumb);
  const currentHeight = state.pageHeights[pageNum - 1] || THUMBNAIL_HEIGHT;

  if (Math.abs(nextHeight - currentHeight) <= 1) {
    return false;
  }

  state.pageHeights[pageNum - 1] = nextHeight;
  return true;
}

function measureThumbnailHeight(thumb) {
  const rect = thumb.getBoundingClientRect();
  const styles = window.getComputedStyle(thumb);
  const marginBottom = parseFloat(styles.marginBottom) || 0;
  return Math.ceil(rect.height + marginBottom);
}

function updateHorizontalStrideFromElement(thumb, state) {
  const itemsContainer =
    state.container.querySelector('.virtual-thumbnail-items') || state.container;
  const styles = window.getComputedStyle(itemsContainer);
  const gap = parseFloat(styles.columnGap || styles.gap) || 0;
  const width = thumb.getBoundingClientRect().width;
  const stride = Math.ceil(width + gap);

  if (!stride) {
    return false;
  }

  if (Math.abs((state.itemStride || HORIZONTAL_ITEM_STRIDE) - stride) <= 1) {
    return false;
  }

  state.itemStride = stride;
  return true;
}

/**
 * 刷新虚拟滚动（当 PDF 加载完成后调用）
 */
export function refreshVirtualScroller() {
  if (!virtualScrollerState) return;

  const totalPages = getState().totalPages;
  if (!totalPages) return;

  abortThumbnailRenders();

  virtualScrollerState.generation += 1;
  virtualScrollerState.horizontal = isHorizontalThumbnailMode();
  virtualScrollerState.pageHeights = new Array(totalPages).fill(THUMBNAIL_HEIGHT);
  virtualScrollerState.itemStride = HORIZONTAL_ITEM_STRIDE;
  virtualScrollerState.renderedPages.clear();

  const itemsContainer = virtualScrollerState.container.querySelector(
    '.virtual-thumbnail-items'
  );
  if (itemsContainer) {
    itemsContainer.remove();
  }

  updateVisibleRange(virtualScrollerState);
}

/**
 * 当前页变化时，让横向条滚到该页附近
 * @param {number} pageNum
 */
export function syncVirtualScrollerToPage(pageNum) {
  if (!virtualScrollerState || !pageNum) return;

  const state = virtualScrollerState;
  if (isHorizontalThumbnailMode()) {
    const stride = state.itemStride || HORIZONTAL_ITEM_STRIDE;
    const container = state.container;
    const target =
      (pageNum - 1) * stride - (container.clientWidth - stride) / 2;
    container.scrollLeft = Math.max(0, target);
  }

  updateVisibleRange(state);
}

/**
 * 获取当前虚拟滚动状态
 * @returns {Object|null}
 */
export function getVirtualScrollerState() {
  return virtualScrollerState;
}
