import {
  getRotatedSealDataUrl,
  makeSealToneMatrix,
  removeSealBackground,
} from '../src/modules/seal-image-processing.js';
import {
  downloadExportArtifacts,
  sha256Hex,
} from '../src/modules/evidence-manifest.js';
import {
  calculateStampPlacement,
  resolveTemplatePages,
  sanitizeStampTemplate,
  validateStraddleCoverage,
} from '../src/modules/stamp-template.js';
import { decryptSealVault, encryptSealVault } from '../src/modules/seal-vault.js';

function createResults() {
  return { passed: 0, failed: 0, tests: [] };
}

function assert(results, condition, message) {
  results[condition ? 'passed' : 'failed'] += 1;
  results.tests.push({ status: condition ? 'PASS' : 'FAIL', message });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export async function runAdvancedFeatureTests() {
  const results = createResults();

  const scannedPixels = new Uint8ClampedArray(3 * 3 * 4);
  for (let offset = 0; offset < scannedPixels.length; offset += 4) {
    scannedPixels.set([222, 220, 216, 255], offset);
  }
  scannedPixels.set([238, 154, 154, 255], (1 * 3 + 1) * 4);
  const scannedImageData = new ImageData(scannedPixels, 3, 3);
  const improvedBackground = removeSealBackground(scannedImageData);
  assert(results, scannedImageData.data[3] === 0, '浅灰扫描底色应自动透明');
  assert(results, scannedImageData.data[(1 * 3 + 1) * 4 + 3] === 255, '浅红印泥不应被误删');
  assert(results, improvedBackground.backgroundColor[0] < 240, '算法应从图片边缘估算实际纸张底色');

  const shallowMatrix = makeSealToneMatrix(0);
  const normalMatrix = makeSealToneMatrix(100);
  const deepMatrix = makeSealToneMatrix(200);
  assert(results, shallowMatrix[0] === 1 && shallowMatrix[18] === 0.2, '调浅应降低印泥密度而不是把颜色乘成黑色');
  assert(results, normalMatrix[0] === 1 && normalMatrix[18] === 1, '深浅 100 应保持原图');
  assert(results, deepMatrix[0] === 0.6 && deepMatrix[18] === 1, '最深档应保留颜色并限制暗化幅度');

  const originalAnchorClick = HTMLAnchorElement.prototype.click;
  let downloadedFilename = '';
  HTMLAnchorElement.prototype.click = function captureDownload() {
    downloadedFilename = this.download;
  };
  try {
    const directDownload = await downloadExportArtifacts({
      sourceFile: new File([new Uint8Array([1, 2])], 'source.pdf', { type: 'application/pdf' }),
      sourceBytes: new Uint8Array([1, 2]),
      outputBytes: new Uint8Array([3, 4]),
      outputFilename: 'result.pdf',
      mode: 'visual-stamp',
      pageCount: 1,
      operations: [],
    });
    assert(results, downloadedFilename === 'result.pdf', '人工导出应直接下载 PDF，不应改成 ZIP');
    assert(results, directDownload.downloadFilename === 'result.pdf', '下载结果应报告原格式文件名');
  } finally {
    HTMLAnchorElement.prototype.click = originalAnchorClick;
  }

  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = 100;
  sourceCanvas.height = 20;
  sourceCanvas.getContext('2d').fillRect(0, 0, 100, 20);
  const sourceImage = await loadImage(sourceCanvas.toDataURL());
  const rotatedImage = await loadImage(getRotatedSealDataUrl(sourceImage, 90, 100));
  assert(results, rotatedImage.naturalWidth <= 22, '长条图片旋转 90 度后宽度应交换');
  assert(results, rotatedImage.naturalHeight >= 99, '长条图片旋转 90 度后不应被裁切');

  const digest = await sha256Hex(new TextEncoder().encode('abc'));
  assert(results, digest === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'SHA-256 应匹配标准向量');

  assert(results, JSON.stringify(resolveTemplatePages('1,3-4,last', 6)) === '[1,3,4,6]', '模板页码表达式应支持范围和末页');
  const safeTemplate = sanitizeStampTemplate({ anchor: 'bad', offsetX: 99999 });
  assert(results, safeTemplate.anchor === 'center' && safeTemplate.offsetX === 2000, '模板输入应清洗并限制范围');
  const adjustedTemplate = sanitizeStampTemplate({ rotation: 270, brightness: -10, removeBackground: false });
  assert(results, adjustedTemplate.rotation === 180 && adjustedTemplate.brightness === 0 && adjustedTemplate.removeBackground === false, 'Agent 模板应限制旋转、深浅并保留去背景选择');
  const placement = calculateStampPlacement({ pageWidth: 600, pageHeight: 800, stampWidth: 100, stampHeight: 50, template: { anchor: 'bottom-right' } });
  assert(results, placement.x === 476 && placement.y === 24, '右下锚点坐标应正确');
  const coverage = validateStraddleCoverage([{ page: 1, kind: 'straddle', group: 'g' }], 2, 'g');
  assert(results, !coverage.ok && coverage.missingPages[0] === 2, '骑缝章覆盖校验应发现缺页');

  const seals = [{ id: '1', name: '合同章', imageData: 'data:image/png;base64,AAAA' }];
  const envelope = await encryptSealVault(seals, 'correct-passphrase');
  assert(results, !JSON.stringify(envelope).includes('合同章'), '加密保险库不应泄露印章名称明文');
  const restored = await decryptSealVault(envelope, 'correct-passphrase');
  assert(results, restored[0].name === '合同章', '加密保险库应正确往返');
  let wrongPasswordRejected = false;
  try { await decryptSealVault(envelope, 'wrong-passphrase'); } catch { wrongPasswordRejected = true; }
  assert(results, wrongPasswordRejected, '错误口令必须拒绝解密');

  return results;
}
