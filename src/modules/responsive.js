/**
 * 响应式布局管理模块
 * 处理移动端适配、触摸手势、布局切换
 */

let isMobile = false;
let touchStartX = 0;
let touchStartY = 0;
let gestureState = { zoom: 1, rotation: 0 };

/**
 * 检测屏幕宽度并应用响应式布局
 */
export function detectAndApplyResponsive() {
  const wasMobile = isMobile;
  isMobile = window.innerWidth <= 768;

  if (isMobile !== wasMobile) {
    applyMobileLayout(isMobile);
  }

  return isMobile;
}

/**
 * 应用移动端布局
 * @param {boolean} mobile - 是否为移动端
 */
function applyMobileLayout(mobile) {
  const appContainer = document.getElementById('app');
  const toolbar = document.querySelector('.toolbar');

  if (!appContainer || !toolbar) return;

  if (mobile) {
    // 移动端：切到单列布局，避免侧栏收起后丢失预览入口
    appContainer.classList.add('mobile');
    appContainer.classList.remove('sidebar-collapsed');
    toolbar.classList.add('toolbar-compact');
  } else {
    // 桌面端：恢复默认
    appContainer.classList.remove('mobile');
    toolbar.classList.remove('toolbar-compact');
  }
}

/**
 * 计算触摸两点间距离
 */
function getTouchDistance(touch1, touch2) {
  const dx = touch1.clientX - touch2.clientX;
  const dy = touch1.clientY - touch2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 计算触摸两点间角度
 */
function getTouchAngle(touch1, touch2) {
  const dx = touch1.clientX - touch2.clientX;
  const dy = touch1.clientY - touch2.clientY;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/**
 * 初始化触摸手势支持
 * @param {HTMLElement} canvasEl - 画布元素
 */
export function initTouchGestures(canvasEl) {
  if (!canvasEl) return;

  let initialScale = 1;
  let initialRotation = 0;
  let objectBeingMoved = null;

  canvasEl.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      // 单指触摸：拖动
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      objectBeingMoved = canvasEl._canvas?.getActiveObject();
    } else if (e.touches.length === 2) {
      // 双指触摸：缩放+旋转
      initialScale = getTouchDistance(e.touches[0], e.touches[1]);
      initialRotation = getTouchAngle(e.touches[0], e.touches[1]);
      e.preventDefault();
    }
  }, { passive: false });

  canvasEl.addEventListener('touchmove', (e) => {
    const canvas = canvasEl._canvas;
    if (!canvas) return;

    if (e.touches.length === 1) {
      // 单指拖动：移动选中对象
      const activeObject = canvas.getActiveObject();
      if (activeObject && objectBeingMoved) {
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;

        activeObject.set({
          left: activeObject.left + dx,
          top: activeObject.top + dy,
        });
        canvas.renderAll();

        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    } else if (e.touches.length === 2) {
      // 双指缩放+旋转
      e.preventDefault();
      const currentScale = getTouchDistance(e.touches[0], e.touches[1]);
      const scaleRatio = currentScale / initialScale;

      const activeObject = canvas.getActiveObject();
      if (activeObject) {
        activeObject.set({
          scaleX: activeObject.scaleX * scaleRatio,
          scaleY: activeObject.scaleY * scaleRatio,
        });
        canvas.renderAll();
      }

      initialScale = currentScale;
    }
  }, { passive: false });

  canvasEl.addEventListener('touchend', (e) => {
    // 触摸结束：清除状态
    objectBeingMoved = null;
    gestureState = { zoom: 1, rotation: 0 };
  });
}

/**
 * 优化移动端 UI 元素
 */
export function optimizeMobileUI() {
  if (!isMobile) return;

  // 增大按钮触摸区域
  const buttons = document.querySelectorAll('.btn, .toolbar-btn, .icon-btn');
  buttons.forEach((btn) => {
    btn.style.minWidth = '44px';
    btn.style.minHeight = '44px';
    btn.style.padding = '8px';
  });

  // 隐藏桌面端专用提示
  const desktopHints = document.querySelectorAll('.desktop-only');
  desktopHints.forEach((hint) => {
    hint.style.display = 'none';
  });

  // 显示移动端专用提示
  const mobileHints = document.querySelectorAll('.mobile-only');
  mobileHints.forEach((hint) => {
    hint.style.display = 'block';
  });
}

/**
 * 初始化响应式布局
 */
export function initResponsive() {
  detectAndApplyResponsive();
  window.addEventListener('resize', detectAndApplyResponsive);

  // 为所有画布初始化触摸手势
  const observer = new MutationObserver(() => {
    document.querySelectorAll('canvas').forEach((canvas) => {
      if (!canvas._touchInitialized) {
        initTouchGestures(canvas);
        canvas._touchInitialized = true;
      }
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * 获取当前是否为移动端
 * @returns {boolean}
 */
export function getIsMobile() {
  return isMobile;
}
