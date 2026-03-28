/**
 * Toast Notification System for PDF Stamper
 * Provides user-friendly notifications to replace browser dialogs
 */

// ==================== Constants ====================

const TOAST_DURATION = {
  SHORT: 2000,   // 2 seconds
  MEDIUM: 3000,  // 3 seconds
  LONG: 5000,    // 5 seconds
};

const TOAST_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
};

// ==================== Toast Container ====================

let toastContainer = null;

/**
 * Initialize toast container (called once on page load)
 */
function initToastContainer() {
  if (toastContainer) return;

  toastContainer = document.createElement('div');
  toastContainer.id = 'toast-container';
  toastContainer.className = 'toast-container';
  document.body.appendChild(toastContainer);
}

// ==================== Toast Functions ====================

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {string} type - Toast type (success, error, warning, info)
 * @param {number} duration - Duration in milliseconds (0 = no auto-dismiss)
 * @returns {HTMLElement} Toast element
 */
function showToast(message, type = TOAST_TYPES.INFO, duration = TOAST_DURATION.MEDIUM) {
  initToastContainer();

  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  // Create icon
  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.textContent = getToastIcon(type);

  // Create message
  const messageEl = document.createElement('span');
  messageEl.className = 'toast-message';
  messageEl.textContent = message;

  // Create close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.onclick = () => dismissToast(toast);

  // Assemble toast
  toast.appendChild(icon);
  toast.appendChild(messageEl);
  toast.appendChild(closeBtn);

  // Add to container
  toastContainer.appendChild(toast);

  // Trigger animation
  setTimeout(() => toast.classList.add('toast-show'), 10);

  // Auto-dismiss if duration > 0
  if (duration > 0) {
    setTimeout(() => dismissToast(toast), duration);
  }

  return toast;
}

/**
 * Dismiss a toast notification
 * @param {HTMLElement} toast - Toast element to dismiss
 */
function dismissToast(toast) {
  if (!toast || !toast.parentElement) return;

  toast.classList.remove('toast-show');
  toast.classList.add('toast-hide');

  // Remove from DOM after animation
  setTimeout(() => {
    if (toast.parentElement) {
      toast.parentElement.removeChild(toast);
    }
  }, 300);
}

/**
 * Get icon for toast type
 * @param {string} type - Toast type
 * @returns {string} Icon character
 */
function getToastIcon(type) {
  switch (type) {
    case TOAST_TYPES.SUCCESS:
      return '✓';
    case TOAST_TYPES.ERROR:
      return '✕';
    case TOAST_TYPES.WARNING:
      return '⚠';
    case TOAST_TYPES.INFO:
    default:
      return 'ℹ';
  }
}

// ==================== Convenience Functions ====================

/**
 * Show success toast
 * @param {string} message - Success message
 * @param {number} duration - Duration in milliseconds
 */
function showSuccess(message, duration = TOAST_DURATION.MEDIUM) {
  return showToast(message, TOAST_TYPES.SUCCESS, duration);
}

/**
 * Show error toast
 * @param {string} message - Error message
 * @param {number} duration - Duration in milliseconds (0 = manual dismiss)
 */
function showError(message, duration = TOAST_DURATION.LONG) {
  return showToast(message, TOAST_TYPES.ERROR, duration);
}

/**
 * Show warning toast
 * @param {string} message - Warning message
 * @param {number} duration - Duration in milliseconds
 */
function showWarning(message, duration = TOAST_DURATION.MEDIUM) {
  return showToast(message, TOAST_TYPES.WARNING, duration);
}

/**
 * Show info toast
 * @param {string} message - Info message
 * @param {number} duration - Duration in milliseconds
 */
function showInfo(message, duration = TOAST_DURATION.MEDIUM) {
  return showToast(message, TOAST_TYPES.INFO, duration);
}

/**
 * Clear all toasts
 */
function clearAllToasts() {
  if (!toastContainer) return;

  const toasts = toastContainer.querySelectorAll('.toast');
  toasts.forEach(toast => dismissToast(toast));
}

// ==================== Exports ====================

// Export for use in main.js
window.Toast = {
  show: showToast,
  success: showSuccess,
  error: showError,
  warning: showWarning,
  info: showInfo,
  clear: clearAllToasts,
  DURATION: TOAST_DURATION,
  TYPES: TOAST_TYPES,
};

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initToastContainer);
} else {
  initToastContainer();
}
