import { getState, setState } from '../core/state.js';

const EDITOR_LOGICAL_SCALE = 2.0;

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

function getPreviewRenderScale() {
  if (typeof window === 'undefined') {
    return EDITOR_LOGICAL_SCALE;
  }

  const dpr = Number(window.devicePixelRatio) || 1;
  let scale = Math.min(2, Math.max(1, dpr));
  if (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 768px)').matches
  ) {
    scale = Math.min(scale, 1.15);
  }
  return scale;
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
 * 坐标系仍按 2x PDF 点，屏幕预览可降采样；导出请传 fullQuality。
 * @param {number} pageNum
 * @param {boolean} forceRecalculate
 * @param {{ fullQuality?: boolean }} [options]
 * @returns {Promise<fabric.Canvas>}
 */
export async function initializeFabricCanvasForPage(
  pageNum,
  forceRecalculate = false,
  options = {}
) {
  const pdfDoc = getState().pdfDoc;
  if (!pdfDoc) return null;
  options = options || {};

  const fabricCanvases = getFabricCanvases();
  const existingCanvas = fabricCanvases[pageNum - 1];
  const pageFitScales = getPageFitScalesSafe();
  const needsFitScale = forceRecalculate || !pageFitScales[pageNum - 1];

  if (existingCanvas && !forceRecalculate && !needsFitScale) {
    return existingCanvas;
  }

  const page = await pdfDoc.getPage(pageNum);
  const logicalViewport = page.getViewport({ scale: EDITOR_LOGICAL_SCALE });

  if (needsFitScale) {
    const mainContent = getMainContent();
    const containerWidth = mainContent ? mainContent.clientWidth - 40 : 800;
    setPageFitScaleAt(
      pageNum - 1,
      (containerWidth * 0.9) / logicalViewport.width
    );
  }

  if (existingCanvas && !forceRecalculate) {
    return existingCanvas;
  }

  const canvasEl = document.getElementById(`canvas-${pageNum}`);
  const fabricCanvas =
    existingCanvas ||
    new fabric.Canvas(canvasEl, {
      // 允许右键选中/操作对象，并阻止浏览器原生右键菜单，
      // 使自定义右键菜单能作用在实际点到的印章上。
      fireRightClick: true,
      stopContextMenu: true,
    });

  if (!existingCanvas) {
    fabricCanvas.originalWidth = logicalViewport.width;
    fabricCanvas.originalHeight = logicalViewport.height;

    const renderScale = options.fullQuality
      ? EDITOR_LOGICAL_SCALE
      : getPreviewRenderScale();
    const renderViewport = page.getViewport({ scale: renderScale });
    const bitmapWidth = Math.max(1, Math.round(renderViewport.width));
    const bitmapHeight = Math.max(1, Math.round(renderViewport.height));

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = bitmapWidth;
    tempCanvas.height = bitmapHeight;

    try {
      await page
        .render({
          canvasContext: tempCanvas.getContext('2d'),
          viewport: renderViewport,
        })
        .promise;

      fabricCanvas.backgroundImage = new fabric.Image(tempCanvas, {
        originX: 'left',
        originY: 'top',
        left: 0,
        top: 0,
        scaleX: logicalViewport.width / bitmapWidth,
        scaleY: logicalViewport.height / bitmapHeight,
      });
      fabricCanvas.requestRenderAll();
    } catch (error) {
      if (options.fullQuality) {
        throw error;
      }
      console.warn(`第 ${pageNum} 页预览渲染失败:`, error);
    }

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

  if (isVirtualThumbnailMode) {
    import('./thumbnail-virtual-scroller.js')
      .then((scroller) => scroller.syncVirtualScrollerToPage(pageNum))
      .catch((error) => {
        console.warn(`同步缩略图位置失败:`, error);
      });
  } else {
    import('./pdf-loader.js')
      .then((pdfLoader) => pdfLoader.renderThumbnailForPage(pageNum))
      .catch((error) => {
        console.warn(`渲染第 ${pageNum} 页缩略图时出错:`, error);
      });
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

  setFabricCanvasAt(pageNum - 1, null);
}
