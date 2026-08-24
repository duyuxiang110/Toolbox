/**
 * Word（docx）转 PDF
 * 管线：复用 wordToImages 的「mammoth 解析 + html2canvas 渲染 + A4 智能分页」，
 *       得到每页一张图片，再用 jsPDF 逐页塞进 A4 纸面，组装成多页 PDF。
 * 分页与「Word 转图片」完全一致：内容按 A4 页高切分、切分点落在段落/图片/表格边界，
 * 因此「文档有几屏内容就生成几页 PDF」。
 * 纯客户端处理，零服务器负载；仅支持新版 .docx（旧版二进制 .doc 无法在浏览器解析）。
 */
import jsPDF from 'jspdf';
import { convertWordToImages } from './wordToImages';

export interface WordToPdfOptions {
  /** 清晰度（html2canvas scale，默认 2） */
  scale?: number;
  /** 页内图片 JPEG 质量（默认 0.95） */
  quality?: number;
}

export interface WordToPdfResult {
  blob: Blob;
  /** 生成的 PDF 页数 */
  pageCount: number;
}

/** 读取 dataURL 的像素尺寸 */
function getImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('页面图片加载失败'));
    img.src = dataUrl;
  });
}

/**
 * 将 docx 转换为多页 A4 PDF。
 * 每一「页」图片按 A4 纸宽等比铺放：满页内容铺满整页，不足一页的内容顶部对齐、
 * 底部留白（与 Word 末页观感一致）。
 * @param arrayBuffer docx 文件的 ArrayBuffer
 */
export async function convertWordToPdf(
  arrayBuffer: ArrayBuffer,
  opts: WordToPdfOptions = {}
): Promise<WordToPdfResult> {
  const { scale = 2, quality = 0.95 } = opts;

  // 1. 复用分页管线，拿到逐页图片（用 JPEG 控制 PDF 体积）
  const images = await convertWordToImages(arrayBuffer, {
    scale,
    format: 'image/jpeg',
    quality,
  });
  if (images.length === 0) {
    throw new Error('文档内容为空或无法解析');
  }

  // 2. 逐页塞进 A4 PDF
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < images.length; i++) {
    const dataUrl = images[i];
    const { width, height } = await getImageSize(dataUrl);

    // 默认按 A4 纸宽铺满、等比缩放
    let drawW = pageW;
    let drawH = (height / width) * drawW;
    // 极少数超长单块可能高于一页，改为按页高约束，水平居中
    if (drawH > pageH) {
      drawH = pageH;
      drawW = (width / height) * drawH;
    }
    const x = (pageW - drawW) / 2;

    if (i > 0) pdf.addPage();
    pdf.addImage(dataUrl, 'JPEG', x, 0, drawW, drawH);
  }

  return { blob: pdf.output('blob'), pageCount: images.length };
}
