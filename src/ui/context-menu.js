import { getCurrentPageCanvas } from '../modules/canvas-manager.js';
import {
  deleteSelectedObject,
  toggleLockSelected,
} from '../modules/stamp-manager.js';
import {
  copySelected,
  pasteClipboard,
  hasClipboard,
} from '../modules/object-clipboard.js';

const contextMenu = document.getElementById('context-menu');

let toolbarStatusChangeHandler = null;
let initialized = false;

export function setupContextMenu({ onToolbarStatusChange } = {}) {
  if (!contextMenu) {
    return;
  }

  toolbarStatusChangeHandler = onToolbarStatusChange || toolbarStatusChangeHandler;

  if (initialized) {
    return;
  }

  document.addEventListener('contextmenu', handleContextMenuOpen);
  contextMenu.addEventListener('click', handleContextMenuClick);
  document.addEventListener('click', handleContextMenuDismiss);

  initialized = true;
}

function handleContextMenuOpen(event) {
  const canvasWrapper = event.target.closest('.canvas-wrapper');
  if (!canvasWrapper) {
    hideContextMenu();
    return;
  }

  const canvas = getCurrentPageCanvas();
  const activeObject = canvas?.getActiveObject();

  if (!activeObject) {
    hideContextMenu();
    return;
  }

  event.preventDefault();
  showContextMenu(event.clientX, event.clientY);
}

function handleContextMenuClick(event) {
  const menuItem = event.target.closest('.context-menu-item');
  if (!menuItem) {
    return;
  }

  handleContextMenuAction(menuItem.dataset.action);
  hideContextMenu();
}

function handleContextMenuDismiss(event) {
  if (!event.target.closest('#context-menu')) {
    hideContextMenu();
  }
}

function showContextMenu(x, y) {
  contextMenu.classList.remove('hidden');
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function hideContextMenu() {
  contextMenu.classList.add('hidden');
}

function handleContextMenuAction(action) {
  switch (action) {
    case 'delete':
      deleteSelectedObject();
      break;
    case 'copy':
      copySelected();
      break;
    case 'paste':
      if (hasClipboard()) {
        pasteClipboard();
      }
      break;
    case 'toggle-lock':
      toggleLockSelected();
      break;
    case 'undo':
      window.History.undo();
      break;
    case 'redo':
      window.History.redo();
      break;
    default:
      break;
  }

  toolbarStatusChangeHandler?.();
}
