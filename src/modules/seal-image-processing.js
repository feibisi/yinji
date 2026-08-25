const DEFAULT_BACKGROUND_THRESHOLD = 232;
const DEFAULT_BACKGROUND_FEATHER = 64;

function clamp(value, min, max, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.min(max, Math.max(min, numeric))
    : fallback;
}

export function normalizeSealBrightness(value) {
  return clamp(value, 0, 200, 100);
}

export function makeSealToneMatrix(brightness) {
  const normalized = normalizeSealBrightness(brightness);
  const shallowFactor = normalized <= 100
    ? 0.2 + (normalized / 100) * 0.8
    : 1;
  const colorFactor = normalized <= 100
    ? 1
    : 1 - ((normalized - 100) / 100) * 0.4;
  return [
    colorFactor, 0, 0, 0, 0,
    0, colorFactor, 0, 0, 0,
    0, 0, colorFactor, 0, 0,
    0, 0, 0, shallowFactor, 0,
  ];
}

export function getSealToneCssFilter(brightness) {
  const normalized = normalizeSealBrightness(brightness);
  if (normalized <= 100) {
    return `opacity(${0.2 + (normalized / 100) * 0.8})`;
  }
  return `brightness(${1 - ((normalized - 100) / 100) * 0.4})`;
}

export function normalizeBackgroundThreshold(value) {
  return clamp(value, 180, 254, DEFAULT_BACKGROUND_THRESHOLD);
}

function isBackgroundPixel(data, offset, threshold) {
  const alpha = data[offset + 3];
  if (alpha === 0) return true;

  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const min = Math.min(red, green, blue);
  const max = Math.max(red, green, blue);

  // 只把接近中性的亮色视作候选背景，避免浅红印章被误删。
  return min >= threshold && max - min <= 24;
}

function pixelLuminance(red, green, blue) {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function median(values) {
  if (values.length === 0) return 255;
  values.sort((left, right) => left - right);
  return values[Math.floor(values.length / 2)];
}

/**
 * 从四边的低色差亮色像素估算纸张底色。这样拍照或扫描得到的米白、浅灰底
 * 也能被识别，而不是只能处理纯白色。
 */
function estimateBackgroundColor(imageData) {
  const { data, width, height } = imageData;
  const samples = [[], [], []];
  const collect = (x, y) => {
    const offset = (y * width + x) * 4;
    if (data[offset + 3] === 0) return;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
    if (chroma > 42 || pixelLuminance(red, green, blue) < 150) return;
    samples[0].push(red);
    samples[1].push(green);
    samples[2].push(blue);
  };

  for (let x = 0; x < width; x += 1) {
    collect(x, 0);
    if (height > 1) collect(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    collect(0, y);
    if (width > 1) collect(width - 1, y);
  }

  return samples.map(median);
}

function smoothstep(value) {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * 去除整张印章图中的纸张底色，并对抗锯齿边缘做柔化。
 * 与旧的边缘洪泛不同，封闭文字和圆环内部的纸张也会透明；浅红、浅蓝等
 * 有明显色差的印泥会保留。
 * @returns {{removedPixels:number,softenedPixels:number,totalPixels:number,backgroundColor:number[]}}
 */
export function removeSealBackground(
  imageData,
  { threshold = DEFAULT_BACKGROUND_THRESHOLD, feather = DEFAULT_BACKGROUND_FEATHER } = {}
) {
  const { data, width, height } = imageData;
  const safeThreshold = normalizeBackgroundThreshold(threshold);
  const safeFeather = clamp(feather, 24, 96, DEFAULT_BACKGROUND_FEATHER);
  const backgroundColor = estimateBackgroundColor(imageData);
  const backgroundLuminance = pixelLuminance(...backgroundColor);
  const hardDistance = Math.max(12, 255 - safeThreshold + 8);
  const softDistance = hardDistance + safeFeather;
  let removedPixels = 0;
  let softenedPixels = 0;

  for (let offset = 0; offset < data.length; offset += 4) {
    const originalAlpha = data[offset + 3];
    if (originalAlpha === 0) continue;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
    const luminance = pixelLuminance(red, green, blue);
    if (chroma > 52 || luminance < Math.max(132, backgroundLuminance - 105)) continue;

    const distance = Math.sqrt(
      ((red - backgroundColor[0]) ** 2
        + (green - backgroundColor[1]) ** 2
        + (blue - backgroundColor[2]) ** 2) / 3
    );
    if (distance >= softDistance) continue;

    const alphaScale = smoothstep((distance - hardDistance) / (softDistance - hardDistance));
    const nextAlpha = Math.round(originalAlpha * alphaScale);
    if (nextAlpha === originalAlpha) continue;
    data[offset + 3] = nextAlpha;
    if (nextAlpha === 0) removedPixels += 1;
    else softenedPixels += 1;
  }

  return {
    removedPixels,
    softenedPixels,
    totalPixels: width * height,
    backgroundColor,
  };
}

/**
 * 只移除与图片边缘连通的近白背景，保留封闭图形内部的白色区域。
 * @param {ImageData} imageData
 * @param {number} threshold
 * @returns {{removedPixels:number,totalPixels:number}}
 */
export function removeEdgeConnectedBackground(
  imageData,
  threshold = DEFAULT_BACKGROUND_THRESHOLD
) {
  const { data, width, height } = imageData;
  const safeThreshold = normalizeBackgroundThreshold(threshold);
  const visited = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  let head = 0;
  let tail = 0;

  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (visited[index]) return;
    visited[index] = 1;
    if (!isBackgroundPixel(data, index * 4, safeThreshold)) return;
    queue[tail++] = index;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  let removedPixels = 0;
  while (head < tail) {
    const index = queue[head++];
    const offset = index * 4;
    if (data[offset + 3] !== 0) {
      data[offset + 3] = 0;
      removedPixels += 1;
    }

    const x = index % width;
    const y = Math.floor(index / width);
    enqueue(x - 1, y);
    enqueue(x + 1, y);
    enqueue(x, y - 1);
    enqueue(x, y + 1);
  }

  return { removedPixels, totalPixels: width * height };
}

export function loadSealImage(source) {
  if (source instanceof HTMLImageElement && source.complete && source.naturalWidth > 0) {
    return Promise.resolve(source);
  }

  const src = typeof source === 'string' ? source : source?.src;
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('印章图片无法读取'));
    image.src = src || '';
  });
}

export async function removeBackgroundFromSeal(source, { threshold } = {}) {
  const image = await loadSealImage(source);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const result = removeSealBackground(imageData, { threshold });
  context.putImageData(imageData, 0, 0);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    ...result,
  };
}

export function getRotatedSealDataUrl(sourceImage, angle, brightness = 100) {
  const width = sourceImage.naturalWidth || sourceImage.width;
  const height = sourceImage.naturalHeight || sourceImage.height;
  const radians = (clamp(angle, -180, 180, 0) * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const outputWidth = Math.max(1, Math.ceil(width * cos + height * sin));
  const outputHeight = Math.max(1, Math.ceil(width * sin + height * cos));
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext('2d');
  context.translate(outputWidth / 2, outputHeight / 2);
  context.rotate(radians);
  context.filter = `brightness(${normalizeSealBrightness(brightness) / 100})`;
  context.drawImage(sourceImage, -width / 2, -height / 2);
  return canvas.toDataURL('image/png');
}

export { DEFAULT_BACKGROUND_THRESHOLD };
