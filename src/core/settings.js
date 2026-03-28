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

// ==================== Dialog Functions ====================

/**
 * Show custom dialog modal
 * @param {Object} options - Dialog options
 * @param {string} options.title - Dialog title
 * @param {string} [options.message] - Dialog message
 * @param {string} [options.confirmText] - Confirm button text
 * @param {string} [options.cancelText] - Cancel button text
 * @param {boolean} [options.showInput] - Whether to show input box
 * @param {string} [options.defaultValue] - Input default value
 * @param {string} [options.placeholder] - Input placeholder
 * @param {boolean} [options.danger] - Whether confirm button is danger style
 * @returns {Promise<boolean|string|null>} Dialog result
 */
function showDialogModal({
  title,
  message = '',
  confirmText = '确定',
  cancelText = '取消',
  showInput = false,
  defaultValue = '',
  placeholder = '',
  danger = false,
}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:31000;display:flex;align-items:center;justify-content:center;';

    const content = document.createElement('div');
    content.style.cssText = 'background:white;border-radius:8px;padding:1.5rem;max-width:420px;width:90%;box-shadow:0 12px 32px rgba(0,0,0,0.2);';

    const titleElement = document.createElement('h3');
    titleElement.textContent = title;
    titleElement.style.cssText = 'margin:0 0 1rem;font-size:1.25rem;';
    content.appendChild(titleElement);

    if (message) {
      const messageElement = document.createElement('p');
      messageElement.textContent = message;
      messageElement.style.cssText = 'margin:0 0 1rem;line-height:1.6;color:#333;';
      content.appendChild(messageElement);
    }

    let inputElement = null;
    if (showInput) {
      inputElement = document.createElement('input');
      inputElement.type = 'text';
      inputElement.value = defaultValue;
      inputElement.placeholder = placeholder;
      inputElement.style.cssText = 'width:100%;padding:0.75rem;border:1px solid #ced4da;border-radius:4px;font-size:1rem;box-sizing:border-box;margin-bottom:1rem;';
      content.appendChild(inputElement);
    }

    const actionRow = document.createElement('div');
    actionRow.style.cssText = 'display:flex;gap:0.75rem;justify-content:flex-end;';

    const cancelButton = document.createElement('button');
    cancelButton.textContent = cancelText;
    cancelButton.style.cssText = 'padding:0.75rem 1rem;background:#6c757d;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:600;';

    const confirmButton = document.createElement('button');
    confirmButton.textContent = confirmText;
    confirmButton.style.cssText = `padding:0.75rem 1rem;background:${danger ? '#dc3545' : '#007bff'};color:white;border:none;border-radius:4px;cursor:pointer;font-weight:600;`;

    actionRow.appendChild(cancelButton);
    actionRow.appendChild(confirmButton);
    content.appendChild(actionRow);
    overlay.appendChild(content);

    const closeDialog = (result) => {
      document.removeEventListener('keydown', handleKeydown);
      overlay.remove();
      resolve(result);
    };

    const confirmDialog = () => {
      if (showInput) {
        closeDialog(inputElement ? inputElement.value : '');
        return;
      }
      closeDialog(true);
    };

    const cancelDialog = () => {
      if (showInput) {
        closeDialog(null);
        return;
      }
      closeDialog(false);
    };

    const handleKeydown = (event) => {
      if (event.key === 'Escape') {
        cancelDialog();
      }

      if (event.key === 'Enter') {
        confirmDialog();
      }
    };

    cancelButton.addEventListener('click', cancelDialog);
    confirmButton.addEventListener('click', confirmDialog);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        cancelDialog();
      }
    });
    document.addEventListener('keydown', handleKeydown);

    document.body.appendChild(overlay);

    if (inputElement) {
      inputElement.focus();
      inputElement.select();
      return;
    }

    confirmButton.focus();
  });
}

/**
 * Show custom confirm dialog
 * @param {Object} options - Dialog options
 * @returns {Promise<boolean>} Confirm result
 */
async function confirmAction(options) {
  return showDialogModal(options);
}

/**
 * Show custom input dialog
 * @param {Object} options - Dialog options
 * @returns {Promise<string|null>} Input result
 */
async function promptInput(options) {
  return showDialogModal({ ...options, showInput: true });
}

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
function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    window.Toast?.success('设置已保存');
    return true;
  } catch (error) {
    console.error('保存设置失败:', error);
    window.Toast?.error('保存设置失败');
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
  const settings = getSettings();
  const dataStr = JSON.stringify(settings, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = 'pdf-stamper-settings.json';
  link.click();

  URL.revokeObjectURL(url);
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
      const settings = JSON.parse(e.target.result);
      const mergedSettings = validateImportedSettings(settings);

      if (saveSettings(mergedSettings)) {
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
  const settings = getSettings();

  const modal = document.createElement('div');
  modal.id = 'settings-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:30000;display:flex;align-items:center;justify-content:center;';

  const content = document.createElement('div');
  content.style.cssText = 'background:white;border-radius:8px;padding:2rem;max-width:500px;width:90%;max-height:80vh;overflow-y:auto;';

  content.innerHTML = `
    <h2 style="margin-bottom:1.5rem;">设置</h2>

    <div style="margin-bottom:1.5rem;">
      <label style="display:block;margin-bottom:0.5rem;font-weight:600;">默认印章大小</label>
      <input type="range" id="setting-seal-size" min="0.1" max="0.5" step="0.05" style="width:100%;">
      <span id="seal-size-value"></span>
    </div>

    <div style="margin-bottom:1.5rem;">
      <label style="display:block;margin-bottom:0.5rem;font-weight:600;">默认旋转角度</label>
      <input type="range" id="setting-rotation" min="-180" max="180" step="1" style="width:100%;">
      <span id="rotation-value"></span>
    </div>

    <div style="margin-bottom:1.5rem;">
      <label style="display:block;margin-bottom:0.5rem;font-weight:600;">印章透明度</label>
      <input type="range" id="setting-opacity" min="0.1" max="1" step="0.1" style="width:100%;">
      <span id="opacity-value"></span>
    </div>

    <div style="margin-bottom:1.5rem;">
      <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;">
        <input type="checkbox" id="setting-auto-save">
        <span>自动保存设置</span>
      </label>
    </div>

    <div style="display:flex;gap:0.5rem;margin-top:2rem;">
      <button id="save-settings-btn" style="flex:1;padding:0.75rem;background:#007bff;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:600;">保存</button>
      <button id="reset-settings-btn" style="flex:1;padding:0.75rem;background:#6c757d;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:600;">重置</button>
      <button id="close-settings-btn" style="flex:1;padding:0.75rem;background:#dc3545;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:600;">关闭</button>
    </div>

    <div style="display:flex;gap:0.5rem;margin-top:1rem;">
      <button id="export-settings-btn" style="flex:1;padding:0.5rem;background:#28a745;color:white;border:none;border-radius:4px;cursor:pointer;font-size:0.875rem;">导出设置</button>
      <button id="import-settings-btn" style="flex:1;padding:0.5rem;background:#17a2b8;color:white;border:none;border-radius:4px;cursor:pointer;font-size:0.875rem;">导入设置</button>
      <input type="file" id="import-settings-input" accept=".json" hidden>
    </div>
  `;

  modal.appendChild(content);
  document.body.appendChild(modal);

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

  sealSizeInput.addEventListener('input', (e) => {
    sealSizeValue.textContent = Math.round(e.target.value * 100) + '%';
  });

  rotationInput.addEventListener('input', (e) => {
    rotationValue.textContent = e.target.value + '°';
  });

  opacityInput.addEventListener('input', (e) => {
    opacityValue.textContent = Math.round(e.target.value * 100) + '%';
  });

  // Save button
  content.querySelector('#save-settings-btn').addEventListener('click', () => {
    const newSettings = {
      sealSize: parseFloat(sealSizeInput.value),
      sealRotation: parseInt(rotationInput.value, 10),
      sealOpacity: parseFloat(opacityInput.value),
      autoSave: autoSaveInput.checked,
      exportFormat: settings.exportFormat,
      exportQuality: settings.exportQuality,
    };

    if (saveSettings(newSettings)) {
      modal.remove();
    }
  });

  // Reset button
  content.querySelector('#reset-settings-btn').addEventListener('click', async () => {
    if (await resetSettings()) {
      modal.remove();
      showSettingsModal();
    }
  });

  // Close button
  content.querySelector('#close-settings-btn').addEventListener('click', () => {
    modal.remove();
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
      modal.remove();
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
