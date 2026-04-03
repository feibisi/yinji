/**
 * PDF 渲染 Web Worker
 * 将耗时的 PDF 页面渲染操作移到后台线程，避免阻塞主线程
 */

importScripts('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

/**
 * 渲染指定页面为缩略图
 * @param {Object} data - 任务数据
 * @param {string} data.pdfUrl - PDF 文件的 ObjectURL
 * @param {number} data.pageNum - 页面编号（从1开始）
 * @param {number} data.scale - 缩放比例
 * @param {string} data.taskId - 任务ID（用于取消）
 */
async function renderPage(data) {
  const { pdfUrl, pageNum, scale, taskId } = data;

  try {
    // 加载 PDF 文档
    const loadingTask = pdfjsLib.getDocument(pdfUrl);
    const pdfDoc = await loadingTask.promise;

    // 获取指定页面
    const page = await pdfDoc.getPage(pageNum);

    // 计算渲染尺寸
    const viewport = page.getViewport({ scale });

    // 创建 canvas
    const canvas = new OffscreenCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d');

    // 渲染页面
    await page.render({
      canvasContext: ctx,
      viewport: viewport,
    }).promise;

    // 转换为 Blob
    const blob = await canvas.convertToBlob({ type: 'image/png' });

    // 读取为 DataURL
    const reader = new FileReader();
    reader.onload = () => {
      self.postMessage({
        type: 'RENDER_COMPLETE',
        taskId,
        pageNum,
        imageData: reader.result,
        width: viewport.width,
        height: viewport.height,
      });
    };
    reader.readAsDataURL(blob);

    // 清理
    page.cleanup();
    pdfDoc.cleanup();

  } catch (error) {
    console.error(`Worker: 渲染页面 ${pageNum} 失败:`, error);
    self.postMessage({
      type: 'RENDER_ERROR',
      taskId,
      pageNum,
      error: error.message,
    });
  }
}

/**
 * 获取 PDF 文档信息
 * @param {Object} data
 * @param {string} data.pdfUrl
 */
async function getPDFInfo(data) {
  const { pdfUrl } = data;

  try {
    const loadingTask = pdfjsLib.getDocument(pdfUrl);
    const pdfDoc = await loadingTask.promise;

    self.postMessage({
      type: 'PDF_INFO',
      numPages: pdfDoc.numPages,
      metadata: await pdfDoc.getMetadata(),
    });

    pdfDoc.destroy();
  } catch (error) {
    self.postMessage({
      type: 'PDF_INFO_ERROR',
      error: error.message,
    });
  }
}

// 消息处理
const pendingTasks = new Map();

self.addEventListener('message', async (e) => {
  const { type, ...data } = e.data;

  switch (type) {
    case 'RENDER_PAGE':
      await renderPage(data);
      break;

    case 'GET_PDF_INFO':
      await getPDFInfo(data);
      break;

    case 'CANCEL_TASK':
      // 可以添加任务取消逻辑
      pendingTasks.delete(data.taskId);
      break;

    default:
      console.warn('Worker: 未知消息类型', type);
  }
});

self.postMessage({ type: 'WORKER_READY' });
