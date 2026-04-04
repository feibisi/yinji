/**
 * 加载 Fabric.js 图片，优先使用 crossOrigin
 * @param {string} src - 图片 URL 或 data URL
 * @returns {Promise<fabric.Image>}
 */
export async function loadFabricImage(src) {
  try {
    return await fabric.Image.fromURL(src, { crossOrigin: "anonymous" });
  } catch (error) {
    return await fabric.Image.fromURL(src);
  }
}
