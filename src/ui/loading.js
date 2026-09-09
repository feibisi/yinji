/**
 * Loading Indicator System for PDF Stamper
 * Provides loading overlays and progress indicators for long operations
 */

// ==================== Loading Overlay ====================

let loadingOverlay = null;
let progressBar = null;
let progressText = null;
let cancelButton = null;
let cancelHandler = null;

/**
 * Initialize loading overlay (called once on page load)
 */
function initLoadingOverlay() {
  if (loadingOverlay) return;

  loadingOverlay = document.createElement('div');
  loadingOverlay.id = 'loading-overlay';
  loadingOverlay.className = 'loading-overlay';
  loadingOverlay.innerHTML = `
    <div class="loading-content">
      <div class="loading-spinner"></div>
      <div class="loading-text">加载中...</div>
      <div class="loading-progress-container">
        <div class="loading-progress-bar"></div>
      </div>
      <div class="loading-progress-text"></div>
      <button type="button" class="btn btn-secondary loading-cancel-btn" hidden>取消</button>
    </div>
  `;
  document.body.appendChild(loadingOverlay);

  progressBar = loadingOverlay.querySelector('.loading-progress-bar');
  progressText = loadingOverlay.querySelector('.loading-progress-text');
  cancelButton = loadingOverlay.querySelector('.loading-cancel-btn');
  cancelButton.addEventListener('click', () => {
    if (!cancelHandler || cancelButton.disabled) return;
    cancelButton.disabled = true;
    cancelButton.textContent = '正在取消…';
    cancelHandler();
  });
}

function configureCancel({ cancelable = false, onCancel = null } = {}) {
  if (!cancelButton) return;
  cancelHandler = cancelable && typeof onCancel === 'function' ? onCancel : null;
  cancelButton.hidden = !cancelHandler;
  cancelButton.disabled = false;
  cancelButton.textContent = '取消';
}

// ==================== Loading Functions ====================

/**
 * Show loading overlay
 * @param {string} message - Loading message to display
 * @param {boolean} showProgress - Whether to show progress bar
 */
function showLoading(message = '加载中...', showProgress = false, options = {}) {
  initLoadingOverlay();

  const textEl = loadingOverlay.querySelector('.loading-text');
  const progressContainer = loadingOverlay.querySelector('.loading-progress-container');

  textEl.textContent = message;
  progressContainer.style.display = showProgress ? 'block' : 'none';
  progressText.style.display = showProgress ? 'block' : 'none';
  configureCancel(options);

  if (showProgress) {
    updateProgress(0);
  }

  loadingOverlay.classList.add('loading-show');
}

/**
 * Hide loading overlay
 */
function hideLoading() {
  if (!loadingOverlay) return;
  loadingOverlay.classList.remove('loading-show');
  configureCancel();
}

/**
 * Update progress bar
 * @param {number} percent - Progress percentage (0-100)
 * @param {string} text - Optional progress text
 */
function updateProgress(percent, text = '') {
  if (!progressBar) return;

  const clampedPercent = Math.max(0, Math.min(100, percent));
  progressBar.style.width = `${clampedPercent}%`;

  if (text) {
    progressText.textContent = text;
  } else {
    progressText.textContent = `${Math.round(clampedPercent)}%`;
  }
}

// ==================== Convenience Functions ====================

/**
 * Show loading for PDF operations
 * @param {string} message - Loading message
 */
function showPdfLoading(message = '正在加载文件...') {
  showLoading(message, false);
}

/**
 * Show loading for export operations with progress
 * @param {string} message - Loading message
 */
function showExportLoading(message = '正在导出 PDF...', options = {}) {
  showLoading(message, true, options);
}

window.Loading = {
  show: showLoading,
  hide: hideLoading,
  updateProgress: updateProgress,
  showPdfLoading: showPdfLoading,
  showExportLoading: showExportLoading,
};

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLoadingOverlay);
} else {
  initLoadingOverlay();
}
