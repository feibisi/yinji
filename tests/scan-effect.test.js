import {
  DEFAULT_SCAN_CONFIG,
  SCAN_PARAM_RANGES,
  SCAN_PRESETS,
  sanitizeScanConfig,
  getNoiseSVG,
  createNoiseImage,
  applyScanEffect,
} from '../src/modules/scan-effect.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeSourceCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'black';
  ctx.fillRect(10, 10, 40, 20);
  // 中灰区: brightness() 是乘法, 纯黑(0)与纯白(255)都不可观测,
  // 需要中间灰阶才能验证亮度/对比度类参数真实生效
  ctx.fillStyle = '#808080';
  ctx.fillRect(10, 40, 60, 30);
  return canvas;
}

function meanLuminance(canvas) {
  const ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  return sum / (data.length / 4);
}

// 暖色偏移: 红通道均值 - 蓝通道均值。
// sepia() 是色相偏移而非亮度偏移(对白色降均值、对中灰升均值, 会互相抵消),
// 故用通道差值度量泛黄是否真实生效。
function warmth(canvas) {
  const ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let r = 0;
  let b = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    b += data[i + 2];
  }
  return (r - b) / (data.length / 4);
}

async function runScanEffectTests() {
  const results = [];

  // 1. 默认值必须与 lookscanned 一致
  assert(DEFAULT_SCAN_CONFIG.rotate === 1, 'rotate 默认应为 1');
  assert(DEFAULT_SCAN_CONFIG.rotate_var === 0.5, 'rotate_var 默认应为 0.5');
  assert(DEFAULT_SCAN_CONFIG.colorspace === 'gray', 'colorspace 默认应为 gray');
  assert(DEFAULT_SCAN_CONFIG.blur === 0.5, 'blur 默认应为 0.5');
  assert(DEFAULT_SCAN_CONFIG.noise === 0.25, 'noise 默认应为 0.25');
  assert(DEFAULT_SCAN_CONFIG.border === false, 'border 默认应为 false');
  assert(DEFAULT_SCAN_CONFIG.scale === 2, 'scale 默认应为 2');
  assert(DEFAULT_SCAN_CONFIG.brightness === 1, 'brightness 默认应为 1');
  assert(DEFAULT_SCAN_CONFIG.yellowish === 0, 'yellowish 默认应为 0');
  assert(DEFAULT_SCAN_CONFIG.contrast === 1, 'contrast 默认应为 1');
  assert(DEFAULT_SCAN_CONFIG.output_format === 'image/jpeg', 'output_format 默认应为 image/jpeg');
  results.push('默认配置一致');

  // 2. 范围表
  assert(SCAN_PARAM_RANGES.rotate.min === -10 && SCAN_PARAM_RANGES.rotate.max === 10, 'rotate 范围应为 -10~10');
  assert(SCAN_PARAM_RANGES.scale.step === 0.5, 'scale step 应为 0.5');
  results.push('参数范围正确');

  // 3. sanitize: 越界钳制 + 脏类型回落 + 未知键剔除
  const cleaned = sanitizeScanConfig({
    rotate: 999,
    blur: -5,
    colorspace: 'cmyk',
    noise: 'abc',
    border: 'yes',
    evil: 1,
  });
  assert(cleaned.rotate === 10, '越界 rotate 应钳制到 10');
  assert(cleaned.blur === 0, '越界 blur 应钳制到 0');
  assert(cleaned.colorspace === 'gray', '非法 colorspace 应回落 gray');
  assert(cleaned.noise === DEFAULT_SCAN_CONFIG.noise, '非数字 noise 应回落默认');
  assert(cleaned.border === true, "字符串 'yes' 应转为布尔 true");
  assert(!('evil' in cleaned), '未知键应被剔除');
  results.push('sanitizeScanConfig 正确');

  // 4. 预设存在且合法
  assert(SCAN_PRESETS.light && SCAN_PRESETS.standard && SCAN_PRESETS.mono, '应有三个预设');
  assert(SCAN_PRESETS.mono.colorspace === 'gray', '黑白复印预设应为 gray');
  results.push('预设存在');

  // 5. 噪点 SVG 随 noise 变化
  const svgA = getNoiseSVG(0.25);
  const svgB = getNoiseSVG(0.75);
  assert(svgA.includes('feTurbulence'), '噪点 SVG 应含 feTurbulence');
  assert(svgA !== svgB, '不同 noise 应生成不同 SVG');
  results.push('噪点 SVG 生成正确');

  // 6. noise=0 时不产生噪点图
  const noNoise = await createNoiseImage(0);
  assert(noNoise === null, 'noise=0 应返回 null');
  results.push('noise=0 跳过噪点');

  // 7. applyScanEffect 输出尺寸 = 源尺寸
  const source = makeSourceCanvas(120, 80);
  const out = document.createElement('canvas');
  applyScanEffect(out, source, { ...DEFAULT_SCAN_CONFIG, noise: 0, rotate: 0, rotate_var: 0 }, null);
  assert(out.width === 120 && out.height === 80, '输出尺寸应等于源尺寸');
  results.push('输出尺寸正确');

  // 8. 泛黄(yellowish)会改变画面 —— 效果确实生效
  const plain = document.createElement('canvas');
  applyScanEffect(plain, source, { ...DEFAULT_SCAN_CONFIG, noise: 0, rotate: 0, rotate_var: 0, yellowish: 0 }, null);
  const sepia = document.createElement('canvas');
  applyScanEffect(sepia, source, { ...DEFAULT_SCAN_CONFIG, noise: 0, rotate: 0, rotate_var: 0, yellowish: 1 }, null);
  assert(warmth(sepia) - warmth(plain) > 5, '泛黄应产生暖色偏移(红高于蓝)');
  results.push('泛黄生效');

  // 9. 亮度参数生效(调亮 => 平均亮度升高)
  const bright = document.createElement('canvas');
  applyScanEffect(bright, source, { ...DEFAULT_SCAN_CONFIG, noise: 0, rotate: 0, rotate_var: 0, brightness: 1.8 }, null);
  assert(meanLuminance(bright) > meanLuminance(plain), '提高 brightness 应提升平均亮度');
  results.push('亮度生效');

  // 10. border 会在边缘画深色线
  const bordered = document.createElement('canvas');
  applyScanEffect(bordered, source, { ...DEFAULT_SCAN_CONFIG, noise: 0, rotate: 0, rotate_var: 0, border: true }, null);
  const bctx = bordered.getContext('2d');
  const corner = bctx.getImageData(0, 0, 1, 1).data;
  assert(corner[0] < 200, 'border=true 时左上角应为深色');
  results.push('边框生效');

  return results;
}

window.runScanEffectTests = runScanEffectTests;
