/**
 * 布尔值解析工具
 * 供各 sanitize* 函数共用, 避免同一套"否"字符串判断散落多处。
 */

/**
 * 解析来自不可信来源(localStorage 等)的布尔值。
 * 该值可能是手工编辑或损坏的字符串, 而 Boolean('false') 为 true,
 * 故需显式识别表示"否"的字符串。
 * @param {*} value
 * @param {boolean} fallback
 * @returns {boolean}
 */
export function parseBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return !['', 'false', 'no', '0', 'off'].includes(normalized);
  }

  return Boolean(value);
}
