import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const INPUT_LIMITS = Object.freeze({
  pdfBytes: 50 * 1024 * 1024,
  sealBytes: 5 * 1024 * 1024,
});

function failure(code, message, details = {}) {
  return { ok: false, code, message, ...details };
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function hasPdfHeader(bytes) {
  return bytes.subarray(0, Math.min(bytes.length, 1024)).toString('latin1').includes('%PDF-');
}

function hasPdfEof(bytes) {
  return bytes.subarray(Math.max(0, bytes.length - 4096)).toString('latin1').includes('%%EOF');
}

function detectRasterMime(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return '';
}

export function inspectLocalFile(filePath, { expected = 'document' } = {}) {
  const absolutePath = path.resolve(filePath || '');
  if (!filePath || !fs.existsSync(absolutePath)) {
    return failure('FILE_NOT_FOUND', `找不到文件：${absolutePath}`, { path: absolutePath });
  }
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) return failure('NOT_A_FILE', '输入路径不是普通文件', { path: absolutePath });
  if (stat.size === 0) return failure('FILE_EMPTY', '输入文件为空', { path: absolutePath });
  const bytes = fs.readFileSync(absolutePath);
  const common = { path: absolutePath, filename: path.basename(absolutePath), size: stat.size, sha256: sha256(bytes) };

  if (expected === 'seal') {
    if (stat.size > INPUT_LIMITS.sealBytes) return failure('SEAL_TOO_LARGE', '印章图片超过 5 MB', common);
    const mime = detectRasterMime(bytes);
    if (!mime) return failure('SEAL_FORMAT_UNSUPPORTED', 'Agent 只接受 PNG、JPEG、GIF 或 WebP 印章图片', common);
    return { ok: true, kind: 'seal', mime, ...common };
  }

  if (stat.size > INPUT_LIMITS.pdfBytes) return failure('PDF_TOO_LARGE', 'PDF 超过 50 MB', common);
  if (!hasPdfHeader(bytes)) return failure('PDF_HEADER_INVALID', '文件没有有效 PDF 头', common);
  if (!hasPdfEof(bytes)) return failure('PDF_EOF_MISSING', 'PDF 结尾不完整或文件已损坏', common);
  if (/\/Encrypt\b/.test(bytes.toString('latin1'))) {
    return failure('PDF_ENCRYPTED_UNSUPPORTED', '当前 Agent 流程不处理加密 PDF，请先由用户解密副本', common);
  }
  return { ok: true, kind: 'pdf', mime: 'application/pdf', ...common };
}

export function assertPreflight(filePath, options) {
  const result = inspectLocalFile(filePath, options);
  if (!result.ok) {
    const error = new Error(result.message);
    error.code = result.code;
    error.details = result;
    throw error;
  }
  return result;
}
