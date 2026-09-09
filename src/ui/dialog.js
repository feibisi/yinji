/**
 * 通用对话框组件
 * 提供确认框和输入框，替代浏览器原生 confirm/prompt
 */

/**
 * 显示自定义对话框
 * @param {Object} options
 * @param {string} options.title - 标题
 * @param {string} [options.message] - 说明文字
 * @param {string} [options.confirmText] - 确认按钮文字
 * @param {string} [options.cancelText] - 取消按钮文字
 * @param {boolean} [options.showInput] - 是否显示输入框
 * @param {string} [options.defaultValue] - 输入框默认值
 * @param {string} [options.placeholder] - 输入框占位文字
 * @param {string} [options.inputType] - text 或 password
 * @param {boolean} [options.danger] - 确认按钮是否为危险样式
 * @returns {Promise<boolean|string|null>}
 */
function showDialogModal({
  title,
  message = "",
  confirmText = "确定",
  cancelText = "取消",
  showInput = false,
  defaultValue = "",
  placeholder = "",
  inputType = "text",
  danger = false,
}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "app-dialog-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");

    const content = document.createElement("div");
    content.className = "app-dialog-content";

    const titleElement = document.createElement("h3");
    titleElement.textContent = title;
    titleElement.className = "app-modal-title";

    const body = document.createElement("div");
    body.className = "app-modal-body app-dialog-body";
    body.appendChild(titleElement);

    if (message) {
      const messageElement = document.createElement("p");
      messageElement.textContent = message;
      messageElement.className = "app-dialog-message";
      body.appendChild(messageElement);
    }

    let inputElement = null;
    if (showInput) {
      inputElement = document.createElement("input");
      inputElement.type = inputType === 'password' ? 'password' : 'text';
      inputElement.value = defaultValue;
      inputElement.placeholder = placeholder;
      inputElement.className = "app-dialog-input";
      body.appendChild(inputElement);
    }

    const actionRow = document.createElement("div");
    actionRow.className = "app-dialog-actions";

    const cancelButton = document.createElement("button");
    cancelButton.textContent = cancelText;
    cancelButton.type = "button";
    cancelButton.className = "btn btn-secondary";

    const confirmButton = document.createElement("button");
    confirmButton.textContent = confirmText;
    confirmButton.type = "button";
    confirmButton.className = danger ? "btn btn-danger" : "btn btn-primary";

    actionRow.appendChild(cancelButton);
    actionRow.appendChild(confirmButton);
    body.appendChild(actionRow);
    content.appendChild(body);
    overlay.appendChild(content);

    const closeDialog = (result) => {
      document.removeEventListener("keydown", handleKeydown);
      overlay.remove();
      resolve(result);
    };

    const confirmDialog = () => {
      if (showInput) {
        closeDialog(inputElement ? inputElement.value : "");
        return;
      }
      closeDialog(true);
    };

    const cancelDialog = () => {
      if (showInput) {
        closeDialog(null);
        return;
      }
      closeDialog(false);
    };

    const handleKeydown = (event) => {
      if (event.key === "Escape") {
        cancelDialog();
      }
      if (event.key === "Enter") {
        confirmDialog();
      }
    };

    cancelButton.addEventListener("click", cancelDialog);
    confirmButton.addEventListener("click", confirmDialog);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        cancelDialog();
      }
    });
    document.addEventListener("keydown", handleKeydown);

    document.body.appendChild(overlay);

    if (inputElement) {
      inputElement.focus();
      inputElement.select();
      return;
    }

    confirmButton.focus();
  });
}

/**
 * 确认对话框
 * @param {Object} options - 同 showDialogModal
 * @returns {Promise<boolean>}
 */
export async function confirmAction(options) {
  return showDialogModal(options);
}

/**
 * 输入对话框
 * @param {Object} options - 同 showDialogModal，自动 showInput=true
 * @returns {Promise<string|null>}
 */
export async function promptInput(options) {
  return showDialogModal({ ...options, showInput: true });
}
