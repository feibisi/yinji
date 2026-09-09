export const STAMP_TEMPLATE_SCHEMA = 'yinji-stamp-template/v1';

export const DEFAULT_STAMP_TEMPLATE = Object.freeze({
  schema: STAMP_TEMPLATE_SCHEMA,
  pages: 'all',
  anchor: 'center',
  offsetX: 0,
  offsetY: 0,
  size: null,
  opacity: null,
  rotation: null,
  brightness: null,
  removeBackground: null,
});

const ANCHORS = new Set([
  'center',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]);

function finiteOr(value, fallback, min = -Infinity, max = Infinity) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(max, Math.max(min, number))
    : fallback;
}

export function sanitizeStampTemplate(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const anchor = ANCHORS.has(source.anchor) ? source.anchor : 'center';
  const pages = String(source.pages || 'all').trim().slice(0, 200) || 'all';
  return {
    schema: STAMP_TEMPLATE_SCHEMA,
    pages,
    anchor,
    offsetX: finiteOr(source.offsetX, 0, -2000, 2000),
    offsetY: finiteOr(source.offsetY, 0, -2000, 2000),
    size: source.size == null ? null : finiteOr(source.size, null, 0.05, 1),
    opacity: source.opacity == null ? null : finiteOr(source.opacity, null, 0.05, 1),
    rotation: source.rotation == null ? null : finiteOr(source.rotation, null, -180, 180),
    brightness: source.brightness == null ? null : finiteOr(source.brightness, null, 0, 200),
    removeBackground: typeof source.removeBackground === 'boolean' ? source.removeBackground : null,
  };
}

export function resolveTemplatePages(expression, totalPages) {
  const total = Math.max(0, Math.floor(Number(totalPages) || 0));
  const text = String(expression || 'all').trim().toLowerCase();
  if (text === 'all' || text === '全部') {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const pages = new Set();
  const resolveToken = (token) => {
    if (token === 'first' || token === '首页') return 1;
    if (token === 'last' || token === '末页') return total;
    return Number(token);
  };

  text.split(/[，,\s]+/).filter(Boolean).forEach((part) => {
    const range = part.split('-');
    if (range.length === 2) {
      const start = resolveToken(range[0]);
      const end = resolveToken(range[1]);
      if (Number.isInteger(start) && Number.isInteger(end)) {
        for (let page = Math.min(start, end); page <= Math.max(start, end); page += 1) {
          if (page >= 1 && page <= total) pages.add(page);
        }
      }
      return;
    }

    const page = resolveToken(part);
    if (Number.isInteger(page) && page >= 1 && page <= total) pages.add(page);
  });

  return Array.from(pages).sort((a, b) => a - b);
}

export function calculateStampPlacement({
  pageWidth,
  pageHeight,
  stampWidth,
  stampHeight,
  template,
  margin = 24,
}) {
  const safe = sanitizeStampTemplate(template);
  let x = (pageWidth - stampWidth) / 2;
  let y = (pageHeight - stampHeight) / 2;

  if (safe.anchor.includes('left')) x = margin;
  if (safe.anchor.includes('right')) x = pageWidth - stampWidth - margin;
  if (safe.anchor.includes('top')) y = pageHeight - stampHeight - margin;
  if (safe.anchor.includes('bottom')) y = margin;

  return {
    x: Math.min(pageWidth - stampWidth, Math.max(0, x + safe.offsetX)),
    y: Math.min(pageHeight - stampHeight, Math.max(0, y + safe.offsetY)),
  };
}

export function validateStraddleCoverage(operations, totalPages, groupId = null) {
  const covered = new Set(
    (operations || [])
      .filter((item) => item.kind === 'straddle' && (!groupId || item.group === groupId))
      .map((item) => Number(item.page))
      .filter(Number.isInteger)
  );
  const missingPages = [];
  for (let page = 1; page <= totalPages; page += 1) {
    if (!covered.has(page)) missingPages.push(page);
  }
  return { ok: missingPages.length === 0, missingPages, coveredPages: covered.size };
}

export function findIncompleteStraddleGroups(operations, totalPages) {
  const groups = Array.from(
    new Set((operations || []).filter((item) => item.kind === 'straddle').map((item) => item.group))
  ).filter(Boolean);
  return groups
    .map((group) => ({ group, ...validateStraddleCoverage(operations, totalPages, group) }))
    .filter((result) => !result.ok);
}
