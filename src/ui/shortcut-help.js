function buildShortcutKeyset(keys) {
  const wrapper = document.createElement('div');
  wrapper.className = 'shortcut-keyset';

  const parts = keys.includes('+') ? keys.split('+') : [keys];
  parts.forEach((part, index) => {
    const key = document.createElement('kbd');
    key.className = 'shortcut-kbd';
    key.textContent = part.trim();
    wrapper.appendChild(key);

    if (index < parts.length - 1) {
      const join = document.createElement('span');
      join.className = 'shortcut-join';
      join.textContent = '+';
      wrapper.appendChild(join);
    }
  });

  return wrapper;
}

export function showShortcutsHelp() {
  const existingModal = document.getElementById('shortcut-help-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const shortcuts = [
    {
      category: '编辑',
      items: [
        { keys: 'Ctrl+Z', desc: '撤销' },
        { keys: 'Ctrl+Y', desc: '重做' },
        { keys: 'Delete', desc: '删除选中印章' },
        { keys: 'Esc', desc: '取消选择' },
        { keys: 'Ctrl+C', desc: '复制选中印章' },
        { keys: 'Ctrl+V', desc: '粘贴印章' },
        { keys: 'Ctrl+L', desc: '锁定/解锁印章' },
      ],
    },
    {
      category: '移动',
      items: [
        { keys: '↑↓←→', desc: '移动印章 (1px)' },
        { keys: 'Shift+↑↓←→', desc: '快速移动 (10px)' },
      ],
    },
    {
      category: '视图',
      items: [
        { keys: '+/-', desc: '缩放' },
        { keys: 'PageUp/Down', desc: '切换页面' },
      ],
    },
    {
      category: '操作',
      items: [
        { keys: 'Ctrl+S', desc: '导出PDF' },
        { keys: '?', desc: '显示此帮助' },
      ],
    },
  ];

  const modal = document.createElement('div');
  modal.id = 'shortcut-help-modal';
  modal.className = 'app-dialog-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  const content = document.createElement('div');
  content.className = 'shortcut-modal-content';

  const header = document.createElement('div');
  header.className = 'shortcut-modal-header';

  const headerCopy = document.createElement('div');
  headerCopy.innerHTML = `
    <h2 class="app-modal-title">键盘快捷键</h2>
    <p class="app-modal-subtitle">常用编辑、移动、视图和导出操作。</p>
  `;

  const headerCloseBtn = document.createElement('button');
  headerCloseBtn.type = 'button';
  headerCloseBtn.className = 'app-modal-close-btn';
  headerCloseBtn.setAttribute('aria-label', '关闭快捷键帮助');
  headerCloseBtn.innerHTML = '&times;';

  header.appendChild(headerCopy);
  header.appendChild(headerCloseBtn);

  const body = document.createElement('div');
  body.className = 'shortcut-modal-body';

  shortcuts.forEach((category) => {
    const section = document.createElement('section');
    section.className = 'shortcut-section shortcut-card';

    const heading = document.createElement('h3');
    heading.className = 'shortcut-section-title shortcut-card-title';
    heading.textContent = category.category;
    section.appendChild(heading);

    const table = document.createElement('table');
    table.className = 'shortcut-table';

    category.items.forEach((item) => {
      const row = document.createElement('tr');
      const keyCell = document.createElement('td');
      keyCell.className = 'shortcut-key';
      keyCell.appendChild(buildShortcutKeyset(item.keys));

      const descCell = document.createElement('td');
      descCell.className = 'shortcut-desc';
      descCell.textContent = item.desc;

      row.appendChild(keyCell);
      row.appendChild(descCell);
      table.appendChild(row);
    });

    section.appendChild(table);
    body.appendChild(section);
  });

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn-primary';
  closeBtn.textContent = '关闭';

  const footer = document.createElement('div');
  footer.className = 'shortcut-footer';
  footer.appendChild(closeBtn);

  content.appendChild(header);
  content.appendChild(body);
  content.appendChild(footer);
  modal.appendChild(content);

  const closeModal = () => {
    document.removeEventListener('keydown', escHandler);
    modal.remove();
  };

  const escHandler = (event) => {
    if (event.key === 'Escape') {
      closeModal();
    }
  };

  closeBtn.onclick = closeModal;
  headerCloseBtn.onclick = closeModal;

  modal.onclick = (event) => {
    if (event.target === modal) {
      closeModal();
    }
  };

  document.addEventListener('keydown', escHandler);
  document.body.appendChild(modal);
}
