/**
 * Loading Indicator System for PDF Stamper
 * Provides loading overlays and progress indicators for long operations
 */

// ==================== Loading Overlay ====================

let loadingOverlay = null;
let progressBar = null;
let progressText = null;

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
    </div>
  `;
  document.body.appendChild(loadingOverlay);

  progressBar = loadingOverlay.querySelector('.loading-progress-bar');
  progressText = loadingOverlay.querySelector('.loading-progress-text');
}

// ==================== Loading Functions ====================

/**
 * Show loading overlay
 * @param {string} message - Loading message to display
 * @param {boolean} showProgress - Whether to show progress bar
 */
function showLoading(message = '加载中...', showProgress = false) {
  initLoadingOverlay();

  const textEl = loadingOverlay.querySelector('.loading-text');
  const progressContainer = loadingOverlay.querySelector('.loading-progress-container');

  textEl.textContent = message;
  progressContainer.style.display = showProgress ? 'block' : 'none';
  progressText.style.display = showProgress ? 'block' : 'none';

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
function showExportLoading(message = '正在导出 PDF...') {
  showLoading(message, true);
}

/**
 * Wrap an async operation with loading indicator
 * @param {Function} operation - Async function to execute
 * @param {string} message - Loading message
 * @param {boolean} showProgress - Whether to show progress bar
 * @returns {Promise} Result of the operation
 */
async function withLoading(operation, message = '处理中...', showProgress = false) {
  try {
    showLoading(message, showProgress);
    const result = await operation();
    return result;
  } finally {
    hideLoading();
  }
}

// ==================== Exports ====================

window.Loading = {
  show: showLoading,
  hide: hideLoading,
  updateProgress: updateProgress,
  showPdfLoading: showPdfLoading,
  showExportLoading: showExportLoading,
  withLoading: withLoading,
};

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLoadingOverlay);
} else {
  initLoadingOverlay();
}
