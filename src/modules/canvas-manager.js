import { getState, setState } from '../core/state.js';

/**
 * Canvas 画布管理模块
 * 负责 Fabric 画布的创建、初始化、缩放和渲染
 */

const SIDEBAR_ANIMATION_DURATION = 300;

/**
 * 获取当前活动页面编号
 * @returns {number}
 */
export function getCurrentActivePage() {
  return getState().currentActivePage;
}

/**
 * 获取 Fabric 画布数组
 * @returns {fabric.Canvas[]}
 */
export function getFabricCanvases() {
  return getState().fabricCanvases;
}

/**
 * 获取全局缩放倍数
 * @returns {number}
 */
export function getGlobalZoomMultiplier() {
  return getState().globalZoomMultiplier;
}

function getPageFitScalesSafe() {
  const scales = getState().pageFitScales;
  return Array.isArray(scales) ? scales : [];
}

/**
 * 获取主内容区域
 * @returns {HTMLElement}
 */
function getMainContent() {
  return document.getElementById('main-content');
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * 设置指定页面的 Fabric 画布
 * @param {number} pageIndex
 * @param {fabric.Canvas|null} fabricCanvas
 */
export function setFabricCanvasAt(pageIndex, fabricCanvas) {
  const fabricCanvases = [...getFabricCanvases()];
  fabricCanvases[pageIndex] = fabricCanvas;
  setState({ fabricCanvases });
}

/**
 * 设置页面适配缩放比例
 * @param {number} pageIndex
 * @param {number} pageFitScale
 */
function setPageFitScaleAt(pageIndex, pageFitScale) {
  const pageFitScales = [...getPageFitScalesSafe()];
  pageFitScales[pageIndex] = pageFitScale;
  setState({ pageFitScales });
}

/**
 * 获取当前活动页面的 Fabric 画布
 * @returns {fabric.Canvas|null}
 */
export function getCurrentPageCanvas() {
  const currentPage = getCurrentActivePage();
  const canvases = getFabricCanvases();
  return canvases[currentPage - 1] || null;
}

/**
 * 初始化指定页面的 Fabric 画布
 * @param {number} pageNum
 * @param {boolean} forceRecalculate
 * @returns {Promise<fabric.Canvas>}
 */
export async function initializeFabricCanvasForPage(pageNum, forceRecalculate = false) {
  const pdfDoc = getState().pdfDoc;
  if (!pdfDoc) return null;

  const pageFitScales = getPageFitScalesSafe();
  if (forceRecalculate || !pageFitScales[pageNum - 1]) {
    const page = await pdfDoc.getPage(pageNum);
    const highResViewport = page.getViewport({ scale: 2.0 });
    const mainContent = getMainContent();
    const containerWidth = mainContent ? mainContent.clientWidth - 40 : 800;
    setPageFitScaleAt(pageNum - 1, (containerWidth * 0.9) / highResViewport.width);
  }

  const fabricCanvases = getFabricCanvases();
  if (fabricCanvases[pageNum - 1] && !forceRecalculate) {
    return fabricCanvases[pageNum - 1];
  }

  const page = await pdfDoc.getPage(pageNum);
  const highResViewport = page.getViewport({ scale: 2.0 });
  const originalWidth = highResViewport.width;
  const originalHeight = highResViewport.height;

  const canvasEl = document.getElementById(`canvas-${pageNum}`);
  const fabricCanvas = fabricCanvases[pageNum - 1] || new fabric.Canvas(canvasEl);

  if (!fabricCanvases[pageNum - 1]) {
    fabricCanvas.originalWidth = originalWidth;
    fabricCanvas.originalHeight = originalHeight;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = originalWidth;
    tempCanvas.height = originalHeight;
    await page
      .render({
        canvasContext: tempCanvas.getContext('2d'),
        viewport: highResViewport,
      })
      .promise;

    fabricCanvas.backgroundImage = new fabric.Image(tempCanvas);
    fabricCanvas.requestRenderAll();

    setFabricCanvasAt(pageNum - 1, fabricCanvas);
  }

  return fabricCanvas;
}

/**
 * 应用缩放设置到当前页面画布
 */
export function applyZoom({ clientX = null, clientY = null } = {}) {
  const pdfDoc = getState().pdfDoc;
  if (!pdfDoc) return;

  const zoomMultiplier = getGlobalZoomMultiplier();
  const currentPage = getCurrentActivePage();
  const canvas = getCurrentPageCanvas();
  const mainContent = getMainContent();
  const wrapper = document.getElementById(`page-wrapper-${currentPage}`);

  const shouldKeepPointerFocus =
    Number.isFinite(clientX) &&
    Number.isFinite(clientY) &&
    Boolean(mainContent && wrapper);

  let focusState = null;

  if (shouldKeepPointerFocus) {
    const mainRect = mainContent.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();

    if (wrapperRect.width > 0 && wrapperRect.height > 0) {
      focusState = {
        offsetX: clientX - mainRect.left,
        offsetY: clientY - mainRect.top,
        relativeX: clamp((clientX - wrapperRect.left) / wrapperRect.width, 0, 1),
        relativeY: clamp((clientY - wrapperRect.top) / wrapperRect.height, 0, 1),
      };
    }
  }

  const zoomValue = document.getElementById('zoom-value');
  if (zoomValue) {
    zoomValue.textContent = `${Math.round(zoomMultiplier * 100)}% (Fit-Width)`;
  }

  if (canvas) {
    const pageFitScales = getPageFitScalesSafe();
    const fitScale = pageFitScales[currentPage - 1] || 1;
    const newZoom = fitScale * zoomMultiplier;

    canvas.setZoom(newZoom);
    canvas.setDimensions({
      width: canvas.originalWidth * newZoom,
      height: canvas.originalHeight * newZoom,
    });

    canvas.renderAll();

    if (focusState) {
      requestAnimationFrame(() => {
        const mainRect = mainContent.getBoundingClientRect();
        const wrapperRect = wrapper.getBoundingClientRect();

        const wrapperLeft =
          mainContent.scrollLeft + wrapperRect.left - mainRect.left;
        const wrapperTop =
          mainContent.scrollTop + wrapperRect.top - mainRect.top;

        mainContent.scrollLeft =
          wrapperLeft + wrapperRect.width * focusState.relativeX - focusState.offsetX;
        mainContent.scrollTop =
          wrapperTop + wrapperRect.height * focusState.relativeY - focusState.offsetY;
      });
    }
  }
}

/**
 * 处理侧边栏切换后的重绘
 * @param {boolean} isCollapsed
 */
export async function handleSidebarToggle(isCollapsed) {
  const pdfDoc = getState().pdfDoc;
  if (!pdfDoc) return;

  setState({
    pageFitScales: new Array(getState().totalPages).fill(null),
  });

  setTimeout(() => {
    const currentPage = getCurrentActivePage();
    showPage(currentPage, true);
  }, SIDEBAR_ANIMATION_DURATION);
}

/**
 * 显示指定页面
 * @param {number} pageNum
 * @param {boolean} forceRecalculate
 */
export async function showPage(pageNum, forceRecalculate = false) {
  const pdfDoc = getState().pdfDoc;
  if (!pdfDoc) return;

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

  const isVirtualThumbnailMode = Boolean(
    document.querySelector('#thumbnail-container .virtual-thumbnail-items')
  );

  if (!isVirtualThumbnailMode) {
    const pdfLoader = await import('./pdf-loader.js');
    await pdfLoader.renderThumbnailForPage(pageNum);
  }

  const wrapper = document.getElementById(`page-wrapper-${pageNum}`);
  if (wrapper) {
    wrapper.style.display = 'block';
  }

  await initializeFabricCanvasForPage(pageNum, forceRecalculate);
  applyZoom();
  updatePageNavigator();
}

/**
 * 更新页面导航器显示
 */
function updatePageNavigator() {
  const pageIndicator = document.getElementById('page-indicator');
  const pageSelector = document.getElementById('page-selector');

  if (!pageIndicator || !pageSelector) return;

  const currentPage = getCurrentActivePage();
  const totalPages = getState().totalPages;

  pageIndicator.textContent = `第 ${currentPage} / ${totalPages} 页`;

  while (pageSelector.firstChild) {
    pageSelector.removeChild(pageSelector.firstChild);
  }
  for (let i = 1; i <= totalPages; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = `第 ${i} 页`;
    pageSelector.appendChild(option);
  }

  pageSelector.value = currentPage;
}

/**
 * 清理指定页面的画布
 * @param {number} pageNum
 */
export function cleanupCanvas(pageNum) {
  const canvases = getFabricCanvases();
  const canvas = canvases[pageNum - 1];

  if (canvas) {
    try {
      canvas.dispose();
    } catch (error) {
      console.warn(`清理画布 ${pageNum} 时出错:`, error);
    }
  }
}
