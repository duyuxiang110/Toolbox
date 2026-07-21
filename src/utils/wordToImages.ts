/**
 * Word（docx）转图片
 * 管线：mammoth 将 docx 解析为 HTML（图片自动内嵌为 base64）
 *       → 注入文档样式并在离屏容器渲染 → html2canvas 整篇截图
 *       → 按 A4 页高智能分页：切分点落在内容块（段落 / 图片 / 表格）边界，
 *         避免把任何内容切到一半（解决旧版"硬切导致一段一段"的问题）。
 * 纯客户端处理，零服务器负载。
 */
import mammoth from 'mammoth';
import html2canvas from 'html2canvas';

export interface WordToImagesOptions {
  /** 清晰度（html2canvas scale，默认 2） */
  scale?: number;
  /** 输出格式（默认 PNG） */
  format?: 'image/png' | 'image/jpeg';
  /** JPEG 质量（默认 0.92） */
  quality?: number;
}

/** 文档渲染宽度（px @96dpi，接近 A4 纸宽度） */
const PAGE_WIDTH = 794;
/** A4 高宽比（297 / 210） */
const PAGE_RATIO = 297 / 210;
/** 单页内容高度（px），用于分页 */
const PAGE_HEIGHT = Math.round(PAGE_WIDTH * PAGE_RATIO);

/** 文档渲染样式，尽量还原 Word 排版观感 */
const DOC_STYLE = `
.docx-render {
  font-family: -apple-system, "Segoe UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif;
  font-size: 14px; line-height: 1.75; color: #1a1a1a;
  padding: 50px 56px; box-sizing: border-box; width: 100%; word-wrap: break-word;
}
.docx-render p { margin: 0 0 10px; }
.docx-render h1 { font-size: 26px; font-weight: 700; margin: 18px 0 12px; }
.docx-render h2 { font-size: 21px; font-weight: 700; margin: 16px 0 10px; }
.docx-render h3 { font-size: 17px; font-weight: 600; margin: 14px 0 8px; }
.docx-render h4, .docx-render h5, .docx-render h6 { font-size: 15px; font-weight: 600; margin: 12px 0 8px; }
.docx-render ul, .docx-render ol { margin: 0 0 10px; padding-left: 26px; }
.docx-render li { margin: 2px 0; }
.docx-render img { max-width: 100%; height: auto; }
.docx-render table { border-collapse: collapse; width: 100%; margin: 10px 0; }
.docx-render td, .docx-render th { border: 1px solid #999; padding: 5px 9px; font-size: 13px; vertical-align: top; }
.docx-render strong { font-weight: 700; }
.docx-render em { font-style: italic; }
.docx-render a { color: #2563eb; text-decoration: underline; }
.docx-render blockquote { margin: 8px 0; padding-left: 12px; border-left: 3px solid #ccc; color: #555; }
`;

interface BlockRect {
  top: number;
  bottom: number;
}

/** 等待容器内所有图片加载完成，确保布局高度正确 */
function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  return Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve();
          img.onload = () => resolve();
          img.onerror = () => resolve();
        })
    )
  ).then(() => undefined);
}

/**
 * 智能分页：按页高切分，但切分点落在内容块边界，避免把块切到一半。
 * 若单个块本身超过一页高度，则只能强制按页高切分。
 * @returns 每页的 [startY, endY] 区间数组
 */
function paginate(contentHeight: number, blocks: BlockRect[], pageHeight: number): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let currentY = 0;

  while (currentY < contentHeight) {
    const idealBottom = currentY + pageHeight;

    // 剩余内容不足一页，直接作为最后一页
    if (idealBottom >= contentHeight) {
      ranges.push([currentY, contentHeight]);
      break;
    }

    let splitY = idealBottom; // 兜底：按页高强制切分
    for (const b of blocks) {
      if (b.bottom <= currentY) continue; // 块在当前页之上，跳过
      if (b.top >= idealBottom) break; // 块完全在下一页，停止

      if (b.bottom <= idealBottom) {
        // 块完整落在当前页内，切分点候选推进到该块底部
        splitY = b.bottom;
      } else {
        // b.top < idealBottom < b.bottom：该块被页底切断
        if (b.top > currentY) {
          // 把切分点上移到该块顶部，让整块放到下一页（不切断）
          splitY = b.top;
        } else {
          // 该块从当前页顶部开始且超过一页高，无法避免，强制按页高切
          splitY = idealBottom;
        }
        break;
      }
    }

    // 防止切分点不前进导致死循环
    if (splitY <= currentY) splitY = idealBottom;
    ranges.push([currentY, splitY]);
    currentY = splitY;
  }

  return ranges;
}

/** 从整篇大画布中裁剪出指定 Y 区间的单页画布 */
function cropCanvas(full: HTMLCanvasElement, startY: number, endY: number, scale: number): HTMLCanvasElement {
  const pageCanvas = document.createElement('canvas');
  pageCanvas.width = full.width;
  const h = Math.max(1, Math.round((endY - startY) * scale));
  pageCanvas.height = h;
  const ctx = pageCanvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
  const sy = Math.round(startY * scale);
  ctx.drawImage(full, 0, sy, full.width, h, 0, 0, full.width, h);
  return pageCanvas;
}

/**
 * 将 docx 文件转换为图片（dataURL 数组，每页一张）
 * 按 A4 页高智能分页，切分点落在内容块边界，不切断段落 / 图片 / 表格。
 * @param arrayBuffer docx 文件的 ArrayBuffer
 */
export async function convertWordToImages(
  arrayBuffer: ArrayBuffer,
  opts: WordToImagesOptions = {}
): Promise<string[]> {
  const { scale = 2, format = 'image/png', quality = 0.92 } = opts;

  // 1. docx → HTML
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
  if (!html || !html.trim()) {
    throw new Error('文档内容为空或无法解析');
  }

  // 2. 离屏渲染容器（fixed 定位到屏幕外，保证有布局但不影响界面）
  const container = document.createElement('div');
  container.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_WIDTH}px;background:#fff;`;
  container.innerHTML = `<style>${DOC_STYLE}</style><div class="docx-render">${html}</div>`;
  document.body.appendChild(container);

  try {
    const target = container.querySelector('.docx-render') as HTMLElement;

    // 3. 等待图片加载完成，确保测量到真实布局高度
    await waitForImages(target);

    // 4. 测量每个顶层内容块的位置（用于智能分页）
    const targetTop = target.getBoundingClientRect().top;
    const blocks: BlockRect[] = Array.from(target.children).map((el) => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      return { top: rect.top - targetTop, bottom: rect.bottom - targetTop };
    });
    const contentHeight = target.scrollHeight;

    // 5. html2canvas 整篇截图
    const full = await html2canvas(target, {
      scale,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });

    // 6. 智能分页并裁剪
    const ranges = paginate(contentHeight, blocks, PAGE_HEIGHT);
    if (ranges.length <= 1) {
      return [full.toDataURL(format, quality)];
    }
    return ranges.map(([startY, endY]) => cropCanvas(full, startY, endY, scale).toDataURL(format, quality));
  } finally {
    document.body.removeChild(container);
  }
}
