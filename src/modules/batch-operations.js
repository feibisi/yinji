import { getState, setState } from '../core/state.js';
import { getCurrentPageCanvas } from './canvas-manager.js';

/**
 * 批量操作模块
 * 负责多页选择、批量添加/删除印章等功能
 */

/**
 * 切换页面选中状态（Ctrl+Click 单个选择）
 * @param {number} pageNum - 页面编号
 */
export function togglePageSelection(pageNum) {
  const selectedPages = new Set(getState().selectedPages);

  if (selectedPages.has(pageNum)) {
    selectedPages.delete(pageNum);
  } else {
    selectedPages.add(pageNum);
  }

  setState({ selectedPages });
  updateSelectionUI();
}

/**
 * 连续选择页面（Shift+Click 范围选择）
 * @param {number} pageNum - 页面编号
 */
export function selectPageRange(pageNum) {
  const currentActive = getState().currentActivePage;
  const selectedPages = new Set(getState().selectedPages);

  const start = Math.min(currentActive, pageNum);
  const end = Math.max(currentActive, pageNum);

  for (let i = start; i <= end; i++) {
    selectedPages.add(i);
  }

  setState({ selectedPages });
  updateSelectionUI();
}

/**
 * 选择所有页面
 */
export function selectAllPages() {
  const totalPages = getState().totalPages;
  const selectedPages = new Set();

  for (let i = 1; i <= totalPages; i++) {
    selectedPages.add(i);
  }

  setState({ selectedPages, isMultiSelectMode: true });
  updateSelectionUI();
}

/**
 * 清除所有选中页面
 */
export function clearSelection() {
  setState({ selectedPages: new Set(), isMultiSelectMode: false });
  updateSelectionUI();
}

/**
 * 进入/退出批量选择模式
 * @param {boolean} enable
 */
export function setMultiSelectMode(enable) {
  setState({ isMultiSelectMode: enable });
  const batchBtn = document.getElementById('batch-mode-btn');
  if (batchBtn) {
    batchBtn.classList.toggle('active', enable);
    batchBtn.textContent = enable ? '退出批量模式' : '批量模式';
  }
}

/**
 * 更新UI显示选中页面状态
 */
function updateSelectionUI() {
  const selectedPages = getState().selectedPages;
  const isMultiSelectMode = getState().isMultiSelectMode;
  const totalPages = getState().totalPages;

  // 更新页面指示器
  const pageIndicator = document.getElementById('page-indicator');
  if (selectedPages.size > 0) {
    const pages = Array.from(selectedPages).sort((a, b) => a - b);
    pageIndicator.textContent = `选中 ${selectedPages.size}/${totalPages} 页`;
  } else {
    const currentPage = getState().currentActivePage;
    pageIndicator.textContent = `第 ${currentPage} / ${totalPages} 页`;
  }

  // 更新缩略图视觉反馈
  document.querySelectorAll('.thumbnail-item').forEach((item) => {
    const pageNum = parseInt(item.dataset.pageNumber);
    if (selectedPages.has(pageNum)) {
      item.classList.add('selected');
      item.style.border = '2px solid #3b82f6';
      item.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
    } else {
      item.classList.remove('selected');
      item.style.border = '';
      item.style.backgroundColor = '';
    }
  });

  // 更新批量操作按钮状态
  const batchActions = document.getElementById('batch-actions');
  if (batchActions) {
    batchActions.style.display = selectedPages.size > 0 ? 'flex' : 'none';
  }

  // 更新选中页面列表显示
  const selectedPagesList = document.getElementById('selected-pages-list');
  if (selectedPagesList) {
    if (selectedPages.size > 0) {
      const pages = Array.from(selectedPages).sort((a, b) => a - b);
      selectedPagesList.textContent = pages.join(', ');
    } else {
      selectedPagesList.textContent = '';
    }
  }
}

/**
 * 批量添加印章到选中页面
 * @param {HTMLImageElement} sealImageElement - 印章图片元素
 * @param {Object} settings - 印章设置
 */
export async function addSealToSelectedPages(sealImageElement, settings) {
  const selectedPages = getState().selectedPages;
  if (selectedPages.size === 0) {
    window.Toast.warning('请先选择要添加印章的页面');
    return false;
  }

  const pdfDoc = getState().pdfDoc;
  if (!pdfDoc) {
    window.Toast.warning('请先加载 PDF 文件');
    return false;
  }

  if (!sealImageElement || !sealImageElement.src) {
    window.Toast.warning('请先选择印章图片');
    return false;
  }

  window.Loading.showExportLoading('正在批量添加印章...');

  try {
    const { initializeFabricCanvasForPage } = await import('./canvas-manager.js');
    const { getRotatedCroppedImage } = await import('./stamp-manager.js');

    // 处理印章图片（旋转和亮度调整）
    const imageToProcess = new Image();
    imageToProcess.src = sealImageElement.src;

    await new Promise((resolve, reject) => {
      imageToProcess.onload = resolve;
      imageToProcess.onerror = reject;
    });

    const rotatedSealUrl = getRotatedCroppedImage(
      imageToProcess,
      getState().sealRotation,
      getState().sealBrightness
    );

    const pages = Array.from(selectedPages).sort((a, b) => a - b);
    const totalPages = pdfDoc.numPages;

    for (let i = 0; i < pages.length; i++) {
      const pageNum = pages[i];
      window.Loading.updateProgress(
        ((i + 1) / pages.length) * 80,
        `处理第 ${i + 1}/${pages.length} 页`
      );

      const canvas = await initializeFabricCanvasForPage(pageNum);
      if (!canvas) continue;

      // 创建印章图片对象
      await new Promise((resolve) => {
        fabric.Image.fromURL(rotatedSealUrl, (img) => {
          img.scaleToWidth(canvas.originalWidth * settings.sealSize);

          img.set({
            left: canvas.originalWidth / 2,
            top: canvas.originalHeight / 2,
            originX: 'center',
            originY: 'center',
            cornerSize: 10,
            cornerStyle: 'circle',
            cornerColor: '#007bff',
            transparentCorners: false,
            borderColor: '#3b82f6',
            lockRotation: true,
            angle: 0,
            opacity: settings.sealOpacity,
          });

          const command = new window.History.AddSealCommand(pageNum, img);
          window.History.executeCommand(command);
          canvas.renderAll();
          resolve();
        });
      });
    }

    window.Loading.updateProgress(100, '完成！');
    window.Toast.success(`已在 ${pages.length} 页添加印章`);

    // 返回第一页被选中的页面
    window.showPage(pages[0]);
    window.Loading.hide();
    return true;
  } catch (error) {
    console.error('批量添加印章失败:', error);
    window.Toast.error('批量添加失败，详情请查看控制台');
    window.Loading.hide();
    return false;
  }
}

/**
 * 批量删除选中页面上的所有印章
 * @returns {Promise<boolean>}
 */
export async function deleteAllStampsFromSelectedPages() {
  const selectedPages = getState().selectedPages;
  if (selectedPages.size === 0) {
    window.Toast.warning('请先选择要删除印章的页面');
    return false;
  }

  window.Loading.showExportLoading('正在批量删除印章...');

  try {
    const { getFabricCanvases, initializeFabricCanvasForPage } = await import('./canvas-manager.js');
    const pages = Array.from(selectedPages).sort((a, b) => a - b);
    let totalDeleted = 0;

    for (let i = 0; i < pages.length; i++) {
      const pageNum = pages[i];
      const canvas = await initializeFabricCanvasForPage(pageNum);
      if (!canvas) continue;

      const objects = canvas.getObjects().filter((obj) => !obj.isBackgroundImage);
      objects.forEach((obj) => canvas.remove(obj));
      totalDeleted += objects.length;

      window.Loading.updateProgress(
        ((i + 1) / pages.length) * 100,
        `清理第 ${i + 1}/${pages.length} 页`
      );
    }

    window.Toast.success(`已从 ${pages.length} 页删除 ${totalDeleted} 个印章`);
    window.Loading.hide();
    return true;
  } catch (error) {
    console.error('批量删除印章失败:', error);
    window.Toast.error('批量删除失败');
    window.Loading.hide();
    return false;
  }
}
