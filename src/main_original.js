const { getState, setState } = window.AppState;

/**
 * 获取PDF文档对象
 * @returns {PDFDocumentProxy|null} PDF文档对象
 */
function getPdfDoc() {
  return getState().pdfDoc;
}

/**
 * 设置PDF文档对象
 * @param {PDFDocumentProxy|null} pdfDoc - PDF文档对象
 */
function setPdfDoc(pdfDoc) {
  setState({ pdfDoc });
}

/**
 * 获取原始PDF字节数据
 * @returns {Uint8Array|null} 原始PDF字节数据
 */
function getOriginalPdfBytes() {
  return getState().originalPdfBytes;
}

/**
 * 设置原始PDF字节数据
 * @param {Uint8Array|null} originalPdfBytes - 原始PDF字节数据
 */
function setOriginalPdfBytes(originalPdfBytes) {
  setState({ originalPdfBytes });
}

/**
 * 获取Fabric画布数组
 * @returns {fabric.Canvas[]} Fabric画布数组
 */
function getFabricCanvases() {
  return getState().fabricCanvases;
}

/**
 * 设置Fabric画布数组
 * @param {fabric.Canvas[]} fabricCanvases - Fabric画布数组
 */
function setFabricCanvases(fabricCanvases) {
  setState({ fabricCanvases });
}

/**
 * 设置指定页面的Fabric画布
 * @param {number} pageIndex - 页面索引
 * @param {fabric.Canvas|null} fabricCanvas - Fabric画布对象
 */
function setFabricCanvasAt(pageIndex, fabricCanvas) {
  const fabricCanvases = [...getFabricCanvases()];
  fabricCanvases[pageIndex] = fabricCanvas;
  setFabricCanvases(fabricCanvases);
}

/**
 * 获取印章图片元素
 * @returns {HTMLImageElement|null} 印章图片元素
 */
function getSealImageElement() {
  return getState().sealImageElement;
}

/**
 * 设置印章图片元素
 * @param {HTMLImageElement|null} sealImageElement - 印章图片元素
 */
function setSealImageElement(sealImageElement) {
  setState({ sealImageElement });
}

/**
 * 获取当前活动页面编号
 * @returns {number} 当前活动页面编号
 */
function getCurrentActivePage() {
  return getState().currentActivePage;
}

/**
 * 设置当前活动页面编号
 * @param {number} currentActivePage - 当前活动页面编号
 */
function setCurrentActivePage(currentActivePage) {
  setState({ currentActivePage });
}

/**
 * 获取PDF总页数
 * @returns {number} PDF总页数
 */
function getTotalPages() {
  return getState().totalPages;
}

/**
 * 设置PDF总页数
 * @param {number} totalPages - PDF总页数
 */
function setTotalPages(totalPages) {
  setState({ totalPages });
}

/**
 * 获取页面适配缩放比例缓存
 * @returns {number[]} 页面适配缩放比例缓存
 */
function getPageFitScales() {
  return getState().pageFitScales;
}

/**
 * 设置页面适配缩放比例缓存
 * @param {number[]} pageFitScales - 页面适配缩放比例缓存
 */
function setPageFitScales(pageFitScales) {
  setState({ pageFitScales });
}

/**
 * 设置指定页面的适配缩放比例
 * @param {number} pageIndex - 页面索引
 * @param {number} pageFitScale - 适配缩放比例
 */
function setPageFitScaleAt(pageIndex, pageFitScale) {
  const pageFitScales = [...getPageFitScales()];
  pageFitScales[pageIndex] = pageFitScale;
  setPageFitScales(pageFitScales);
}

/**
 * 获取全局缩放倍数
 * @returns {number} 全局缩放倍数
 */
function getGlobalZoomMultiplier() {
  return getState().globalZoomMultiplier;
}

/**
 * 设置全局缩放倍数
 * @param {number} globalZoomMultiplier - 全局缩放倍数
 */
function setGlobalZoomMultiplier(globalZoomMultiplier) {
  setState({ globalZoomMultiplier });
}

/**
 * 获取印章旋转角度
 * @returns {number} 印章旋转角度
 */
function getSealRotation() {
  return getState().sealRotation;
}

/**
 * 设置印章旋转角度
 * @param {number} sealRotation - 印章旋转角度
 */
function setSealRotation(sealRotation) {
  setState({ sealRotation });
}

/**
 * 获取印章亮度
 * @returns {number} 印章亮度
 */
function getSealBrightness() {
  return getState().sealBrightness;
}

/**
 * 设置印章亮度
 * @param {number} sealBrightness - 印章亮度
 */
function setSealBrightness(sealBrightness) {
  setState({ sealBrightness });
}

/**
 * 获取当前页面的Fabric画布
 * @returns {fabric.Canvas|null} 当前页面的Fabric画布
 */
function getCurrentPageCanvas() {
  return getFabricCanvases()[getCurrentActivePage() - 1] || null;
}

window.getRotatedCroppedImage = getRotatedCroppedImage;

// ==================== DOM元素获取 ====================

/** @type {HTMLElement} 主应用容器 */
const appContainer = document.getElementById('app');

/** @type {HTMLButtonElement} 侧边栏切换按钮 */
const sidebarToggleBtn = document.getElementById('sidebar-toggle');

/** @type {HTMLElement} 主内容区域 */
const mainContent = document.getElementById('main-content');

/** @type {HTMLInputElement} PDF文件输入框 */
const pdfInputElement = document.getElementById('pdfInput');

/** @type {HTMLInputElement} 印章文件输入框 */
const sealInputElement = document.getElementById('sealInput');

/** @type {HTMLButtonElement} 主上传PDF按钮 */
const mainUploadBtn = document.getElementById('upload-pdf-btn-main');

/** @type {HTMLButtonElement} 上传印章按钮 */
const sealUploadBtn = document.getElementById('upload-seal-btn');

/** @type {HTMLImageElement} 印章预览图片 */
const sealPreviewImg = document.getElementById('seal-preview');

/** @type {HTMLElement} 印章占位符 */
const sealPlaceholder = document.getElementById('seal-placeholder');

/** @type {HTMLElement} 缩略图容器 */
const thumbnailContainer = document.getElementById('thumbnail-container');

/** @type {HTMLButtonElement} 添加普通章按钮 */
const addSealBtn = document.getElementById('addSeal');

/** @type {HTMLButtonElement} 添加骑缝章按钮 */
const addStraddleBtn = document.getElementById('addStraddle');

/** @type {HTMLButtonElement} 导出PDF按钮 */
const exportPdfBtn = document.getElementById('exportPDF');

/** @type {HTMLInputElement} 缩放滑块 */
const zoomSlider = document.getElementById('zoom-slider');

/** @type {HTMLElement} 缩放值显示 */
const zoomValue = document.getElementById('zoom-value');

/** @type {HTMLElement} 页面指示器 */
const pageIndicator = document.getElementById('page-indicator');

/** @type {HTMLSelectElement} 页面选择器 */
const pageSelector = document.getElementById('page-selector');

/** @type {HTMLInputElement} 旋转滑块 */
const rotationSlider = document.getElementById('rotation-slider');

/** @type {HTMLInputElement} 旋转角度输入框 */
const rotationInput = document.getElementById('rotation-input');

const INITIAL_RENDERED_THUMBNAILS = 3;
const THUMBNAIL_RENDER_BUFFER = 240;

let thumbnailRenderFrameId = null;

/**
 * 主程序入口 - 初始化应用
 */
async function main() {
  // 配置PDF.js工作线程路径
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

  // 初始化事件监听器
  initializeEventListeners();

  // 初始化右键菜单
  initContextMenu();

  console.log('应用已初始化');
}

/**
 * 初始化所有事件监听器
 */
function initializeEventListeners() {
    // 侧边栏切换事件
    sidebarToggleBtn.addEventListener('click', () => {
        appContainer.classList.toggle('sidebar-collapsed');

        // 重置页面缩放缓存，重新计算布局
        setPageFitScales(new Array(getTotalPages()).fill(null));

        // 延迟重绘当前页面，等待CSS动画完成
        setTimeout(() => {
            if (getPdfDoc()) {
                showPage(getCurrentActivePage(), true);
            }
        }, 300);
    });
    
    // 拖拽事件处理 (优化版，防止闪烁)
    let dragCounter = 0;

    mainContent.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        mainContent.classList.add('dragover');
    });

    mainContent.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    mainContent.addEventListener('dragleave', (e) => {
        dragCounter--;
        if (dragCounter === 0) {
            mainContent.classList.remove('dragover');
        }
    });

    mainContent.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        mainContent.classList.remove('dragover');
        const files = e.dataTransfer.files;
        // 只处理PDF文件
        if (files.length > 0 && files[0].type === 'application/pdf') handlePdfFile(files[0]);
    });

    // 文件上传按钮事件
    mainUploadBtn.addEventListener('click', () => pdfInputElement.click());
    pdfInputElement.addEventListener('change', (e) => e.target.files.length > 0 && handlePdfFile(e.target.files[0]));
    sealUploadBtn.addEventListener('click', () => sealInputElement.click());
    sealInputElement.addEventListener('change', (e) => e.target.files.length > 0 && handleSealFile(e.target.files[0]));

    // 印章操作按钮事件
    addSealBtn.addEventListener('click', addNormalSeal);
    addStraddleBtn.addEventListener('click', addStraddleSeal);
    exportPdfBtn.addEventListener('click', exportPDF);

    // 帮助按钮事件
    const helpBtn = document.getElementById('helpBtn');
    helpBtn.addEventListener('click', showShortcutsHelp);

    // 设置按钮事件
    const settingsBtn = document.getElementById('settingsBtn');
    settingsBtn.addEventListener('click', () => window.Settings.showSettingsModal());

    // 保存印章到库按钮事件
    const saveSealBtn = document.getElementById('save-seal-btn');
    saveSealBtn.addEventListener('click', saveSealToLibrary);

    // 批量处理按钮事件
    const uploadBatchBtn = document.getElementById('upload-batch-btn');
    const batchInputElement = document.getElementById('batchInput');
    const processBatchBtn = document.getElementById('processBatch');
    const clearBatchBtn = document.getElementById('clearBatch');

    uploadBatchBtn.addEventListener('click', () => batchInputElement.click());
    batchInputElement.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            window.BatchProcessing.addFilesToBatch(e.target.files);
            e.target.value = '';
        }
    });
    processBatchBtn.addEventListener('click', () => window.BatchProcessing.processBatchFiles());
    clearBatchBtn.addEventListener('click', () => window.BatchProcessing.clearBatchQueue());

    // 标签页切换
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;

            // 移除所有活动状态
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanels.forEach(p => p.classList.remove('active'));

            // 添加活动状态
            btn.classList.add('active');
            document.getElementById(`tab-${targetTab}`).classList.add('active');
        });
    });

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
        const canvas = getCurrentPageCanvas();
        const activeObject = canvas?.getActiveObject();

        // Ctrl+Z: 撤销
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            window.History.undo();
            return;
        }

        // Ctrl+Y 或 Ctrl+Shift+Z: 重做
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
            e.preventDefault();
            window.History.redo();
            return;
        }

        // Ctrl+S: 导出PDF
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            exportPDF();
            return;
        }

        // Delete/Backspace: 删除选中对象
        if ((e.key === 'Delete' || e.key === 'Backspace') && activeObject) {
            e.preventDefault();
            deleteSelectedObject();
            return;
        }

        // Escape: 取消选择
        if (e.key === 'Escape' && activeObject) {
            canvas.discardActiveObject();
            canvas.renderAll();
            return;
        }

        // 方向键: 移动选中对象
        if (activeObject && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1; // Shift+方向键移动10px
            const oldState = window.History.getObjectState(activeObject);

            switch (e.key) {
                case 'ArrowUp': activeObject.top -= step; break;
                case 'ArrowDown': activeObject.top += step; break;
                case 'ArrowLeft': activeObject.left -= step; break;
                case 'ArrowRight': activeObject.left += step; break;
            }

            canvas.renderAll();
            const newState = window.History.getObjectState(activeObject);
            const command = new window.History.ModifySealCommand(getCurrentActivePage(), activeObject, oldState, newState);
            window.History.executeCommand(command);
            return;
        }

        // +/-: 缩放
        if ((e.key === '+' || e.key === '=') && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            const globalZoomMultiplier = Math.min(2, getGlobalZoomMultiplier() + 0.1);
            setGlobalZoomMultiplier(globalZoomMultiplier);
            zoomSlider.value = globalZoomMultiplier;
            applyZoom();
            return;
        }

        if ((e.key === '-' || e.key === '_') && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            const globalZoomMultiplier = Math.max(0.5, getGlobalZoomMultiplier() - 0.1);
            setGlobalZoomMultiplier(globalZoomMultiplier);
            zoomSlider.value = globalZoomMultiplier;
            applyZoom();
            return;
        }

        // PageUp/PageDown: 页面导航
        if (e.key === 'PageUp' && getCurrentActivePage() > 1) {
            e.preventDefault();
            showPage(getCurrentActivePage() - 1);
            return;
        }

        if (e.key === 'PageDown' && getCurrentActivePage() < getTotalPages()) {
            e.preventDefault();
            showPage(getCurrentActivePage() + 1);
            return;
        }

        // ?: 显示快捷键帮助
        if (e.key === '?' && e.shiftKey) {
            e.preventDefault();
            showShortcutsHelp();
            return;
        }
    });

    // 页面导航事件
    pageSelector.addEventListener('change', (e) => {
        const newPage = parseInt(e.target.value, 10);
        if (newPage !== getCurrentActivePage()) showPage(newPage);
    });

    // 缩放控制事件
    zoomSlider.addEventListener('input', (e) => {
        setGlobalZoomMultiplier(parseFloat(e.target.value));
        applyZoom();
    });

    // 旋转控制事件
    rotationSlider.addEventListener('input', (e) => {
        const angle = parseInt(e.target.value, 10);
        rotationInput.value = angle;
        setSealRotation(angle);
        sealPreviewImg.style.transform = `rotate(${angle}deg)`;
    });
    rotationInput.addEventListener('input', (e) => {
        const angle = parseInt(e.target.value, 10);
        if(!isNaN(angle) && angle >= -180 && angle <= 180) {
            rotationSlider.value = angle;
            setSealRotation(angle);
            sealPreviewImg.style.transform = `rotate(${angle}deg)`;
        }
    });

    // 亮度控制事件
    const brightnessSlider = document.getElementById('brightness-slider');
    const brightnessValue = document.getElementById('brightness-value');
    if(brightnessSlider && brightnessValue) {
        brightnessSlider.addEventListener('input', (e) => {
            const brightness = parseInt(e.target.value, 10);
            setSealBrightness(brightness);
            brightnessValue.textContent = `${brightness}%`;
            updateSealPreviewBrightness();
        });
    }

    // 去白底按钮
    const removeBgBtn = document.getElementById('remove-bg-btn');
    if(removeBgBtn) removeBgBtn.addEventListener('click', removeWhiteBackground);

    // 手写签名按钮
    const addSignatureBtn = document.getElementById('addSignature');
    if(addSignatureBtn) addSignatureBtn.addEventListener('click', openSignatureModal);

    // 签名模态框按钮
    const closeSignatureBtn = document.querySelector('.modal-close');
    const clearSignatureBtn = document.getElementById('clear-signature-btn');
    const confirmSignatureBtn = document.getElementById('confirm-signature-btn');

    if(closeSignatureBtn) closeSignatureBtn.addEventListener('click', closeSignatureModal);
    if(clearSignatureBtn) clearSignatureBtn.addEventListener('click', () => signaturePad.clear());
    if(confirmSignatureBtn) confirmSignatureBtn.addEventListener('click', addSignatureToPage);

    thumbnailContainer.addEventListener('scroll', scheduleVisibleThumbnailRender, { passive: true });
    window.addEventListener('resize', scheduleVisibleThumbnailRender);
}

/**
 * 应用缩放设置到当前页面画布
 */
function applyZoom() {
    if (!getPdfDoc()) return;

    // 更新缩放显示文本
    zoomValue.textContent = `${Math.round(getGlobalZoomMultiplier() * 100)}% (Fit-Width)`;

    // 获取当前页面的画布
    const canvas = getCurrentPageCanvas();
    if (canvas) {
        const fitScale = getPageFitScales()[getCurrentActivePage() - 1];
        const newZoom = fitScale * getGlobalZoomMultiplier();

        // 设置画布缩放和尺寸
        canvas.setZoom(newZoom);
        canvas.setDimensions({
            width: canvas.originalWidth * newZoom,
            height: canvas.originalHeight * newZoom
        });

        // 重新渲染画布
        canvas.renderAll();
    }
}

/**
 * 更新页面导航器显示
 */
function updatePageNavigator() {
    // 更新页面指示器文本
    pageIndicator.textContent = `第 ${getCurrentActivePage()} / ${getTotalPages()} 页`;

    // 清空并重新生成页面选择器选项
    pageSelector.innerHTML = '';

    for (let i = 1; i <= getTotalPages(); i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `第 ${i} 页`;
        pageSelector.appendChild(option);
    }

    // 设置当前选中页面
    pageSelector.value = getCurrentActivePage();
}

/**
 * 更新印章预览的亮度
 */
function updateSealPreviewBrightness() {
    const sealImageElement = getSealImageElement();
    if (!sealImageElement || !sealImageElement.src) return;

    const brightness = getSealBrightness() / 100;
    sealPreviewImg.style.filter = `brightness(${brightness})`;
}

/**
 * 获取旋转和亮度调整后的图片数据URL
 * @param {HTMLImageElement} sourceImage - 源图片
 * @param {number} angle - 旋转角度（度）
 * @param {number} brightness - 亮度（0-200，100为正常）
 * @returns {string} 处理后的图片数据URL
 */
function getRotatedCroppedImage(sourceImage, angle, brightness = 100) {
    // 创建临时画布用于旋转
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const w = sourceImage.width;
    const h = sourceImage.height;

    // 计算对角线长度，确保旋转后图片不会被裁剪
    const diagonal = Math.sqrt(w * w + h * h);
    canvas.width = diagonal;
    canvas.height = diagonal;

    // 执行旋转操作
    ctx.translate(diagonal / 2, diagonal / 2);
    ctx.rotate(angle * Math.PI / 180);
    ctx.drawImage(sourceImage, -w / 2, -h / 2);

    // 创建最终画布，裁剪回原始尺寸并应用亮度
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = w;
    finalCanvas.height = h;
    const finalCtx = finalCanvas.getContext('2d');

    // 应用亮度滤镜
    finalCtx.filter = `brightness(${brightness / 100})`;
    finalCtx.drawImage(canvas, (diagonal - w) / 2, (diagonal - h) / 2, w, h, 0, 0, w, h);

    return finalCanvas.toDataURL();
}

/**
 * 处理PDF文件上传
 * @param {File} file - PDF文件对象
 */
async function handlePdfFile(file) {
    // 验证PDF文件
    const validation = window.Validators.validatePdfFile(file);
    if (!validation.valid) {
        window.Toast.error(validation.error);
        return;
    }

    // 清理旧的PDF资源
    cleanupAllResources();

    // 移除无PDF状态类
    appContainer.classList.remove('no-pdf-loaded');

    // 显示加载状态
    window.Loading.showPdfLoading('正在加载 PDF...');
    thumbnailContainer.innerHTML = '<p>渲染中...</p>';
    mainContent.innerHTML = '';

    const fileReader = new FileReader();
    fileReader.onload = async (e) => {
        // 保存原始PDF字节数据
        setOriginalPdfBytes(new Uint8Array(e.target.result));

        try {
            // 加载PDF文档
            const pdfDoc = await pdfjsLib.getDocument({ data: getOriginalPdfBytes().slice() }).promise;
            setPdfDoc(pdfDoc);
            setTotalPages(pdfDoc.numPages);

            // 验证页数
            const pageValidation = window.Validators.validatePageCount(getTotalPages());
            if (!pageValidation.valid) {
                window.Toast.error(pageValidation.error);
                appContainer.classList.add('no-pdf-loaded');
                window.Loading.hide();
                return;
            }

            // 初始化画布和缩放缓存数组
            setFabricCanvases(new Array(getTotalPages()).fill(null));
            setPageFitScales(new Array(getTotalPages()).fill(null));

            // 优先渲染前几页，其余缩略图按需加载
            await renderAllPages();
            window.Loading.hide();
        } catch (error) {
            console.error('加载PDF失败:', error);
            window.Toast.error('PDF加载失败，请检查文件。');
            appContainer.classList.add('no-pdf-loaded');
            window.Loading.hide();
        }
    };

    // 读取文件为ArrayBuffer
    fileReader.readAsArrayBuffer(file);
}

/**
 * 创建缩略图占位符
 * @param {string} text - 占位符文本
 * @returns {HTMLDivElement} 占位符元素
 */
function createThumbnailPlaceholder(text = '滚动后加载预览') {
    const placeholder = document.createElement('div');
    placeholder.className = 'thumbnail-placeholder';
    placeholder.textContent = text;
    return placeholder;
}

/**
 * 创建缩略图项
 * @param {number} pageNum - 页面编号
 * @returns {HTMLDivElement} 缩略图项元素
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
        thumbItem.appendChild(createThumbnailPlaceholder());
    }

    const pageNumText = document.createElement('p');
    pageNumText.textContent = `第 ${pageNum} 页`;
    thumbItem.appendChild(pageNumText);

    thumbItem.addEventListener('click', () => showPage(pageNum));

    return thumbItem;
}

/**
 * 创建主画布包装器
 * @param {number} pageNum - 页面编号
 * @returns {HTMLDivElement} 画布包装器元素
 */
function createPageWrapper(pageNum) {
    const mainCanvasWrapper = document.createElement('div');
    mainCanvasWrapper.id = `page-wrapper-${pageNum}`;
    mainCanvasWrapper.className = 'canvas-wrapper';
    mainCanvasWrapper.style.display = 'none';

    const mainCanvas = document.createElement('canvas');
    mainCanvas.id = `canvas-${pageNum}`;
    mainCanvasWrapper.appendChild(mainCanvas);

    return mainCanvasWrapper;
}

/**
 * 渲染指定页面的缩略图
 * @param {number} pageNum - 页面编号
 */
async function renderThumbnailForPage(pageNum) {
    const thumbItem = document.querySelector(`.thumbnail-item[data-page-number="${pageNum}"]`);
    if (!thumbItem || !getPdfDoc()) return;

    if (thumbItem.dataset.thumbnailRendered === 'true' || thumbItem.dataset.thumbnailRendering === 'true') {
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
        await page.render({
            canvasContext: thumbCanvas.getContext('2d'),
            viewport,
        }).promise;
        thumbItem.dataset.thumbnailRendered = 'true';
    } catch (error) {
        console.warn(`渲染第 ${pageNum} 页缩略图时出错:`, error);

        if (thumbCanvas.parentNode) {
            thumbCanvas.remove();
        }

        thumbItem.insertBefore(createThumbnailPlaceholder('预览加载失败'), thumbItem.querySelector('p'));
    } finally {
        thumbItem.dataset.thumbnailRendering = 'false';
    }
}

/**
 * 判断缩略图是否接近可视区域
 * @param {HTMLElement} thumbItem - 缩略图项元素
 * @returns {boolean} 是否需要提前渲染
 */
function isThumbnailNearViewport(thumbItem) {
    const containerRect = thumbnailContainer.getBoundingClientRect();
    const itemRect = thumbItem.getBoundingClientRect();

    return itemRect.bottom >= containerRect.top - THUMBNAIL_RENDER_BUFFER &&
        itemRect.top <= containerRect.bottom + THUMBNAIL_RENDER_BUFFER;
}

/**
 * 渲染当前可视区域附近的缩略图
 */
function renderVisibleThumbnails() {
    const thumbItems = thumbnailContainer.querySelectorAll('.thumbnail-item');

    thumbItems.forEach((thumbItem) => {
        if (thumbItem.dataset.thumbnailRendered === 'true') return;
        if (!isThumbnailNearViewport(thumbItem)) return;

        void renderThumbnailForPage(parseInt(thumbItem.dataset.pageNumber, 10));
    });
}

/**
 * 延迟执行缩略图懒加载检查
 */
function scheduleVisibleThumbnailRender() {
    if (thumbnailRenderFrameId !== null) return;

    thumbnailRenderFrameId = window.requestAnimationFrame(() => {
        thumbnailRenderFrameId = null;
        renderVisibleThumbnails();
    });
}

/**
 * 渲染PDF页面预览
 */
async function renderAllPages() {
    // 清空缩略图容器
    thumbnailContainer.innerHTML = '';
    setCurrentActivePage(1);

    for (let i = 1; i <= getTotalPages(); i++) {
        thumbnailContainer.appendChild(createThumbnailItem(i));
        mainContent.appendChild(createPageWrapper(i));
    }

    for (let i = 1; i <= Math.min(getTotalPages(), INITIAL_RENDERED_THUMBNAILS); i++) {
        await renderThumbnailForPage(i);
    }

    // 初始化拖拽排序
    initializeThumbnailDragSort();

    // 继续按可视区域补充渲染缩略图
    scheduleVisibleThumbnailRender();

    // 显示第一页
    await showPage(1);
}

/**
 * 初始化缩略图拖拽排序
 */
function initializeThumbnailDragSort() {
    const thumbItems = thumbnailContainer.querySelectorAll('.thumbnail-item');
    let draggedItem = null;

    thumbItems.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            draggedItem = item;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', (e) => {
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
 * 初始化指定页面的Fabric画布
 * @param {number} pageNum - 页面编号
 * @param {boolean} forceRecalculate - 是否强制重新计算缩放比例
 * @returns {Promise<fabric.Canvas>} Fabric画布对象
 */
async function initializeFabricCanvasForPage(pageNum, forceRecalculate = false) {
    // 计算或获取页面适配缩放比例
    const pageFitScales = getPageFitScales();
    if (forceRecalculate || !pageFitScales[pageNum - 1]) {
        const page = await getPdfDoc().getPage(pageNum);
        const highResViewport = page.getViewport({ scale: 2.0 });
        const containerWidth = mainContent.clientWidth - 40;
        setPageFitScaleAt(pageNum - 1, (containerWidth * 0.9) / highResViewport.width);
    }

    // 如果画布已存在且不需要强制重算，直接返回
    const fabricCanvases = getFabricCanvases();
    if (fabricCanvases[pageNum - 1] && !forceRecalculate) return fabricCanvases[pageNum - 1];

    // 获取PDF页面和高分辨率视图
    const page = await getPdfDoc().getPage(pageNum);
    const highResViewport = page.getViewport({ scale: 2.0 });
    const originalWidth = highResViewport.width;
    const originalHeight = highResViewport.height;

    // 获取或创建Fabric画布
    const canvasEl = document.getElementById(`canvas-${pageNum}`);
    const fabricCanvas = fabricCanvases[pageNum - 1] || new fabric.Canvas(canvasEl);

    // 如果是新画布，进行初始化
    if (!fabricCanvases[pageNum - 1]) {
        // 保存原始尺寸
        fabricCanvas.originalWidth = originalWidth;
        fabricCanvas.originalHeight = originalHeight;

        // 创建临时画布渲染PDF页面
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = originalWidth;
        tempCanvas.height = originalHeight;
        await page.render({ canvasContext: tempCanvas.getContext('2d'), viewport: highResViewport }).promise;

        // 设置背景图片
        fabricCanvas.setBackgroundImage(new fabric.Image(tempCanvas), fabricCanvas.renderAll.bind(fabricCanvas));

        // 保存到缓存
        setFabricCanvasAt(pageNum - 1, fabricCanvas);
    }

    return fabricCanvas;
}

/**
 * 显示指定页面
 * @param {number} pageNum - 要显示的页面编号
 * @param {boolean} forceRecalculate - 是否强制重新计算布局
 */
async function showPage(pageNum, forceRecalculate = false) {
    if (!getPdfDoc()) return;

    // 更新当前活动页面
    setCurrentActivePage(pageNum);

    // 隐藏所有页面画布
    document.querySelectorAll('.canvas-wrapper').forEach(div => div.style.display = 'none');

    // 移除所有缩略图的激活状态
    document.querySelectorAll('.thumbnail-item').forEach(item => item.classList.remove('active'));

    // 激活当前页面的缩略图
    const activeThumb = document.querySelector(`.thumbnail-item[data-page-number="${pageNum}"]`);
    if (activeThumb) activeThumb.classList.add('active');

    // 确保当前页缩略图已渲染
    await renderThumbnailForPage(pageNum);

    // 显示当前页面的画布
    const wrapper = document.getElementById(`page-wrapper-${pageNum}`);
    wrapper.style.display = 'block';

    // 初始化Fabric画布
    await initializeFabricCanvasForPage(pageNum, forceRecalculate);

    // 应用缩放设置
    applyZoom();

    // 更新页面导航器
    updatePageNavigator();
}

/**
 * 处理印章文件上传
 * @param {File} file - 印章图片文件
 */
function handleSealFile(file) {
    // 验证图片文件
    const validation = window.Validators.validateImageFile(file);
    if (!validation.valid) {
        window.Toast.error(validation.error);
        return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
        const imageUrl = event.target.result;

        // 创建印章图片对象
        const sealImageElement = new Image();
        sealImageElement.src = imageUrl;
        setSealImageElement(sealImageElement);

        // 更新预览图片
        sealPreviewImg.src = imageUrl;
        sealPreviewImg.classList.remove('hidden');
        sealPlaceholder.classList.add('hidden');

        // 图片加载完成后验证尺寸并提示用户
        sealImageElement.onload = () => {
            const dimValidation = window.Validators.validateImageDimensions(sealImageElement);
            if (!dimValidation.valid) {
                window.Toast.error(dimValidation.error);
                // 清除无效图片
                setSealImageElement(null);
                sealPreviewImg.src = '';
                sealPreviewImg.classList.add('hidden');
                sealPlaceholder.classList.remove('hidden');
                return;
            }
            window.Toast.success('印章已准备好。');
        }
    };

    // 读取文件为DataURL
    reader.readAsDataURL(file);
}

/**
 * 添加普通印章到当前页面
 */
function addNormalSeal() {
    const sealImageElement = getSealImageElement();

    // 验证印章图片是否有效
    if (!sealImageElement || !sealImageElement.src || sealImageElement.naturalWidth === 0 || !getPdfDoc()) {
        window.Toast.warning('请先选择一个有效的印章图片！');
        return;
    }

    const canvas = getCurrentPageCanvas();
    if (!canvas) return;

    // 创建新的图片对象进行处理
    const imageToProcess = new Image();
    imageToProcess.onload = () => {
        // 获取旋转和亮度调整后的印章图片
        const rotatedSealUrl = getRotatedCroppedImage(imageToProcess, getSealRotation(), getSealBrightness());

        // 从URL创建Fabric图片对象
        fabric.Image.fromURL(rotatedSealUrl, (img) => {
            // 获取用户设置
            const settings = window.Settings.getSettings();

            // 设置印章大小（根据用户设置）
            img.scaleToWidth(canvas.originalWidth * settings.sealSize);

            // 配置印章属性
            img.set({
                left: canvas.originalWidth / 2,
                top: canvas.originalHeight / 2,
                originX: 'center',
                originY: 'center',
                cornerSize: 10,
                cornerStyle: 'circle',
                cornerColor: '#007bff',
                transparentCorners: false,
                borderColor: '#007bff',
                lockRotation: true,
                angle: 0,
                opacity: settings.sealOpacity
            });

            // 使用历史系统添加印章
            const command = new window.History.AddSealCommand(getCurrentActivePage(), img);
            window.History.executeCommand(command);
            canvas.setActiveObject(img);
        });
    };

    imageToProcess.onerror = () => {
        window.Toast.error('无法处理此印章图片。');
    };

    imageToProcess.src = sealImageElement.src;
}

/**
 * 添加骑缝章到所有页面
 */
async function addStraddleSeal() {
    const sealImageElement = getSealImageElement();
    const pdfDoc = getPdfDoc();

    // 验证印章图片是否有效
    if (!sealImageElement || !sealImageElement.src || sealImageElement.naturalWidth === 0 || !pdfDoc) {
        window.Toast.warning('请先选择一个有效的印章图片！');
        return;
    }

    const imageToProcess = new Image();
    imageToProcess.onload = async () => {
        // 获取旋转和亮度调整后的印章图片
        const rotatedSealUrl = getRotatedCroppedImage(imageToProcess, getSealRotation(), getSealBrightness());
        const rotatedSealImage = new Image();
        rotatedSealImage.src = rotatedSealUrl;

        rotatedSealImage.onload = async () => {
            const totalPages = pdfDoc.numPages;
            const pieceWidth = sealImageElement.width / totalPages;
            const groupId = `straddle-${Date.now()}`;

            // 为每个页面创建印章片段
            for (let i = 0; i < totalPages; i++) {
                const pageNum = i + 1;
                const canvas = await initializeFabricCanvasForPage(pageNum);
                if (!canvas) continue;

                // 获取用户设置
                const settings = window.Settings.getSettings();

                // 计算初始缩放比例（根据用户设置）
                const initialScale = (canvas.originalWidth * settings.sealSize) / sealImageElement.width;

                // 创建印章片段画布
                const tempPieceCanvas = document.createElement('canvas');
                tempPieceCanvas.width = pieceWidth;
                tempPieceCanvas.height = sealImageElement.height;

                // 绘制印章片段
                tempPieceCanvas.getContext('2d').drawImage(
                    rotatedSealImage,
                    i * pieceWidth, 0, pieceWidth, sealImageElement.height,
                    0, 0, pieceWidth, sealImageElement.height
                );

                // 创建Fabric图片对象
                fabric.Image.fromURL(tempPieceCanvas.toDataURL(), (imgPiece) => {
                    imgPiece.scale(initialScale);
                    const scaledPieceWidth = pieceWidth * initialScale;

                    // 配置印章片段属性
                    imgPiece.set({
                        left: canvas.originalWidth - scaledPieceWidth,
                        top: 400,
                        hasControls: true,
                        borderColor: '#007bff',
                        lockMovementX: true,
                        lockRotation: true,
                        straddleGroup: groupId,
                        pageIndex: i,
                        originX: 'left',
                        originY: 'top',
                        angle: 0,
                        opacity: settings.sealOpacity
                    });

                    // 添加到画布
                    canvas.add(imgPiece);
                    canvas.renderAll();

                    // 同步骑缝章片段
                    const syncObjects = (target) => {
                        getFabricCanvases().forEach((c) => {
                            if (!c) return;
                            c.getObjects()
                                .filter(obj => obj.straddleGroup === groupId && obj !== target)
                                .forEach(obj => {
                                    obj.set({ top: target.top, scaleX: target.scaleX, scaleY: target.scaleY }).setCoords();
                                    c.renderAll();
                                });
                        });
                    };

                    // 监听移动和缩放事件进行同步
                    imgPiece.on('moving', () => syncObjects(imgPiece));
                    imgPiece.on('scaling', () => syncObjects(imgPiece));
                });
            }
        }
    };

    imageToProcess.onerror = () => {
        window.Toast.error('无法处理此印章图片。');
    };

    imageToProcess.src = sealImageElement.src;
}

/**
 * 删除选中的印章对象
 */
function deleteSelectedObject() {
    const canvas = getCurrentPageCanvas();
    if (!canvas) return;

    const activeObject = canvas.getActiveObject();
    if (activeObject) {
        // 检查是否是骑缝章
        if (activeObject.straddleGroup) {
            const groupId = activeObject.straddleGroup;

            // 删除所有页面中属于同一骑缝章组的对象
            getFabricCanvases().forEach(c => {
                if (!c) return;
                c.getObjects()
                    .filter(obj => obj.straddleGroup === groupId)
                    .forEach(obj => c.remove(obj));
                c.renderAll();
            });
            window.Toast.success('已删除骑缝章');
        } else {
            // 使用历史系统删除普通印章
            const command = new window.History.DeleteSealCommand(getCurrentActivePage(), activeObject);
            window.History.executeCommand(command);
            window.Toast.success('已删除印章');
        }
    } else {
        window.Toast.warning('请先选择要删除的印章');
    }
}

/**
 * 导出带有印章的PDF文件
 */
async function exportPDF() {
    if (!getOriginalPdfBytes()) {
        window.Toast.warning('请先上传PDF文件！');
        return;
    }

    // 显示导出加载状态
    window.Loading.showExportLoading('正在导出 PDF...');

    try {
        const { PDFDocument, degrees } = window.PDFLib;

        // 加载原始PDF文档
        const pdfDoc = await PDFDocument.load(getOriginalPdfBytes());
        const pages = pdfDoc.getPages();

        // 为每个页面添加印章
        for (let i = 0; i < pages.length; i++) {
            const canvas = getFabricCanvases()[i];
            if (!canvas) continue;

            // 更新进度
            const progress = ((i + 1) / pages.length) * 80; // 0-80%
            window.Loading.updateProgress(progress, `处理第 ${i + 1}/${pages.length} 页`);

            const page = pages[i];
            const { width: pageWidth, height: pageHeight } = page.getSize();

            // 获取所有印章对象（排除背景图片）
            const objects = canvas.getObjects().filter(obj => !obj.isBackgroundImage);

            for (const obj of objects) {
                const multiplier = 2;

                // 将印章对象转换为图片
                const imgDataUrl = obj.toDataURL({ format: 'png', multiplier });
                const pngImageBytes = await fetch(imgDataUrl).then(res => res.arrayBuffer());
                const pngImage = await pdfDoc.embedPng(pngImageBytes);

                // 计算印章尺寸和位置
                const objWidth = obj.getScaledWidth();
                const objHeight = obj.getScaledHeight();
                let objLeft = obj.left;
                let objTop = obj.top;

                // 调整坐标原点
                if (obj.originX === 'center') objLeft -= objWidth / 2;
                if (obj.originY === 'center') objTop -= objHeight / 2;

                // 转换为PDF坐标系
                const pdfX = (objLeft / canvas.originalWidth) * pageWidth;
                const pdfY = pageHeight - ((objTop + objHeight) / canvas.originalHeight) * pageHeight;

                // 在PDF页面上绘制印章
                page.drawImage(pngImage, {
                    x: pdfX,
                    y: pdfY,
                    width: (objWidth / canvas.originalWidth) * pageWidth,
                    height: (objHeight / canvas.originalHeight) * pageHeight,
                    rotate: degrees(0),
                });
            }
        }

        // 保存PDF
        window.Loading.updateProgress(90, '正在保存文件...');
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);

        // 生成文件名
        const fileName = pdfInputElement.files[0]?.name.replace('.pdf', '') || 'document';
        link.download = `${fileName}_盖章版.pdf`;

        // 触发下载
        window.Loading.updateProgress(100, '完成！');
        link.click();
        URL.revokeObjectURL(link.href);

        // 隐藏加载状态并显示成功提示
        window.Loading.hide();
        window.Toast.success('PDF 导出成功！');

    } catch (error) {
        console.error('导出PDF时发生错误:', error);
        window.Loading.hide();
        window.Toast.error('导出失败，详情请查看控制台。', 0); // 0 = 不自动消失
    }
}

/**
 * 清理所有PDF相关资源（内存管理）
 */
function cleanupAllResources() {
    if (thumbnailRenderFrameId !== null) {
        window.cancelAnimationFrame(thumbnailRenderFrameId);
        thumbnailRenderFrameId = null;
    }

    // 清理所有Fabric画布
    const fabricCanvases = [...getFabricCanvases()];
    fabricCanvases.forEach((canvas, index) => {
        if (canvas) {
            try {
                canvas.dispose();
            } catch (error) {
                console.warn(`清理画布 ${index + 1} 时出错:`, error);
            }
        }
    });

    // 重置画布数组
    setFabricCanvases([]);
    setPageFitScales([]);

    // 清理PDF文档对象
    if (getPdfDoc()) {
        try {
            getPdfDoc().destroy();
        } catch (error) {
            console.warn('清理PDF文档时出错:', error);
        }
        setPdfDoc(null);
    }

    // 清理原始PDF字节数据
    setOriginalPdfBytes(null);

    // 重置页面计数
    setTotalPages(0);
    setCurrentActivePage(1);

    // 清理DOM元素（innerHTML已在handlePdfFile中处理）
}

/**
 * 显示快捷键帮助面板
 */
function showShortcutsHelp() {
    const shortcuts = [
        { category: '编辑', items: [
            { keys: 'Ctrl+Z', desc: '撤销' },
            { keys: 'Ctrl+Y', desc: '重做' },
            { keys: 'Delete', desc: '删除选中印章' },
            { keys: 'Esc', desc: '取消选择' },
        ]},
        { category: '移动', items: [
            { keys: '↑↓←→', desc: '移动印章 (1px)' },
            { keys: 'Shift+↑↓←→', desc: '快速移动 (10px)' },
        ]},
        { category: '视图', items: [
            { keys: '+/-', desc: '缩放' },
            { keys: 'PageUp/Down', desc: '切换页面' },
        ]},
        { category: '操作', items: [
            { keys: 'Ctrl+S', desc: '导出PDF' },
            { keys: '?', desc: '显示此帮助' },
        ]},
    ];

    let html = '<div style="font-family: sans-serif;"><h2 style="margin-top:0;">键盘快捷键</h2>';
    shortcuts.forEach(cat => {
        html += `<h3 style="margin: 1rem 0 0.5rem; color: #007bff;">${cat.category}</h3>`;
        html += '<table style="width:100%; border-collapse: collapse;">';
        cat.items.forEach(item => {
            html += `<tr><td style="padding:0.5rem; border-bottom:1px solid #eee; font-weight:600;">${item.keys}</td><td style="padding:0.5rem; border-bottom:1px solid #eee;">${item.desc}</td></tr>`;
        });
        html += '</table>';
    });
    html += '</div>';

    // 创建模态框
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:30000; display:flex; align-items:center; justify-content:center;';

    const content = document.createElement('div');
    content.style.cssText = 'background:white; padding:2rem; border-radius:8px; max-width:600px; max-height:80vh; overflow-y:auto;';
    content.innerHTML = html;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '关闭 (Esc)';
    closeBtn.style.cssText = 'margin-top:1rem; padding:0.75rem 1.5rem; background:#007bff; color:white; border:none; border-radius:4px; cursor:pointer; font-size:1rem;';
    closeBtn.onclick = () => modal.remove();
    content.appendChild(closeBtn);

    modal.appendChild(content);
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', escHandler);
        }
    });

    document.body.appendChild(modal);
}

/**
 * 保存当前印章到库
 */
async function saveSealToLibrary() {
    const sealImageElement = getSealImageElement();

    if (!sealImageElement || !sealImageElement.src || sealImageElement.naturalWidth === 0) {
        window.Toast.warning('请先选择一个有效的印章图片！');
        return;
    }

    // 提示用户输入印章名称
    const sealName = await window.Settings.promptInput({
        title: '保存到印章库',
        message: '请输入印章名称：',
        defaultValue: '印章' + (window.SealLibrary.getSavedSeals().length + 1),
        placeholder: '请输入印章名称',
        confirmText: '保存',
        cancelText: '取消',
    });

    if (!sealName) {
        return; // 用户取消
    }

    if (sealName.trim().length === 0) {
        window.Toast.warning('印章名称不能为空');
        return;
    }

    // 保存印章
    const success = window.SealLibrary.addSealToLibrary(
        sealName.trim(),
        sealImageElement.src,
        getSealRotation()
    );

    if (success) {
        window.SealLibrary.renderSealLibrary();
    }
}

// 启动应用 - 等待DOM和所有依赖加载完成
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}

// ==================== Magic Eraser (去白底) ====================

/**
 * 去除图片白色背景
 */
function removeWhiteBackground() {
    const sealImageElement = getSealImageElement();

    if (!sealImageElement || !sealImageElement.src || sealImageElement.naturalWidth === 0) {
        window.Toast.warning('请先选择一个有效的印章图片！');
        return;
    }

    const img = new Image();
    img.src = sealImageElement.src;
    img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const threshold = 200; // 阈值，可调整

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // 如果 RGB 值都很高（接近白色），则将 Alpha 设为 0（透明）
            if (r > threshold && g > threshold && b > threshold) {
                data[i + 3] = 0;
            }
        }

        ctx.putImageData(imageData, 0, 0);
        
        // 更新预览和状态
        const newSrc = canvas.toDataURL('image/png');
        sealImageElement.src = newSrc;
        setSealImageElement(sealImageElement);
        sealPreviewImg.src = newSrc;
        
        window.Toast.success('已成功去除白色背景！');
    };
    img.onerror = () => {
        window.Toast.error('处理图片时发生错误。');
    };
}

// ==================== Signature System (手写签名) ====================

let signaturePad = {
    canvas: null,
    ctx: null,
    isDrawing: false,
    lastX: 0,
    lastY: 0,
    initialized: false,

    init: function() {
        if (this.initialized) return;

        this.canvas = document.getElementById('signature-canvas');
        this.ctx = this.canvas.getContext('2d');

        // 设置线条样式
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 3;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // 绑定事件
        this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
        this.canvas.addEventListener('mousemove', this.draw.bind(this));
        this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
        this.canvas.addEventListener('mouseout', this.stopDrawing.bind(this));

        // 触摸事件支持
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            this.startDrawing({
                offsetX: touch.clientX - rect.left,
                offsetY: touch.clientY - rect.top
            });
        });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            this.draw({
                offsetX: touch.clientX - rect.left,
                offsetY: touch.clientY - rect.top
            });
        });

        this.canvas.addEventListener('touchend', this.stopDrawing.bind(this));

        this.initialized = true;
    },
    
    startDrawing: function(e) {
        this.isDrawing = true;
        [this.lastX, this.lastY] = [e.offsetX, e.offsetY];
    },
    
    draw: function(e) {
        if (!this.isDrawing) return;
        this.ctx.beginPath();
        this.ctx.moveTo(this.lastX, this.lastY);
        this.ctx.lineTo(e.offsetX, e.offsetY);
        this.ctx.stroke();
        [this.lastX, this.lastY] = [e.offsetX, e.offsetY];
    },
    
    stopDrawing: function() {
        this.isDrawing = false;
    },
    
    clear: function() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    },
    
    isEmpty: function() {
        const pixelBuffer = new Uint32Array(
            this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height).data.buffer
        );
        return !pixelBuffer.some(color => color !== 0);
    },
    
    toDataURL: function() {
        return this.canvas.toDataURL('image/png');
    }
};

/**
 * 打开签名模态框
 */
function openSignatureModal() {
    const modal = document.getElementById('signature-modal');
    modal.classList.remove('hidden');
    signaturePad.init();
    signaturePad.clear();
}

/**
 * 关闭签名模态框
 */
function closeSignatureModal() {
    document.getElementById('signature-modal').classList.add('hidden');
}

/**
 * 添加签名到当前页面
 */
function addSignatureToPage() {
    if (signaturePad.isEmpty()) {
        window.Toast.warning('请先书写签名！');
        return;
    }

    const signatureDataUrl = signaturePad.toDataURL();
    const canvas = getCurrentPageCanvas();

    if (!canvas) return;

    fabric.Image.fromURL(signatureDataUrl, (img) => {
        // 设置初始属性
        img.scaleToWidth(200); // 默认宽度
        img.set({
            left: canvas.originalWidth / 2,
            top: canvas.originalHeight / 2,
            originX: 'center',
            originY: 'center',
            borderColor: '#007bff',
            cornerColor: '#007bff',
            cornerSize: 10,
            transparentCorners: false
        });

        // 使用历史系统添加对象
        const command = new window.History.AddSealCommand(getCurrentActivePage(), img);
        window.History.executeCommand(command);

        canvas.setActiveObject(img);
        canvas.renderAll();

        closeSignatureModal();
        window.Toast.success('签名已添加');
    });
}

/**
 * 初始化右键菜单
 */
function initContextMenu() {
    const contextMenu = document.getElementById('context-menu');
    if (!contextMenu) return;

    // 为所有画布添加右键事件监听
    document.addEventListener('contextmenu', (e) => {
        // 检查是否在画布上右键
        const canvasWrapper = e.target.closest('.canvas-wrapper');
        if (!canvasWrapper) {
            hideContextMenu();
            return;
        }

        const canvas = getCurrentPageCanvas();
        const activeObject = canvas?.getActiveObject();

        // 只在有选中对象时显示菜单
        if (activeObject) {
            e.preventDefault();
            showContextMenu(e.clientX, e.clientY);
        }
    });

    // 点击菜单项
    contextMenu.addEventListener('click', (e) => {
        const menuItem = e.target.closest('.context-menu-item');
        if (!menuItem) return;

        const action = menuItem.dataset.action;
        handleContextMenuAction(action);
        hideContextMenu();
    });

    // 点击其他地方隐藏菜单
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#context-menu')) {
            hideContextMenu();
        }
    });
}

/**
 * 显示右键菜单
 */
function showContextMenu(x, y) {
    const contextMenu = document.getElementById('context-menu');
    if (!contextMenu) return;

    contextMenu.classList.remove('hidden');
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;

    // 重新初始化图标
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

/**
 * 隐藏右键菜单
 */
function hideContextMenu() {
    const contextMenu = document.getElementById('context-menu');
    if (contextMenu) {
        contextMenu.classList.add('hidden');
    }
}

/**
 * 处理右键菜单操作
 */
function handleContextMenuAction(action) {
    switch (action) {
        case 'delete':
            deleteSelectedObject();
            break;
        case 'undo':
            window.History.undo();
            break;
        case 'redo':
            window.History.redo();
            break;
    }
}
