import {
  DEFAULT_SCAN_CONFIG,
  SCAN_PARAM_RANGES,
  SCAN_PRESETS,
  sanitizeScanConfig,
  getNoiseSVG,
  createNoiseImage,
  applyScanEffect,
} from '../src/modules/scan-effect.js';
import {
  DEFAULT_WATERMARK,
  sanitizeWatermark,
  applyWatermark,
} from '../src/modules/scan-watermark.js';
import {
  DEFAULT_SCAN_METADATA,
  sanitizeScanMetadata,
} from '../src/modules/scan-export.js';

function createResults() {
  return {
    passed: 0,
    failed: 0,
    tests: [],
  };
}

function assert(results, condition, message) {
  if (condition) {
    results.passed += 1;
    results.tests.push({ status: 'PASS', message });
    return;
  }

  results.failed += 1;
  results.tests.push({ status: 'FAIL', message });
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

export async function runScanEffectTests() {
  const results = createResults();

  // 1. 默认值必须与 lookscanned 一致
  assert(results, DEFAULT_SCAN_CONFIG.rotate === 1, 'rotate 默认应为 1');
  assert(results, DEFAULT_SCAN_CONFIG.rotate_var === 0.5, 'rotate_var 默认应为 0.5');
  assert(results, DEFAULT_SCAN_CONFIG.colorspace === 'gray', 'colorspace 默认应为 gray');
  assert(results, DEFAULT_SCAN_CONFIG.blur === 0.5, 'blur 默认应为 0.5');
  assert(results, DEFAULT_SCAN_CONFIG.noise === 0.25, 'noise 默认应为 0.25');
  assert(results, DEFAULT_SCAN_CONFIG.border === false, 'border 默认应为 false');
  assert(results, DEFAULT_SCAN_CONFIG.scale === 2, 'scale 默认应为 2');
  assert(results, DEFAULT_SCAN_CONFIG.brightness === 1, 'brightness 默认应为 1');
  assert(results, DEFAULT_SCAN_CONFIG.yellowish === 0, 'yellowish 默认应为 0');
  assert(results, DEFAULT_SCAN_CONFIG.contrast === 1, 'contrast 默认应为 1');
  assert(results, DEFAULT_SCAN_CONFIG.output_format === 'image/jpeg', 'output_format 默认应为 image/jpeg');

  // 2. 范围表
  assert(results, SCAN_PARAM_RANGES.rotate.min === -10 && SCAN_PARAM_RANGES.rotate.max === 10, 'rotate 范围应为 -10~10');
  assert(results, SCAN_PARAM_RANGES.scale.step === 0.5, 'scale step 应为 0.5');

  // 3. sanitize: 越界钳制 + 脏类型回落 + 未知键剔除
  const cleaned = sanitizeScanConfig({
    rotate: 999,
    blur: -5,
    colorspace: 'cmyk',
    noise: 'abc',
    border: 'yes',
    evil: 1,
  });
  assert(results, cleaned.rotate === 10, '越界 rotate 应钳制到 10');
  assert(results, cleaned.blur === 0, '越界 blur 应钳制到 0');
  assert(results, cleaned.colorspace === 'gray', '非法 colorspace 应回落 gray');
  assert(results, cleaned.noise === DEFAULT_SCAN_CONFIG.noise, '非数字 noise 应回落默认');
  assert(results, cleaned.border === true, "字符串 'yes' 应转为布尔 true");
  assert(results, !('evil' in cleaned), '未知键应被剔除');

  // 3b. sanitize: 表示"否"的字符串不应被误转为 true
  const falsy = sanitizeScanConfig({ border: 'false' });
  assert(results, falsy.border === false, "字符串 'false' 应转为布尔 false");
  const falsy2 = sanitizeScanConfig({ border: '0' });
  assert(results, falsy2.border === false, "字符串 '0' 应转为布尔 false");

  // 4. 预设存在且合法
  assert(results, SCAN_PRESETS.light && SCAN_PRESETS.standard && SCAN_PRESETS.mono, '应有三个预设');
  assert(results, SCAN_PRESETS.mono.colorspace === 'gray', '黑白复印预设应为 gray');

  // 5. 噪点 SVG 随 noise 变化
  const svgA = getNoiseSVG(0.25);
  const svgB = getNoiseSVG(0.75);
  assert(results, svgA.includes('feTurbulence'), '噪点 SVG 应含 feTurbulence');
  assert(results, svgA !== svgB, '不同 noise 应生成不同 SVG');

  // 6. noise=0 时不产生噪点图
  const noNoise = await createNoiseImage(0);
  assert(results, noNoise === null, 'noise=0 应返回 null');

  // 7. applyScanEffect 输出尺寸 = 源尺寸
  const source = makeSourceCanvas(120, 80);
  const out = document.createElement('canvas');
  applyScanEffect(out, source, { ...DEFAULT_SCAN_CONFIG, noise: 0, rotate: 0, rotate_var: 0 }, null);
  assert(results, out.width === 120 && out.height === 80, '输出尺寸应等于源尺寸');

  // 8. 泛黄(yellowish)会改变画面 —— 效果确实生效
  const plain = document.createElement('canvas');
  applyScanEffect(plain, source, { ...DEFAULT_SCAN_CONFIG, noise: 0, rotate: 0, rotate_var: 0, yellowish: 0 }, null);
  const sepia = document.createElement('canvas');
  applyScanEffect(sepia, source, { ...DEFAULT_SCAN_CONFIG, noise: 0, rotate: 0, rotate_var: 0, yellowish: 1 }, null);
  assert(results, warmth(sepia) - warmth(plain) > 5, '泛黄应产生暖色偏移(红高于蓝)');

  // 9. 亮度参数生效(调亮 => 平均亮度升高)
  const bright = document.createElement('canvas');
  applyScanEffect(bright, source, { ...DEFAULT_SCAN_CONFIG, noise: 0, rotate: 0, rotate_var: 0, brightness: 1.8 }, null);
  assert(results, meanLuminance(bright) > meanLuminance(plain), '提高 brightness 应提升平均亮度');

  // 10. border 会在边缘画深色线
  const bordered = document.createElement('canvas');
  applyScanEffect(bordered, source, { ...DEFAULT_SCAN_CONFIG, noise: 0, rotate: 0, rotate_var: 0, border: true }, null);
  const bctx = bordered.getContext('2d');
  const corner = bctx.getImageData(0, 0, 1, 1).data;
  assert(results, corner[0] < 200, 'border=true 时左上角应为深色');

  // 11. 水印默认关闭
  assert(results, DEFAULT_WATERMARK.enabled === false, '水印默认应关闭');
  assert(results, typeof DEFAULT_WATERMARK.text === 'string', '水印应有默认文本字段');

  // 12. sanitizeWatermark 钳制透明度与字号
  const wm = sanitizeWatermark({ opacity: 99, fontSize: -3, text: 123, enabled: 'y' });
  assert(results, wm.opacity <= 1 && wm.opacity >= 0, '透明度应钳制到 0~1');
  assert(results, wm.fontSize > 0, '字号应为正数');
  assert(results, typeof wm.text === 'string', '文本应转为字符串');
  assert(results, wm.enabled === true, "enabled 'y' 应转 true");

  // 13. 关闭时不改动画布
  const untouched = document.createElement('canvas');
  applyScanEffect(untouched, source, { ...DEFAULT_SCAN_CONFIG, noise: 0, rotate: 0, rotate_var: 0 }, null);
  const beforeLum = meanLuminance(untouched);
  applyWatermark(untouched, { ...DEFAULT_WATERMARK, enabled: false, text: '机密' });
  assert(results, Math.abs(meanLuminance(untouched) - beforeLum) < 0.001, '水印关闭时不应改动画布');

  // 14. 开启时改变画面
  const marked = document.createElement('canvas');
  applyScanEffect(marked, source, { ...DEFAULT_SCAN_CONFIG, noise: 0, rotate: 0, rotate_var: 0 }, null);
  const plainLum = meanLuminance(marked);
  applyWatermark(marked, { ...DEFAULT_WATERMARK, enabled: true, text: '机密', fontSize: 24, opacity: 0.8, color: '#ff0000' });
  assert(results, Math.abs(meanLuminance(marked) - plainLum) > 0.05, '水印开启应改变画面');

  // 15. 平铺模式比单个水印覆盖更多像素
  const single = document.createElement('canvas');
  applyScanEffect(single, source, { ...DEFAULT_SCAN_CONFIG, noise: 0, rotate: 0, rotate_var: 0 }, null);
  const singleBase = meanLuminance(single);
  applyWatermark(single, { ...DEFAULT_WATERMARK, enabled: true, text: '密', fontSize: 16, opacity: 1, color: '#000000', repeat: false });
  const singleDelta = Math.abs(meanLuminance(single) - singleBase);

  const tiled = document.createElement('canvas');
  applyScanEffect(tiled, source, { ...DEFAULT_SCAN_CONFIG, noise: 0, rotate: 0, rotate_var: 0 }, null);
  const tiledBase = meanLuminance(tiled);
  applyWatermark(tiled, { ...DEFAULT_WATERMARK, enabled: true, text: '密', fontSize: 16, opacity: 1, color: '#000000', repeat: true });
  const tiledDelta = Math.abs(meanLuminance(tiled) - tiledBase);

  assert(results, tiledDelta > singleDelta, '平铺水印应覆盖更多像素');

  // 16. 水印布尔字段: 脏 localStorage 里的 false 类字符串不得被当成 true
  const wmFalse = sanitizeWatermark({ enabled: 'false', repeat: '0' });
  assert(results, wmFalse.enabled === false, "水印 enabled 字符串 'false' 应转为 false");
  assert(results, wmFalse.repeat === false, "水印 repeat 字符串 '0' 应转为 false");
  const wmOff = sanitizeWatermark({ enabled: ' OFF ', repeat: 'no' });
  assert(results, wmOff.enabled === false, "水印 enabled ' OFF '(含空格大写) 应转为 false");
  assert(results, wmOff.repeat === false, "水印 repeat 'no' 应转为 false");
  const wmTrue = sanitizeWatermark({ enabled: 'y', repeat: true });
  assert(results, wmTrue.enabled === true, "水印 enabled 'y' 应仍为 true");
  assert(results, wmTrue.repeat === true, '水印 repeat 真布尔应仍为 true');

  // 17. 非法颜色应回落默认色
  const wmBadColor = sanitizeWatermark({ color: 'not-a-color' });
  assert(results, wmBadColor.color === DEFAULT_WATERMARK.color, '非法颜色应回落默认色');
  const wmGoodColor = sanitizeWatermark({ color: '#ff0000' });
  assert(results, wmGoodColor.color === '#ff0000', '合法颜色应被采纳');

  // 18. 异常字号下平铺不得挂死(step 兜底): 能在有限时间内返回即算通过。
  // 若死循环守卫失效, 下面这行会挂住/超时而永远到不了 assert, 这是有意的设计而非空断言。
  const hangCanvas = document.createElement('canvas');
  applyScanEffect(hangCanvas, source, { ...DEFAULT_SCAN_CONFIG, noise: 0, rotate: 0, rotate_var: 0 }, null);
  applyWatermark(hangCanvas, {
    enabled: true,
    text: '密',
    fontSize: 0,
    color: '#000000',
    opacity: 1,
    angle: 0,
    repeat: true,
  });
  assert(results, true, '异常字号(0)平铺水印不挂死');

  // 19. angle 与超长文本钳制
  const wmClamp = sanitizeWatermark({ angle: 999, text: 'x'.repeat(500) });
  assert(results, wmClamp.angle === 180, '越界 angle 应钳制到 180');
  assert(results, wmClamp.text.length === 100, '超长文本应截断到 100 字');

  // 20. 元数据默认值与 sanitize
  assert(results, DEFAULT_SCAN_METADATA.enabled === false, '元数据默认应关闭');
  assert(results, DEFAULT_SCAN_METADATA.scannerStyle === false, '扫描仪风格默认应关闭');
  const md = sanitizeScanMetadata({ title: 456, author: '  张三  ', evil: 1, enabled: 1, scannerStyle: 'x' });
  assert(results, md.title === '456', '标题应转为字符串');
  assert(results, md.author === '张三', '作者应去除首尾空格');
  assert(results, md.enabled === true, 'enabled 应转布尔');
  assert(results, md.scannerStyle === true, 'scannerStyle 应转布尔');
  assert(results, !('evil' in md), '未知键应剔除');

  return results;
}

window.runScanEffectTests = runScanEffectTests;
