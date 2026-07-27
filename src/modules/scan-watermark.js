/**
 * 扫描件水印模块
 * 在扫描效果图上叠加文字水印(单个居中 或 平铺)。纯函数层。
 */

export const DEFAULT_WATERMARK = {
  enabled: false,
  text: '机密',
  fontSize: 48,
  color: '#888888',
  opacity: 0.25,
  angle: -30,
  repeat: true,
};

// sanitizeWatermark 钳制边界
const MAX_TEXT_LENGTH = 100;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 400;
const MAX_ANGLE = 180;

// 平铺步长下限(像素): 防止异常字号导致步长 <= 0 而循环不终止
const MIN_TILE_STEP = 4;

/**
 * 解析不可信来源的布尔值。
 * 该值可能来自手工编辑或损坏的 localStorage 字符串,
 * 而 Boolean('false') 为 true, 故需显式识别表示"否"的字符串。
 * @param {*} value
 * @param {boolean} fallback
 * @returns {boolean}
 */
function parseBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return !['', 'false', 'no', '0', 'off'].includes(normalized);
  }

  return Boolean(value);
}

/**
 * 校验并规范化水印配置
 * @param {object} raw
 * @returns {object}
 */
export function sanitizeWatermark(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const watermark = { ...DEFAULT_WATERMARK };

  watermark.enabled = parseBoolean(source.enabled, watermark.enabled);

  if (source.text !== undefined && source.text !== null) {
    watermark.text = String(source.text).slice(0, MAX_TEXT_LENGTH);
  }

  const fontSize = Number(source.fontSize);
  if (Number.isFinite(fontSize)) {
    watermark.fontSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, fontSize));
  }

  const opacity = Number(source.opacity);
  if (Number.isFinite(opacity)) {
    watermark.opacity = Math.min(1, Math.max(0, opacity));
  }

  const angle = Number(source.angle);
  if (Number.isFinite(angle)) {
    watermark.angle = Math.min(MAX_ANGLE, Math.max(-MAX_ANGLE, angle));
  }

  if (typeof source.color === 'string' && source.color.trim()) {
    const candidate = source.color.trim();
    // 非法颜色会被 canvas fillStyle 静默忽略(保留前值), 故显式校验后回落默认色
    const supportsColor =
      typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
        ? CSS.supports('color', candidate)
        : true;
    watermark.color = supportsColor ? candidate : DEFAULT_WATERMARK.color;
  }

  watermark.repeat = parseBoolean(source.repeat, watermark.repeat);

  return watermark;
}

/**
 * 在画布上叠加文字水印
 * @param {HTMLCanvasElement} canvas
 * @param {object} watermark
 */
export function applyWatermark(canvas, watermark) {
  if (!watermark || !watermark.enabled) {
    return;
  }

  const text = String(watermark.text || '').trim();
  if (!text) {
    return;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  const { width, height } = canvas;

  ctx.save();
  ctx.globalAlpha = watermark.opacity;
  ctx.fillStyle = watermark.color;
  ctx.font = `${watermark.fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const radians = (watermark.angle * Math.PI) / 180;

  if (watermark.repeat) {
    const metrics = ctx.measureText(text);
    // 步长必须为正, 否则循环永不终止(挂死浏览器)。
    // applyWatermark 可能被传入未经 sanitizeWatermark 清洗的配置, 故此处兜底。
    const stepX = Math.max(metrics.width + watermark.fontSize * 2, watermark.fontSize * 4, MIN_TILE_STEP);
    const stepY = Math.max(watermark.fontSize * 4, MIN_TILE_STEP);
    // 覆盖旋转后的对角范围, 保证边角也有水印
    const reach = Math.ceil(Math.sqrt(width * width + height * height) / 2);

    ctx.translate(width / 2, height / 2);
    ctx.rotate(radians);

    for (let x = -reach; x <= reach; x += stepX) {
      for (let y = -reach; y <= reach; y += stepY) {
        ctx.fillText(text, x, y);
      }
    }
  } else {
    ctx.translate(width / 2, height / 2);
    ctx.rotate(radians);
    ctx.fillText(text, 0, 0);
  }

  ctx.restore();
}
