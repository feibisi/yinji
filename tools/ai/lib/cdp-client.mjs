const DEFAULT_CDP_BASE_URL = 'http://127.0.0.1:9222';

export async function openPageTarget(pageUrl, cdpBaseUrl = DEFAULT_CDP_BASE_URL) {
  const endpoint = `${cdpBaseUrl.replace(/\/$/, '')}/json/new?${encodeURI(pageUrl)}`;
  let response;

  try {
    response = await fetch(endpoint, { method: 'PUT' });
  } catch (error) {
    const detail =
      error?.cause?.code || error?.message
        ? ` 原始错误：${error?.cause?.code || error?.message}`
        : '';
    throw new Error(
      `无法连接浏览器调试端口 ${cdpBaseUrl}。请先启动带 --remote-debugging-port=9222 的 Chrome 或 Chromium。${detail}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `无法连接浏览器调试端口 ${cdpBaseUrl}，状态码 ${response.status}`
    );
  }

  return response.json();
}

export class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 0;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);

    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) {
        return;
      }

      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }

      this.pending.delete(message.id);

      if (message.error) {
        pending.reject(new Error(message.error.message));
        return;
      }

      pending.resolve(message.result);
    };
  }

  async send(method, params = {}) {
    const id = ++this.id;
    const payload = { id, method, params };

    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });

    this.ws.send(JSON.stringify(payload));
    return promise;
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });

    if (result.exceptionDetails) {
      const description =
        result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text ||
        'Runtime.evaluate 执行失败';
      throw new Error(description);
    }

    return result.result?.value;
  }

  async querySelector(selector) {
    const { root } = await this.send('DOM.getDocument', {
      depth: 1,
      pierce: true,
    });
    const { nodeId } = await this.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector,
    });

    if (!nodeId) {
      throw new Error(`找不到元素: ${selector}`);
    }

    return nodeId;
  }

  async setInputFiles(selector, files) {
    const nodeId = await this.querySelector(selector);
    await this.send('DOM.setFileInputFiles', {
      nodeId,
      files,
    });
  }

  async close() {
    if (!this.ws) {
      return;
    }

    this.ws.close();
    this.ws = null;
  }
}

export async function createBrowserSession({
  pageUrl,
  cdpBaseUrl = DEFAULT_CDP_BASE_URL,
  width = 1440,
  height = 960,
} = {}) {
  const target = await openPageTarget(pageUrl, cdpBaseUrl);
  const client = new CDPClient(target.webSocketDebuggerUrl);

  await client.connect();
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('DOM.enable');
  await client.send('Network.enable');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });

  return client;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
