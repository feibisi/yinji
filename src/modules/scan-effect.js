/**
 * 扫描效果模块
 *
 * 核心算法移植自 lookscanned.io (MIT License)
 * https://github.com/lookscanned/lookscanned.io
 * 灵感来源: baicunko/scanyourpdf
 *
 * 纯函数层: 不依赖应用状态、不操作业务 DOM。
 */

export const COLORSPACES = ['gray', 'sRGB'];

export const DEFAULT_SCAN_CONFIG = {
  rotate: 1,
  rotate_var: 0.5,
  colorspace: 'gray',
  blur: 0.5,
  noise: 0.25,
  border: false,
  scale: 2,
  brightness: 1,
  yellowish: 0,
  contrast: 1,
  output_format: 'image/jpeg',
};

export const SCAN_PARAM_RANGES = {
  rotate: { min: -10, max: 10, step: 0.1 },
  rotate_var: { min: 0, max: 10, step: 0.1 },
  blur: { min: 0, max: 1, step: 0.01 },
  noise: { min: 0, max: 1, step: 0.01 },
  brightness: { min: 0, max: 2, step: 0.01 },
  contrast: { min: 0, max: 2, step: 0.01 },
  yellowish: { min: 0, max: 2, step: 0.01 },
  scale: { min: 1, max: 3, step: 0.5 },
};

export const SCAN_PRESETS = {
  light: {
    rotate: 0.3,
    rotate_var: 0.2,
    colorspace: 'sRGB',
    blur: 0.2,
    noise: 0.1,
    brightness: 1,
    yellowish: 0.1,
    contrast: 1.05,
  },
  standard: {
    rotate: 1,
    rotate_var: 0.5,
    colorspace: 'gray',
    blur: 0.5,
    noise: 0.25,
    brightness: 1,
    yellowish: 0,
    contrast: 1,
  },
  mono: {
    rotate: 1.2,
    rotate_var: 0.8,
    colorspace: 'gray',
    blur: 0.6,
    noise: 0.35,
    brightness: 1.1,
    yellowish: 0,
    contrast: 1.4,
  },
};

/**
 * 校验并规范化扫描配置: 越界钳制、类型不符回落默认、未知键剔除
 * @param {object} raw
 * @returns {object}
 */
export function sanitizeScanConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const config = { ...DEFAULT_SCAN_CONFIG };

  Object.keys(SCAN_PARAM_RANGES).forEach((key) => {
    const range = SCAN_PARAM_RANGES[key];
    const value = Number(source[key]);
    if (Number.isFinite(value)) {
      config[key] = Math.min(range.max, Math.max(range.min, value));
    }
  });

  if (COLORSPACES.includes(source.colorspace)) {
    config.colorspace = source.colorspace;
  }

  if (source.border !== undefined) {
    config.border = Boolean(source.border);
  }

  if (source.output_format === 'image/png' || source.output_format === 'image/jpeg') {
    config.output_format = source.output_format;
  }

  return config;
}

/**
 * 生成噪点 SVG (feTurbulence fractalNoise)
 * 取自 https://fffuel.co/nnnoise/ 的思路, 强度随 noise 变化
 * @param {number} noise
 * @returns {string}
 */
export function getNoiseSVG(noise) {
  return `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 700 700" width="700" height="700">
  <defs>
    <filter id="yinji-noise" x="-20%" y="-20%" width="140%" height="140%" filterUnits="objectBoundingBox" primitiveUnits="userSpaceOnUse" color-interpolation-filters="linearRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.102" numOctaves="4" seed="15" stitchTiles="stitch" result="turbulence"></feTurbulence>
      <feSpecularLighting surfaceScale="15" specularConstant="${noise * 3}" specularExponent="20" lighting-color="#7957A8" in="turbulence" result="specularLighting">
        <feDistantLight azimuth="3" elevation="100"></feDistantLight>
      </feSpecularLighting>
      <feColorMatrix type="saturate" values="0" in="specularLighting" result="colormatrix"></feColorMatrix>
    </filter>
  </defs>
  <rect width="700" height="700" fill="transparent"></rect>
  <rect width="700" height="700" fill="#7957a8" filter="url(#yinji-noise)"></rect>
</svg>`;
}

const noiseImageCache = new Map();

/**
 * 生成噪点图片元素, 按 noise 值缓存。noise<=0 返回 null
 * @param {number} noise
 * @returns {Promise<HTMLImageElement|null>}
 */
export async function createNoiseImage(noise) {
  const value = Number(noise);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  const cacheKey = value.toFixed(2);
  if (noiseImageCache.has(cacheKey)) {
    return noiseImageCache.get(cacheKey);
  }

  const svg = getNoiseSVG(value);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('噪点图生成失败'));
      image.src = url;
    });
    noiseImageCache.set(cacheKey, image);
    return image;
  } catch (error) {
    console.error('生成噪点图失败:', error);
    return null;
  } finally {
    // 延迟撤销: 部分浏览器在解码完成前撤销会导致图片失效
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * 在 canvas 上绘制扫描效果
 * @param {HTMLCanvasElement} canvas 目标画布(会被 resize)
 * @param {CanvasImageSource} source 源页面图(含背景+印章的合成结果)
 * @param {object} config 扫描配置
 * @param {HTMLImageElement|null} noiseImage 预先备好的噪点图
 */
export function applyScanEffect(canvas, source, config, noiseImage) {
  const width = source.width || source.naturalWidth;
  const height = source.height || source.naturalHeight;

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('画布不可用');
  }

  ctx.save();

  // 白底
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);

  // 滤镜链: 模糊 → 可选灰度 → 亮度 → 泛黄 → 对比度
  let filter = `blur(${config.blur}px)`;
  if (config.colorspace === 'gray') {
    filter += ' grayscale(1)';
  }
  filter += ` brightness(${config.brightness})`;
  filter += ` sepia(${config.yellowish})`;
  filter += ` contrast(${config.contrast})`;
  ctx.filter = filter;

  // 绕中心随机小角度旋转(模拟放歪的纸)
  const angle = config.rotate + config.rotate_var * (Math.random() * 2 - 1);
  ctx.translate(width / 2, height / 2);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.translate(-width / 2, -height / 2);

  ctx.drawImage(source, 0, 0);

  ctx.restore();

  // 噪点层(不受滤镜与旋转影响)
  if (noiseImage) {
    ctx.drawImage(noiseImage, 0, 0, width, height);
  }

  // 可选黑边
  if (config.border) {
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);
  }
}
