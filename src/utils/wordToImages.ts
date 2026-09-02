/**
 * Word（docx）转图片
 * 管线：mammoth 将 docx 解析为 HTML（图片自动内嵌为 base64）
 *       → 注入文档样式并在屏幕内隐藏容器渲染 → 按 A4 页高智能分页，
 *         切分点落在内容块（段落 / 图片 / 表格）边界，避免把内容切到一半
 *       → 每页用独立的「页窗口」（固定页高 + overflow:hidden + 负 margin 偏移）
 *         单独 html2canvas 截图，避免一次性超长画布被浏览器截断。
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
/** 切分点允许低于页底的最大距离：块边界落在此范围内才作为切分点，
 *  否则宁可切断块也要贴近 A4 页高，避免把多个 Word 页合并成一张长图 */
const SPLIT_TOLERANCE = PAGE_HEIGHT * 0.22;
/** 页面最小填充比例：切分点上移/后移后页面不能太空，否则宁可切断块贴近页高 */
const MIN_PAGE_FILL = 0.6;

/** 文档渲染样式，尽量还原 Word 排版观感 */
const DOC_STYLE = `
.docx-render {
  font-family: -apple-system, "Segoe UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif;
  font-size: 16px; line-height: 2; color: #1a1a1a;
  padding: 72px 64px; box-sizing: border-box; width: 100%; word-wrap: break-word;
}
.docx-render p { margin: 0 0 12px; }
.docx-render p:empty { min-height: 1em; }
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
 * 区间连续无间隙：splitY 始终等于某个块的边界或 currentY + pageHeight。
 * @returns 每页的 [startY, endY] 区间数组（相对文档内容顶部）
 */
function paginate(contentHeight: number, blocks: BlockRect[], pageHeight: number): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let currentY = 0;

  while (currentY < contentHeight) {
    const idealBottom = currentY + pageHeight;

    // 剩余内容不足一页，直接作为最后一页（用实际内容高度，避免尾页大片空白）
    if (idealBottom >= contentHeight) {
      ranges.push([currentY, contentHeight]);
      break;
    }

    // lastSafe：已完整落在本页内的块的底部，作为优先切分候选，避免块间空白被漏掉
    let splitY = currentY;
    let lastSafe = currentY;
    for (const b of blocks) {
      if (b.bottom <= currentY) continue; // 块在当前页之上，跳过
      if (b.top >= idealBottom) break; // 块完全在下一页，停止
      if (b.bottom <= idealBottom) {
        // 块完整落在当前页内；仅当底部贴近页底时才作为切分候选，
        // 否则继续看后面的块，防止页面过短、把多个 Word 页合并成一张长图
        if (idealBottom - b.bottom <= SPLIT_TOLERANCE) {
          lastSafe = Math.max(lastSafe, b.bottom);
        }
        continue;
      }
      // b.top < idealBottom < b.bottom：该块被页底切断
      if (b.top > currentY && b.top - currentY >= MIN_PAGE_FILL * pageHeight) {
        // 块开始位置已深入本页，把切分点上移到该块顶部，让整块放到下一页（不切断）
        splitY = b.top;
      } else if (lastSafe > currentY) {
        // 否则切在上一个贴近页底的完整块底部（不切任何块）
        splitY = lastSafe;
      } else {
        // 页内只有这一个超大块，无法避免，强制按页高切
        splitY = idealBottom;
      }
      break;
    }
    // 没有任何块被切断（页底落在块间空白中）：用最后一个完整块的底部，
    // 若页内没有完整块则按页高切，保证进度前进
    if (splitY <= currentY) splitY = lastSafe > currentY ? lastSafe : idealBottom;
    ranges.push([currentY, splitY]);
    currentY = splitY;
  }

  return ranges;
}

/**
 * 渲染单个页面切片：用「页窗口」包裹文档副本，负 margin 把内容上移，
 * overflow:hidden 只露出该页区间。窗口在文档流内、位于可视区，
 * html2canvas 截图稳定，不会像离屏/超长画布那样被浏览器截断。
 */
function renderSlice(target: HTMLElement, startY: number, endY: number): HTMLElement {
  const pageHeight = endY - startY;
  const windowEl = document.createElement('div');
  windowEl.style.cssText = `position:relative;width:${PAGE_WIDTH}px;height:${pageHeight}px;overflow:hidden;background:#fff;`;
  const clone = target.cloneNode(true) as HTMLElement;
  clone.style.marginTop = `-${startY}px`;
  windowEl.appendChild(clone);
  document.body.appendChild(windowEl);
  return windowEl;
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

  // 2. 屏幕内渲染容器（放在文档流内，避免离屏定位导致 html2canvas 截断）
  const container = document.createElement('div');
  container.style.cssText = `position:relative;width:${PAGE_WIDTH}px;background:#fff;z-index:-1;`;
  container.innerHTML = `<style>${DOC_STYLE}</style><div class="docx-render">${html}</div>`;
  document.body.appendChild(container);

  const prevScrollX = window.scrollX;
  const prevScrollY = window.scrollY;
  const sliceWindows: HTMLElement[] = [];

  try {
    const target = container.querySelector('.docx-render') as HTMLElement;

    // 3. 等待图片加载完成，确保测量到真实布局高度；容器在文档流内会撑高页面，先滚到顶部避免干扰测量与截图
    await waitForImages(target);
    window.scrollTo(0, 0);

    // 4. 测量每个顶层内容块的位置（用于智能分页）
    const targetTop = target.getBoundingClientRect().top;
    const blocks: BlockRect[] = Array.from(target.children).map((el) => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      return { top: rect.top - targetTop, bottom: rect.bottom - targetTop };
    });
    const contentHeight = target.scrollHeight;

    // 5. 智能分页
    const ranges = paginate(contentHeight, blocks, PAGE_HEIGHT);

    // 6. 逐页渲染：每页一个固定页高的窗口，单独截图，避免超长画布被截断丢页
    const dataUrls: string[] = [];
    for (const [startY, endY] of ranges) {
      const win = renderSlice(target, startY, endY);
      sliceWindows.push(win);
      const canvas = await html2canvas(win, {
        scale,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        windowWidth: PAGE_WIDTH,
      });
      dataUrls.push(canvas.toDataURL(format, quality));
    }
    return dataUrls;
  } finally {
    sliceWindows.forEach((w) => w.remove());
    container.remove();
    window.scrollTo(prevScrollX, prevScrollY);
  }
}
