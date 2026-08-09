const DEFAULT_BACKGROUND_THRESHOLD = 232;

function clamp(value, min, max, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.min(max, Math.max(min, numeric))
    : fallback;
}

export function normalizeSealBrightness(value) {
  return clamp(value, 0, 200, 100);
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
  const result = removeEdgeConnectedBackground(imageData, threshold);
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
