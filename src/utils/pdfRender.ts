/**
 * PDF 页面渲染工具（基于 pdfjs-dist）
 * 将 PDF 每一页渲染为高清图片（dataURL），供「PDF 转 PPT」「PDF 转 Word」复用。
 * 纯客户端渲染，零服务器负载。
 */
import * as pdfjsLib from 'pdfjs-dist';
// Vite 以 URL 形式引入 worker，避免打包进主 bundle
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface RenderedPage {
  /** 页面图片（dataURL） */
  dataUrl: string;
  /** 图片宽（px） */
  width: number;
  /** 图片高（px） */
  height: number;
  /** 页码（从 1 开始） */
  pageNum: number;
}

export interface RenderOptions {
  /** 基础缩放倍数（默认 2，越大越清晰） */
  scale?: number;
  /** 单边最大像素，超出则等比缩小，避免内存爆炸（默认 2200） */
  maxEdge?: number;
  /** 输出格式（默认 PNG） */
  format?: 'image/png' | 'image/jpeg';
  /** JPEG 质量（默认 0.92） */
  quality?: number;
  /** 每渲染完一页回调（用于进度提示），参数为已完成页码 */
  onProgress?: (donePages: number, totalPages: number) => void;
}

/** 读取 File 为 ArrayBuffer */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 将 PDF 的每一页渲染为图片
 * @param data PDF 文件的 ArrayBuffer
 */
export async function renderPdfPages(
  data: ArrayBuffer,
  opts: RenderOptions = {}
): Promise<RenderedPage[]> {
  const {
    scale = 2,
    maxEdge = 2200,
    format = 'image/png',
    quality = 0.92,
    onProgress,
  } = opts;

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data) });
  const pdf = await loadingTask.promise;
  const total = pdf.numPages;
  const pages: RenderedPage[] = [];

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });

    // 在 scale 基础上限制单边不超过 maxEdge
    let s = scale;
    const longEdge = Math.max(base.width, base.height) * s;
    if (longEdge > maxEdge) {
      s = maxEdge / Math.max(base.width, base.height);
    }
    const viewport = page.getViewport({ scale: s });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    // pdfjs v6 推荐直接传 canvas（库内部自取 context）；background 铺白底
    await page.render({ canvas, viewport, background: '#ffffff' }).promise;

    pages.push({
      dataUrl: canvas.toDataURL(format, quality),
      width: canvas.width,
      height: canvas.height,
      pageNum: i,
    });

    page.cleanup();
    onProgress?.(i, total);
  }

  await loadingTask.destroy();
  return pages;
}
