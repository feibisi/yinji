/**
 * 将 data URL 转成 Uint8Array
 * @param {string} dataUrl
 * @returns {Uint8Array}
 */
export function dataUrlToUint8Array(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    throw new Error('无效的图片数据');
  }

  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) {
    throw new Error('图片数据格式错误');
  }

  const meta = dataUrl.slice(5, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);
  const isBase64 = meta.includes(';base64');

  if (!isBase64) {
    return new TextEncoder().encode(decodeURIComponent(payload));
  }

  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}
