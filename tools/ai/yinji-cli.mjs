#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

import { YinjiDriver } from './lib/yinji-driver.mjs';

function printHelp() {
  console.log(`印迹 AI CLI

用法:
  node tools/ai/yinji-cli.mjs smoke --pdf ./test-fixture.pdf [--seal demo]
  node tools/ai/yinji-cli.mjs state --pdf ./test-fixture.pdf [--seal demo] [--export-mode normal|scan|batch]
  node tools/ai/yinji-cli.mjs scan-check
  node tools/ai/yinji-cli.mjs stamp --pdf ./contract.pdf --seal ./seal.png --output-dir ./out [--template ./template.json]
  node tools/ai/yinji-cli.mjs scan --pdf ./contract.pdf --seal ./seal.png --output-dir ./out [--template ./template.json]
  node tools/ai/yinji-cli.mjs verify --manifest ./out/contract_盖章版.yinji.json [--input ./out/contract_盖章版.pdf]
  node tools/ai/yinji-cli.mjs capabilities
  node tools/ai/yinji-cli.mjs doctor [--app-url http://127.0.0.1:8123/index.html] [--cdp-url http://127.0.0.1:9222]
  node tools/ai/yinji-cli.mjs sign --input ./out/contract_盖章版.pdf --output ./out/contract_signed.pdf [--sign-command /path/to/signer]
  node tools/ai/yinji-cli.mjs capture --output ./shot.png [--pdf ./test-fixture.pdf] [--seal demo] [--add-seal] [--add-signature-demo] [--batch-pdf ./test-fixture.pdf] [--batch-pdf ./test-multi.pdf] [--process-batch] [--tab edit|export] [--collapse-sidebar] [--modal settings|help]

可选参数:
  --app-url     页面地址，默认 http://127.0.0.1:8123/index.html
  --cdp-url     Chrome DevTools 地址，默认 http://127.0.0.1:9222
  --width       视口宽度，默认 1440
  --height      视口高度，默认 960
  --pdf         文件路径，支持 PDF、PNG、JPG
  --seal        印章文件路径，或 demo
  --add-seal    自动点击“添加普通章”
  --add-signature-demo  自动写入一笔演示签名并确认
  --batch-pdf   加入一个批量 PDF，可重复传多次
  --batch-pdfs  加入多个批量 PDF，使用逗号分隔
  --process-batch  自动开始批量处理，并等待界面流程结束
  --process-batch-scan  自动批量盖章并转为扫描件
  --tab         切到 edit 或 export
  --export-mode 切到普通导出、扫描件或批量处理（normal|scan|batch）
  --collapse-sidebar  折叠左侧页面预览
  --modal       打开 settings 或 help
  --output      截图输出路径
  --output-dir  stamp 输出目录
  --template    yinji-stamp-template/v1 JSON 文件
  --input       sign 输入 PDF
  --manifest    verify 使用的 yinji-evidence/v1 文件
  --sign-command 外部签名程序；也可使用 YINJI_SIGN_COMMAND
  --dry-run     只验证参数和打印执行计划
  --force       stamp、scan、sign 允许覆盖已存在的输出（sign 绝不允许覆盖输入）

scan-check 自带三页墨量差异化夹具, 校验扫描件导出的未访问页内容、页号映射、
上下方向与三档元数据, 不需要 --pdf。失败时退出码为 1。
`);
}

function agentResult(payload) {
  return { schema: 'yinji-agent-result/v1', ...payload };
}

function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function parseArgs(argv) {
  const [, , command, ...rest] = argv;
  const options = {};

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];

    if (!arg.startsWith('--')) {
      continue;
    }

    const key = arg.slice(2);

    if (
      [
        'add-seal',
        'add-signature-demo',
        'process-batch',
        'process-batch-scan',
        'collapse-sidebar',
        'dry-run',
        'force',
      ].includes(key)
    ) {
      options[key] = true;
      continue;
    }

    if (key === 'batch-pdf') {
      if (!options[key]) {
        options[key] = [];
      }
      options[key].push(rest[i + 1]);
      i += 1;
      continue;
    }

    options[key] = rest[i + 1];
    i += 1;
  }

  return { command, options };
}

function runExternalSigner(command, input, output) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [input, output], { stdio: 'inherit', shell: false });
    child.on('error', reject);
    child.on('exit', (code) => code === 0
      ? resolve()
      : reject(new Error(`外部签名程序退出码 ${code}`)));
  });
}

function resolveOptionPath(filePath) {
  if (!filePath || filePath === 'demo') {
    return filePath;
  }

  return path.resolve(process.cwd(), filePath);
}

function resolveOptionPathList(values = []) {
  return values.map((value) => path.resolve(process.cwd(), value));
}

function resolveCommaSeparatedPathList(value) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => path.resolve(process.cwd(), item));
}

async function main() {
  const { command, options } = parseArgs(process.argv);

  if (!command || command === '--help' || command === 'help') {
    printHelp();
    return;
  }

  if (command === 'capabilities') {
    console.log(JSON.stringify(agentResult({
      ok: true,
      commands: ['capabilities', 'doctor', 'stamp', 'scan', 'verify', 'sign', 'state', 'capture', 'smoke', 'scan-check'],
      contracts: {
        template: 'yinji-stamp-template/v1',
        evidence: 'yinji-evidence/v1',
        result: 'yinji-agent-result/v1',
      },
      boundaries: {
        visualStampIsDigitalSignature: false,
        certificateMaterialAcceptedByBrowser: false,
        networkUploadRequired: false,
        signCommandRequiredForDigitalSignature: true,
      },
    }), null, 2));
    return;
  }

  if (command === 'doctor') {
    const appUrl = options['app-url'] || 'http://127.0.0.1:8123/index.html';
    const cdpUrl = (options['cdp-url'] || 'http://127.0.0.1:9222').replace(/\/$/, '');
    const probe = async (url, validate) => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const body = await response.text();
        return { ok: response.ok && validate(body), status: response.status };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    };
    const checks = {
      app: await probe(appUrl, (body) => /id=["']app["']/.test(body) && body.includes('印迹')),
      cdp: await probe(`${cdpUrl}/json/version`, (body) => {
        try {
          return Boolean(JSON.parse(body).webSocketDebuggerUrl);
        } catch {
          return false;
        }
      }),
    };
    const ok = checks.app.ok && checks.cdp.ok;
    console.log(JSON.stringify(agentResult({ ok, checks }), null, 2));
    if (!ok) process.exitCode = 1;
    return;
  }

  if (command === 'verify') {
    const manifestPath = resolveOptionPath(options.manifest);
    if (!manifestPath || !fs.existsSync(manifestPath)) throw new Error('verify 需要可读的 --manifest');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.schema !== 'yinji-evidence/v1') throw new Error('不支持的证据记录 schema');
    const declaredFilename = String(manifest.output?.filename || '');
    if (!declaredFilename || path.basename(declaredFilename) !== declaredFilename) {
      throw new Error('证据记录中的输出文件名不安全');
    }
    const input = resolveOptionPath(options.input) || path.join(path.dirname(manifestPath), declaredFilename);
    if (!input || !fs.existsSync(input)) throw new Error(`找不到待校验结果：${input}`);
    const actual = { size: fs.statSync(input).size, sha256: sha256File(input) };
    const checks = {
      filename: path.basename(input) === manifest.output?.filename,
      size: actual.size === manifest.output?.size,
      sha256: actual.sha256 === manifest.output?.sha256,
    };
    const ok = Object.values(checks).every(Boolean);
    console.log(JSON.stringify(agentResult({ ok, manifest: manifestPath, input, checks, actual }), null, 2));
    if (!ok) process.exitCode = 1;
    return;
  }

  if (command === 'sign') {
    const input = resolveOptionPath(options.input);
    const output = resolveOptionPath(options.output);
    const signCommand = options['sign-command'] || process.env.YINJI_SIGN_COMMAND;
    if (!input || !output) throw new Error('sign 需要 --input 和 --output');
    if (!fs.existsSync(input)) throw new Error(`找不到待签文件：${input}`);
    if (input === output) throw new Error('sign 不允许覆盖输入文件');
    if (fs.existsSync(output) && !options.force) throw new Error('签名输出已存在；明确使用 --force 才能覆盖');
    if (!signCommand) throw new Error('未配置外部签名程序；使用 --sign-command 或 YINJI_SIGN_COMMAND');
    const plan = { command: signCommand, input, output, contract: '<sign-command> <input.pdf> <output.pdf>' };
    if (options['dry-run']) {
      console.log(JSON.stringify(agentResult({ ok: true, dryRun: true, plan }), null, 2));
      return;
    }
    const temporaryOutput = path.join(
      path.dirname(output),
      `.${path.basename(output, path.extname(output))}.yinji-tmp-${process.pid}.pdf`
    );
    try {
      await runExternalSigner(signCommand, input, temporaryOutput);
      if (!fs.existsSync(temporaryOutput) || fs.statSync(temporaryOutput).size === 0) {
        throw new Error('外部签名程序没有生成有效输出文件');
      }
      fs.renameSync(temporaryOutput, output);
    } finally {
      if (fs.existsSync(temporaryOutput)) fs.unlinkSync(temporaryOutput);
    }
    console.log(JSON.stringify(agentResult({
      ok: true,
      output,
      bytes: fs.statSync(output).size,
      assurance: '外部程序已返回文件；证书链和签名有效性仍须由独立验证器确认。',
    }), null, 2));
    return;
  }

  let stampPlan = null;
  if (command === 'stamp' || command === 'scan') {
    const pdf = resolveOptionPath(options.pdf);
    const seal = resolveOptionPath(options.seal);
    if (!pdf || !seal) throw new Error(`${command} 需要 --pdf 和 --seal`);
    if (!fs.existsSync(pdf)) throw new Error(`找不到 PDF：${pdf}`);
    if (seal !== 'demo' && !fs.existsSync(seal)) throw new Error(`找不到印章图片：${seal}`);
    const outputDirectory = path.resolve(options['output-dir'] || './yinji-output');
    const template = options.template
      ? JSON.parse(fs.readFileSync(resolveOptionPath(options.template), 'utf8'))
      : { schema: 'yinji-stamp-template/v1', pages: 'all', anchor: 'center' };
    stampPlan = { pdf, seal, outputDirectory, template, scan: command === 'scan' };
    if (options['dry-run']) {
      console.log(JSON.stringify(agentResult({ ok: true, dryRun: true, plan: stampPlan }), null, 2));
      return;
    }
  }

  const driver = new YinjiDriver({
    appUrl: options['app-url'],
    cdpBaseUrl: options['cdp-url'],
    width: options.width ? Number(options.width) : undefined,
    height: options.height ? Number(options.height) : undefined,
  });

  try {
    await driver.open();

    const pdf = resolveOptionPath(options.pdf);
    const seal = resolveOptionPath(options.seal);
    const batchPdfs = [
      ...resolveOptionPathList(options['batch-pdf'] || []),
      ...resolveCommaSeparatedPathList(options['batch-pdfs']),
    ];

    if (command === 'stamp' || command === 'scan') {
      const { pdf, seal, outputDirectory, template, scan } = stampPlan;
      fs.mkdirSync(outputDirectory, { recursive: true });
      await driver.enableArtifactCapture();
      if (seal === 'demo') await driver.loadDemoSeal(); else await driver.loadSeal(seal);
      await driver.switchTab('export');
      await driver.switchExportMode('batch');
      await driver.setBatchTemplate(template);
      await driver.loadBatchPdfs([pdf]);
      await driver.processBatchQueue(120000, scan);
      const files = (await driver.writeCapturedArtifacts(outputDirectory, {
        force: Boolean(options.force),
      })).sort();
      if (!files.some((name) => name.endsWith('.pdf')) || !files.some((name) => name.endsWith('.yinji.json'))) {
        throw new Error('浏览器没有返回 PDF 和证据记录');
      }
      console.log(JSON.stringify(agentResult({ ok: true, operation: scan ? 'scan' : 'stamp', outputDirectory, files }), null, 2));
      return;
    }

    if (command === 'smoke') {
      if (!pdf) {
        throw new Error('smoke 需要 --pdf');
      }

      const result = await driver.runSmoke({
        pdf,
        seal: seal || 'demo',
      });
      console.log(JSON.stringify(agentResult({ ...result, operation: 'smoke' }), null, 2));
      return;
    }

    if (command === 'scan-check') {
      const result = await driver.runScanCheck();
      console.log(JSON.stringify(agentResult({ ...result, operation: 'scan-check' }), null, 2));

      if (!result.ok) {
        process.exitCode = 1;
      }

      return;
    }

    if (command === 'state' || command === 'capture') {
      await driver.prepare({
        pdf,
        seal,
        addSeal: Boolean(options['add-seal']),
        addSignatureDemo: Boolean(options['add-signature-demo']),
        batchPdfs,
        processBatch: Boolean(options['process-batch']),
        processBatchScan: Boolean(options['process-batch-scan']),
        tab: options.tab || '',
        exportMode: options['export-mode'] || '',
        collapseSidebar: Boolean(options['collapse-sidebar']),
        modal: options.modal || '',
      });

      const snapshot = await driver.snapshotState();

      if (command === 'capture') {
        const output = options.output
          ? path.resolve(process.cwd(), options.output)
          : path.resolve(process.cwd(), 'yinji-capture.png');
        await driver.captureScreenshot(output);
        console.log(
          JSON.stringify(
            agentResult({
              ok: true,
              operation: 'capture',
              output,
              snapshot,
            }),
            null,
            2
          )
        );
        return;
      }

      console.log(JSON.stringify(agentResult({ ok: true, operation: 'state', snapshot }), null, 2));
      return;
    }

    throw new Error(`未知命令: ${command}`);
  } finally {
    await driver.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify(agentResult({
    ok: false,
    error: { code: error.code || 'YINJI_ERROR', message: error.message || String(error) },
  }), null, 2));
  process.exitCode = 1;
});
