/**
 * Settings Management System for PDF Stamper
 * Manages user preferences and settings
 */

// ==================== Constants ====================

const SETTINGS_KEY = 'pdf-stamper-settings';

const DEFAULT_SETTINGS = {
  sealSize: 0.2, // 印章大小比例 (页面宽度的比例)
  sealRotation: 0, // 默认旋转角度
  sealOpacity: 1, // 印章透明度 (0-1)
  autoSave: false, // 自动保存设置
  exportFormat: 'pdf', // 导出格式
  exportQuality: 'high', // 导出质量
};

const SETTINGS_TYPES = Object.freeze(
  Object.fromEntries(
    Object.entries(DEFAULT_SETTINGS).map(([key, value]) => [key, typeof value])
  )
);

// ==================== Validation Functions ====================

/**
 * Check whether a value is a plain object
 * @param {*} value - Value to check
 * @returns {boolean} Whether value is a plain object
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Sanitize stored settings with default values
 * @param {*} rawSettings - Settings from localStorage
 * @returns {Object} Sanitized settings object
 */
function sanitizeSettings(rawSettings) {
  if (!isPlainObject(rawSettings)) {
    return { ...DEFAULT_SETTINGS };
  }

  const sanitizedSettings = { ...DEFAULT_SETTINGS };

  Object.keys(DEFAULT_SETTINGS).forEach((key) => {
    const value = rawSettings[key];
    const expectedType = SETTINGS_TYPES[key];

    if (value === undefined) {
      return;
    }

    if (expectedType === 'number') {
      if (typeof value === 'number' && Number.isFinite(value)) {
        sanitizedSettings[key] = value;
      }
      return;
    }

    if (typeof value === expectedType) {
      sanitizedSettings[key] = value;
    }
  });

  return sanitizedSettings;
}

/**
 * Validate imported settings with whitelist and type checks
 * @param {*} rawSettings - Imported settings object
 * @returns {Object} Validated settings object
 */
function validateImportedSettings(rawSettings) {
  if (!isPlainObject(rawSettings)) {
    throw new Error('无效的设置文件');
  }

  const validatedSettings = { ...DEFAULT_SETTINGS };
  const allowedKeys = Object.keys(DEFAULT_SETTINGS);

  Object.keys(rawSettings).forEach((key) => {
    if (!allowedKeys.includes(key)) {
      throw new Error(`不支持的设置项：${key}`);
    }
  });

  allowedKeys.forEach((key) => {
    const value = rawSettings[key];
    const expectedType = SETTINGS_TYPES[key];

    if (value === undefined) {
      return;
    }

    if (expectedType === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`设置项 ${key} 类型无效`);
      }
      validatedSettings[key] = value;
      return;
    }

    if (typeof value !== expectedType) {
      throw new Error(`设置项 ${key} 类型无效`);
    }

    validatedSettings[key] = value;
  });

  return validatedSettings;
}

import { confirmAction, promptInput } from '../ui/dialog.js';

// ==================== Storage Functions ====================

/**
 * Get settings from localStorage
 * @returns {Object} Settings object
 */
function getSettings() {
  try {
    const data = localStorage.getItem(SETTINGS_KEY);
    return data ? sanitizeSettings(JSON.parse(data)) : { ...DEFAULT_SETTINGS };
  } catch (error) {
    console.error('读取设置失败:', error);
    window.Toast?.error('读取设置失败，已使用默认设置');
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Save settings to localStorage
 * @param {Object} settings - Settings object
 */
function saveSettings(settings, options = {}) {
  const { silent = false } = options;

  try {
    const normalizedSettings = sanitizeSettings(settings);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizedSettings));
    window.dispatchEvent(
      new CustomEvent('pdf-stamper:settings-updated', {
        detail: normalizedSettings,
      })
    );

    if (!silent) {
      window.Toast?.success('设置已保存');
    }
    return true;
  } catch (error) {
    console.error('保存设置失败:', error);
    if (!silent) {
      window.Toast?.error('保存设置失败');
    }
    return false;
  }
}

/**
 * Reset settings to defaults
 */
async function resetSettings() {
  const confirmed = await confirmAction({
    title: '重置设置',
    message: '确定要重置所有设置为默认值吗？',
    confirmText: '重置',
    cancelText: '取消',
    danger: true,
  });

  if (!confirmed) {
    return false;
  }

  try {
    localStorage.removeItem(SETTINGS_KEY);
    window.ScanSettings?.reset?.();
    window.Toast?.success('设置已重置');
    return true;
  } catch (error) {
    console.error('重置设置失败:', error);
    window.Toast?.error('重置设置失败');
    return false;
  }
}

/**
 * Export settings as JSON file
 */
function exportSettings() {
  const payload = {
    version: 2,
    settings: getSettings(),
    scan: window.ScanSettings?.get?.() || null,
  };
  const dataStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = 'yinji-settings.json';
  link.click();

  // 延迟撤销：部分浏览器在下载真正开始前撤销会导致下载失败
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  window.Toast?.success('设置已导出');
}

/**
 * Import settings from JSON file
 * @param {File} file - JSON file
 */
function importSettings(file) {
  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      const isBundle = isPlainObject(imported) && imported.version === 2;
      const mergedSettings = validateImportedSettings(
        isBundle ? imported.settings : imported
      );

      if (saveSettings(mergedSettings)) {
        if (isBundle && imported.scan !== null && imported.scan !== undefined) {
          window.ScanSettings?.apply?.(imported.scan);
        }
        renderSettingsModal();
        window.Toast?.success('设置已导入');
      }
    } catch (error) {
      console.error('导入设置失败:', error);
      window.Toast?.error('导入设置失败：' + error.message);
    }
  };

  reader.onerror = () => {
    window.Toast?.error('读取文件失败');
  };

  reader.readAsText(file);
}

// ==================== UI Functions ====================

/**
 * Show settings modal
 */
function showSettingsModal() {
  const existingModal = document.getElementById('settings-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const settings = getSettings();

  const modal = document.createElement('div');
  modal.id = 'settings-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  const content = document.createElement('div');
  content.className = 'settings-modal-content';

  content.innerHTML = `
    <div class="app-modal-header">
      <div class="settings-modal-header">
        <div class="app-modal-header-copy">
          <h2 class="app-modal-title">设置</h2>
          <p class="app-modal-subtitle">调整默认参数和本地偏好。这里只改默认值，已经放到页面上的印章不受影响。</p>
        </div>
        <button id="close-settings-icon-btn" type="button" class="app-modal-close-btn" aria-label="关闭设置">&times;</button>
      </div>
    </div>

    <div class="app-modal-body">
      <div class="settings-form">
        <div class="settings-field">
          <div class="settings-field-header">
            <label class="settings-field-label" for="setting-seal-size">默认印章大小</label>
            <span class="settings-field-value" id="seal-size-value"></span>
          </div>
          <input type="range" id="setting-seal-size" min="0.1" max="0.5" step="0.05">
          <p class="settings-field-hint">新印章放上去时，按这个比例决定初始大小。</p>
        </div>

        <div class="settings-field">
          <div class="settings-field-header">
            <label class="settings-field-label" for="setting-rotation">默认旋转角度</label>
            <span class="settings-field-value" id="rotation-value"></span>
          </div>
          <input type="range" id="setting-rotation" min="-180" max="180" step="1">
          <p class="settings-field-hint">新印章放到页面时会先按这个角度转。</p>
        </div>

        <div class="settings-field">
          <div class="settings-field-header">
            <label class="settings-field-label" for="setting-opacity">印章透明度</label>
            <span class="settings-field-value" id="opacity-value"></span>
          </div>
          <input type="range" id="setting-opacity" min="0.1" max="1" step="0.1">
          <p class="settings-field-hint">调低后更适合盖在有内容的地方。</p>
        </div>

        <label class="settings-field settings-checkbox-field">
          <input type="checkbox" id="setting-auto-save">
          <span class="settings-checkbox-copy">
            <span class="settings-checkbox-title">自动保存设置</span>
            <span class="settings-checkbox-hint">修改后立刻写入本地浏览器，不用再手动保存。</span>
          </span>
        </label>
      </div>
    </div>

    <div class="app-modal-footer settings-modal-footer">
      <div class="settings-modal-primary-actions">
        <button id="save-settings-btn" type="button" class="btn btn-primary">保存设置</button>
        <button id="close-settings-btn" type="button" class="btn btn-secondary">关闭</button>
      </div>

      <div class="settings-modal-secondary-actions">
        <button id="reset-settings-btn" type="button" class="btn btn-danger-soft">重置默认值</button>
        <button id="export-settings-btn" type="button" class="btn btn-tertiary">导出设置</button>
        <button id="import-settings-btn" type="button" class="btn btn-tertiary">导入设置</button>
      </div>

      <input type="file" id="import-settings-input" accept=".json" hidden>
    </div>
  `;

  modal.appendChild(content);
  document.body.appendChild(modal);

  const closeModal = () => {
    document.removeEventListener('keydown', handleKeydown);
    modal.remove();
  };

  const handleKeydown = (event) => {
    if (event.key === 'Escape') {
      closeModal();
    }
  };

  document.addEventListener('keydown', handleKeydown);

  // Update value displays
  const sealSizeInput = content.querySelector('#setting-seal-size');
  const rotationInput = content.querySelector('#setting-rotation');
  const opacityInput = content.querySelector('#setting-opacity');
  const autoSaveInput = content.querySelector('#setting-auto-save');
  const sealSizeValue = content.querySelector('#seal-size-value');
  const rotationValue = content.querySelector('#rotation-value');
  const opacityValue = content.querySelector('#opacity-value');

  sealSizeInput.value = String(settings.sealSize);
  rotationInput.value = String(settings.sealRotation);
  opacityInput.value = String(settings.sealOpacity);
  autoSaveInput.checked = settings.autoSave;
  sealSizeValue.textContent = `${Math.round(settings.sealSize * 100)}%`;
  rotationValue.textContent = `${settings.sealRotation}°`;
  opacityValue.textContent = `${Math.round(settings.sealOpacity * 100)}%`;

  const getDraftSettings = () => ({
    sealSize: parseFloat(sealSizeInput.value),
    sealRotation: parseInt(rotationInput.value, 10),
    sealOpacity: parseFloat(opacityInput.value),
    autoSave: autoSaveInput.checked,
    exportFormat: settings.exportFormat,
    exportQuality: settings.exportQuality,
  });

  const persistDraftIfAutoSave = () => {
    if (autoSaveInput.checked) {
      saveSettings(getDraftSettings(), { silent: true });
    }
  };

  sealSizeInput.addEventListener('input', (e) => {
    sealSizeValue.textContent = Math.round(e.target.value * 100) + '%';
    persistDraftIfAutoSave();
  });

  rotationInput.addEventListener('input', (e) => {
    rotationValue.textContent = e.target.value + '°';
    persistDraftIfAutoSave();
  });

  opacityInput.addEventListener('input', (e) => {
    opacityValue.textContent = Math.round(e.target.value * 100) + '%';
    persistDraftIfAutoSave();
  });

  autoSaveInput.addEventListener('change', () => {
    if (autoSaveInput.checked) {
      saveSettings(getDraftSettings(), { silent: true });
      window.Toast?.info('已开启自动保存。后续修改会直接写入本地设置。');
      return;
    }

    const currentSettings = getSettings();
    saveSettings(
      {
        ...currentSettings,
        autoSave: false,
      },
      { silent: true }
    );
    window.Toast?.info('已关闭自动保存。');
  });

  // Save button
  content.querySelector('#save-settings-btn').addEventListener('click', () => {
    const newSettings = getDraftSettings();

    if (saveSettings(newSettings)) {
      closeModal();
    }
  });

  // Reset button
  content.querySelector('#reset-settings-btn').addEventListener('click', async () => {
    if (await resetSettings()) {
      closeModal();
      showSettingsModal();
    }
  });

  // Close button
  content.querySelector('#close-settings-btn').addEventListener('click', () => {
    closeModal();
  });
  content.querySelector('#close-settings-icon-btn').addEventListener('click', () => {
    closeModal();
  });

  // Export button
  content.querySelector('#export-settings-btn').addEventListener('click', exportSettings);

  // Import button
  content.querySelector('#import-settings-btn').addEventListener('click', () => {
    content.querySelector('#import-settings-input').click();
  });

  content.querySelector('#import-settings-input').addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      importSettings(e.target.files[0]);
      e.target.value = '';
    }
  });

  // Close on background click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });
}

/**
 * Render settings modal (for refresh after import)
 */
function renderSettingsModal() {
  const existingModal = document.getElementById('settings-modal');
  if (existingModal) {
    existingModal.remove();
    showSettingsModal();
  }
}

// ==================== Exports ====================

window.Settings = {
  getSettings,
  saveSettings,
  resetSettings,
  exportSettings,
  importSettings,
  confirmAction,
  promptInput,
  showSettingsModal,
  DEFAULT_SETTINGS,
};
