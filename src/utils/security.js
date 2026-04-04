/**
 * 安全工具模块
 * 提供 CSP、文件名安全处理、XSS 防护等功能
 */

/**
 * 安全文件名处理：移除危险字符，防止路径遍历
 * @param {string} filename - 原始文件名
 * @returns {string} 安全文件名
 */
export function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return 'document';
  }

  // 移除路径遍历字符、空字节、特殊字符
  let safe = filename
    .replace(/\.\./g, '')  // 防止 ../../ 路径遍历
    .replace(/[<>:"|?*\\]/g, '')  // 移除 Windows 非法字符
    .replace(/\0/g, '')  // 移除空字节
    .replace(/[^\x20-\x7E\u4e00-\u9fa5]/g, ''); // 只保留可打印字符+中文

  // 限制长度
  if (safe.length > 100) {
    safe = safe.substring(0, 100);
  }

  return safe || 'document';
}

/**
 * 从文件名中提取 basename（不含扩展名）
 * @param {string} filename
 * @returns {string}
 */
export function getBasename(filename) {
  const safe = sanitizeFilename(filename);
  const lastDot = safe.lastIndexOf('.');
  return lastDot > 0 ? safe.substring(0, lastDot) : safe;
}

/**
 * 生成安全的导出文件名
 * @param {File|null} originalFile - 原始文件
 * @param {string} suffix - 后缀（默认：_盖章版）
 * @param {string} extension - 文件扩展名，不带点
 * @returns {string} 安全的完整文件名
 */
export function generateSafeExportFilename(
  originalFile,
  suffix = '_盖章版',
  extension = 'pdf'
) {
  const normalizedExtension = String(extension || 'pdf').replace(/^\./, '') || 'pdf';

  if (originalFile && originalFile.name) {
    const base = getBasename(originalFile.name);
    return `${base}${suffix}.${normalizedExtension}`;
  }
  return `document${suffix}.${normalizedExtension}`;
}

/**
 * 设置 Content Security Policy
 * 静态页面需要在 HTML 里预先声明 CSP。
 * 运行时再插入 meta 不会可靠生效，还会在控制台产生警告。
 */
export function setContentSecurityPolicy() {
  return document.querySelector('meta[http-equiv="Content-Security-Policy"]');
}

/**
 * XSS 防护：安全设置文本内容
 * @param {HTMLElement} element - 目标元素
 * @param {string} text - 文本内容
 */
export function setTextContent(element, text) {
  if (element && text) {
    element.textContent = text;
  }
}

/**
 * XSS 防护：安全创建用户可见的文本节点
 * @param {string} text
 * @returns {Text}
 */
export function createTextNode(text) {
  return document.createTextNode(String(text));
}

/**
 * 验证 URL 是否安全（防止 javascript: 协议）
 * @param {string} url
 * @returns {boolean}
 */
export function isSafeUrl(url) {
  if (!url || typeof url !== 'string') return false;

  const lower = url.toLowerCase().trim();
  const dangerous = ['javascript:', 'data:text/html', 'vbscript:', 'blob:'];

  return !dangerous.some(prefix => lower.startsWith(prefix));
}

/**
 * 防止点击劫持：确保页面不被嵌套在 iframe 中
 */
export function preventClickjacking() {
  if (window.self !== window.top) {
    window.top.location = window.self.location;
  }
}

/**
 * 初始化所有安全措施
 */
export function initSecurity() {
  // 设置 CSP
  setContentSecurityPolicy();

  // 防止点击劫持
  preventClickjacking();
}
