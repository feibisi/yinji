#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

import { YinjiDriver } from './lib/yinji-driver.mjs';

function printHelp() {
  console.log(`印迹 AI CLI

用法:
  node tools/ai/yinji-cli.mjs smoke --pdf ./test-fixture.pdf [--seal demo]
  node tools/ai/yinji-cli.mjs state --pdf ./test-fixture.pdf [--seal demo] [--export-mode normal|scan|batch]
  node tools/ai/yinji-cli.mjs scan-check
  node tools/ai/yinji-cli.mjs stamp --pdf ./contract.pdf --seal ./seal.png --output-dir ./out [--template ./template.json]
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
  --sign-command 外部签名程序；也可使用 YINJI_SIGN_COMMAND
  --dry-run     只验证参数和打印执行计划

scan-check 自带三页墨量差异化夹具, 校验扫描件导出的未访问页内容、页号映射、
上下方向与三档元数据, 不需要 --pdf。失败时退出码为 1。
`);
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

  if (command === 'sign') {
    const input = resolveOptionPath(options.input);
    const output = resolveOptionPath(options.output);
    const signCommand = options['sign-command'] || process.env.YINJI_SIGN_COMMAND;
    if (!input || !output) throw new Error('sign 需要 --input 和 --output');
    if (!fs.existsSync(input)) throw new Error(`找不到待签文件：${input}`);
    if (!signCommand) throw new Error('未配置外部签名程序；使用 --sign-command 或 YINJI_SIGN_COMMAND');
    const plan = { command: signCommand, input, output, contract: '<sign-command> <input.pdf> <output.pdf>' };
    if (options['dry-run']) {
      console.log(JSON.stringify({ ok: true, dryRun: true, plan }, null, 2));
      return;
    }
    await runExternalSigner(signCommand, input, output);
    if (!fs.existsSync(output) || fs.statSync(output).size === 0) {
      throw new Error('外部签名程序没有生成有效输出文件');
    }
    console.log(JSON.stringify({ ok: true, output, bytes: fs.statSync(output).size }, null, 2));
    return;
  }

  let stampPlan = null;
  if (command === 'stamp') {
    const pdf = resolveOptionPath(options.pdf);
    const seal = resolveOptionPath(options.seal);
    if (!pdf || !seal) throw new Error('stamp 需要 --pdf 和 --seal');
    if (!fs.existsSync(pdf)) throw new Error(`找不到 PDF：${pdf}`);
    if (seal !== 'demo' && !fs.existsSync(seal)) throw new Error(`找不到印章图片：${seal}`);
    const outputDirectory = path.resolve(options['output-dir'] || './yinji-output');
    const template = options.template
      ? JSON.parse(fs.readFileSync(resolveOptionPath(options.template), 'utf8'))
      : { schema: 'yinji-stamp-template/v1', pages: 'all', anchor: 'center' };
    stampPlan = { pdf, seal, outputDirectory, template };
    if (options['dry-run']) {
      console.log(JSON.stringify({ ok: true, dryRun: true, plan: stampPlan }, null, 2));
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

    if (command === 'stamp') {
      const { pdf, seal, outputDirectory, template } = stampPlan;
      fs.mkdirSync(outputDirectory, { recursive: true });
      await driver.enableArtifactCapture();
      if (seal === 'demo') await driver.loadDemoSeal(); else await driver.loadSeal(seal);
      await driver.switchTab('export');
      await driver.switchExportMode('batch');
      await driver.setBatchTemplate(template);
      await driver.loadBatchPdfs([pdf]);
      await driver.processBatchQueue(120000, false);
      const files = (await driver.writeCapturedArtifacts(outputDirectory)).sort();
      if (!files.some((name) => name.endsWith('.pdf')) || !files.some((name) => name.endsWith('.yinji.json'))) {
        throw new Error('浏览器没有返回 PDF 和证据记录');
      }
      console.log(JSON.stringify({ ok: true, outputDirectory, files }, null, 2));
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
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (command === 'scan-check') {
      const result = await driver.runScanCheck();
      console.log(JSON.stringify(result, null, 2));

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
            {
              output,
              snapshot,
            },
            null,
            2
          )
        );
        return;
      }

      console.log(JSON.stringify(snapshot, null, 2));
      return;
    }

    throw new Error(`未知命令: ${command}`);
  } finally {
    await driver.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
