/**
 * Seal Library Management System for PDF Stamper
 * Manages saved seals using localStorage
 */

import { setState } from './state.js';

// ==================== Constants ====================

const STORAGE_KEY = 'pdf-stamper-seal-library';
const MAX_SEALS = 20; // 最多保存20个印章

// ==================== Storage Functions ====================

/**
 * Get all saved seals from localStorage
 * @returns {Array} Array of seal objects
 */
function isValidSeal(seal) {
  return Boolean(
    seal &&
    typeof seal === 'object' &&
    typeof seal.imageData === 'string' &&
    seal.imageData.length > 0
  );
}

function getSavedSeals() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      return [];
    }

    const parsed = JSON.parse(data);
    // 校验解析结果必须是数组，且逐项过滤脏数据；
    // 否则被污染成 {}/字符串/数字的键会让下游 findIndex/forEach/length 全线崩溃。
    if (!Array.isArray(parsed)) {
      console.warn('印章库数据格式异常，已重置');
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }

    return parsed.filter(isValidSeal);
  } catch (error) {
    console.error('读取印章库失败:', error);
    window.Toast?.error('读取印章库失败');
    return [];
  }
}

/**
 * Save seals to localStorage
 * @param {Array} seals - Array of seal objects
 */
function saveSealsTolocalStorage(seals) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seals));
  } catch (error) {
    console.error('保存印章库失败:', error);
    window.Toast?.error('保存失败，可能是存储空间不足');
  }
}

/**
 * Add a seal to the library with full settings
 * @param {string} name - Seal name
 * @param {string} imageData - Base64 image data
 * @param {Object} settings - Seal settings (rotation, opacity, size, brightness)
 * @returns {boolean} Success status
 */
function addSealToLibrary(name, imageData, settings = {}) {
  const seals = getSavedSeals();

  // Check if name already exists (offer overwrite) - MUST check BEFORE full check
  const existingIndex = seals.findIndex(seal => seal.name === name);
  if (existingIndex !== -1) {
    window.Toast?.warning('同名印章已存在，会覆盖旧的。');
    seals.splice(existingIndex, 1);
  }

  // Check if library is full (after name check, so overwrite still works)
  if (seals.length >= MAX_SEALS) {
    window.Toast?.warning(`印章库已满，最多保存 ${MAX_SEALS} 个印章`);
    return false;
  }

  // Add new seal with full settings
  const newSeal = {
    id: Date.now().toString(),
    name: name,
    imageData: imageData,
    rotation: settings.rotation || 0,
    opacity: settings.opacity || 1,
    size: settings.size || 0.15,
    brightness: settings.brightness || 100,
    createdAt: new Date().toISOString(),
  };

  seals.push(newSeal);
  saveSealsTolocalStorage(seals);
  window.Toast?.success(`印章 "${name}" 已保存到库中`);
  return true;
}

/**
 * Delete a seal from the library
 * @param {string} sealId - Seal ID
 */
function deleteSealFromLibrary(sealId) {
  let seals = getSavedSeals();
  const sealIndex = seals.findIndex(s => s.id === sealId);

  if (sealIndex === -1) {
    window.Toast?.error('这个印章不存在。');
    return false;
  }

  const sealName = seals[sealIndex].name;
  seals = seals.filter(s => s.id !== sealId);
  saveSealsTolocalStorage(seals);
  window.Toast?.success(`印章 "${sealName}" 已删除`);
  return true;
}

/**
 * Load a seal from the library
 * @param {string} sealId - Seal ID
 * @returns {Object|null} Seal object or null
 */
function loadSealFromLibrary(sealId) {
  const seals = getSavedSeals();
  return seals.find(s => s.id === sealId) || null;
}

/**
 * Clear all seals from library
 */
async function clearSealLibrary() {
  const confirmed = await window.Settings.confirmAction({
    title: '清空印章库',
    message: '确定要清空印章库吗？此操作不可撤销。',
    confirmText: '清空',
    cancelText: '取消',
    danger: true,
  });

  if (!confirmed) {
    return false;
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
    window.Toast?.success('印章库已清空');
    return true;
  } catch (error) {
    console.error('清空印章库失败:', error);
    window.Toast?.error('清空印章库失败');
    return false;
  }
}

// ==================== UI Functions ====================

/**
 * Render seal library UI
 */
function renderSealLibrary() {
  const container = document.getElementById('seal-library-container');
  if (!container) return;

  const seals = getSavedSeals();
  const emitLibraryUpdate = () => {
    document.dispatchEvent(
      new CustomEvent('pdf-stamper:seal-library-updated', {
        detail: {
          count: seals.length,
        },
      })
    );
  };

  if (seals.length === 0) {
    const emptyState = document.createElement('p');
    emptyState.className = 'seal-library-empty';
    emptyState.textContent = '暂无保存的印章';
    container.replaceChildren(emptyState);
    emitLibraryUpdate();
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'seal-library-grid';

  seals.forEach((seal) => {
    const item = document.createElement('div');
    item.className = 'seal-library-item';
    item.dataset.sealId = seal.id;

    const image = document.createElement('img');
    image.src = seal.imageData;
    image.alt = seal.name;
    image.className = 'seal-library-image';
    image.style.transform = `rotate(${Number.isFinite(seal.rotation) ? seal.rotation : 0}deg)`;

    const name = document.createElement('div');
    name.className = 'seal-library-name';
    name.textContent = seal.name;

    const actions = document.createElement('div');
    actions.className = 'seal-library-actions';

    const loadButton = document.createElement('button');
    loadButton.className = 'seal-library-load-btn';
    loadButton.dataset.sealId = seal.id;
    loadButton.title = '使用此印章';
    loadButton.textContent = '使用';
    loadButton.addEventListener('click', (event) => {
      event.stopPropagation();
      loadAndApplySeal(seal.id);
    });

    const deleteButton = document.createElement('button');
    deleteButton.className = 'seal-library-delete-btn';
    deleteButton.dataset.sealId = seal.id;
    deleteButton.title = '删除';
    deleteButton.textContent = '×';
    deleteButton.addEventListener('click', (event) => {
      event.stopPropagation();
      if (deleteSealFromLibrary(seal.id)) {
        renderSealLibrary();
      }
    });

    actions.appendChild(loadButton);
    actions.appendChild(deleteButton);
    item.appendChild(image);
    item.appendChild(name);
    item.appendChild(actions);
    grid.appendChild(item);
  });

  container.replaceChildren(grid);
  emitLibraryUpdate();
}

/**
 * Load and apply a seal from library with all settings
 * @param {string} sealId - Seal ID
 */
function loadAndApplySeal(sealId) {
  const seal = loadSealFromLibrary(sealId);
  if (!seal) return;

  // Set seal image and all settings
  const sealPreviewImg = document.getElementById('seal-preview');
  const sealPlaceholder = document.getElementById('seal-placeholder');
  const rotationSlider = document.getElementById('rotation-slider');
  const rotationInput = document.getElementById('rotation-input');
  const brightnessSlider = document.getElementById('brightness-slider');
  const brightnessValue = document.getElementById('brightness-value');

  if (sealPreviewImg && sealPlaceholder) {
    sealPreviewImg.src = seal.imageData;
    sealPreviewImg.classList.remove('hidden');
    sealPlaceholder.classList.add('hidden');

    const currentSettings = window.Settings.getSettings();
    window.Settings.saveSettings(
      {
        ...currentSettings,
        sealOpacity: Number.isFinite(seal.opacity)
          ? seal.opacity
          : currentSettings.sealOpacity,
        sealSize: Number.isFinite(seal.size)
          ? seal.size
          : currentSettings.sealSize,
      },
      { silent: true }
    );

    const sealImageElement = new Image();
    sealImageElement.onload = () => {
      // Apply all settings
      if (rotationSlider && rotationInput) {
        rotationSlider.value = seal.rotation || 0;
        rotationInput.value = seal.rotation || 0;
        sealPreviewImg.style.transform = `rotate(${seal.rotation || 0}deg)`;
      }

      if (brightnessSlider && brightnessValue) {
        brightnessSlider.value = seal.brightness || 100;
        brightnessValue.textContent = `${seal.brightness || 100}%`;
        sealPreviewImg.style.filter = `brightness(${(seal.brightness || 100) / 100})`;
      }

      setState({
        sealImageElement,
        sealRotation: seal.rotation || 0,
        sealBrightness: seal.brightness || 100,
      });

      // 成功提示必须在 onload 内：图片损坏时不能假报成功，
      // 否则 state 未更新却提示成功，后续盖章会用旧/空印章。
      window.Toast?.success(`已加载印章 "${seal.name}"`);
    };

    sealImageElement.onerror = () => {
      window.Toast?.error(`印章 "${seal.name}" 数据损坏，无法加载`);
    };

    sealImageElement.src = seal.imageData;
  }
}

// ==================== Exports ====================

window.SealLibrary = {
  getSavedSeals,
  addSealToLibrary,
  deleteSealFromLibrary,
  loadSealFromLibrary,
  clearSealLibrary,
  renderSealLibrary,
  loadAndApplySeal,
};

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderSealLibrary);
} else {
  renderSealLibrary();
}
