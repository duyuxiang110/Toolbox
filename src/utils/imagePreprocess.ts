/**
 * OCR 图像预处理（Canvas 像素级处理）
 * 目标：显著提升 Tesseract 识别准确率
 *
 * 技术管线参考 Tesseract 官方与业界最佳实践：
 *   放大（小图文字放大到易识别尺寸）→ 灰度化 → 对比度增强
 *   → 反色校正（暗底亮字）→ 中值降噪（保边去噪）→ Unsharp 锐化
 *   （恢复放大插值损失的边缘清晰度）→（可选）Otsu 二值化
 *
 * Tesseract 内部虽自带 Otsu，但对噪点多、对比度低、尺寸小的图片，
 * 先做一次针对性预处理可大幅提升识别准确率。
 * 其中「放大后锐化」是关键：双线性/双三次插值会把文字边缘糊化，
 * 导致形近字符（如 G/I、工/T）混淆，锐化可显著降低这类误识。
 */

export type OcrPreprocessMode = 'auto' | 'binarize' | 'grayscale' | 'none';

export const OCR_MODE_OPTIONS = [
  { value: 'auto', label: '智能增强（推荐）' },
  { value: 'binarize', label: '黑白二值化' },
  { value: 'grayscale', label: '灰度降噪' },
  { value: 'none', label: '原图（不处理）' },
];

/** 灰度化（ITU-R BT.601 亮度公式） */
function toGrayscale(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = data[i + 1] = data[i + 2] = g;
  }
}

/** 对比度拉伸（直方图归一化，拉开文字与背景差距） */
function contrastStretch(data: Uint8ClampedArray): void {
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.round(((i - min) / range) * 255);
  }
  for (let i = 0; i < data.length; i += 4) {
    const v = lut[data[i]];
    data[i] = data[i + 1] = data[i + 2] = v;
  }
}

/**
 * 对比度 S 曲线：把中间灰度推向黑/白两极，让文字笔画更实心、背景更干净。
 * 相比中值滤波，它不会腐蚀中文细笔画，是保护笔画前提下清理噪点的更优选择。
 * 公式：以 128 为中心的三次 S 曲线（strength 控制陡峭程度）。
 */
function contrastCurve(data: Uint8ClampedArray, strength = 0.6): void {
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    // 归一化到 [-1, 1]，过原点的 S 曲线：y = x + strength * x^3
    const x = (i - 128) / 128;
    const y = x + strength * x * x * x;
    let v = Math.round(y * 128 + 128);
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    lut[i] = v;
  }
  for (let i = 0; i < data.length; i += 4) {
    const v = lut[data[i]];
    data[i] = data[i + 1] = data[i + 2] = v;
  }
}

/** 反色校正：暗底亮字 → 亮底暗字（Tesseract 对深字浅底更敏感） */
function autoInvert(data: Uint8ClampedArray): void {
  let sum = 0;
  const count = data.length / 4;
  for (let i = 0; i < data.length; i += 4) sum += data[i];
  const avg = sum / count;
  if (avg < 110) {
    for (let i = 0; i < data.length; i += 4) {
      const v = 255 - data[i];
      data[i] = data[i + 1] = data[i + 2] = v;
    }
  }
}

/** Otsu 大津法二值化（自动寻找最佳阈值，适合双峰直方图） */
function otsuThreshold(data: Uint8ClampedArray): void {
  const hist = new Array(256).fill(0);
  const total = data.length / 4;
  for (let i = 0; i < data.length; i += 4) hist[data[i]]++;

  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }

  for (let i = 0; i < data.length; i += 4) {
    const v = data[i] > threshold ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = v;
  }
}

/**
 * Unsharp Mask 锐化：恢复放大插值损失的文字边缘清晰度
 * 原理：sharp = 原图 + amount × (原图 − 模糊图)，把被插值"糊掉"的边缘重新拉开
 * @param amount 锐化强度（0.3~1.0，放大倍数越大取值越大）
 */
function unsharpMask(imageData: ImageData, amount: number): ImageData {
  const { width, height, data } = imageData;
  const out = new Uint8ClampedArray(data);
  // 3×3 高斯模糊（角 1 / 边 2 / 中心 4，总和 16）作为低频分量
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const blur =
        (data[((y - 1) * width + (x - 1)) * 4] +
          data[((y - 1) * width + (x + 1)) * 4] +
          data[((y + 1) * width + (x - 1)) * 4] +
          data[((y + 1) * width + (x + 1)) * 4] +
          2 * (data[((y - 1) * width + x) * 4] +
            data[(y * width + (x - 1)) * 4] +
            data[(y * width + (x + 1)) * 4] +
            data[((y + 1) * width + x) * 4]) +
          4 * data[idx]) / 16;
      const orig = data[idx];
      let sharp = orig + amount * (orig - blur);
      sharp = sharp < 0 ? 0 : sharp > 255 ? 255 : sharp;
      out[idx] = out[idx + 1] = out[idx + 2] = sharp;
    }
  }
  return new ImageData(out, width, height);
}

/** 3×3 中值滤波降噪（非线性滤波，去椒盐噪点且保留文字边缘） */
function medianFilter(imageData: ImageData): ImageData {
  const { width, height, data } = imageData;
  const out = new Uint8ClampedArray(data);
  const win = new Uint8ClampedArray(9);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let k = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          win[k++] = data[((y + dy) * width + (x + dx)) * 4];
        }
      }
      // 9 个值取中位数（简单插入排序）
      for (let i = 1; i < 9; i++) {
        const key = win[i];
        let j = i - 1;
        while (j >= 0 && win[j] > key) {
          win[j + 1] = win[j];
          j--;
        }
        win[j + 1] = key;
      }
      const idx = (y * width + x) * 4;
      out[idx] = out[idx + 1] = out[idx + 2] = win[4];
    }
  }
  return new ImageData(out, width, height);
}

/**
 * OCR 预处理主流程
 * @returns 处理后的图片 dataURL 与尺寸
 */
export async function preprocessForOcr(
  img: HTMLImageElement,
  mode: OcrPreprocessMode
): Promise<{ dataUrl: string; width: number; height: number }> {
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;

  // 原图模式：直接返回
  if (mode === 'none') {
    const c = document.createElement('canvas');
    c.width = srcW;
    c.height = srcH;
    c.getContext('2d')!.drawImage(img, 0, 0);
    return { dataUrl: c.toDataURL('image/png'), width: srcW, height: srcH };
  }

  // 1. 放大：小图文字放大到易识别尺寸（Tesseract 推荐文字高度 ≥30px）
  const minDim = Math.min(srcW, srcH);
  let scale = 1;
  if (minDim < 500) scale = 2.5;
  else if (minDim < 900) scale = 1.8;
  else if (minDim < 1400) scale = 1.3;
  // 限制长边，避免内存爆炸与识别过慢
  const maxEdge = Math.max(srcW, srcH) * scale;
  if (maxEdge > 2600) scale = 2600 / Math.max(srcW, srcH);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(srcW * scale);
  canvas.height = Math.round(srcH * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  // 按放大倍数自适应选择插值方式：
  //   · 激进放大（scale>1.5，小/中图）→ 最近邻插值：保留硬边二值轮廓。
  //     双三次插值会在笔画边缘产生灰色光晕（糊化），导致形近字符
  //     （G/I、工/T）混淆；Tesseract 对硬边文字识别显著更准。
  //   · 温和放大（scale≤1.5，大图）→ 双三次平滑：大图原边缘本就平滑
  //     抗锯齿，最近邻反而引入锯齿、扭曲字形（如「工具箱」误识为 THE）。
  const aggressive = scale > 1.5;
  ctx.imageSmoothingEnabled = !aggressive;
  if (!aggressive) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  if (mode === 'grayscale') {
    // 灰度降噪：灰度 + 反色 + 轻中值 + 轻锐化
    toGrayscale(imageData.data);
    autoInvert(imageData.data);
    imageData = medianFilter(imageData);
    imageData = unsharpMask(imageData, aggressive ? 0.6 : 0.4);
  } else if (aggressive) {
    // 小/中图（激进放大）：灰度 + 反色 + 强锐化 + 对比度曲线。
    // 刻意不做中值滤波——中值滤波会腐蚀中文细笔画（如「工具箱」
    // 的细横被削掉后误识为 TRE）；噪点改由锐化 + 对比度曲线
    // （中间灰度推向黑白两极）清理，配合最近邻插值修复 G/I 混淆。
    toGrayscale(imageData.data);
    autoInvert(imageData.data);
    imageData = unsharpMask(imageData, 1.2);
    contrastCurve(imageData.data);
    if (mode === 'binarize') {
      otsuThreshold(imageData.data);
    }
  } else {
    // 大图（温和放大）：灰度 + 对比度拉伸 + 反色 + 中值降噪。
    // 大图边缘本就平滑抗锯齿、笔画较粗，不需要锐化（锐化反而会
    // 引入伪影扭曲字形，如「工具箱」误识为 THM）；中值滤波能抹平
    // 毛刺且不伤粗笔画，保持高准确率。
    toGrayscale(imageData.data);
    contrastStretch(imageData.data);
    autoInvert(imageData.data);
    imageData = medianFilter(imageData);
    if (mode === 'binarize') {
      otsuThreshold(imageData.data);
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}
