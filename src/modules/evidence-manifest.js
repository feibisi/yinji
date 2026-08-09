import { sanitizeFilename } from '../utils/security.js';

export const EVIDENCE_SCHEMA = 'yinji-evidence/v1';

function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError('需要可计算哈希的二进制数据');
}

export async function sha256Hex(value) {
  const bytes = toUint8Array(value);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

export function collectStampOperations(canvases = []) {
  return canvases.flatMap((canvas, pageIndex) => {
    if (!canvas) return [];
    return canvas
      .getObjects()
      .filter((object) => !object.isBackgroundImage && !object.excludeFromExport)
      .map((object) => ({
        page: pageIndex + 1,
        kind: object.yinjiKind || (object.straddleGroup ? 'straddle' : 'stamp'),
        x: Number((object.left || 0).toFixed(2)),
        y: Number((object.top || 0).toFixed(2)),
        width: Number(object.getScaledWidth().toFixed(2)),
        height: Number(object.getScaledHeight().toFixed(2)),
        opacity: Number((object.opacity ?? 1).toFixed(3)),
        brightness: Number(object.yinjiBrightness ?? 100),
        group: object.straddleGroup || null,
      }));
  });
}

export async function createEvidenceManifest({
  sourceFile,
  sourceBytes,
  outputBytes,
  outputFilename,
  mode,
  pageCount,
  operations = [],
  settings = {},
  createdAt = new Date().toISOString(),
} = {}) {
  return {
    schema: EVIDENCE_SCHEMA,
    createdAt,
    app: { name: 'Yinji', version: 'development' },
    mode: String(mode || 'visual-stamp'),
    source: {
      filename: sanitizeFilename(sourceFile?.name || 'document.pdf'),
      size: toUint8Array(sourceBytes).byteLength,
      sha256: await sha256Hex(sourceBytes),
    },
    output: {
      filename: sanitizeFilename(outputFilename || 'document-sealed.pdf'),
      size: toUint8Array(outputBytes).byteLength,
      sha256: await sha256Hex(outputBytes),
      pageCount: Number(pageCount) || 0,
    },
    operations,
    settings,
    assurance: {
      visualStampOnly: true,
      digitalSignatureApplied: false,
      note: '该清单记录本机处理结果，不等同于数字证书签名或不可篡改审计。',
    },
  };
}

function triggerDownload(blob, filename) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function downloadExportArtifacts(options) {
  const manifest = await createEvidenceManifest(options);
  const outputFilename = manifest.output.filename;
  const outputBytes = toUint8Array(options.outputBytes);
  const sidecarName = outputFilename.replace(/\.[^.]+$/i, '') + '.yinji.json';
  if (globalThis.__yinjiCliCapture === true) {
    globalThis.__yinjiCapturedArtifacts ||= [];
    globalThis.__yinjiCapturedArtifacts.push({
      outputFilename,
      outputBase64: bytesToBase64(outputBytes),
      sidecarName,
      manifest,
    });
  } else {
    triggerDownload(new Blob([outputBytes], { type: options.outputMime || 'application/pdf' }), outputFilename);
  }
  if (globalThis.__yinjiCliCapture !== true) {
  triggerDownload(
    new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }),
    sidecarName
  );
  }
  return { manifest, outputFilename, sidecarName };
}
