import {
  getCurrentActivePage,
  getCurrentPageCanvas,
  getFabricCanvases,
} from '../modules/canvas-manager.js';
import {
  initOn as initGuidelines,
  setEnabled as setGuidelinesEnabled,
  isEnabled as isGuidelinesEnabled,
} from '../modules/guideline-manager.js';

const coordinateCanvasBindings = new WeakSet();
const historyCanvasBindings = new WeakSet();

let coordXInputRef = null;
let coordYInputRef = null;
let guidelineToggleBtnRef = null;
let toolbarStatusChangeHandler = null;
let coordinateInputListenersBound = false;
let guidelineToggleBound = false;

export function setupSelectionControls({
  coordXInput,
  coordYInput,
  guidelineToggleBtn,
  onToolbarStatusChange,
} = {}) {
  coordXInputRef = coordXInput || coordXInputRef;
  coordYInputRef = coordYInput || coordYInputRef;
  guidelineToggleBtnRef = guidelineToggleBtn || guidelineToggleBtnRef;
  toolbarStatusChangeHandler =
    onToolbarStatusChange || toolbarStatusChangeHandler;

  bindCoordinateInputListeners();
  bindGuidelineToggle();
  updateGuidelineToggleButton(isGuidelinesEnabled());
  syncSelectionCanvasState();
}

export function syncSelectionCanvasState() {
  initGuidelinesOnCurrentCanvas();
  bindCoordinateCanvasListeners();
  bindHistoryCanvasListeners();
}

function bindCoordinateInputListeners() {
  if (coordinateInputListenersBound) {
    return;
  }

  if (coordXInputRef) {
    coordXInputRef.addEventListener('change', applyCoordinateInputs);
  }

  if (coordYInputRef) {
    coordYInputRef.addEventListener('change', applyCoordinateInputs);
  }

  coordinateInputListenersBound = true;
}

function bindGuidelineToggle() {
  if (guidelineToggleBound || !guidelineToggleBtnRef) {
    return;
  }

  guidelineToggleBtnRef.addEventListener('click', () => {
    const enabled = !isGuidelinesEnabled();
    setGuidelinesEnabled(enabled);
    updateGuidelineToggleButton(enabled);

    if (window.Toast) {
      window.Toast.info(
        enabled
          ? '对齐辅助线已开启。'
          : '对齐辅助线已关闭。'
      );
    }
  });

  guidelineToggleBound = true;
}

function bindCoordinateCanvasListeners() {
  const canvas = getCurrentPageCanvas();
  if (!canvas || coordinateCanvasBindings.has(canvas)) {
    return;
  }

  canvas.on('selection:created', updateCoordinateInputs);
  canvas.on('selection:updated', updateCoordinateInputs);
  canvas.on('object:moving', updateCoordinateInputs);
  canvas.on('selection:cleared', clearCoordinateInputs);

  coordinateCanvasBindings.add(canvas);
}

function bindHistoryCanvasListeners() {
  const canvas = getCurrentPageCanvas();
  if (!canvas || historyCanvasBindings.has(canvas)) {
    return;
  }

  canvas.on('mouse:down', captureHistoryStateBeforeTransform);
  canvas.on('object:modified', recordHistoryAfterTransform);

  historyCanvasBindings.add(canvas);
}

function captureHistoryStateBeforeTransform(event) {
  const target = event?.target;
  if (!target || target.isBackgroundImage) {
    return;
  }

  if (target.straddleGroup) {
    target.__historyBeforeEntries = getFabricCanvases()
      .flatMap((canvas, index) => {
        if (!canvas) {
          return [];
        }

        return canvas
          .getObjects()
          .filter((obj) => obj.straddleGroup === target.straddleGroup)
          .map((sealObject) => ({
            pageNum: index + 1,
            sealObject,
            oldState: window.History.getObjectState(sealObject),
          }));
      });
    return;
  }

  target.__historyBeforeState = window.History.getObjectState(target);
}

function recordHistoryAfterTransform(event) {
  const target = event?.target;
  if (!target || target.isBackgroundImage) {
    return;
  }

  if (target.straddleGroup) {
    const previousEntries = Array.isArray(target.__historyBeforeEntries)
      ? target.__historyBeforeEntries
      : [];

    const entries = previousEntries
      .map(({ pageNum, sealObject, oldState }) => ({
        pageNum,
        sealObject,
        oldState,
        newState: window.History.getObjectState(sealObject),
      }))
      .filter(({ oldState, newState }) =>
        hasObjectStateChanged(oldState, newState)
      );

    target.__historyBeforeEntries = null;

    if (entries.length > 0) {
      const command = new window.History.ModifySealsCommand(entries);
      window.History.executeCommand(command);
    }
    return;
  }

  const oldState = target.__historyBeforeState;
  target.__historyBeforeState = null;

  if (!oldState) {
    return;
  }

  const newState = window.History.getObjectState(target);
  if (!hasObjectStateChanged(oldState, newState)) {
    return;
  }

  const command = new window.History.ModifySealCommand(
    getCurrentActivePage(),
    target,
    oldState,
    newState
  );
  window.History.executeCommand(command);
}

function hasObjectStateChanged(oldState, newState) {
  if (!oldState || !newState) {
    return false;
  }

  return Object.keys(newState).some((key) => oldState[key] !== newState[key]);
}

function updateCoordinateInputs(event) {
  const activeObject = event?.target || getCurrentPageCanvas()?.getActiveObject();
  if (!activeObject) {
    return;
  }

  if (coordXInputRef) {
    coordXInputRef.value = String(Math.round(activeObject.left || 0));
  }

  if (coordYInputRef) {
    coordYInputRef.value = String(Math.round(activeObject.top || 0));
  }

  toolbarStatusChangeHandler?.();
}

function clearCoordinateInputs() {
  if (coordXInputRef) {
    coordXInputRef.value = '';
  }

  if (coordYInputRef) {
    coordYInputRef.value = '';
  }

  toolbarStatusChangeHandler?.();
}

function applyCoordinateInputs() {
  const canvas = getCurrentPageCanvas();
  if (!canvas) {
    return;
  }

  const activeObject = canvas.getActiveObject();
  if (!activeObject || activeObject.isLocked) {
    return;
  }

  const x = parseFloat(coordXInputRef?.value ?? '');
  const y = parseFloat(coordYInputRef?.value ?? '');

  if (Number.isNaN(x) && Number.isNaN(y)) {
    return;
  }

  const oldState = window.History.getObjectState(activeObject);

  if (!Number.isNaN(x)) {
    activeObject.set({ left: x });
  }

  if (!Number.isNaN(y)) {
    activeObject.set({ top: y });
  }

  canvas.renderAll();

  const newState = window.History.getObjectState(activeObject);
  const command = new window.History.ModifySealCommand(
    getCurrentActivePage(),
    activeObject,
    oldState,
    newState
  );
  window.History.executeCommand(command);
  toolbarStatusChangeHandler?.();
}

function updateGuidelineToggleButton(enabled) {
  if (!guidelineToggleBtnRef) {
    return;
  }

  guidelineToggleBtnRef.classList.toggle('active', enabled);
  guidelineToggleBtnRef.textContent = enabled ? '辅助线：开' : '辅助线：关';
  guidelineToggleBtnRef.title = enabled
    ? '拖动印章时会显示蓝色对齐线，并自动吸附到中心、边缘或其他印章'
    : '点击打开对齐辅助线';
  toolbarStatusChangeHandler?.();
}

function initGuidelinesOnCurrentCanvas() {
  const canvas = getCurrentPageCanvas();
  if (!canvas) {
    return;
  }

  initGuidelines(canvas);
}
