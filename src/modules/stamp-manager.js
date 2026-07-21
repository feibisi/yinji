import { getState, setState } from '../core/state.js';
import { getCurrentPageCanvas } from './canvas-manager.js';
import { getCurrentActivePage } from './canvas-manager.js';
import { loadFabricImage } from '../utils/fabric-helpers.js';

/**
 * 印章管理模块
 * 负责普通章、骑缝章、签名的添加和管理
 */

/**
 * 获取印章图片元素
 * @returns {HTMLImageElement|null}
 */
export function getSealImageElement() {
  return getState().sealImageElement;
}

/**
 * 设置印章图片元素
 * @param {HTMLImageElement|null} sealImageElement
 */
export function setSealImageElement(sealImageElement) {
  setState({ sealImageElement });
}

function updateSealPreview(src) {
  const sealPreviewImg = document.getElementById('seal-preview');
  const sealPlaceholder = document.getElementById('seal-placeholder');

  if (!sealPreviewImg || !sealPlaceholder) {
    return;
  }

  if (src) {
    sealPreviewImg.src = src;
    sealPreviewImg.classList.remove('hidden');
    sealPlaceholder.classList.add('hidden');
    return;
  }

  sealPreviewImg.src = '';
  sealPreviewImg.classList.add('hidden');
  sealPreviewImg.style.transform = '';
  sealPreviewImg.style.filter = '';
  sealPlaceholder.classList.remove('hidden');
}

export function clearSelectedSeal({
  silent = false,
} = {}) {
  setSealImageElement(null);
  updateSealPreview('');

  if (!silent) {
    window.Toast.success('已清除当前素材。');
  }
}

/**
 * 获取印章旋转角度
 * @returns {number}
 */
export function getSealRotation() {
  return getState().sealRotation;
}

/**
 * 获取印章亮度
 * @returns {number}
 */
export function getSealBrightness() {
  return getState().sealBrightness;
}

/**
 * 兼容 Fabric 6 的图片加载
 * @param {string} src
 * @returns {Promise<fabric.Image>}
 */


/**
 * 获取旋转和亮度调整后的图片数据URL
 * @param {HTMLImageElement} sourceImage
 * @param {number} angle
 * @param {number} brightness
 * @returns {string}
 */
export function getRotatedCroppedImage(sourceImage, angle, brightness = 100) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const w = sourceImage.width;
  const h = sourceImage.height;

  const diagonal = Math.sqrt(w * w + h * h);
  canvas.width = diagonal;
  canvas.height = diagonal;

  ctx.translate(diagonal / 2, diagonal / 2);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.drawImage(sourceImage, -w / 2, -h / 2);

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = w;
  finalCanvas.height = h;
  const finalCtx = finalCanvas.getContext('2d');

  finalCtx.filter = `brightness(${brightness / 100})`;
  finalCtx.drawImage(
    canvas,
    (diagonal - w) / 2,
    (diagonal - h) / 2,
    w,
    h,
    0,
    0,
    w,
    h
  );

  return finalCanvas.toDataURL();
}

/**
 * 处理印章文件上传
 * @param {File} file
 */
export function handleSealFile(file) {
  const validation = window.Validators.validateImageFile(file);
  if (!validation.valid) {
    window.Toast.error(validation.error);
    return;
  }

  const reader = new FileReader();
  reader.onload = function (event) {
    const sealImageElement = new Image();
    sealImageElement.src = event.target.result;
    setSealImageElement(sealImageElement);
    updateSealPreview(event.target.result);

    sealImageElement.onload = () => {
      const dimValidation = window.Validators.validateImageDimensions(
        sealImageElement
      );
      if (!dimValidation.valid) {
        window.Toast.error(dimValidation.error);
        clearSelectedSeal({ silent: true });
        return;
      }
      window.Toast.success(
        `${file.name} 已选好。现在可以盖普通章，或打开手写签名。`
      );
    };
  };

  reader.readAsDataURL(file);
}

/**
 * 添加普通印章到当前页面
 */
export function addNormalSeal() {
  const sealImageElement = getSealImageElement();
  const pdfDoc = getState().pdfDoc;

  if (
    !sealImageElement ||
    !sealImageElement.src ||
    sealImageElement.naturalWidth === 0 ||
    !pdfDoc
  ) {
    window.Toast.warning('还没选印章图片，先选一个。');
    return;
  }

  const canvas = getCurrentPageCanvas();
  if (!canvas) return;

  const imageToProcess = new Image();
  imageToProcess.onload = async () => {
    const rotatedSealUrl = getRotatedCroppedImage(
      imageToProcess,
      getSealRotation(),
      getSealBrightness()
    );

    try {
      const img = await loadFabricImage(rotatedSealUrl);
      const settings = window.Settings.getSettings();

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
        borderColor: '#007bff',
        lockRotation: true,
        angle: 0,
        opacity: settings.sealOpacity,
      });

      const command = new window.History.AddSealCommand(
        getCurrentActivePage(),
        img
      );
      window.History.executeCommand(command);
      canvas.setActiveObject(img);
      window.Toast.success(
        `已盖到第 ${getCurrentActivePage()} 页。现在可以拖动位置，或直接去导出。`
      );
    } catch (error) {
      console.error('创建印章图片失败:', error);
      window.Toast.error('印章没创建成功，再试一次。');
    }
  };

  imageToProcess.onerror = () => {
    window.Toast.error('无法处理此印章图片。');
  };

  imageToProcess.src = sealImageElement.src;
}

/**
 * 添加骑缝章到所有页面
 */
export async function addStraddleSeal() {
  const sealImageElement = getSealImageElement();
  const pdfDoc = getState().pdfDoc;

  if (
    !sealImageElement ||
    !sealImageElement.src ||
    sealImageElement.naturalWidth === 0 ||
    !pdfDoc
  ) {
    window.Toast.warning('还没选印章图片，先选一个。');
    return;
  }

  const imageToProcess = new Image();
  imageToProcess.onload = async () => {
    const rotatedSealUrl = getRotatedCroppedImage(
      imageToProcess,
      getSealRotation(),
      getSealBrightness()
    );
    const rotatedSealImage = new Image();
    rotatedSealImage.src = rotatedSealUrl;

    rotatedSealImage.onload = async () => {
      const totalPages = pdfDoc.numPages;
      const pieceWidth = sealImageElement.width / totalPages;
      const groupId = `straddle-${Date.now()}`;
      const entries = [];

      const { getFabricCanvases, initializeFabricCanvasForPage } = await import('./canvas-manager.js');

      for (let i = 0; i < totalPages; i++) {
        const pageNum = i + 1;
        const canvas = await initializeFabricCanvasForPage(pageNum);
        if (!canvas) continue;

        const settings = window.Settings.getSettings();
        const initialScale =
          (canvas.originalWidth * settings.sealSize) / sealImageElement.width;

        const tempPieceCanvas = document.createElement('canvas');
        tempPieceCanvas.width = pieceWidth;
        tempPieceCanvas.height = sealImageElement.height;

        tempPieceCanvas
          .getContext('2d')
          .drawImage(
            rotatedSealImage,
            i * pieceWidth,
            0,
            pieceWidth,
            sealImageElement.height,
            0,
            0,
            pieceWidth,
            sealImageElement.height
          );

        try {
          const imgPiece = await loadFabricImage(tempPieceCanvas.toDataURL());
          imgPiece.scale(initialScale);
          const scaledPieceWidth = pieceWidth * initialScale;
          const scaledPieceHeight = sealImageElement.height * initialScale;
          // 按页面实际高度垂直居中，替换硬编码 top:400，
          // 避免固定像素在小页面出界或不同尺寸页位置不一致。
          const straddleTop = Math.max(
            0,
            (canvas.originalHeight - scaledPieceHeight) / 2
          );

          imgPiece.set({
            left: canvas.originalWidth - scaledPieceWidth,
            top: straddleTop,
            hasControls: true,
            borderColor: '#007bff',
            lockMovementX: true,
            lockRotation: true,
            straddleGroup: groupId,
            pageIndex: i,
            originX: 'left',
            originY: 'top',
            angle: 0,
            opacity: settings.sealOpacity,
          });

          const syncObjects = (target) => {
            getFabricCanvases()
              .forEach((c) => {
                if (!c) return;
                c.getObjects()
                  .filter(
                    (obj) => obj.straddleGroup === groupId && obj !== target
                  )
                  .forEach((obj) => {
                    obj
                      .set({
                        top: target.top,
                        scaleX: target.scaleX,
                        scaleY: target.scaleY,
                      })
                      .setCoords();
                    c.renderAll();
                  });
              });
          };

          imgPiece.on('moving', () => syncObjects(imgPiece));
          imgPiece.on('scaling', () => syncObjects(imgPiece));
          entries.push({ pageNum, sealObject: imgPiece });
        } catch (error) {
          console.error(`骑缝章第 ${pageNum} 页加载失败:`, error);
        }
      }

      if (entries.length === 0) {
        window.Toast.error('骑缝章没做成，再试一次。');
        return;
      }

      const command = new window.History.AddSealsCommand(entries);
      window.History.executeCommand(command);
      window.Toast.success(`已盖好骑缝章，共跨 ${entries.length} 页。`);
    };
  };

  imageToProcess.onerror = () => {
    window.Toast.error('无法处理此印章图片。');
  };

  imageToProcess.src = sealImageElement.src;
}

/**
 * 删除选中的印章对象
 */
export async function deleteSelectedObject() {
  const canvas = getCurrentPageCanvas();
  if (!canvas) return;

  const activeObject = canvas.getActiveObject();
  if (activeObject) {
    if (activeObject.straddleGroup) {
      const groupId = activeObject.straddleGroup;
      const { getFabricCanvases: getAllCanvases } = await import('./canvas-manager.js');
      const entries = [];
      getAllCanvases().forEach((c, index) => {
        if (!c) return;
        c.getObjects()
          .filter((obj) => obj.straddleGroup === groupId)
          .forEach((sealObject) => {
            entries.push({ pageNum: index + 1, sealObject });
          });
      });

      if (entries.length > 0) {
        const command = new window.History.DeleteSealsCommand(entries);
        window.History.executeCommand(command);
      }
      window.Toast.success('已删除这组骑缝章。');
    } else {
      const command = new window.History.DeleteSealCommand(
        getCurrentActivePage(),
        activeObject
      );
      window.History.executeCommand(command);
      window.Toast.success(`已从第 ${getCurrentActivePage()} 页删掉选中的印章。`);
    }
  } else {
    window.Toast.warning('先点一下要删的印章。');
  }
}

/**
 * 锁定选中的对象
 */
export function lockObject() {
  const canvas = getCurrentPageCanvas();
  if (!canvas) return false;

  const activeObject = canvas.getActiveObject();
  if (!activeObject) {
    window.Toast.warning('先点一下要锁定的印章。');
    return false;
  }

  const oldState = window.History.getObjectState(activeObject);
  const newState = {
    ...oldState,
    lockMovementX: true,
    lockMovementY: true,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    isLocked: true,
    borderColor: '#f59e0b',
    cornerColor: '#ccc',
    cornerSize: 0,
  };
  const command = new window.History.ModifySealCommand(
    getCurrentActivePage(),
    activeObject,
    oldState,
    newState
  );
  window.History.executeCommand(command);
  canvas.setActiveObject(activeObject);
  canvas.renderAll();
  window.Toast.success('印章已锁定，不会被误动。');
  return true;
}

/**
 * 解锁选中的对象
 */
export function unlockObject() {
  const canvas = getCurrentPageCanvas();
  if (!canvas) return false;

  const activeObject = canvas.getActiveObject();
  if (!activeObject) {
    window.Toast.warning('先点一下要解锁的印章。');
    return false;
  }

  const oldState = window.History.getObjectState(activeObject);
  let newState;

  if (activeObject.straddleGroup) {
    newState = {
      ...oldState,
      lockMovementX: true,
      lockMovementY: false,
      lockScalingX: false,
      lockScalingY: false,
      lockRotation: true,
      isLocked: false,
      borderColor: '#007bff',
      cornerColor: '#007bff',
      cornerSize: 10,
    };
  } else {
    newState = {
      ...oldState,
      lockMovementX: false,
      lockMovementY: false,
      lockScalingX: false,
      lockScalingY: false,
      lockRotation: false,
      isLocked: false,
      borderColor: '#007bff',
      cornerColor: '#007bff',
      cornerSize: 10,
    };
  }

  const command = new window.History.ModifySealCommand(
    getCurrentActivePage(),
    activeObject,
    oldState,
    newState
  );
  window.History.executeCommand(command);
  canvas.setActiveObject(activeObject);
  canvas.renderAll();
  window.Toast.success('印章已解锁，可以继续调整。');
  return true;
}

/**
 * 切换选中对象的锁定状态
 */
export function toggleLockSelected() {
  const canvas = getCurrentPageCanvas();
  if (!canvas) return;

  const activeObject = canvas.getActiveObject();
  if (!activeObject) {
    window.Toast.warning('先点一下要操作的印章。');
    return false;
  }

  if (activeObject.isLocked) {
    return unlockObject();
  } else {
    return lockObject();
  }
}
