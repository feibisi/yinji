import { getState, setState } from '../core/state.js';
import { handleThumbnailInteraction } from './batch-operations.js';

/**
 * PDF 加载与管理模块
 * 负责 PDF 文件的验证、加载、渲染和清理
 */

const INITIAL_RENDERED_THUMBNAILS = 3;
const THUMBNAIL_RENDER_BUFFER = 240;
let thumbnailRenderFrameId = null;
let activeLoadRequestId = 0;

function createStaleLoadError() {
  const error = new Error('PDF load request is stale');
  error.code = 'PDF_LOAD_STALE';
  return error;
}

function assertActiveLoad(requestId) {
  if (requestId !== activeLoadRequestId) {
    throw createStaleLoadError();
  }
}

function readFileAsBytes(file) {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();

    fileReader.onload = (event) => {
      resolve(new Uint8Array(event.target.result));
    };

    fileReader.onerror = () => {
      reject(new Error('文件读取失败，请重试。'));
    };

    fileReader.onabort = () => {
      reject(new Error('文件读取已取消。'));
    };

    fileReader.readAsArrayBuffer(file);
  });
}

function getSourceKind(file) {
  if (!file) {
    return null;
  }

  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')) {
    return 'pdf';
  }

  if (
    ['image/png', 'image/jpeg', 'image/jpg'].includes(file.type) ||
    /\.(png|jpe?g)$/i.test(file.name || '')
  ) {
    return 'image';
  }

  return null;
}

async function createPdfBytesFromImage(file, imageBytes) {
  const { PDFDocument } = window.PDFLib;
  const pdfDoc = await PDFDocument.create();

  const embeddedImage =
    file.type === 'image/png' || /\.png$/i.test(file.name || '')
      ? await pdfDoc.embedPng(imageBytes)
      : await pdfDoc.embedJpg(imageBytes);

  const { width, height } = embeddedImage.scale(1);
  const page = pdfDoc.addPage([width, height]);

  page.drawImage(embeddedImage, {
    x: 0,
    y: 0,
    width,
    height,
  });

  return new Uint8Array(await pdfDoc.save());
}

function resetPageNavigator() {
  const pageIndicator = document.getElementById('page-indicator');
  const pageSelector = document.getElementById('page-selector');

  if (pageIndicator) {
    pageIndicator.textContent = '第 - / - 页';
  }

  if (pageSelector) {
    pageSelector.innerHTML = '';
  }
}

/**
 * 获取 PDF 文档对象
 * @returns {PDFDocumentProxy|null}
 */
export function getPdfDoc() {
  return getState().pdfDoc;
}

/**
 * 设置 PDF 文档对象
 * @param {PDFDocumentProxy|null} pdfDoc
 */
export function setPdfDoc(pdfDoc) {
  setState({ pdfDoc });
}

/**
 * 获取原始 PDF 字节数据
 * @returns {Uint8Array|null}
 */
export function getOriginalPdfBytes() {
  return getState().originalPdfBytes;
}

/**
 * 设置原始 PDF 字节数据
 * @param {Uint8Array|null} originalPdfBytes
 */
export function setOriginalPdfBytes(originalPdfBytes) {
  setState({ originalPdfBytes });
}

/**
 * 获取总页数
 * @returns {number}
 */
export function getTotalPages() {
  return getState().totalPages;
}

/**
 * 设置总页数
 * @param {number} totalPages
 */
export function setTotalPages(totalPages) {
  setState({ totalPages });
}

/**
 * 处理单个文件上传
 * @param {File} file - PDF 或图片文件对象
 * @param {Object} callbacks - 回调函数集合
 */
export async function handlePdfFile(
  file,
  {
    onLoadingStart = () => {},
    onLoadingEnd = () => {},
    onError = () => {},
    onPagesRendered = () => {},
  } = {}
) {
  const validation = window.Validators.validateDocumentFile(file);
  if (!validation.valid) {
    onError(validation.error);
    onLoadingEnd(false);
    return;
  }

  const sourceKind = getSourceKind(file);
  const requestId = ++activeLoadRequestId;
  cleanupAllResources();
  setState({
    currentPdfFile: file,
    currentSourceKind: sourceKind,
  });
  onLoadingStart(sourceKind === 'image' ? '正在加载图片...' : '正在加载文件...');

  try {
    const sourceBytes = await readFileAsBytes(file);
    assertActiveLoad(requestId);

    const originalPdfBytes =
      sourceKind === 'image'
        ? await createPdfBytesFromImage(file, sourceBytes)
        : sourceBytes;

    setOriginalPdfBytes(originalPdfBytes);

    const pdfDoc = await pdfjsLib.getDocument({
      data: originalPdfBytes.slice(),
    }).promise;
    assertActiveLoad(requestId);

    setPdfDoc(pdfDoc);
    setTotalPages(pdfDoc.numPages);

    const pageValidation = window.Validators.validatePageCount(pdfDoc.numPages);
    if (!pageValidation.valid) {
      try {
        await pdfDoc.destroy?.();
      } catch (destroyError) {
        console.warn('清理无效 PDF 资源时出错:', destroyError);
      }
      cleanupAllResources();
      onError(pageValidation.error);
      onLoadingEnd(false);
      return;
    }

    setState({
      fabricCanvases: new Array(pdfDoc.numPages).fill(null),
      pageFitScales: new Array(pdfDoc.numPages).fill(null),
    });

    const {
      getVirtualScrollerState,
      refreshVirtualScroller,
    } = await import('./thumbnail-virtual-scroller.js');
    assertActiveLoad(requestId);

    const vState = getVirtualScrollerState();

    if (vState) {
      createThumbnailList(pdfDoc.numPages);
      refreshVirtualScroller();

      if (typeof window.showPage === 'function') {
        await window.showPage(1, false);
        onPagesRendered(1);
      } else {
        await showPage(1, onPagesRendered);
      }
    } else {
      await renderAllPages(onPagesRendered);
    }

    assertActiveLoad(requestId);
    onLoadingEnd(true);
  } catch (error) {
    if (error?.code === 'PDF_LOAD_STALE') {
      return;
    }

    console.error('加载文件失败:', error);
    if (requestId === activeLoadRequestId) {
      cleanupAllResources();
    }
    onError(error?.message || '文件加载失败，请检查文件。');
    onLoadingEnd(false);
  }
}

/**
 * 创建缩略图列表（虚拟滚动模式下使用）
 * @param {number} totalPages - 总页数
 */
export function createThumbnailList(totalPages) {
  const container = document.getElementById('thumbnail-container');
  if (!container) return;

  createPageWrappers(totalPages);
  setThumbnailEmptyStateVisible(false);

  // 清空旧内容（保留空状态）
  Array.from(container.children).forEach(child => {
    if (!child.classList.contains('empty-state')) {
      child.remove();
    }
  });

  // 虚拟滚动会自动创建 items，这里不需要手动创建
  // virtual scroller will handle everything
}

/**
 * 创建缩略图占位符
 * @param {string} text
 * @returns {HTMLDivElement}
 */
function createThumbnailPlaceholder(text = '滚动后加载预览') {
  const placeholder = document.createElement('div');
  placeholder.className = 'thumbnail-placeholder';
  placeholder.textContent = text;
  return placeholder;
}

/**
 * 创建缩略图项
 * @param {number} pageNum
 * @returns {HTMLDivElement}
 */
function createThumbnailItem(pageNum) {
  const thumbItem = document.createElement('div');
  thumbItem.className = 'thumbnail-item';
  thumbItem.dataset.pageNumber = pageNum;
  thumbItem.dataset.thumbnailRendered = 'false';
  thumbItem.dataset.thumbnailRendering = 'false';
  thumbItem.draggable = true;

  if (pageNum <= INITIAL_RENDERED_THUMBNAILS) {
    thumbItem.appendChild(document.createElement('canvas'));
  } else {
    const placeholder = createThumbnailPlaceholder();
    thumbItem.appendChild(placeholder);
  }

  const pageNumText = document.createElement('p');
  pageNumText.textContent = `第 ${pageNum} 页`;
  thumbItem.appendChild(pageNumText);

  thumbItem.addEventListener('click', (event) => {
    if (handleThumbnailInteraction(pageNum, event)) {
      return;
    }

    if (typeof window.showPage === 'function') {
      window.showPage(pageNum);
      return;
    }

    showPage(pageNum);
  });

  return thumbItem;
}

/**
 * 创建主画布包装器
 * @param {number} pageNum
 * @returns {HTMLDivElement}
 */
function createPageWrapper(pageNum) {
  const wrapper = document.createElement('div');
  wrapper.id = `page-wrapper-${pageNum}`;
  wrapper.className = 'canvas-wrapper';
  wrapper.style.display = 'none';

  const canvas = document.createElement('canvas');
  canvas.id = `canvas-${pageNum}`;
  wrapper.appendChild(canvas);

  return wrapper;
}

/**
 * 创建主区域页面画布包装器
 * @param {number} totalPages
 */
function createPageWrappers(totalPages) {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) return;

  mainContent.querySelectorAll('.canvas-wrapper').forEach((wrapper) => {
    wrapper.remove();
  });

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    mainContent.appendChild(createPageWrapper(pageNum));
  }
}

function ensureThumbnailEmptyState(container) {
  let emptyState = container.querySelector('.empty-state');
  if (emptyState) return emptyState;

  emptyState = document.createElement('div');
  emptyState.className = 'empty-state';
  const message = document.createElement('p');
  message.textContent = '请先上传文件';
  emptyState.appendChild(message);
  container.prepend(emptyState);
  return emptyState;
}

function setThumbnailEmptyStateVisible(visible) {
  const container = document.getElementById('thumbnail-container');
  if (!container) return;

  const emptyState = ensureThumbnailEmptyState(container);
  emptyState.style.display = visible ? '' : 'none';
}

/**
 * 渲染指定页面的缩略图
 * @param {number} pageNum
 */
export async function renderThumbnailForPage(pageNum) {
  const thumbItem = document.querySelector(
    `.thumbnail-item[data-page-number="${pageNum}"]`
  );
  if (!thumbItem || !getPdfDoc()) return;

  if (
    thumbItem.dataset.thumbnailRendered === 'true' ||
    thumbItem.dataset.thumbnailRendering === 'true'
  ) {
    return;
  }

  thumbItem.dataset.thumbnailRendering = 'true';

  let thumbCanvas = thumbItem.querySelector('canvas');
  if (!thumbCanvas) {
    thumbCanvas = document.createElement('canvas');
    thumbItem.insertBefore(thumbCanvas, thumbItem.querySelector('p'));
  }

  const existingPlaceholder = thumbItem.querySelector('.thumbnail-placeholder');
  if (existingPlaceholder) {
    existingPlaceholder.remove();
  }

  try {
    const page = await getPdfDoc().getPage(pageNum);
    const viewport = page.getViewport({ scale: 0.3 });
    thumbCanvas.height = viewport.height;
    thumbCanvas.width = viewport.width;

    await page
      .render({
        canvasContext: thumbCanvas.getContext('2d'),
        viewport,
      })
      .promise;

    thumbItem.dataset.thumbnailRendered = 'true';
  } catch (error) {
    console.warn(`渲染第 ${pageNum} 页缩略图时出错:`, error);

    if (thumbCanvas.parentNode) {
      thumbCanvas.remove();
    }

    const placeholder = createThumbnailPlaceholder('预览加载失败');
    thumbItem.insertBefore(placeholder, thumbItem.querySelector('p'));
  } finally {
    thumbItem.dataset.thumbnailRendering = 'false';
  }
}

/**
 * 判断缩略图是否接近可视区域
 * @param {HTMLElement} thumbItem
 * @returns {boolean}
 */
function isThumbnailNearViewport(thumbItem) {
  const thumbnailContainer = document.getElementById('thumbnail-container');
  const containerRect = thumbnailContainer.getBoundingClientRect();
  const itemRect = thumbItem.getBoundingClientRect();

  return (
    itemRect.bottom >= containerRect.top - THUMBNAIL_RENDER_BUFFER &&
    itemRect.top <= containerRect.bottom + THUMBNAIL_RENDER_BUFFER
  );
}

/**
 * 渲染当前可视区域附近的缩略图
 */
function renderVisibleThumbnails() {
  const thumbnailContainer = document.getElementById('thumbnail-container');
  const thumbItems = thumbnailContainer.querySelectorAll('.thumbnail-item');

  thumbItems.forEach((thumbItem) => {
    if (thumbItem.dataset.thumbnailRendered === 'true') return;
    if (!isThumbnailNearViewport(thumbItem)) return;

    renderThumbnailForPage(parseInt(thumbItem.dataset.pageNumber, 10));
  });
}

/**
 * 延迟执行缩略图懒加载检查
 */
export function scheduleVisibleThumbnailRender() {
  if (thumbnailRenderFrameId !== null) return;

  thumbnailRenderFrameId = window.requestAnimationFrame(() => {
    thumbnailRenderFrameId = null;
    renderVisibleThumbnails();
  });
}

/**
 * 初始化缩略图拖拽排序
 * @param {HTMLElement} thumbnailContainer
 */
function initializeThumbnailDragSort(thumbnailContainer) {
  const thumbItems = thumbnailContainer.querySelectorAll('.thumbnail-item');
  let draggedItem = null;

  thumbItems.forEach((item) => {
    item.addEventListener('dragstart', (e) => {
      draggedItem = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      draggedItem = null;
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      if (draggedItem && draggedItem !== item) {
        const rect = item.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;

        if (e.clientY < midpoint) {
          thumbnailContainer.insertBefore(draggedItem, item);
        } else {
          thumbnailContainer.insertBefore(draggedItem, item.nextSibling);
        }
      }
    });
  });
}

/**
 * 渲染所有页面缩略图和画布容器
 * @param {Function} onPagesRendered
 */
async function renderAllPages(onPagesRendered) {
  const thumbnailContainer = document.getElementById('thumbnail-container');
  const mainContent = document.getElementById('main-content');

  if (!thumbnailContainer || !mainContent) return;

  thumbnailContainer.innerHTML = '';
  setState({ currentActivePage: 1 });

  const totalPages = getTotalPages();

  for (let i = 1; i <= totalPages; i++) {
    const item = createThumbnailItem(i);
    thumbnailContainer.appendChild(item);
    mainContent.appendChild(createPageWrapper(i));
  }

  for (let i = 1; i <= Math.min(totalPages, INITIAL_RENDERED_THUMBNAILS); i++) {
    await renderThumbnailForPage(i);
  }

  initializeThumbnailDragSort(thumbnailContainer);
  scheduleVisibleThumbnailRender();

  if (typeof window.showPage === 'function') {
    await window.showPage(1, false);
    if (onPagesRendered) onPagesRendered(1);
    return;
  }

  await showPage(1, onPagesRendered);
}

/**
 * 显示指定页面
 * @param {number} pageNum
 * @param {Function} [onPagesRendered]
 */
export async function showPage(pageNum, onPagesRendered) {
  if (!getPdfDoc()) return;

  setState({ currentActivePage: pageNum });

  document.querySelectorAll('.canvas-wrapper').forEach((div) => {
    div.style.display = 'none';
  });

  document.querySelectorAll('.thumbnail-item').forEach((item) => {
    item.classList.remove('active');
  });

  const activeThumb = document.querySelector(
    `.thumbnail-item[data-page-number="${pageNum}"]`
  );
  if (activeThumb) activeThumb.classList.add('active');

  await renderThumbnailForPage(pageNum);

  const wrapper = document.getElementById(`page-wrapper-${pageNum}`);
  if (wrapper) {
    wrapper.style.display = 'block';
  }

  const canvasModule = await import('./canvas-manager.js');
  await canvasModule.initializeFabricCanvasForPage(pageNum, false);

  const zoomModule = await import('./canvas-manager.js');
  zoomModule.applyZoom();

  updatePageNavigator();

  if (onPagesRendered) {
    onPagesRendered(pageNum);
  }
}

/**
 * 更新页面导航器显示
 */
function updatePageNavigator() {
  const pageIndicator = document.getElementById('page-indicator');
  const pageSelector = document.getElementById('page-selector');

  if (!pageIndicator || !pageSelector) return;

  const currentPage = getState().currentActivePage;
  const totalPages = getTotalPages();

  pageIndicator.textContent = `第 ${currentPage} / ${totalPages} 页`;

  pageSelector.innerHTML = '';
  for (let i = 1; i <= totalPages; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = `第 ${i} 页`;
    pageSelector.appendChild(option);
  }

  pageSelector.value = currentPage;
}

/**
 * 清理所有 PDF 相关资源
 */
export function cleanupAllResources() {
  if (thumbnailRenderFrameId !== null) {
    window.cancelAnimationFrame(thumbnailRenderFrameId);
    thumbnailRenderFrameId = null;
  }

  const pdfDoc = getPdfDoc();
  if (pdfDoc?.destroy) {
    Promise.resolve(pdfDoc.destroy()).catch((error) => {
      console.warn('销毁 PDF 文档时出错:', error);
    });
  }

  window.History?.clearHistory?.();

  const fabricCanvases = [...getState().fabricCanvases];
  fabricCanvases.forEach((canvas, index) => {
    if (canvas) {
      try {
        canvas.dispose();
      } catch (error) {
        console.warn(`清理画布 ${index + 1} 时出错:`, error);
      }
    }
  });

  document.querySelectorAll('.canvas-wrapper').forEach((wrapper) => {
    wrapper.remove();
  });

  const thumbnailContainer = document.getElementById('thumbnail-container');
  if (thumbnailContainer) {
    thumbnailContainer.scrollTop = 0;
    Array.from(thumbnailContainer.children).forEach((child) => {
      if (!child.classList.contains('empty-state')) {
        child.remove();
      }
    });
    setThumbnailEmptyStateVisible(true);
  }

  const mainContent = document.getElementById('main-content');
  if (mainContent) {
    mainContent.scrollTop = 0;
  }

  const virtualScroller = getState().virtualScroller;
  if (virtualScroller) {
    virtualScroller.visibleRange = { start: 1, end: 10 };
    virtualScroller.renderedPages?.clear?.();
    virtualScroller.pageHeights = [];
  }

  resetPageNavigator();

  setState({
    fabricCanvases: [],
    pageFitScales: [],
    pdfDoc: null,
    originalPdfBytes: null,
    currentPdfFile: null,
    currentSourceKind: null,
    totalPages: 0,
    currentActivePage: 1,
    selectedPages: new Set(),
    isMultiSelectMode: false,
    selectionAnchorPage: 1,
  });
}
