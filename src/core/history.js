/**
 * History Management System for PDF Stamper
 * Implements undo/redo functionality using Command pattern
 */

const { getState } = window.AppState;

// ==================== History Stack ====================

let undoStack = [];
let redoStack = [];
const MAX_HISTORY = 50; // 最多保存50步历史

// ==================== Command Base Class ====================

class Command {
  execute() {
    throw new Error('execute() must be implemented');
  }

  undo() {
    throw new Error('undo() must be implemented');
  }
}

// ==================== Specific Commands ====================

/**
 * Add Seal Command
 */
class AddSealCommand extends Command {
  constructor(pageNum, sealObject) {
    super();
    this.pageNum = pageNum;
    this.sealObject = sealObject;
  }

  execute() {
    const canvas = getState().fabricCanvases[this.pageNum - 1];
    if (canvas) {
      canvas.add(this.sealObject);
      canvas.setActiveObject(this.sealObject);
      canvas.renderAll();
    }
  }

  undo() {
    const canvas = getState().fabricCanvases[this.pageNum - 1];
    if (canvas) {
      canvas.remove(this.sealObject);
      canvas.renderAll();
    }
  }
}

/**
 * Delete Seal Command
 */
class DeleteSealCommand extends Command {
  constructor(pageNum, sealObject) {
    super();
    this.pageNum = pageNum;
    this.sealObject = sealObject;
  }

  execute() {
    const canvas = getState().fabricCanvases[this.pageNum - 1];
    if (canvas) {
      canvas.remove(this.sealObject);
      canvas.renderAll();
    }
  }

  undo() {
    const canvas = getState().fabricCanvases[this.pageNum - 1];
    if (canvas) {
      canvas.add(this.sealObject);
      canvas.renderAll();
    }
  }
}

/**
 * Modify Seal Command (move, resize, rotate)
 */
class ModifySealCommand extends Command {
  constructor(pageNum, sealObject, oldState, newState) {
    super();
    this.pageNum = pageNum;
    this.sealObject = sealObject;
    this.oldState = oldState;
    this.newState = newState;
  }

  execute() {
    this.applyState(this.newState);
  }

  undo() {
    this.applyState(this.oldState);
  }

  applyState(state) {
    this.sealObject.set({
      left: state.left,
      top: state.top,
      scaleX: state.scaleX,
      scaleY: state.scaleY,
      angle: state.angle,
    });
    const canvas = getState().fabricCanvases[this.pageNum - 1];
    if (canvas) {
      canvas.renderAll();
    }
  }
}

// ==================== History Management Functions ====================

/**
 * Execute a command and add to history
 * @param {Command} command - Command to execute
 */
function executeCommand(command) {
  command.execute();
  undoStack.push(command);

  // Limit history size
  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift();
  }

  // Clear redo stack when new command is executed
  redoStack = [];

  updateUndoRedoButtons();
}

/**
 * Undo last command
 */
function undo() {
  if (undoStack.length === 0) {
    window.Toast?.info('没有可撤销的操作');
    return;
  }

  const command = undoStack.pop();
  command.undo();
  redoStack.push(command);

  updateUndoRedoButtons();
  window.Toast?.success('已撤销');
}

/**
 * Redo last undone command
 */
function redo() {
  if (redoStack.length === 0) {
    window.Toast?.info('没有可重做的操作');
    return;
  }

  const command = redoStack.pop();
  command.execute();
  undoStack.push(command);

  updateUndoRedoButtons();
  window.Toast?.success('已重做');
}

/**
 * Clear all history
 */
function clearHistory() {
  undoStack = [];
  redoStack = [];
  updateUndoRedoButtons();
}

/**
 * Update undo/redo button states
 */
function updateUndoRedoButtons() {
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');

  if (undoBtn) {
    undoBtn.disabled = undoStack.length === 0;
  }

  if (redoBtn) {
    redoBtn.disabled = redoStack.length === 0;
  }
}

/**
 * Get object state for history
 * @param {fabric.Object} obj - Fabric object
 * @returns {Object} Object state
 */
function getObjectState(obj) {
  return {
    left: obj.left,
    top: obj.top,
    scaleX: obj.scaleX,
    scaleY: obj.scaleY,
    angle: obj.angle,
  };
}

// ==================== Exports ====================

window.History = {
  executeCommand,
  undo,
  redo,
  clearHistory,
  getObjectState,
  AddSealCommand,
  DeleteSealCommand,
  ModifySealCommand,
};

// Initialize button states
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', updateUndoRedoButtons);
} else {
  updateUndoRedoButtons();
}
