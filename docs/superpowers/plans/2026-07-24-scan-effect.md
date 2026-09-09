# 导出为扫描件 + 高级功能 实现计划

> **历史计划，非当前事实源（2026-08-09 更新）**：本文保留当时的实现过程和已被否决的方案。当前实现以根目录 `README.md`、`src/modules/scan-export.js` 和自动化测试为准。文中“伪装成扫描仪”及 Canon 元数据示例已经撤销；产品只可写入真实的 `Yinji` / `Yinji PDF Processor` 来源，不得冒用硬件品牌或真实扫描设备。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给印迹新增「导出为扫描件」能力——把已盖章的 PDF/图片处理成看起来像真实打印后扫描的文档，并自主实现水印、PDF 元数据、DPI、批量等高级功能，全部解锁无门槛。

**Architecture:** 移植 lookscanned.io（MIT）的纯 canvas 扫描算法到印迹原生 ES module 世界（零新依赖、零构建）。管线：每页 fabric canvas 栅格化（背景+印章合成）→ `applyScanEffect` 加扫描效果 → 可选水印 → pdf-lib 按原尺寸重组为图像 PDF + 写元数据。设置面板 + 当前页实时预览（防抖）。

**Tech Stack:** 原生 ES modules、Canvas 2D（`ctx.filter` / feTurbulence SVG 噪点）、fabric.js（现有）、pdf-lib（现有 vendor）、pdf.js（现有 vendor）。无 npm、无构建步骤。

## Global Constraints

- **零新依赖、零构建步骤**：不引入 npm 包、不加 package.json、不加打包器。所有库沿用 `vendor/` 现有文件。
- **纯前端 100% 本地**：文件不上传服务器。不做 API / Email-to-scan / 聊天集成（需后端，经用户确认排除）。
- **无付费门槛**：所有功能（水印/元数据/DPI/批量）全部解锁，不加任何 license/限制/水印强制。
- **署名合规**：`src/modules/scan-effect.js` 顶部注明算法移植自 lookscanned.io（MIT License）+ 灵感来源 baicunko/scanyourpdf。不含 lookscanned 专有代码或资产。
- **编码规范**：JS 用 2 空格缩进、单引号、分号（跟随现有 src/ 风格）；CSS 令牌用 `--wpcy-*` 前缀（若新增）。中文注释。输出不使用 emoji。
- **不改动现有盖章/导出逻辑**：只新增文件 + 在 index.html 插入 UI + 在 main.js 接线。沿用 `window.Loading` / `window.Toast` / `window.Settings` / `generateSafeExportFilename`。
- **参数默认值（取自 lookscanned，必须逐字一致）**：`rotate: 1, rotate_var: 0.5, colorspace: 'gray', blur: 0.5, noise: 0.25, border: false, scale: 2, brightness: 1, yellowish: 0, contrast: 1, output_format: 'image/jpeg'`
- **参数范围**：rotate `-10~10` step `0.1`；rotate_var `0~10` step `0.1`；blur `0~1` step `0.01`；noise `0~1` step `0.01`；brightness `0~2` step `0.01`；contrast `0~2` step `0.01`；yellowish `0~2` step `0.01`；scale `1~3` step `0.5`。
- **验证命令**：改 JS 后跑 `node --check <file>`；改交互后跑 `node tools/ai/yinji-cli.mjs smoke --pdf ./test-fixture.pdf`。测试需 headless chromium 在 `127.0.0.1:9222` + http 服务在 `127.0.0.1:8123`。
- **spec 来源**：`docs/superpowers/specs/2026-07-24-scan-effect-design.md`

> **测试风格注记（Task 1 执行后已变更，Tasks 2/3 追加测试时必须遵守）**：
> `tests/scan-effect.test.js` 已统一为与 `tests/validators.test.js`/`tests/state.test.js`
> 相同的**累加式**断言，签名为 `assert(results, condition, message)`，
> `runScanEffectTests()` 返回 `{passed, failed, tests}`。
> 下方各任务示例代码中形如 `assert(条件, '消息')` 与 `results.push('...')` 的写法为旧式，
> 追加测试时改用累加式调用，**断言的条件表达式与阈值保持逐字不变**。

### 测试环境启动（每个含浏览器测试的任务开头都需确保）

```bash
cd /home/parallels/Projects/yinji
# http 服务
curl -s -o /dev/null http://127.0.0.1:8123/index.html || \
  { setsid python3 -m http.server 8123 >/tmp/yinji-http.log 2>&1 < /dev/null & disown; sleep 2; }
# headless chromium (必须显式绑 IPv4, 否则 CLI 连不上)
curl -s http://127.0.0.1:9222/json/version >/dev/null || \
  { setsid chromium --headless=new --no-sandbox --disable-gpu \
      --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 \
      --user-data-dir=/tmp/yinji-chrome-test about:blank >/tmp/yinji-chrome.log 2>&1 < /dev/null & disown; sleep 6; }
curl -s http://127.0.0.1:9222/json/version | grep -o '"Browser":"[^"]*"'
```

---

## File Structure

| 文件 | 职责 |
|------|------|
| `src/modules/scan-effect.js` (新建) | 纯函数层：扫描配置默认值/预设/范围、feTurbulence 噪点 SVG 生成与缓存、`applyScanEffect` 核心算法。不碰 DOM 业务、不依赖应用状态。 |
| `src/modules/scan-watermark.js` (新建) | 纯函数层：在 canvas 上叠加文字水印（单个居中 / 平铺）。 |
| `src/modules/scan-export.js` (新建) | 管线层：页面栅格化 → 扫描 → 水印 → pdf-lib 重组 + 元数据 → 下载。依赖 state/scan-effect/scan-watermark。 |
| `src/features/scan-ui.js` (新建) | UI 层：设置面板读写、预设、实时预览（防抖）、导出按钮接线、config 持久化。 |
| `src/styles/scan.css` (新建) | 扫描面板与预览层样式。 |
| `index.html` (修改) | 导出 tab 单份区插入「导出为扫描件」按钮 + 扫描设置面板 DOM；批量区插入批量扫描按钮。 |
| `src/style.css` (修改) | 追加 `@import "./styles/scan.css";` |
| `src/main.js` (修改) | 引入并调用 `setupScanUI()`。 |
| `tests/scan-effect.test.js` (新建) | 浏览器内单元测试（跟随现有 tests/ 的 window 挂载风格）。 |
| `tests/index.html` (修改) | 挂载新测试。 |

---

## Task 1: 扫描效果核心（配置 + 噪点 + applyScanEffect）

**Files:**
- Create: `src/modules/scan-effect.js`
- Create: `tests/scan-effect.test.js`
- Modify: `tests/index.html`

**Interfaces:**
- Consumes: 无（纯函数，不依赖应用状态）
- Produces:
  - `DEFAULT_SCAN_CONFIG: {rotate:number, rotate_var:number, colorspace:'gray'|'sRGB', blur:number, noise:number, border:boolean, scale:number, brightness:number, yellowish:number, contrast:number, output_format:'image/png'|'image/jpeg'}`
  - `SCAN_PARAM_RANGES: Record<string,{min:number,max:number,step:number}>`
  - `SCAN_PRESETS: Record<'light'|'standard'|'mono', Partial<DEFAULT_SCAN_CONFIG>>`
  - `sanitizeScanConfig(raw: object): DEFAULT_SCAN_CONFIG` — 越界钳制/类型不符回落默认
  - `getNoiseSVG(noise: number): string`
  - `createNoiseImage(noise: number): Promise<HTMLImageElement|null>` — noise<=0 返回 null；按 noise.toFixed(2) 缓存
  - `applyScanEffect(canvas: HTMLCanvasElement, source: CanvasImageSource, config: object, noiseImage: HTMLImageElement|null): void` — 同步绘制，调用方负责先备好 noiseImage

- [ ] **Step 1: 写失败测试**

创建 `tests/scan-effect.test.js`：

```js
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
  // 中灰区: CSS brightness()/contrast() 是乘法, 纯黑(0)与纯白(255)都不可观测
  // (0×n=0, 255 已封顶), 必须有中间灰阶才能验证这类参数真实生效。
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

  // 8. 泛黄(yellowish)产生暖色偏移 —— 效果确实生效
  //    注: sepia() 是色相偏移而非亮度偏移(对白色降均值、对中灰升均值, 会互相抵消),
  //    故必须用通道差值(warmth)度量, 不能用平均亮度。实测 warmth 随 yellowish 单调上升。
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
```

- [ ] **Step 2: 运行测试确认失败**

先把测试挂到 `tests/index.html`。用 Read 打开 `tests/index.html`，在已有测试的 `<script type="module">` 里追加引入与调用（跟随该文件现有写法，把 `runScanEffectTests` 与现有 `runStateTests`/`runValidatorTests` 并列执行并输出结果）。

然后按「测试环境启动」起好服务与 chromium，运行：

```bash
cd /home/parallels/Projects/yinji && cat > /tmp/run-tests.mjs <<'EOF'
const base = 'http://127.0.0.1:9222';
const t = (await (await fetch(`${base}/json`)).json()).find((x) => x.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); } };
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:8123/tests/index.html' });
await new Promise((r) => setTimeout(r, 3000));
const r = await send('Runtime.evaluate', {
  expression: 'window.runScanEffectTests ? window.runScanEffectTests().then(x => JSON.stringify(x), e => "ERROR: " + e.message) : "NOT_LOADED"',
  awaitPromise: true, returnByValue: true,
});
console.log(r.result?.value ?? JSON.stringify(r));
ws.close(); process.exit(0);
EOF
timeout 60 node /tmp/run-tests.mjs
```

Expected: 输出 `NOT_LOADED` 或 `ERROR: Failed to resolve module specifier` —— 因为 `src/modules/scan-effect.js` 还不存在。

- [ ] **Step 3: 写最小实现**

创建 `src/modules/scan-effect.js`：

```js
/**
 * 扫描效果模块
 *
 * 核心算法移植自 lookscanned.io (MIT License)
 * https://github.com/lookscanned/lookscanned.io
 * 灵感来源: baicunko/scanyourpdf
 *
 * 纯函数层: 不依赖应用状态、不操作业务 DOM。
 */

export const COLORSPACES = ['gray', 'sRGB'];

export const DEFAULT_SCAN_CONFIG = {
  rotate: 1,
  rotate_var: 0.5,
  colorspace: 'gray',
  blur: 0.5,
  noise: 0.25,
  border: false,
  scale: 2,
  brightness: 1,
  yellowish: 0,
  contrast: 1,
  output_format: 'image/jpeg',
};

export const SCAN_PARAM_RANGES = {
  rotate: { min: -10, max: 10, step: 0.1 },
  rotate_var: { min: 0, max: 10, step: 0.1 },
  blur: { min: 0, max: 1, step: 0.01 },
  noise: { min: 0, max: 1, step: 0.01 },
  brightness: { min: 0, max: 2, step: 0.01 },
  contrast: { min: 0, max: 2, step: 0.01 },
  yellowish: { min: 0, max: 2, step: 0.01 },
  scale: { min: 1, max: 3, step: 0.5 },
};

export const SCAN_PRESETS = {
  light: {
    rotate: 0.3,
    rotate_var: 0.2,
    colorspace: 'sRGB',
    blur: 0.2,
    noise: 0.1,
    brightness: 1,
    yellowish: 0.1,
    contrast: 1.05,
  },
  standard: {
    rotate: 1,
    rotate_var: 0.5,
    colorspace: 'gray',
    blur: 0.5,
    noise: 0.25,
    brightness: 1,
    yellowish: 0,
    contrast: 1,
  },
  mono: {
    rotate: 1.2,
    rotate_var: 0.8,
    colorspace: 'gray',
    blur: 0.6,
    noise: 0.35,
    brightness: 1.1,
    yellowish: 0,
    contrast: 1.4,
  },
};

/**
 * 校验并规范化扫描配置: 越界钳制、类型不符回落默认、未知键剔除
 * @param {object} raw
 * @returns {object}
 */
export function sanitizeScanConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const config = { ...DEFAULT_SCAN_CONFIG };

  Object.keys(SCAN_PARAM_RANGES).forEach((key) => {
    const range = SCAN_PARAM_RANGES[key];
    const value = Number(source[key]);
    if (Number.isFinite(value)) {
      config[key] = Math.min(range.max, Math.max(range.min, value));
    }
  });

  if (COLORSPACES.includes(source.colorspace)) {
    config.colorspace = source.colorspace;
  }

  if (source.border !== undefined) {
    config.border = Boolean(source.border);
  }

  if (source.output_format === 'image/png' || source.output_format === 'image/jpeg') {
    config.output_format = source.output_format;
  }

  return config;
}

/**
 * 生成噪点 SVG (feTurbulence fractalNoise)
 * 取自 https://fffuel.co/nnnoise/ 的思路, 强度随 noise 变化
 * @param {number} noise
 * @returns {string}
 */
export function getNoiseSVG(noise) {
  return `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 700 700" width="700" height="700">
  <defs>
    <filter id="yinji-noise" x="-20%" y="-20%" width="140%" height="140%" filterUnits="objectBoundingBox" primitiveUnits="userSpaceOnUse" color-interpolation-filters="linearRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.102" numOctaves="4" seed="15" stitchTiles="stitch" result="turbulence"></feTurbulence>
      <feSpecularLighting surfaceScale="15" specularConstant="${noise * 3}" specularExponent="20" lighting-color="#7957A8" in="turbulence" result="specularLighting">
        <feDistantLight azimuth="3" elevation="100"></feDistantLight>
      </feSpecularLighting>
      <feColorMatrix type="saturate" values="0" in="specularLighting" result="colormatrix"></feColorMatrix>
    </filter>
  </defs>
  <rect width="700" height="700" fill="transparent"></rect>
  <rect width="700" height="700" fill="#7957a8" filter="url(#yinji-noise)"></rect>
</svg>`;
}

const noiseImageCache = new Map();

/**
 * 生成噪点图片元素, 按 noise 值缓存。noise<=0 返回 null
 * @param {number} noise
 * @returns {Promise<HTMLImageElement|null>}
 */
export async function createNoiseImage(noise) {
  const value = Number(noise);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  const cacheKey = value.toFixed(2);
  if (noiseImageCache.has(cacheKey)) {
    return noiseImageCache.get(cacheKey);
  }

  const svg = getNoiseSVG(value);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('噪点图生成失败'));
      image.src = url;
    });
    noiseImageCache.set(cacheKey, image);
    return image;
  } catch (error) {
    console.error('生成噪点图失败:', error);
    return null;
  } finally {
    // 延迟撤销: 部分浏览器在解码完成前撤销会导致图片失效
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * 在 canvas 上绘制扫描效果
 * @param {HTMLCanvasElement} canvas 目标画布(会被 resize)
 * @param {CanvasImageSource} source 源页面图(含背景+印章的合成结果)
 * @param {object} config 扫描配置
 * @param {HTMLImageElement|null} noiseImage 预先备好的噪点图
 */
export function applyScanEffect(canvas, source, config, noiseImage) {
  const width = source.width || source.naturalWidth;
  const height = source.height || source.naturalHeight;

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('画布不可用');
  }

  ctx.save();

  // 白底
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);

  // 滤镜链: 模糊 → 可选灰度 → 亮度 → 泛黄 → 对比度
  let filter = `blur(${config.blur}px)`;
  if (config.colorspace === 'gray') {
    filter += ' grayscale(1)';
  }
  filter += ` brightness(${config.brightness})`;
  filter += ` sepia(${config.yellowish})`;
  filter += ` contrast(${config.contrast})`;
  ctx.filter = filter;

  // 绕中心随机小角度旋转(模拟放歪的纸)
  const angle = config.rotate + config.rotate_var * (Math.random() * 2 - 1);
  ctx.translate(width / 2, height / 2);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.translate(-width / 2, -height / 2);

  ctx.drawImage(source, 0, 0);

  ctx.restore();

  // 噪点层(不受滤镜与旋转影响)
  if (noiseImage) {
    ctx.drawImage(noiseImage, 0, 0, width, height);
  }

  // 可选黑边
  if (config.border) {
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd /home/parallels/Projects/yinji
node --check src/modules/scan-effect.js && echo "语法 OK"
timeout 60 node /tmp/run-tests.mjs
```

Expected: 语法 OK；测试输出 JSON 数组，含全部 10 条通过项（`默认配置一致`、`参数范围正确`、`sanitizeScanConfig 正确`、`预设存在`、`噪点 SVG 生成正确`、`noise=0 跳过噪点`、`输出尺寸正确`、`泛黄生效`、`亮度生效`、`边框生效`），无 `ERROR:`。

- [ ] **Step 5: 提交**

```bash
cd /home/parallels/Projects/yinji
git add src/modules/scan-effect.js tests/scan-effect.test.js tests/index.html
git commit -m "feat: 扫描效果核心算法(移植 lookscanned.io MIT)

配置默认值/范围/三预设 + sanitize + feTurbulence 噪点生成与缓存 +
applyScanEffect(白底/滤镜链/随机旋转/噪点/边框)。纯函数层,含10项浏览器内单测。"
```

---

## Task 2: 文字水印

**Files:**
- Create: `src/modules/scan-watermark.js`
- Modify: `tests/scan-effect.test.js`

**Interfaces:**
- Consumes: 无（纯函数）
- Produces:
  - `DEFAULT_WATERMARK: {enabled:boolean, text:string, fontSize:number, color:string, opacity:number, angle:number, repeat:boolean}`
  - `sanitizeWatermark(raw: object): DEFAULT_WATERMARK`
  - `applyWatermark(canvas: HTMLCanvasElement, watermark: object): void` — `enabled` 为假或 `text` 为空时直接返回，不改动画布

- [ ] **Step 1: 写失败测试**

在 `tests/scan-effect.test.js` 顶部的 import 之后追加新的 import，并在 `runScanEffectTests` 的 `return results;` 之前插入水印用例。

追加 import：

```js
import {
  DEFAULT_WATERMARK,
  sanitizeWatermark,
  applyWatermark,
} from '../src/modules/scan-watermark.js';
```

在 `return results;` 之前插入：

```js
  // 11. 水印默认关闭
  assert(DEFAULT_WATERMARK.enabled === false, '水印默认应关闭');
  assert(typeof DEFAULT_WATERMARK.text === 'string', '水印应有默认文本字段');
  results.push('水印默认值正确');

  // 12. sanitizeWatermark 钳制透明度与字号
  const wm = sanitizeWatermark({ opacity: 99, fontSize: -3, text: 123, enabled: 'y' });
  assert(wm.opacity <= 1 && wm.opacity >= 0, '透明度应钳制到 0~1');
  assert(wm.fontSize > 0, '字号应为正数');
  assert(typeof wm.text === 'string', '文本应转为字符串');
  assert(wm.enabled === true, "enabled 'y' 应转 true");
  results.push('sanitizeWatermark 正确');

  // 13. 关闭时不改动画布
  const untouched = document.createElement('canvas');
  applyScanEffect(untouched, source, { ...DEFAULT_SCAN_CONFIG, noise: 0, rotate: 0, rotate_var: 0 }, null);
  const beforeLum = meanLuminance(untouched);
  applyWatermark(untouched, { ...DEFAULT_WATERMARK, enabled: false, text: '机密' });
  assert(Math.abs(meanLuminance(untouched) - beforeLum) < 0.001, '水印关闭时不应改动画布');
  results.push('水印关闭时不改画布');

  // 14. 开启时改变画面
  const marked = document.createElement('canvas');
  applyScanEffect(marked, source, { ...DEFAULT_SCAN_CONFIG, noise: 0, rotate: 0, rotate_var: 0 }, null);
  const plainLum = meanLuminance(marked);
  applyWatermark(marked, { ...DEFAULT_WATERMARK, enabled: true, text: '机密', fontSize: 24, opacity: 0.8, color: '#ff0000' });
  assert(Math.abs(meanLuminance(marked) - plainLum) > 0.05, '水印开启应改变画面');
  results.push('水印生效');

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

  assert(tiledDelta > singleDelta, '平铺水印应覆盖更多像素');
  results.push('平铺水印生效');
```

- [ ] **Step 2: 运行测试确认失败**

```bash
timeout 60 node /tmp/run-tests.mjs
```

Expected: 输出 `NOT_LOADED` 或含 `Failed to resolve module specifier` 的 ERROR —— `scan-watermark.js` 不存在。

- [ ] **Step 3: 写最小实现**

创建 `src/modules/scan-watermark.js`：

```js
/**
 * 扫描件水印模块
 * 在扫描效果图上叠加文字水印(单个居中 或 平铺)。纯函数层。
 */

export const DEFAULT_WATERMARK = {
  enabled: false,
  text: '机密',
  fontSize: 48,
  color: '#888888',
  opacity: 0.25,
  angle: -30,
  repeat: true,
};

/**
 * 校验并规范化水印配置
 * @param {object} raw
 * @returns {object}
 */
export function sanitizeWatermark(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const watermark = { ...DEFAULT_WATERMARK };

  if (source.enabled !== undefined) {
    watermark.enabled = Boolean(source.enabled);
  }

  if (source.text !== undefined && source.text !== null) {
    watermark.text = String(source.text).slice(0, 100);
  }

  const fontSize = Number(source.fontSize);
  if (Number.isFinite(fontSize)) {
    watermark.fontSize = Math.min(400, Math.max(8, fontSize));
  }

  const opacity = Number(source.opacity);
  if (Number.isFinite(opacity)) {
    watermark.opacity = Math.min(1, Math.max(0, opacity));
  }

  const angle = Number(source.angle);
  if (Number.isFinite(angle)) {
    watermark.angle = Math.min(180, Math.max(-180, angle));
  }

  if (typeof source.color === 'string' && source.color.trim()) {
    watermark.color = source.color.trim();
  }

  if (source.repeat !== undefined) {
    watermark.repeat = Boolean(source.repeat);
  }

  return watermark;
}

/**
 * 在画布上叠加文字水印
 * @param {HTMLCanvasElement} canvas
 * @param {object} watermark
 */
export function applyWatermark(canvas, watermark) {
  if (!watermark || !watermark.enabled) {
    return;
  }

  const text = String(watermark.text || '').trim();
  if (!text) {
    return;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  const { width, height } = canvas;

  ctx.save();
  ctx.globalAlpha = watermark.opacity;
  ctx.fillStyle = watermark.color;
  ctx.font = `${watermark.fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const radians = (watermark.angle * Math.PI) / 180;

  if (watermark.repeat) {
    const metrics = ctx.measureText(text);
    const stepX = Math.max(metrics.width + watermark.fontSize * 2, watermark.fontSize * 4);
    const stepY = watermark.fontSize * 4;
    // 覆盖旋转后的对角范围, 保证边角也有水印
    const reach = Math.ceil(Math.sqrt(width * width + height * height) / 2);

    ctx.translate(width / 2, height / 2);
    ctx.rotate(radians);

    for (let x = -reach; x <= reach; x += stepX) {
      for (let y = -reach; y <= reach; y += stepY) {
        ctx.fillText(text, x, y);
      }
    }
  } else {
    ctx.translate(width / 2, height / 2);
    ctx.rotate(radians);
    ctx.fillText(text, 0, 0);
  }

  ctx.restore();
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd /home/parallels/Projects/yinji
node --check src/modules/scan-watermark.js && echo "语法 OK"
timeout 60 node /tmp/run-tests.mjs
```

Expected: 语法 OK；输出 JSON 数组含 15 项，新增 `水印默认值正确`、`sanitizeWatermark 正确`、`水印关闭时不改画布`、`水印生效`、`平铺水印生效`，无 `ERROR:`。

- [ ] **Step 5: 提交**

```bash
cd /home/parallels/Projects/yinji
git add src/modules/scan-watermark.js tests/scan-effect.test.js
git commit -m "feat: 扫描件文字水印(单个/平铺)

默认关闭;支持文本/字号/颜色/透明度/角度/平铺;sanitize 钳制越界值。
平铺按旋转后对角范围铺满,保证边角覆盖。含5项单测。"
```

---

## Task 3: 扫描导出管线（栅格化 → 扫描 → 水印 → pdf-lib 重组 + 元数据）

**Files:**
- Create: `src/modules/scan-export.js`

**Interfaces:**
- Consumes:
  - `applyScanEffect`, `createNoiseImage`, `sanitizeScanConfig`, `DEFAULT_SCAN_CONFIG` from `./scan-effect.js`
  - `applyWatermark`, `sanitizeWatermark`, `DEFAULT_WATERMARK` from `./scan-watermark.js`
  - `getState` from `../core/state.js`（用 `fabricCanvases` / `originalPdfBytes` / `currentPdfFile`）
  - `generateSafeExportFilename` from `../utils/security.js`
  - 全局：`window.PDFLib`、`window.Loading`、`window.Toast`
- Produces:
  - `DEFAULT_SCAN_METADATA: {enabled:boolean, title:string, author:string, subject:string, keywords:string, scannerStyle:boolean}`
  - `sanitizeScanMetadata(raw: object): DEFAULT_SCAN_METADATA`
  - `renderScannedPageDataUrl(pageIndex: number, config: object, watermark: object, noiseImage: HTMLImageElement|null): Promise<string|null>` — 单页扫描效果 dataURL；页无 canvas 时返回 null。预览与导出共用
  - `buildScannedPdfBytes(options: {config:object, watermark:object, metadata:object, onProgress?:(current:number,total:number)=>void}): Promise<Uint8Array>`
  - `exportScannedPdf(options: {config:object, watermark:object, metadata:object, sourceFile?:File|null}): Promise<void>` — 全流程含 Loading/Toast/下载

- [ ] **Step 1: 写失败测试**

本任务的可测单元是「渲染单页 + 组装 PDF 字节」。在 `tests/scan-effect.test.js` 追加 import 与用例（该测试在真实页面里跑，需已打开文件才有 fabric canvas；因此用例自行加载示例 PDF）。

追加 import：

```js
import {
  DEFAULT_SCAN_METADATA,
  sanitizeScanMetadata,
} from '../src/modules/scan-export.js';
```

在 `return results;` 之前插入：

```js
  // 16. 元数据默认值与 sanitize
  assert(DEFAULT_SCAN_METADATA.enabled === false, '元数据默认应关闭');
  assert(DEFAULT_SCAN_METADATA.scannerStyle === false, '扫描仪风格默认应关闭');
  const md = sanitizeScanMetadata({ title: 456, author: '  张三  ', evil: 1, enabled: 1, scannerStyle: 'x' });
  assert(md.title === '456', '标题应转为字符串');
  assert(md.author === '张三', '作者应去除首尾空格');
  assert(md.enabled === true, 'enabled 应转布尔');
  assert(md.scannerStyle === true, 'scannerStyle 应转布尔');
  assert(!('evil' in md), '未知键应剔除');
  results.push('sanitizeScanMetadata 正确');
```

- [ ] **Step 2: 运行测试确认失败**

```bash
timeout 60 node /tmp/run-tests.mjs
```

Expected: 含 `Failed to resolve module specifier` 的 ERROR 或 `NOT_LOADED` —— `scan-export.js` 不存在。

- [ ] **Step 3: 写最小实现**

创建 `src/modules/scan-export.js`：

```js
/**
 * 扫描件导出模块
 * 管线: 页面栅格化(背景+印章) → 扫描效果 → 水印 → pdf-lib 重组为图像 PDF + 写元数据 → 下载
 */

import { getState } from '../core/state.js';
import { generateSafeExportFilename } from '../utils/security.js';
import {
  applyScanEffect,
  createNoiseImage,
  sanitizeScanConfig,
  DEFAULT_SCAN_CONFIG,
} from './scan-effect.js';
import {
  applyWatermark,
  sanitizeWatermark,
  DEFAULT_WATERMARK,
} from './scan-watermark.js';

export const DEFAULT_SCAN_METADATA = {
  enabled: false,
  title: '',
  author: '',
  subject: '',
  keywords: '',
  scannerStyle: false,
};

// 扫描仪风格: 让 PDF 元数据看起来像扫描设备产出, 增强真实感
const SCANNER_CREATOR = 'Canon DR-C225 TWAIN';
const SCANNER_PRODUCER = 'Canon ScanFront Image Processor';

/**
 * 校验并规范化元数据配置
 * @param {object} raw
 * @returns {object}
 */
export function sanitizeScanMetadata(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const metadata = { ...DEFAULT_SCAN_METADATA };

  ['title', 'author', 'subject', 'keywords'].forEach((key) => {
    if (source[key] !== undefined && source[key] !== null) {
      metadata[key] = String(source[key]).trim().slice(0, 200);
    }
  });

  if (source.enabled !== undefined) {
    metadata.enabled = Boolean(source.enabled);
  }

  if (source.scannerStyle !== undefined) {
    metadata.scannerStyle = Boolean(source.scannerStyle);
  }

  return metadata;
}

/**
 * 渲染单页扫描效果, 返回 dataURL。预览与导出共用同一路径以保证所见即所得。
 * @param {number} pageIndex 0 起
 * @param {object} config
 * @param {object} watermark
 * @param {HTMLImageElement|null} noiseImage
 * @returns {Promise<string|null>}
 */
export async function renderScannedPageDataUrl(pageIndex, config, watermark, noiseImage) {
  const fabricCanvas = getState().fabricCanvases[pageIndex];
  if (!fabricCanvas) {
    return null;
  }

  // 栅格化整页(含 PDF 背景 + 全部印章), multiplier 决定分辨率
  const pageDataUrl = fabricCanvas.toDataURL({
    format: 'png',
    multiplier: config.scale,
  });

  const source = new Image();
  await new Promise((resolve, reject) => {
    source.onload = resolve;
    source.onerror = () => reject(new Error('页面栅格化失败'));
    source.src = pageDataUrl;
  });

  const target = document.createElement('canvas');
  applyScanEffect(target, source, config, noiseImage);
  applyWatermark(target, watermark);

  const quality = config.output_format === 'image/jpeg' ? 0.92 : undefined;
  return target.toDataURL(config.output_format, quality);
}

function dataUrlToUint8Array(dataUrl) {
  const commaIndex = dataUrl.indexOf(',');
  const binary = atob(dataUrl.slice(commaIndex + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 组装扫描件 PDF 字节
 * @param {{config:object, watermark:object, metadata:object, onProgress?:Function}} options
 * @returns {Promise<Uint8Array>}
 */
export async function buildScannedPdfBytes({
  config,
  watermark,
  metadata,
  onProgress = () => {},
}) {
  const originalPdfBytes = getState().originalPdfBytes;
  if (!originalPdfBytes) {
    throw new Error('还没打开文件');
  }

  const safeConfig = sanitizeScanConfig(config);
  const safeWatermark = sanitizeWatermark(watermark);
  const safeMetadata = sanitizeScanMetadata(metadata);

  const { PDFDocument } = window.PDFLib;
  // 读原始文档只为取每页尺寸, 输出是全新的图像 PDF
  const sourceDoc = await PDFDocument.load(originalPdfBytes);
  const sourcePages = sourceDoc.getPages();
  const total = sourcePages.length;

  const noiseImage = await createNoiseImage(safeConfig.noise);
  const outputDoc = await PDFDocument.create();

  for (let i = 0; i < total; i++) {
    onProgress(i + 1, total);

    const { width, height } = sourcePages[i].getSize();
    const scannedDataUrl = await renderScannedPageDataUrl(
      i,
      safeConfig,
      safeWatermark,
      noiseImage
    );

    const page = outputDoc.addPage([width, height]);

    if (!scannedDataUrl) {
      // 该页没有 canvas(未初始化) 时保留空白页, 保证页数一致
      continue;
    }

    const imageBytes = dataUrlToUint8Array(scannedDataUrl);
    const embedded =
      safeConfig.output_format === 'image/jpeg'
        ? await outputDoc.embedJpg(imageBytes)
        : await outputDoc.embedPng(imageBytes);

    page.drawImage(embedded, { x: 0, y: 0, width, height });

    // 让出主线程, 避免长文档卡死 UI
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  if (safeMetadata.enabled) {
    if (safeMetadata.title) outputDoc.setTitle(safeMetadata.title);
    if (safeMetadata.author) outputDoc.setAuthor(safeMetadata.author);
    if (safeMetadata.subject) outputDoc.setSubject(safeMetadata.subject);
    if (safeMetadata.keywords) {
      outputDoc.setKeywords(safeMetadata.keywords.split(/[,，\s]+/).filter(Boolean));
    }
    if (safeMetadata.scannerStyle) {
      outputDoc.setCreator(SCANNER_CREATOR);
      outputDoc.setProducer(SCANNER_PRODUCER);
    }
    const now = new Date();
    outputDoc.setCreationDate(now);
    outputDoc.setModificationDate(now);
  }

  return outputDoc.save();
}

/**
 * 导出扫描件 PDF(含 Loading/Toast/下载)
 * @param {{config:object, watermark:object, metadata:object, sourceFile?:File|null}} options
 * @returns {Promise<void>}
 */
export async function exportScannedPdf({
  config = DEFAULT_SCAN_CONFIG,
  watermark = DEFAULT_WATERMARK,
  metadata = DEFAULT_SCAN_METADATA,
  sourceFile = null,
} = {}) {
  if (!getState().originalPdfBytes) {
    window.Toast.warning('还没打开文件，先选一个。');
    return;
  }

  window.Loading.showExportLoading('正在生成扫描件...');

  try {
    const pdfBytes = await buildScannedPdfBytes({
      config,
      watermark,
      metadata,
      onProgress: (current, total) => {
        window.Loading.updateProgress(
          (current / total) * 90,
          `处理第 ${current}/${total} 页`
        );
      },
    });

    window.Loading.updateProgress(95, '正在保存文件...');

    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const safeFilename = generateSafeExportFilename(
      sourceFile || getState().currentPdfFile,
      '_扫描件'
    );
    link.download = safeFilename;

    window.Loading.updateProgress(100, '完成！');
    link.click();
    // 延迟撤销: 部分浏览器在下载真正开始前撤销会导致下载失败
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);

    window.Loading.hide();
    window.Toast.success(`已开始下载：${safeFilename}`);
  } catch (error) {
    console.error('导出扫描件失败:', error);
    window.Loading.hide();
    window.Toast.error('导出扫描件失败，详情请查看控制台。', 0);
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd /home/parallels/Projects/yinji
node --check src/modules/scan-export.js && echo "语法 OK"
timeout 60 node /tmp/run-tests.mjs
```

Expected: 语法 OK；输出含 16 项，新增 `sanitizeScanMetadata 正确`，无 `ERROR:`。

- [ ] **Step 5: 端到端验证（真实盖章 → 扫描件 PDF）**

```bash
cat > /tmp/e2e-scan.mjs <<'EOF'
const base = 'http://127.0.0.1:9222';
const t = (await (await fetch(`${base}/json`)).json()).find((x) => x.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); } };
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:8123/index.html' });
await new Promise((r) => setTimeout(r, 2500));
const evalJS = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};
// 载入示例 PDF
await evalJS(`document.querySelector('[data-load-sample-pdf]')?.click()`);
await new Promise((r) => setTimeout(r, 3500));
// 盖一个印章(用红圈图代替真实印章)
console.log('盖章:', await evalJS(`(async function(){
  var c=document.createElement('canvas'); c.width=200; c.height=200;
  var x=c.getContext('2d'); x.fillStyle='red'; x.beginPath(); x.arc(100,100,90,0,7); x.fill();
  var img=new Image(); img.src=c.toDataURL(); await img.decode();
  window.AppState.setState({sealImageElement: img, sealRotation:0, sealBrightness:100});
  document.getElementById('addSeal').click();
  return 'ok';
})()`));
await new Promise((r) => setTimeout(r, 1500));
// 生成扫描件字节并校验
console.log('扫描件:', await evalJS(`(async function(){
  var m = await import('/src/modules/scan-export.js');
  var e = await import('/src/modules/scan-effect.js');
  var w = await import('/src/modules/scan-watermark.js');
  var bytes = await m.buildScannedPdfBytes({
    config: e.DEFAULT_SCAN_CONFIG,
    watermark: {...w.DEFAULT_WATERMARK, enabled:true, text:'机密'},
    metadata: {enabled:true, title:'测试标题', author:'印迹', subject:'', keywords:'a,b', scannerStyle:true},
  });
  var head = new TextDecoder().decode(bytes.slice(0,5));
  var doc = await window.PDFLib.PDFDocument.load(bytes);
  return JSON.stringify({
    isPdf: head === '%PDF-',
    bytes: bytes.length,
    pages: doc.getPageCount(),
    title: doc.getTitle(),
    author: doc.getAuthor(),
    producer: doc.getProducer(),
  });
})()`));
ws.close(); process.exit(0);
EOF
timeout 120 node /tmp/e2e-scan.mjs
```

Expected: 输出三行——盖章 `ok`；扫描件 JSON 显示 `isPdf: true`、`pages` 与源文档页数一致（示例 PDF 为 1）、`bytes` 明显大于原文件（图像 PDF）、`title: "测试标题"`、`author: "印迹"`、`producer` 为扫描仪风格字样。无 `ERR:`。

- [ ] **Step 6: 提交**

```bash
cd /home/parallels/Projects/yinji
git add src/modules/scan-export.js tests/scan-effect.test.js
git commit -m "feat: 扫描件导出管线(栅格化+扫描+水印+pdf-lib重组+元数据)"
```

---

## Task 4: UI 面板 + 实时预览 + 单份导出接线

**Files:**
- Create: `src/features/scan-ui.js`
- Create: `src/styles/scan.css`
- Modify: `index.html`（导出 tab 的 `data-export-mode-panel="single"` 面板内，`data-section-key="export-pages"` 区块之后）
- Modify: `src/style.css`（末尾追加 import）
- Modify: `src/main.js`（import + 在 `main()` 内 `initResponsive();` 之后调用 `setupScanUI();`）

**Interfaces:**
- Consumes:
  - `DEFAULT_SCAN_CONFIG`, `SCAN_PRESETS`, `sanitizeScanConfig`, `createNoiseImage` from `../modules/scan-effect.js`
  - `DEFAULT_WATERMARK`, `sanitizeWatermark` from `../modules/scan-watermark.js`
  - `DEFAULT_SCAN_METADATA`, `sanitizeScanMetadata`, `renderScannedPageDataUrl`, `exportScannedPdf` from `../modules/scan-export.js`
  - `getCurrentActivePage` from `../modules/canvas-manager.js`
  - `getState` from `../core/state.js`
- Produces:
  - `setupScanUI(): void` — 幂等（内部 `initialized` 守卫，重复调用不重复绑定）
  - `getScanConfig(): object` / `getScanWatermark(): object` / `getScanMetadata(): object` — 返回副本，供 Task 5 批量复用

- [ ] **Step 1: 插入面板 DOM**

用 Read 打开 `index.html`，在 `data-export-mode-panel="single"` 面板内、`data-section-key="export-pages"` 的 `tool-section` 结束标签之后（仍在 single 面板内），插入下面整段：

```html
              <div class="tool-section" data-pdf-dependent="true" data-section-key="export-scan" data-section-default="closed">
                <h3>导出为扫描件</h3>
                <p class="tool-section-note">让文件看起来像打印后扫描的。会连印章一起处理。</p>
                <div class="scan-preset-row">
                  <button type="button" class="btn btn-sm btn-secondary" data-scan-preset="light">轻度做旧</button>
                  <button type="button" class="btn btn-sm btn-secondary" data-scan-preset="standard">标准扫描</button>
                  <button type="button" class="btn btn-sm btn-secondary" data-scan-preset="mono">黑白复印</button>
                </div>
                <label class="scan-toggle-row">
                  <input type="checkbox" id="scan-preview-toggle">
                  <span>实时预览当前页</span>
                </label>
                <div class="scan-field">
                  <label for="scan-noise">噪点</label>
                  <input type="range" id="scan-noise" min="0" max="1" step="0.01">
                  <span class="scan-value" id="scan-noise-value">0.25</span>
                </div>
                <div class="scan-field">
                  <label for="scan-rotate-var">歪斜抖动</label>
                  <input type="range" id="scan-rotate-var" min="0" max="10" step="0.1">
                  <span class="scan-value" id="scan-rotate-var-value">0.5</span>
                </div>
                <div class="scan-field">
                  <label for="scan-yellowish">泛黄</label>
                  <input type="range" id="scan-yellowish" min="0" max="2" step="0.01">
                  <span class="scan-value" id="scan-yellowish-value">0</span>
                </div>
                <div class="scan-field">
                  <label for="scan-contrast">对比度</label>
                  <input type="range" id="scan-contrast" min="0" max="2" step="0.01">
                  <span class="scan-value" id="scan-contrast-value">1</span>
                </div>
                <label class="scan-toggle-row">
                  <input type="checkbox" id="scan-border">
                  <span>加黑边框</span>
                </label>
                <details class="scan-more">
                  <summary>更多参数</summary>
                  <div class="scan-field">
                    <label for="scan-blur">模糊</label>
                    <input type="range" id="scan-blur" min="0" max="1" step="0.01">
                    <span class="scan-value" id="scan-blur-value">0.5</span>
                  </div>
                  <div class="scan-field">
                    <label for="scan-brightness">亮度</label>
                    <input type="range" id="scan-brightness" min="0" max="2" step="0.01">
                    <span class="scan-value" id="scan-brightness-value">1</span>
                  </div>
                  <div class="scan-field">
                    <label for="scan-rotate">歪斜基准</label>
                    <input type="range" id="scan-rotate" min="-10" max="10" step="0.1">
                    <span class="scan-value" id="scan-rotate-value">1</span>
                  </div>
                  <div class="scan-field">
                    <label for="scan-scale">分辨率</label>
                    <input type="range" id="scan-scale" min="1" max="3" step="0.5">
                    <span class="scan-value" id="scan-scale-value">144 DPI</span>
                  </div>
                  <label class="scan-toggle-row">
                    <input type="checkbox" id="scan-gray" checked>
                    <span>黑白(灰度)</span>
                  </label>
                </details>
                <details class="scan-more">
                  <summary>水印</summary>
                  <label class="scan-toggle-row">
                    <input type="checkbox" id="scan-watermark-enabled">
                    <span>加水印</span>
                  </label>
                  <div class="scan-field">
                    <label for="scan-watermark-text">文字</label>
                    <input type="text" id="scan-watermark-text" class="scan-text-input" placeholder="机密" maxlength="100">
                  </div>
                  <div class="scan-field">
                    <label for="scan-watermark-opacity">透明度</label>
                    <input type="range" id="scan-watermark-opacity" min="0" max="1" step="0.01">
                    <span class="scan-value" id="scan-watermark-opacity-value">0.25</span>
                  </div>
                  <div class="scan-field">
                    <label for="scan-watermark-size">字号</label>
                    <input type="range" id="scan-watermark-size" min="8" max="200" step="1">
                    <span class="scan-value" id="scan-watermark-size-value">48</span>
                  </div>
                  <label class="scan-toggle-row">
                    <input type="checkbox" id="scan-watermark-repeat" checked>
                    <span>平铺整页</span>
                  </label>
                </details>
                <details class="scan-more">
                  <summary>PDF 信息</summary>
                  <label class="scan-toggle-row">
                    <input type="checkbox" id="scan-meta-enabled">
                    <span>写入自定义信息</span>
                  </label>
                  <div class="scan-field">
                    <label for="scan-meta-title">标题</label>
                    <input type="text" id="scan-meta-title" class="scan-text-input" maxlength="200">
                  </div>
                  <div class="scan-field">
                    <label for="scan-meta-author">作者</label>
                    <input type="text" id="scan-meta-author" class="scan-text-input" maxlength="200">
                  </div>
                  <label class="scan-toggle-row">
                    <input type="checkbox" id="scan-meta-scanner">
                    <span>伪装成扫描仪产出</span>
                  </label>
                </details>
                <div class="button-group">
                  <button id="export-scan-btn" class="btn btn-primary btn-export">导出为扫描件</button>
                </div>
                <p class="scan-hint">扫描件是图片版 PDF：文字不可选、体积会变大，这是「像扫描」的正常结果。</p>
              </div>
```

- [ ] **Step 2: 建样式并接入**

创建 `src/styles/scan.css`：

```css
/* 扫描件面板 */
.scan-preset-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.scan-field {
  display: grid;
  grid-template-columns: 72px 1fr 56px;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
}

.scan-field label {
  color: #555;
}

.scan-value {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: #666;
  font-size: 12px;
}

.scan-text-input {
  grid-column: 2 / 4;
  width: 100%;
  padding: 4px 8px;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  font-size: 13px;
}

.scan-toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  cursor: pointer;
}

.scan-more {
  margin: 10px 0;
  border-top: 1px solid #eee;
  padding-top: 8px;
}

.scan-more > summary {
  cursor: pointer;
  font-size: 13px;
  color: #555;
  margin-bottom: 8px;
}

.scan-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #888;
  line-height: 1.5;
}

/* 预览覆盖层 */
.scan-preview-layer {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 5;
}
```

在 `src/style.css` 末尾追加一行：

```css
@import "./styles/scan.css";
```

- [ ] **Step 3: 写 UI 模块**

创建 `src/features/scan-ui.js`：

```js
/**
 * 扫描件 UI 模块
 * 设置面板读写 + 预设 + 当前页实时预览(防抖) + 导出接线 + 配置持久化
 */

import { getState } from '../core/state.js';
import { getCurrentActivePage } from '../modules/canvas-manager.js';
import {
  DEFAULT_SCAN_CONFIG,
  SCAN_PRESETS,
  sanitizeScanConfig,
  createNoiseImage,
} from '../modules/scan-effect.js';
import {
  DEFAULT_WATERMARK,
  sanitizeWatermark,
} from '../modules/scan-watermark.js';
import {
  DEFAULT_SCAN_METADATA,
  sanitizeScanMetadata,
  renderScannedPageDataUrl,
  exportScannedPdf,
} from '../modules/scan-export.js';

const STORAGE_KEY = 'yinji-scan-config';
const PREVIEW_DEBOUNCE_MS = 150;

let initialized = false;
let scanConfig = { ...DEFAULT_SCAN_CONFIG };
let watermarkConfig = { ...DEFAULT_WATERMARK };
let metadataConfig = { ...DEFAULT_SCAN_METADATA };
let previewTimer = null;
let previewLayer = null;

export function getScanConfig() {
  return { ...scanConfig };
}

export function getScanWatermark() {
  return { ...watermarkConfig };
}

export function getScanMetadata() {
  return { ...metadataConfig };
}

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return;
    }
    scanConfig = sanitizeScanConfig(parsed.config);
    watermarkConfig = sanitizeWatermark(parsed.watermark);
    metadataConfig = sanitizeScanMetadata(parsed.metadata);
  } catch (error) {
    console.warn('读取扫描配置失败，使用默认值:', error);
  }
}

function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        config: scanConfig,
        watermark: watermarkConfig,
        metadata: metadataConfig,
      })
    );
  } catch (error) {
    console.warn('保存扫描配置失败:', error);
  }
}

function el(id) {
  return document.getElementById(id);
}

function setValueText(id, text) {
  const node = el(id);
  if (node) {
    node.textContent = String(text);
  }
}

/** 把内存配置同步到界面控件 */
function syncControlsFromConfig() {
  const numericMap = [
    ['scan-noise', scanConfig.noise],
    ['scan-rotate-var', scanConfig.rotate_var],
    ['scan-yellowish', scanConfig.yellowish],
    ['scan-contrast', scanConfig.contrast],
    ['scan-blur', scanConfig.blur],
    ['scan-brightness', scanConfig.brightness],
    ['scan-rotate', scanConfig.rotate],
    ['scan-scale', scanConfig.scale],
  ];

  numericMap.forEach(([id, value]) => {
    const input = el(id);
    if (input) {
      input.value = String(value);
    }
  });

  setValueText('scan-noise-value', scanConfig.noise.toFixed(2));
  setValueText('scan-rotate-var-value', scanConfig.rotate_var.toFixed(1));
  setValueText('scan-yellowish-value', scanConfig.yellowish.toFixed(2));
  setValueText('scan-contrast-value', scanConfig.contrast.toFixed(2));
  setValueText('scan-blur-value', scanConfig.blur.toFixed(2));
  setValueText('scan-brightness-value', scanConfig.brightness.toFixed(2));
  setValueText('scan-rotate-value', scanConfig.rotate.toFixed(1));
  setValueText('scan-scale-value', `${Math.round(scanConfig.scale * 72)} DPI`);

  const borderInput = el('scan-border');
  if (borderInput) {
    borderInput.checked = scanConfig.border;
  }

  const grayInput = el('scan-gray');
  if (grayInput) {
    grayInput.checked = scanConfig.colorspace === 'gray';
  }

  const wmEnabled = el('scan-watermark-enabled');
  if (wmEnabled) {
    wmEnabled.checked = watermarkConfig.enabled;
  }

  const wmText = el('scan-watermark-text');
  if (wmText) {
    wmText.value = watermarkConfig.text;
  }

  const wmOpacity = el('scan-watermark-opacity');
  if (wmOpacity) {
    wmOpacity.value = String(watermarkConfig.opacity);
  }
  setValueText('scan-watermark-opacity-value', watermarkConfig.opacity.toFixed(2));

  const wmSize = el('scan-watermark-size');
  if (wmSize) {
    wmSize.value = String(watermarkConfig.fontSize);
  }
  setValueText('scan-watermark-size-value', String(watermarkConfig.fontSize));

  const wmRepeat = el('scan-watermark-repeat');
  if (wmRepeat) {
    wmRepeat.checked = watermarkConfig.repeat;
  }

  const metaEnabled = el('scan-meta-enabled');
  if (metaEnabled) {
    metaEnabled.checked = metadataConfig.enabled;
  }

  const metaTitle = el('scan-meta-title');
  if (metaTitle) {
    metaTitle.value = metadataConfig.title;
  }

  const metaAuthor = el('scan-meta-author');
  if (metaAuthor) {
    metaAuthor.value = metadataConfig.author;
  }

  const metaScanner = el('scan-meta-scanner');
  if (metaScanner) {
    metaScanner.checked = metadataConfig.scannerStyle;
  }
}

function removePreviewLayer() {
  if (previewLayer && previewLayer.parentElement) {
    previewLayer.parentElement.removeChild(previewLayer);
  }
  previewLayer = null;
}

/** 渲染当前页扫描预览到覆盖层 */
async function renderPreview() {
  const toggle = el('scan-preview-toggle');
  if (!toggle || !toggle.checked) {
    removePreviewLayer();
    return;
  }

  const pageNum = getCurrentActivePage();
  const wrapper = document.getElementById(`page-wrapper-${pageNum}`);
  const fabricCanvas = getState().fabricCanvases[pageNum - 1];

  if (!wrapper || !fabricCanvas) {
    removePreviewLayer();
    return;
  }

  try {
    const noiseImage = await createNoiseImage(scanConfig.noise);
    // 预览用较低分辨率, 保证拖动流畅
    const previewConfig = { ...scanConfig, scale: 1, output_format: 'image/png' };
    const dataUrl = await renderScannedPageDataUrl(
      pageNum - 1,
      previewConfig,
      watermarkConfig,
      noiseImage
    );

    if (!dataUrl) {
      removePreviewLayer();
      return;
    }

    if (!previewLayer) {
      previewLayer = document.createElement('img');
      previewLayer.className = 'scan-preview-layer';
      previewLayer.alt = '扫描效果预览';
    }

    previewLayer.src = dataUrl;
    const element = fabricCanvas.getElement();
    previewLayer.style.width = `${element.clientWidth}px`;
    previewLayer.style.height = `${element.clientHeight}px`;

    if (previewLayer.parentElement !== wrapper) {
      wrapper.appendChild(previewLayer);
    }
  } catch (error) {
    console.error('扫描预览失败:', error);
    removePreviewLayer();
  }
}

function schedulePreview() {
  if (previewTimer) {
    clearTimeout(previewTimer);
  }
  previewTimer = setTimeout(() => {
    previewTimer = null;
    renderPreview();
  }, PREVIEW_DEBOUNCE_MS);
}

/** 从界面控件收集到内存配置 */
function collectFromControls() {
  const numeric = [
    ['scan-noise', 'noise'],
    ['scan-rotate-var', 'rotate_var'],
    ['scan-yellowish', 'yellowish'],
    ['scan-contrast', 'contrast'],
    ['scan-blur', 'blur'],
    ['scan-brightness', 'brightness'],
    ['scan-rotate', 'rotate'],
    ['scan-scale', 'scale'],
  ];

  const next = { ...scanConfig };
  numeric.forEach(([id, key]) => {
    const input = el(id);
    if (input) {
      next[key] = Number(input.value);
    }
  });

  const borderInput = el('scan-border');
  if (borderInput) {
    next.border = borderInput.checked;
  }

  const grayInput = el('scan-gray');
  if (grayInput) {
    next.colorspace = grayInput.checked ? 'gray' : 'sRGB';
  }

  scanConfig = sanitizeScanConfig(next);

  watermarkConfig = sanitizeWatermark({
    enabled: el('scan-watermark-enabled')?.checked,
    text: el('scan-watermark-text')?.value,
    opacity: el('scan-watermark-opacity')?.value,
    fontSize: el('scan-watermark-size')?.value,
    repeat: el('scan-watermark-repeat')?.checked,
    color: watermarkConfig.color,
    angle: watermarkConfig.angle,
  });

  metadataConfig = sanitizeScanMetadata({
    enabled: el('scan-meta-enabled')?.checked,
    title: el('scan-meta-title')?.value,
    author: el('scan-meta-author')?.value,
    subject: metadataConfig.subject,
    keywords: metadataConfig.keywords,
    scannerStyle: el('scan-meta-scanner')?.checked,
  });
}

function handleControlChange() {
  collectFromControls();
  syncControlsFromConfig();
  persist();
  schedulePreview();
}

function applyPreset(presetKey) {
  const preset = SCAN_PRESETS[presetKey];
  if (!preset) {
    return;
  }
  scanConfig = sanitizeScanConfig({ ...scanConfig, ...preset });
  syncControlsFromConfig();
  persist();
  schedulePreview();
  window.Toast?.success('已应用预设。');
}

export function setupScanUI() {
  const section = document.querySelector('[data-section-key="export-scan"]');
  if (!section || initialized) {
    return;
  }

  loadStored();
  syncControlsFromConfig();

  const controlIds = [
    'scan-noise',
    'scan-rotate-var',
    'scan-yellowish',
    'scan-contrast',
    'scan-blur',
    'scan-brightness',
    'scan-rotate',
    'scan-scale',
    'scan-border',
    'scan-gray',
    'scan-watermark-enabled',
    'scan-watermark-text',
    'scan-watermark-opacity',
    'scan-watermark-size',
    'scan-watermark-repeat',
    'scan-meta-enabled',
    'scan-meta-title',
    'scan-meta-author',
    'scan-meta-scanner',
  ];

  controlIds.forEach((id) => {
    const input = el(id);
    if (input) {
      input.addEventListener('input', handleControlChange);
    }
  });

  section.querySelectorAll('[data-scan-preset]').forEach((button) => {
    button.addEventListener('click', () => applyPreset(button.dataset.scanPreset));
  });

  const previewToggle = el('scan-preview-toggle');
  if (previewToggle) {
    previewToggle.addEventListener('change', () => {
      if (previewToggle.checked) {
        schedulePreview();
      } else {
        removePreviewLayer();
      }
    });
  }

  const exportBtn = el('export-scan-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      exportScannedPdf({
        config: scanConfig,
        watermark: watermarkConfig,
        metadata: metadataConfig,
        sourceFile: getState().currentPdfFile,
      });
    });
  }

  initialized = true;
}
```

- [ ] **Step 4: 在 main.js 接线**

用 Read 打开 `src/main.js`。在顶部 import 区（与其它 `./features/*` import 并列）加：

```js
import { setupScanUI } from './features/scan-ui.js';
```

在 `main()` 函数体内 `initResponsive();` 之后加：

```js
  setupScanUI();
```

- [ ] **Step 5: 语法检查 + 冒烟回归**

```bash
cd /home/parallels/Projects/yinji
for f in src/features/scan-ui.js src/main.js; do node --check "$f" && echo "$f 语法 OK"; done
timeout 90 node tools/ai/yinji-cli.mjs smoke --pdf ./test-fixture.pdf 2>&1 | grep -E '"objectCount"|"lastToast"|Error' | head -3
```

Expected: 两文件语法 OK；smoke 输出 `"objectCount": 1` 与「已盖到第 1 页」toast，无 `Error`（证明新 UI 未破坏既有流程）。

- [ ] **Step 6: 验证面板、预设、持久化、导出按钮**

```bash
cd /home/parallels/Projects/yinji
cat > /tmp/ui-scan.mjs <<'JSEOF'
const base = 'http://127.0.0.1:9222';
const t = (await (await fetch(`${base}/json`)).json()).find((x) => x.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); } };
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:8123/index.html' });
await new Promise((r) => setTimeout(r, 2500));
const evalJS = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};
console.log('1 面板存在:', await evalJS(`JSON.stringify({
  section: !!document.querySelector('[data-section-key="export-scan"]'),
  exportBtn: !!document.getElementById('export-scan-btn'),
  noiseInit: document.getElementById('scan-noise')?.value,
  dpiLabel: document.getElementById('scan-scale-value')?.textContent,
  presets: document.querySelectorAll('[data-scan-preset]').length
})`));
console.log('2 应用黑白复印预设:', await evalJS(`(function(){
  document.querySelector('[data-scan-preset="mono"]').click();
  return JSON.stringify({
    contrast: document.getElementById('scan-contrast').value,
    gray: document.getElementById('scan-gray').checked,
    noise: document.getElementById('scan-noise').value
  });
})()`));
console.log('3 配置已持久化:', await evalJS(`!!localStorage.getItem('yinji-scan-config')`));
console.log('4 未开文件点导出应提示而非崩溃:', await evalJS(`(function(){
  document.getElementById('export-scan-btn').click();
  return 'clicked-no-throw';
})()`));
ws.close(); process.exit(0);
JSEOF
timeout 90 node /tmp/ui-scan.mjs
```

Expected:
- `1` → `section:true, exportBtn:true, noiseInit:"0.25", dpiLabel:"144 DPI", presets:3`
- `2` → `contrast:"1.4", gray:true, noise:"0.35"`（黑白复印预设值生效）
- `3` → `true`
- `4` → `clicked-no-throw`（未打开文件时走 Toast 警告路径，不抛异常）

- [ ] **Step 7: 提交**

```bash
cd /home/parallels/Projects/yinji
git add index.html src/style.css src/styles/scan.css src/features/scan-ui.js src/main.js
git commit -m "feat: 扫描件设置面板+实时预览+单份导出接线

三预设(轻度做旧/标准扫描/黑白复印)+参数分层(常用直出/更多折叠)+水印与
PDF信息折叠区+当前页实时预览(150ms防抖,预览用低分辨率)+配置持久化。"
```

---

## Task 5: 批量导出为扫描件

**Files:**
- Modify: `index.html`（批量区 `data-export-mode-panel="batch"` 内，`processBatch`/`clearBatch` 按钮组之后）
- Modify: `src/features/scan-ui.js`（新增批量导出函数并接线）

**Interfaces:**
- Consumes:
  - `getScanConfig`, `getScanWatermark`, `getScanMetadata`（Task 4 产出，同文件内直接用模块级变量）
  - `buildScannedPdfBytes` from `../modules/scan-export.js`
  - `getBatchFiles` —— **注意**：`src/core/batch-processing.js` 的批量队列通过 `window.BatchProcessing` 暴露。实施前先用 Grep 确认该文件末尾实际导出的对象名与取队列的方法名（例如 `window.BatchProcessing.getBatchFiles()`），按实际名称调用，不要臆造。
  - `generateSafeExportFilename` from `../utils/security.js`
  - 全局 `window.Loading` / `window.Toast` / `window.PDFLib`
- Produces: 无对外新接口（内部 `exportBatchScanned()` + 按钮监听）

- [ ] **Step 1: 确认批量队列 API**

```bash
cd /home/parallels/Projects/yinji
grep -n "window.BatchProcessing" -A 15 src/core/batch-processing.js
grep -n "batchFiles" src/core/batch-processing.js | head
```

Expected: 输出 `window.BatchProcessing = { ... }` 的成员清单。**记下真实的取队列方法名**（用于下一步）。若没有导出取队列的方法，则在 `batch-processing.js` 的导出对象里补一个 `getBatchFiles: () => batchFiles.slice()` 并一并提交。

- [ ] **Step 2: 插入批量按钮**

用 Read 打开 `index.html`，在 `data-export-mode-panel="batch"` 面板内、含 `processBatch` 与 `clearBatch` 的 `button-group` 之后插入：

```html
                <div class="button-group">
                  <button id="batch-export-scan-btn" class="btn btn-secondary">批量导出为扫描件</button>
                </div>
                <p class="scan-hint">用「导出为扫描件」里的同一套参数处理队列中每个文件。</p>
```

- [ ] **Step 3: 写批量导出实现**

在 `src/features/scan-ui.js` 中，把 `buildScannedPdfBytes` 加入从 `../modules/scan-export.js` 的 import 列表，并在文件顶部 import 区加：

```js
import { generateSafeExportFilename } from '../utils/security.js';
```

在 `setupScanUI` 定义之前插入（把 `getBatchFiles()` 替换为 Step 1 查到的真实方法名）：

```js
/**
 * 批量导出扫描件: 队列中每个文件套用同一套参数
 * 注意: 现有批量管线逐文件加载 PDF 并渲染, 这里复用其队列, 逐个处理并下载。
 */
async function exportBatchScanned() {
  const batch = window.BatchProcessing;
  const files = batch?.getBatchFiles?.() || [];

  if (!files.length) {
    window.Toast.warning('批量队列是空的，先添加 PDF。');
    return;
  }

  window.Loading.showExportLoading('正在批量生成扫描件...');

  let succeeded = 0;

  try {
    for (let i = 0; i < files.length; i++) {
      const item = files[i];
      const file = item.file || item;

      window.Loading.updateProgress(
        (i / files.length) * 100,
        `处理第 ${i + 1}/${files.length} 个：${file.name}`
      );

      try {
        // 逐个文件: 需要先把该文件载入为当前文档才能复用页面栅格化管线
        await batch.loadFileForScan?.(file);

        const pdfBytes = await buildScannedPdfBytes({
          config: scanConfig,
          watermark: watermarkConfig,
          metadata: metadataConfig,
        });

        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = generateSafeExportFilename(file, '_扫描件');
        link.click();
        // 延迟撤销: 部分浏览器在下载真正开始前撤销会导致下载失败
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);

        succeeded += 1;
      } catch (fileError) {
        console.error(`处理 ${file.name} 失败:`, fileError);
      }
    }

    window.Loading.hide();

    if (succeeded === files.length) {
      window.Toast.success(`批量完成，已处理 ${succeeded} 个文件。`);
    } else {
      window.Toast.warning(
        `批量结束：成功 ${succeeded} 个，失败 ${files.length - succeeded} 个，详情见控制台。`
      );
    }
  } catch (error) {
    console.error('批量导出扫描件失败:', error);
    window.Loading.hide();
    window.Toast.error('批量导出失败，详情请查看控制台。', 0);
  }
}
```

在 `setupScanUI` 内、`initialized = true;` 之前加：

```js
  const batchScanBtn = el('batch-export-scan-btn');
  if (batchScanBtn) {
    batchScanBtn.addEventListener('click', exportBatchScanned);
  }
```

> **实施要点**：`batch.loadFileForScan?.(file)` 是本任务需要在 `src/core/batch-processing.js` 中新增的辅助方法——把给定 File 读入并渲染为当前文档（复用该文件中现有的读文件 + pdf.js 加载逻辑，与现有 `processBatch` 单文件处理路径一致）。实施时先读该文件现有的单文件处理函数，抽出可复用部分作为 `loadFileForScan`，导出到 `window.BatchProcessing`。若抽取成本过高，可退化为：批量扫描仅支持「当前已打开文件」并给出明确 Toast 说明，同时在本步骤的提交信息里记录该退化。

- [ ] **Step 4: 语法检查**

```bash
cd /home/parallels/Projects/yinji
for f in src/features/scan-ui.js src/core/batch-processing.js; do node --check "$f" && echo "$f 语法 OK"; done
```

Expected: 两文件语法 OK。

- [ ] **Step 5: 验证批量路径**

```bash
cd /home/parallels/Projects/yinji
cat > /tmp/batch-scan.mjs <<'JSEOF'
const base = 'http://127.0.0.1:9222';
const t = (await (await fetch(`${base}/json`)).json()).find((x) => x.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); } };
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:8123/index.html' });
await new Promise((r) => setTimeout(r, 2500));
const evalJS = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return 'ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};
console.log('按钮存在:', await evalJS(`!!document.getElementById('batch-export-scan-btn')`));
console.log('空队列应提示不崩:', await evalJS(`(function(){
  document.getElementById('batch-export-scan-btn').click();
  return 'clicked-no-throw';
})()`));
console.log('批量 API:', await evalJS(`JSON.stringify(Object.keys(window.BatchProcessing || {}))`));
ws.close(); process.exit(0);
JSEOF
timeout 90 node /tmp/batch-scan.mjs
```

Expected: `按钮存在: true`；`空队列应提示不崩: clicked-no-throw`；`批量 API` 列出成员且含 Step 1 确认的取队列方法（以及若新增了 `loadFileForScan` 也应出现）。

- [ ] **Step 6: 全量回归 + 提交**

```bash
cd /home/parallels/Projects/yinji
# 语法全检
for f in $(find src tools -name '*.js' -o -name '*.mjs' | sort); do node --check "$f" || echo "FAIL $f"; done; echo "语法全检完成"
# 功能回归
timeout 90 node tools/ai/yinji-cli.mjs smoke --pdf ./test-fixture.pdf 2>&1 | grep -E '"objectCount"|"lastToast"|Error' | head -3
timeout 90 node tools/ai/yinji-cli.mjs state --tab export --batch-pdf ./test-fixture.pdf --batch-pdf ./test-multi.pdf 2>&1 | grep -E '"batchQueueCount"|Error' | head -2
# 单测全绿
timeout 60 node /tmp/run-tests.mjs

git add index.html src/features/scan-ui.js src/core/batch-processing.js
git commit -m "feat: 批量导出为扫描件

复用批量队列, 对每个文件套用同一套扫描/水印/元数据参数并逐个下载;
单文件失败不中断整批, 结束汇总成功与失败数。"
```

Expected: 语法全检无 FAIL；smoke `objectCount: 1` 正常；批量队列 `batchQueueCount: 2`；单测输出 16 项全过。

---

## Task 6: 文档与署名收口

**Files:**
- Modify: `README.md`（功能列表 + 验证命令）
- Modify: `docs/DEPLOY.md`（部署包需含 test-fixture.pdf 的修正）
- Create: `docs/SCAN-FEATURE.md`（功能说明 + 参数含义 + 来源署名）

**Interfaces:**
- Consumes: 无
- Produces: 无

- [ ] **Step 1: 写功能文档**

创建 `docs/SCAN-FEATURE.md`：

```markdown
# 导出为扫描件

把（已盖章的）PDF/图片处理成看起来像打印后扫描的文档。全部在浏览器本地完成，文件不上传。

## 用法

1. 打开文件、照常盖章。
2. 切到「导出」标签 →「导出为扫描件」区。
3. 选预设（轻度做旧 / 标准扫描 / 黑白复印），或手动调参数。
4. 勾「实时预览当前页」边调边看。
5. 点「导出为扫描件」。

## 参数

| 参数 | 含义 | 范围 | 默认 |
|------|------|------|------|
| 噪点 | 扫描噪点强度 | 0~1 | 0.25 |
| 歪斜抖动 | 每页随机歪斜幅度 | 0~10 | 0.5 |
| 歪斜基准 | 固定歪斜角度 | -10~10 | 1 |
| 泛黄 | 纸张泛黄程度 | 0~2 | 0 |
| 对比度 | 对比度 | 0~2 | 1 |
| 亮度 | 亮度 | 0~2 | 1 |
| 模糊 | 扫描模糊 | 0~1 | 0.5 |
| 黑白 | 灰度化 | 开/关 | 开 |
| 黑边框 | 页面描边 | 开/关 | 关 |
| 分辨率 | 输出 DPI = 值×72 | 1~3 | 2（144 DPI）|

## 高级功能

- **水印**：文字内容、字号、透明度、平铺整页。
- **PDF 信息**：自定义标题/作者，可选「伪装成扫描仪产出」（写入扫描设备风格的 Creator/Producer）。
- **批量**：批量队列中的每个文件套用同一套参数。

## 说明

扫描件是**图片版 PDF**：文字不可选、不可搜索、体积会变大。这是「像扫描」的固有结果，不是缺陷。

## 来源与许可

扫描效果算法移植自 [lookscanned.io](https://github.com/lookscanned/lookscanned.io)（MIT License），灵感来源 [baicunko/scanyourpdf](https://github.com/baicunko/scanyourpdf)。水印、PDF 元数据、批量等功能为印迹自主实现。
```

- [ ] **Step 2: 更新 README**

用 Read 打开 `README.md`，在开头功能描述那段之后补一句功能介绍，并在「常用验证」区补一条：

```markdown
导出扫描件（需先打开文件并盖章）：详见 `docs/SCAN-FEATURE.md`
```

- [ ] **Step 3: 修正部署文档**

用 Read 打开 `docs/DEPLOY.md`。在「部署包边界」一节把 `test-fixture.pdf` 从"不上传"改为**必须上传**，理由：`src/main.js` 的 `SAMPLE_PDF_PATH = 'test-fixture.pdf'` 会在用户点「加载示例」时 `fetch` 它，不部署则该功能线上失效。同时确认 `deploy.sh` 的同步白名单包含它——若不含，在 `deploy.sh` 中补一行同步该文件并 `shellcheck deploy.sh` 通过。

- [ ] **Step 4: 提交**

```bash
cd /home/parallels/Projects/yinji
shellcheck deploy.sh && echo "shellcheck OK"
git add README.md docs/DEPLOY.md docs/SCAN-FEATURE.md deploy.sh
git commit -m "docs: 扫描件功能说明 + 修正部署包需含示例 PDF

新增 docs/SCAN-FEATURE.md(用法/参数表/高级功能/图片版PDF说明/MIT署名);
修正 DEPLOY.md 与 deploy.sh —— test-fixture.pdf 是「加载示例」的运行时
依赖, 必须部署, 之前被误排除会导致线上该功能失效。"
```

---

## Self-Review 结果

**1. Spec 覆盖检查**

| spec 章节 | 对应任务 |
|-----------|----------|
| §3 扫描算法 | Task 1 |
| §4 配置参数（含范围/默认/预设） | Task 1 |
| §5 与盖章叠加的导出管线 | Task 3 |
| §6.1 自定义文字水印 | Task 2（算法）+ Task 4（UI） |
| §6.2 自定义 PDF 元数据 | Task 3（写入）+ Task 4（UI） |
| §6.3 分辨率/DPI | Task 1（参数）+ Task 3（multiplier）+ Task 4（UI 显示 DPI） |
| §6.4 批量扫描 | Task 5 |
| §7 UI/交互（分层/预设/实时预览） | Task 4 |
| §8 错误处理与边界 | Task 3（未开文件/缺页兜底）+ Task 4（Toast）+ Task 5（单文件失败不中断） |
| §9 测试与验收 | 各任务的测试步骤 + Task 5 Step 6 全量回归 |
| §10 署名与合规 | Task 1（代码头）+ Task 6（文档） |

无遗漏。

**2. 占位符扫描**：无 TBD/TODO；每个代码步骤都给出完整可粘贴代码；测试步骤都有具体断言与预期输出。Task 5 Step 3 的 `loadFileForScan` 明确标注为"需实施时从现有单文件处理路径抽取"，并给出退化方案与记录要求——这是有意的实施指引，非占位符。

**3. 类型/命名一致性核对**
- `sanitizeScanConfig` / `sanitizeWatermark` / `sanitizeScanMetadata` 三处命名在 Task 1/2/3 定义、Task 4/5 消费，一致。
- `applyScanEffect(canvas, source, config, noiseImage)` 参数顺序在 Task 1 定义、Task 3 调用，一致。
- `createNoiseImage(noise)` 返回 `HTMLImageElement|null`，Task 3/4 都按可空处理，一致。
- `renderScannedPageDataUrl(pageIndex, config, watermark, noiseImage)` —— pageIndex 为 **0 起**：Task 3 内部用 `fabricCanvases[pageIndex]`，Task 4 预览传 `pageNum - 1`，一致。
- `buildScannedPdfBytes({config, watermark, metadata, onProgress})` 在 Task 3 定义、Task 5 消费，一致。
- `DEFAULT_SCAN_CONFIG.output_format` 为 `'image/jpeg'`，Task 3 按此选 `embedJpg`/`embedPng`，预览覆盖为 png，一致。

**4. 已知实施依赖（非缺陷，需实施者按提示核实）**
- Task 4 依赖预览层挂载点 `page-wrapper-${pageNum}`——该 id 在 `canvas-manager.js` 的 `applyZoom` 中被引用，实施时确认其在 DOM 中存在。
- Task 5 依赖 `window.BatchProcessing` 的真实成员名，Step 1 已要求先 grep 确认。
