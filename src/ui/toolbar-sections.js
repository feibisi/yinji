const STORAGE_KEY = 'yinji-toolbar-sections';

export function setupToolbarSections() {
  const sections = document.querySelectorAll('.tool-section[data-section-key]');

  sections.forEach((section) => {
    if (section.dataset.sectionReady === 'true') {
      return;
    }

    const heading = section.querySelector('h3');
    if (!heading) {
      return;
    }

    const sectionKey = section.dataset.sectionKey;
    const defaultOpen = section.dataset.sectionDefault !== 'closed';
    const button = createToggleButton(heading.textContent?.trim() || '模块');
    const body = wrapSectionBody(section, heading);
    const storedState = readStoredState();
    const expanded =
      typeof storedState[sectionKey] === 'boolean'
        ? storedState[sectionKey]
        : defaultOpen;

    body.id = `tool-section-body-${sectionKey}`;
    button.setAttribute('aria-controls', body.id);
    button.addEventListener('click', () => {
      const nextExpanded = section.classList.contains('is-collapsed');
      applySectionState(section, body, button, nextExpanded);
      storeSectionState(sectionKey, nextExpanded);
    });

    heading.replaceWith(button);
    section.appendChild(body);
    applySectionState(section, body, button, expanded);
    section.dataset.sectionReady = 'true';
  });
}

function createToggleButton(labelText) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tool-section-toggle';

  const label = document.createElement('span');
  label.className = 'tool-section-toggle-label';
  label.textContent = labelText;

  const icon = document.createElement('span');
  icon.className = 'tool-section-toggle-icon';
  icon.setAttribute('aria-hidden', 'true');

  button.append(label, icon);
  return button;
}

function wrapSectionBody(section, heading) {
  const body = document.createElement('div');
  body.className = 'tool-section-body';

  let node = heading.nextSibling;
  while (node) {
    const currentNode = node;
    node = node.nextSibling;
    body.appendChild(currentNode);
  }

  return body;
}

function applySectionState(section, body, button, expanded) {
  section.classList.toggle('is-collapsed', !expanded);
  body.hidden = !expanded;
  button.setAttribute('aria-expanded', String(expanded));
}

function readStoredState() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function storeSectionState(sectionKey, expanded) {
  const nextState = {
    ...readStoredState(),
    [sectionKey]: expanded,
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
}
