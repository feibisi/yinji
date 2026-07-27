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

/**
 * 校验并规范化水印配置
 * @param {object} raw
 * @returns {object}
 */
export function sanitizeWatermark(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const watermark = { ...DEFAULT_WATERMARK };

  if (source.enabled !== undefined) {
    watermark.enabled = Boolean(source.enabled);
  }

  if (source.text !== undefined && source.text !== null) {
    watermark.text = String(source.text).slice(0, 100);
  }

  const fontSize = Number(source.fontSize);
  if (Number.isFinite(fontSize)) {
    watermark.fontSize = Math.min(400, Math.max(8, fontSize));
  }

  const opacity = Number(source.opacity);
  if (Number.isFinite(opacity)) {
    watermark.opacity = Math.min(1, Math.max(0, opacity));
  }

  const angle = Number(source.angle);
  if (Number.isFinite(angle)) {
    watermark.angle = Math.min(180, Math.max(-180, angle));
  }

  if (typeof source.color === 'string' && source.color.trim()) {
    watermark.color = source.color.trim();
  }

  if (source.repeat !== undefined) {
    watermark.repeat = Boolean(source.repeat);
  }

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
    const stepX = Math.max(metrics.width + watermark.fontSize * 2, watermark.fontSize * 4);
    const stepY = watermark.fontSize * 4;
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
