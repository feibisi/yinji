/**
 * Seal Library Management System for PDF Stamper
 * Manages saved seals using localStorage
 */

const { setState } = window.AppState;

// ==================== Constants ====================

const STORAGE_KEY = 'pdf-stamper-seal-library';
const MAX_SEALS = 20; // 最多保存20个印章

// ==================== Storage Functions ====================

/**
 * Get all saved seals from localStorage
 * @returns {Array} Array of seal objects
 */
function getSavedSeals() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
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
 * Add a seal to the library
 * @param {string} name - Seal name
 * @param {string} imageData - Base64 image data
 * @param {number} rotation - Rotation angle
 * @returns {boolean} Success status
 */
function addSealToLibrary(name, imageData, rotation = 0) {
  const seals = getSavedSeals();

  // Check if library is full
  if (seals.length >= MAX_SEALS) {
    window.Toast?.warning(`印章库已满，最多保存 ${MAX_SEALS} 个印章`);
    return false;
  }

  // Check if name already exists
  if (seals.some(seal => seal.name === name)) {
    window.Toast?.warning('印章名称已存在，请使用其他名称');
    return false;
  }

  // Add new seal
  const newSeal = {
    id: Date.now().toString(),
    name: name,
    imageData: imageData,
    rotation: rotation,
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
    window.Toast?.error('印章不存在');
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

  if (seals.length === 0) {
    const emptyState = document.createElement('p');
    emptyState.className = 'seal-library-empty';
    emptyState.textContent = '暂无保存的印章';
    container.replaceChildren(emptyState);
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
}

/**
 * Load and apply a seal from library
 * @param {string} sealId - Seal ID
 */
function loadAndApplySeal(sealId) {
  const seal = loadSealFromLibrary(sealId);
  if (!seal) return;

  // Set seal image and rotation
  const sealPreviewImg = document.getElementById('seal-preview');
  const sealPlaceholder = document.getElementById('seal-placeholder');
  const rotationSlider = document.getElementById('rotation-slider');
  const rotationInput = document.getElementById('rotation-input');

  if (sealPreviewImg && sealPlaceholder) {
    sealPreviewImg.src = seal.imageData;
    sealPreviewImg.classList.remove('hidden');
    sealPlaceholder.classList.add('hidden');

    const sealImageElement = new Image();
    sealImageElement.src = seal.imageData;

    // Set rotation
    if (rotationSlider && rotationInput) {
      rotationSlider.value = seal.rotation;
      rotationInput.value = seal.rotation;
      sealPreviewImg.style.transform = `rotate(${seal.rotation}deg)`;
    }

    setState({
      sealImageElement,
      sealRotation: seal.rotation,
    });

    window.Toast?.success(`已加载印章 "${seal.name}"`);
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
