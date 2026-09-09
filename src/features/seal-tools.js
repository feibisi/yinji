import { getState, setState } from '../core/state.js';
import {
  getSealToneCssFilter,
  removeBackgroundFromSeal,
} from '../modules/seal-image-processing.js';
import { updateSelectedNormalSealSource } from '../modules/stamp-manager.js';

export function updateSealPreviewBrightness(sealPreviewImg) {
  const brightness = getState().sealBrightness;
  if (sealPreviewImg && sealPreviewImg.src) {
    sealPreviewImg.style.filter = getSealToneCssFilter(brightness);
  }
}

export async function saveSealToLibrary() {
  const sealImageElement = getState().sealImageElement;
  const state = getState();

  if (
    !sealImageElement ||
    !sealImageElement.src ||
    sealImageElement.naturalWidth === 0
  ) {
    window.Toast.warning('还没选印章图片。');
    return;
  }

  const sealName = await window.Settings.promptInput({
    title: '保存到印章库',
    message: '给印章起个名字：',
    defaultValue: '印章' + (window.SealLibrary.getSavedSeals().length + 1),
    placeholder: '印章名称',
    confirmText: '保存',
    cancelText: '取消',
  });

  if (!sealName) return;
  if (sealName.trim().length === 0) {
    window.Toast.warning('印章名称不能为空');
    return;
  }

  const settings = {
    rotation: state.sealRotation,
    brightness: state.sealBrightness,
    opacity: window.Settings.getSettings().sealOpacity,
    size: window.Settings.getSettings().sealSize,
  };

  const success = window.SealLibrary.addSealToLibrary(
    sealName.trim(),
    sealImageElement.src,
    settings
  );

  if (success) {
    window.SealLibrary.renderSealLibrary();
  }
}

export async function removeWhiteBackground(sealPreviewImg) {
  const sealImageElement = getState().sealImageElement;

  if (
    !sealImageElement ||
    !sealImageElement.src ||
    sealImageElement.naturalWidth === 0
  ) {
    window.Toast.warning('还没选印章图片。');
    return false;
  }

  try {
    const source = getState().sealOriginalImageSrc || sealImageElement.src;
    const result = await removeBackgroundFromSeal(source);
    const processedImage = new Image();
    await new Promise((resolve, reject) => {
      processedImage.onload = resolve;
      processedImage.onerror = reject;
      processedImage.src = result.dataUrl;
    });

    setState({ sealImageElement: processedImage });
    if (sealPreviewImg) sealPreviewImg.src = result.dataUrl;
    const updatedSelection = await updateSelectedNormalSealSource(result.dataUrl);
    const ratio = result.totalPixels > 0
      ? Math.round((result.removedPixels / result.totalPixels) * 100)
      : 0;
    window.Toast.success(
      `纸张底色已去除（约 ${ratio}%）${updatedSelection ? '，已更新选中印章' : ''}。`
    );
    return true;
  } catch (error) {
    console.error('去白底失败:', error);
    window.Toast.error('处理图片时发生错误。');
    return false;
  }
}
