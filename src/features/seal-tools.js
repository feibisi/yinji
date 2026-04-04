import { getState, setState } from '../core/state.js';

export function updateSealPreviewBrightness(sealPreviewImg) {
  const brightness = getState().sealBrightness;
  if (sealPreviewImg && sealPreviewImg.src) {
    sealPreviewImg.style.filter = `brightness(${brightness / 100})`;
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
    window.Toast.warning('请先选择一个有效的印章图片！');
    return;
  }

  const sealName = await window.Settings.promptInput({
    title: '保存到印章库',
    message: '请输入印章名称：',
    defaultValue: '印章' + (window.SealLibrary.getSavedSeals().length + 1),
    placeholder: '请输入印章名称',
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

export function removeWhiteBackground(sealPreviewImg) {
  const sealImageElement = getState().sealImageElement;

  if (
    !sealImageElement ||
    !sealImageElement.src ||
    sealImageElement.naturalWidth === 0
  ) {
    window.Toast.warning('请先选择一个有效的印章图片！');
    return;
  }

  const img = new Image();
  img.src = sealImageElement.src;
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const threshold = 200;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      if (r > threshold && g > threshold && b > threshold) {
        data[i + 3] = 0;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    const newSrc = canvas.toDataURL('image/png');
    sealImageElement.src = newSrc;
    setState({ sealImageElement });
    if (sealPreviewImg) {
      sealPreviewImg.src = newSrc;
    }

    window.Toast.success('已成功去除白色背景！');
  };
  img.onerror = () => {
    window.Toast.error('处理图片时发生错误。');
  };
}
