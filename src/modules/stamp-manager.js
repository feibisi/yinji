import { getState, setState } from '../core/state.js';
import { getCurrentPageCanvas } from './canvas-manager.js';
import { getCurrentActivePage } from '../core/state.js';

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

    const sealPreviewImg = document.getElementById('seal-preview');
    const sealPlaceholder = document.getElementById('seal-placeholder');

    if (sealPreviewImg) {
      sealPreviewImg.src = event.target.result;
      sealPreviewImg.classList.remove('hidden');
    }
    if (sealPlaceholder) {
      sealPlaceholder.classList.add('hidden');
    }

    sealImageElement.onload = () => {
      const dimValidation = window.Validators.validateImageDimensions(
        sealImageElement
      );
      if (!dimValidation.valid) {
        window.Toast.error(dimValidation.error);
        setSealImageElement(null);
        if (sealPreviewImg) {
          sealPreviewImg.src = '';
          sealPreviewImg.classList.add('hidden');
        }
        if (sealPlaceholder) {
          sealPlaceholder.classList.remove('hidden');
        }
        return;
      }
      window.Toast.success('印章已准备好。');
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
    window.Toast.warning('请先选择一个有效的印章图片！');
    return;
  }

  const canvas = getCurrentPageCanvas();
  if (!canvas) return;

  const imageToProcess = new Image();
  imageToProcess.onload = () => {
    const rotatedSealUrl = getRotatedCroppedImage(
      imageToProcess,
      getSealRotation(),
      getSealBrightness()
    );

    fabric.Image.fromURL(rotatedSealUrl, (img) => {
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
    });
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
    window.Toast.warning('请先选择一个有效的印章图片！');
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

        fabric.Image.fromURL(tempPieceCanvas.toDataURL(), (imgPiece) => {
          imgPiece.scale(initialScale);
          const scaledPieceWidth = pieceWidth * initialScale;

          imgPiece.set({
            left: canvas.originalWidth - scaledPieceWidth,
            top: 400,
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

          canvas.add(imgPiece);
          canvas.renderAll();

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
        });
      }
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
      getAllCanvases().forEach((c) => {
        if (!c) return;
        c.getObjects()
          .filter((obj) => obj.straddleGroup === groupId)
          .forEach((obj) => c.remove(obj));
        c.renderAll();
      });
      window.Toast.success('已删除骑缝章');
    } else {
      const command = new window.History.DeleteSealCommand(
        getCurrentActivePage(),
        activeObject
      );
      window.History.executeCommand(command);
      window.Toast.success('已删除印章');
    }
  } else {
    window.Toast.warning('请先选择要删除的印章');
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
    window.Toast.warning('请先选择要锁定的印章');
    return false;
  }

  activeObject.set({
    lockMovementX: true,
    lockMovementY: true,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    isLocked: true,
    borderColor: '#f59e0b',
    cornerColor: '#ccc',
    cornerSize: 0,
  });
  canvas.renderAll();
  window.Toast.success('已锁定印章');
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
    window.Toast.warning('请先选择要解锁的印章');
    return false;
  }

  // 骑缝章不解锁 lockMovementX（需要同步机制）
  if (activeObject.straddleGroup) {
    activeObject.set({
      lockScalingX: false,
      lockScalingY: false,
      lockRotation: false,
      isLocked: false,
      borderColor: '#007bff',
      cornerColor: '#007bff',
      cornerSize: 10,
    });
  } else {
    activeObject.set({
      lockMovementX: false,
      lockMovementY: false,
      lockScalingX: false,
      lockScalingY: false,
      lockRotation: false,
      isLocked: false,
      borderColor: '#007bff',
      cornerColor: '#007bff',
      cornerSize: 10,
    });
  }
  canvas.renderAll();
  window.Toast.success('已解锁印章');
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
    window.Toast.warning('请先选择要操作的印章');
    return false;
  }

  if (activeObject.isLocked) {
    return unlockObject();
  } else {
    return lockObject();
  }
}
