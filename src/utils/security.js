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
 * HTML 转义：任何需要把用户可控数据拼进 innerHTML 的地方都必须先过这里。
 * 当前代码统一用 textContent 渲染不可信数据（安全），此助手作为纵深防御，
 * 避免未来改用 innerHTML 时遗漏转义（CSP 含 unsafe-inline，注入即可执行）。
 * @param {string} value
 * @returns {string}
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 初始化安全措施
 * CSP 已在 HTML meta 标签中声明，无需运行时设置
 */
export function initSecurity() {
  // CSP 通过 <meta http-equiv="Content-Security-Policy"> 静态声明
  // frame-ancestors 通过服务器 X-Frame-Options 或 CSP 控制
}
