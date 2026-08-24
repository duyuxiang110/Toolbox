/**
 * PDF 页面编辑工具（基于 pdf-lib）
 * 用于「PDF 拆分」「PDF 合并」，保留原始矢量内容（文字/图形不失真）。
 * 纯客户端处理，零服务器负载。
 */
import { PDFDocument } from 'pdf-lib';

/** 读取 File 为 ArrayBuffer（每次调用重新读取，避免 buffer 被 pdfjs 转移后失效） */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });
}

/** 获取 PDF 页数 */
export async function getPdfPageCount(bytes: ArrayBuffer): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

/** 拆分后的一个片段 */
export interface PdfSegment {
  /** 生成的 PDF 字节 */
  bytes: Uint8Array;
  /** 起始页码（从 1 开始，含） */
  start: number;
  /** 结束页码（从 1 开始，含） */
  end: number;
}

/**
 * 按「拆分点」把一个 PDF 拆成多个。
 * @param bytes 源 PDF 的 ArrayBuffer
 * @param cutAfter 在这些页码「之后」切开（1-based）。例如 [3,7] 表示切成 1-3 / 4-7 / 8-末页
 * @returns 各片段（含页码范围，便于命名）
 */
export async function splitPdfByCuts(
  bytes: ArrayBuffer,
  cutAfter: number[]
): Promise<PdfSegment[]> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = src.getPageCount();

  // 归一化拆分点：去重、去掉越界值、升序
  const cuts = [...new Set(cutAfter)]
    .filter((n) => Number.isInteger(n) && n >= 1 && n < total)
    .sort((a, b) => a - b);

  // 边界（0-based 页索引）：[0, ...cuts, total]
  const boundaries = [0, ...cuts, total];
  const segments: PdfSegment[] = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const startIdx = boundaries[i]; // 含
    const endIdx = boundaries[i + 1]; // 不含
    const out = await PDFDocument.create();
    const indices: number[] = [];
    for (let p = startIdx; p < endIdx; p++) indices.push(p);
    const copied = await out.copyPages(src, indices);
    copied.forEach((pg) => out.addPage(pg));
    segments.push({
      bytes: await out.save(),
      start: startIdx + 1,
      end: endIdx,
    });
  }

  return segments;
}

/**
 * 把多个 PDF 按给定顺序合并为一个。
 * @param buffers 各源 PDF 的 ArrayBuffer（按目标顺序排列）
 */
export async function mergePdfs(buffers: ArrayBuffer[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const buf of buffers) {
    const src = await PDFDocument.load(buf, { ignoreEncryption: true });
    const copied = await out.copyPages(src, src.getPageIndices());
    copied.forEach((pg) => out.addPage(pg));
  }
  return out.save();
}
