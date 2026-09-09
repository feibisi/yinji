import { createBrowserSession, sleep } from '../ai/lib/cdp-client.mjs';

const appUrl = process.env.YINJI_APP_URL || 'http://127.0.0.1:8123/index.html';
const testsUrl = new URL('tests/index.html', appUrl).href;
const client = await createBrowserSession({
  pageUrl: testsUrl,
  cdpBaseUrl: process.env.YINJI_CDP_URL || 'http://127.0.0.1:9222',
});
try {
  let summary = '';
  for (let i = 0; i < 120; i += 1) {
    summary = await client.evaluate(`document.getElementById('test-results')?.textContent || ''`);
    if (summary.includes('失败:')) break;
    await sleep(250);
  }
  const ok = summary.includes('失败: 0');
  console.log(JSON.stringify({ ok, suite: 'browser-unit', summary }));
  if (!ok) process.exitCode = 1;
} finally {
  await client.close();
}
