/**
 * 响应式布局管理模块
 * 处理移动端适配、布局切换
 *
 * 注: 印章的触摸拖动/缩放由 fabric.js 画布原生处理。
 * 早期版本这里有一套自定义 touch 手势，但依赖从未被赋值的 canvasEl._canvas，
 * 整条链路是死代码，且配套的全文档 MutationObserver 常驻空转，已移除。
 */

let isMobile = false;

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
 * 初始化响应式布局
 */
export function initResponsive() {
  detectAndApplyResponsive();
  window.addEventListener('resize', detectAndApplyResponsive);
}

/**
 * 获取当前是否为移动端
 * @returns {boolean}
 */
export function getIsMobile() {
  return isMobile;
}
