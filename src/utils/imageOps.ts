/**
 * 图片处理核心函数库（纯 Canvas 实现，客户端计算零服务器负载）
 * 提供：压缩（目标体积/质量档位）、缩放（等比/指定尺寸）、格式转换、旋转、裁剪
 */

export type OutputFormat = 'image/jpeg' | 'image/png';

export interface OpResult {
  dataUrl: string;
  width: number;
  height: number;
  size: number; // 字节
}

/** 加载 dataURL 为 Image 元素 */
export function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = dataUrl;
  });
}

/** 估算 dataURL 的字节大小（base64 约占 3/4） */
export function dataUrlSize(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] || '';
  return Math.floor((base64.length * 3) / 4);
}

/** 根据 dataURL 的 MIME 推断输出格式（未知默认 PNG） */
export function detectFormat(dataUrl: string): OutputFormat {
  return dataUrl.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png';
}

/** 创建画布并绘制图像 */
function drawToCanvas(
  source: HTMLImageElement | HTMLCanvasElement,
  width: number,
  height: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** 通用导出（JPEG 自动铺白底，避免透明区域变黑） */
function exportCanvas(canvas: HTMLCanvasElement, format: OutputFormat, quality?: number): OpResult {
  let out = canvas;
  if (format === 'image/jpeg') {
    const filled = document.createElement('canvas');
    filled.width = canvas.width;
    filled.height = canvas.height;
    const fctx = filled.getContext('2d')!;
    fctx.fillStyle = '#ffffff';
    fctx.fillRect(0, 0, filled.width, filled.height);
    fctx.drawImage(canvas, 0, 0);
    out = filled;
  }
  const dataUrl = out.toDataURL(format, quality ?? (format === 'image/jpeg' ? 0.92 : undefined));
  return { dataUrl, width: out.width, height: out.height, size: dataUrlSize(dataUrl) };
}

// ==================== 压缩 ====================

/**
 * 压缩到目标体积（KB）以内 —— 二分查找 JPEG 质量
 * @param level 高清：质量下限高、缩放保守；均衡：允许更低质量
 */
export async function compressToTarget(
  img: HTMLImageElement,
  targetKB: number,
  level: 'hd' | 'balanced'
): Promise<OpResult & { quality: number }> {
  const targetBytes = targetKB * 1024;
  const minQ = level === 'hd' ? 0.55 : 0.25;
  const maxQ = level === 'hd' ? 0.95 : 0.85;
  const shrinkStep = level === 'hd' ? 0.92 : 0.85;

  let current = img as HTMLImageElement | HTMLCanvasElement;
  let w = img.naturalWidth;
  let h = img.naturalHeight;

  // 外层：若最低质量仍超体积，逐步缩小尺寸再试（最多 8 轮）
  for (let round = 0; round < 8; round++) {
    const canvas = drawToCanvas(current, w, h);
    // 内层：二分查找质量
    let lo = minQ;
    let hi = maxQ;
    let best: OpResult | null = null;
    let bestQ = minQ;
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      const res = exportCanvas(canvas, 'image/jpeg', mid);
      if (res.size <= targetBytes) {
        best = res;
        bestQ = mid;
        lo = mid; // 体积达标，尝试更高质量
      } else {
        hi = mid; // 体积超标，降低质量
      }
    }
    if (best) return { ...best, quality: bestQ };
    // 最低质量仍超标 → 缩小尺寸重试
    w = Math.round(w * shrinkStep);
    h = Math.round(h * shrinkStep);
    current = canvas;
    if (w < 32 || h < 32) break;
  }

  // 兜底：返回最小尺寸最低质量
  const canvas = drawToCanvas(current, w, h);
  const res = exportCanvas(canvas, 'image/jpeg', minQ);
  return { ...res, quality: minQ };
}

/** 按固定质量压缩（不指定体积时） */
export async function compressWithQuality(
  img: HTMLImageElement,
  quality: number
): Promise<OpResult & { quality: number }> {
  const canvas = drawToCanvas(img, img.naturalWidth, img.naturalHeight);
  const res = exportCanvas(canvas, 'image/jpeg', quality);
  return { ...res, quality };
}

// ==================== 缩放 ====================

/** 等比缩放：按百分比（默认保持源格式） */
export async function resizeByPercent(
  img: HTMLImageElement,
  percent: number,
  format?: OutputFormat
): Promise<OpResult> {
  const scale = Math.max(1, Math.min(1000, percent)) / 100;
  const canvas = drawToCanvas(img, img.naturalWidth * scale, img.naturalHeight * scale);
  return exportCanvas(canvas, format ?? detectFormat(img.src));
}

/** 等比缩放：按长边像素（默认保持源格式） */
export async function resizeByLongEdge(
  img: HTMLImageElement,
  longEdgePx: number,
  format?: OutputFormat
): Promise<OpResult> {
  const { naturalWidth: w, naturalHeight: h } = img;
  const scale = Math.max(1, longEdgePx) / Math.max(w, h);
  const canvas = drawToCanvas(img, w * scale, h * scale);
  return exportCanvas(canvas, format ?? detectFormat(img.src));
}

/** 指定尺寸缩放（拉伸到精确尺寸） */
export async function resizeToExact(
  img: HTMLImageElement,
  width: number,
  height: number,
  format: OutputFormat = 'image/png'
): Promise<OpResult> {
  const canvas = drawToCanvas(img, width, height);
  return exportCanvas(canvas, format, format === 'image/jpeg' ? 0.92 : undefined);
}

/** 等比适配：缩放到不超过 W×H 的最大尺寸（锁定比例、不变形） */
export async function resizeToFit(
  img: HTMLImageElement,
  boxW: number,
  boxH: number,
  format: OutputFormat = 'image/png'
): Promise<OpResult> {
  const scale = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight);
  const canvas = drawToCanvas(img, img.naturalWidth * scale, img.naturalHeight * scale);
  return exportCanvas(canvas, format, format === 'image/jpeg' ? 0.92 : undefined);
}

// ==================== 格式转换 ====================

export async function convertFormat(
  img: HTMLImageElement,
  format: OutputFormat,
  quality = 0.92
): Promise<OpResult> {
  const canvas = drawToCanvas(img, img.naturalWidth, img.naturalHeight);
  // JPEG 白底由 exportCanvas 统一处理
  return exportCanvas(canvas, format, quality);
}

// ==================== 旋转 ====================

/** 旋转指定角度（90 / 180 / -90 等，任意角度亦可；默认保持源格式） */
export async function rotateImage(
  img: HTMLImageElement,
  angle: number,
  format?: OutputFormat
): Promise<OpResult> {
  const rad = (angle * Math.PI) / 180;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const newW = Math.round(w * cos + h * sin);
  const newH = Math.round(w * sin + h * cos);

  const canvas = document.createElement('canvas');
  canvas.width = newW;
  canvas.height = newH;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(newW / 2, newH / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2);
  return exportCanvas(canvas, format ?? detectFormat(img.src));
}

// ==================== 裁剪 ====================

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 按 react-easy-crop 输出的像素区域裁剪（默认保持源格式） */
export async function cropImage(
  img: HTMLImageElement,
  area: CropArea,
  format?: OutputFormat
): Promise<OpResult> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(area.width));
  canvas.height = Math.max(1, Math.round(area.height));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    img,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    canvas.width,
    canvas.height
  );
  return exportCanvas(canvas, format ?? detectFormat(img.src));
}

// ==================== 工具 ====================

/** 读取 File 为 dataURL 并获取尺寸 */
export function readFileAsImage(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new window.Image();
      img.onload = () => resolve({ dataUrl, width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('图片解析失败'));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

/** 格式化字节为可读字符串 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** 触发单文件下载 */
export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** 触发 Blob 文件下载（用于 docx / 打包等二进制结果） */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** dataURL 转 Uint8Array（供 docx 等需要二进制数据的库使用） */
export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
