/**
 * PDF 转 Word（可编辑文本）文档构建
 * 将 pdfTextExtract 重建出的行 / 表格结构生成可编辑的 docx 文档：
 * 文本行 → Paragraph（字号 / 粗斜体 / 缩进 / 居中还原），表格 → Table（固定列宽 + 细边框）。
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import {
  mergeTextPieces,
  type ExtractedLine,
  type ExtractedPage,
  type ExtractedTable,
  type TextPiece,
} from './pdfTextExtract';

/** 1pt = 20 twips（docx 尺寸单位） */
const TWIPS_PER_PT = 20;
/** 最小字号 7pt（半点单位 14），防止异常小字号不可读 */
const MIN_HALF_POINTS = 14;

/**
 * PDF 原始字体名 → Word 字体（中文 / 西文分别映射）。
 * 未识别时中文字体退化为宋体、西文退化为 Calibri，保证可编辑性
 */
function mapFont(raw: string): { ascii: string; eastAsia: string } {
  // 去除子集前缀（如 "ABCDEE+"），统一小写匹配
  const r = raw.toLowerCase().replace(/^[a-z]{6}\+/, '');
  if (/simsun|宋|stsong|stzhongsong|mingliu|songti|song/.test(r)) {
    return { eastAsia: '宋体', ascii: 'Times New Roman' };
  }
  if (/simhei|黑|heiti|hei[^l]|hei$/.test(r)) {
    return { eastAsia: '黑体', ascii: 'Arial' };
  }
  if (/yahei|雅黑/.test(r)) {
    return { eastAsia: '微软雅黑', ascii: 'Arial' };
  }
  if (/kaiti|楷|kai/.test(r)) {
    return { eastAsia: '楷体', ascii: 'Times New Roman' };
  }
  if (/fangsong|仿宋|stfangsong/.test(r)) {
    return { eastAsia: '仿宋', ascii: 'Times New Roman' };
  }
  if (/pingfang|苹方/.test(r)) {
    return { eastAsia: '苹方', ascii: 'Helvetica Neue' };
  }
  if (/times|roman|georgia|garamond|palatino|book/.test(r)) {
    return { eastAsia: '宋体', ascii: 'Times New Roman' };
  }
  if (/helvetica|arial|verdana|tahoma|segoe/.test(r)) {
    return { eastAsia: '宋体', ascii: 'Arial' };
  }
  if (/calibri|carlito/.test(r)) {
    return { eastAsia: '宋体', ascii: 'Calibri' };
  }
  if (/courier|mono|consol/.test(r)) {
    return { eastAsia: '宋体', ascii: 'Courier New' };
  }
  return { eastAsia: '宋体', ascii: 'Calibri' };
}

/** 文本片段 → docx TextRun（还原字号 / 粗斜体 / 字体 / 颜色） */
function pieceToRun(p: TextPiece): TextRun {
  const { ascii, eastAsia } = mapFont(p.font);
  return new TextRun({
    text: p.text,
    bold: p.bold,
    italics: p.italic,
    size: Math.max(MIN_HALF_POINTS, Math.round(p.fontSize * 2)),
    font: { ascii, eastAsia, hAnsi: ascii },
    color: p.color,
  });
}

/** 居中检测：行中心接近正文中心且两侧留白明显，否则按左对齐 */
function detectAlignment(line: ExtractedLine, leftX: number, rightX: number) {
  const width = rightX - leftX;
  const center = leftX + width / 2;
  const lineCenter = (line.x + line.endX) / 2;
  if (
    Math.abs(lineCenter - center) < width * 0.03 &&
    line.x - leftX > width * 0.04 &&
    rightX - line.endX > width * 0.04
  ) {
    return AlignmentType.CENTER;
  }
  return AlignmentType.LEFT;
}

/** 文本行 → docx Paragraph（保留段首缩进，紧凑行距贴近原版面） */
function lineToParagraph(line: ExtractedLine, leftX: number, rightX: number): Paragraph {
  return new Paragraph({
    children: mergeTextPieces(line.items).map(pieceToRun),
    alignment: detectAlignment(line, leftX, rightX),
    indent: { left: Math.max(0, Math.round((line.x - leftX) * TWIPS_PER_PT)) },
    spacing: { line: 240, after: 40 },
  });
}

/** 细灰线边框（Word 中表格识别更直观） */
function thinBorders() {
  const line = { style: BorderStyle.SINGLE, size: 4, color: 'A6A6A6' };
  return {
    top: line,
    bottom: line,
    left: line,
    right: line,
    insideHorizontal: line,
    insideVertical: line,
  };
}

/** 检测出的表格 → docx Table（固定列宽 + 细边框，贴近原始版面） */
function tableToDocx(t: ExtractedTable): Table {
  const colWidths: number[] = [];
  for (let k = 0; k + 1 < t.colXs.length; k++) {
    colWidths.push(Math.max(300, Math.round((t.colXs[k + 1] - t.colXs[k]) * TWIPS_PER_PT)));
  }

  const rows = t.rows.map(
    (cells) =>
      new TableRow({
        children: cells.map(
          (pieces) =>
            new TableCell({
              children: pieces.length
                ? [new Paragraph({ children: pieces.map(pieceToRun), spacing: { after: 0 } })]
                : [new Paragraph('')],
            })
        ),
      })
  );

  return new Table({
    width: { size: colWidths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: colWidths,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    borders: thinBorders(),
    rows,
  });
}

/** 统计全文正文水平范围（pt），用于页边距与对齐基准 */
function contentRange(pages: ExtractedPage[]): { leftX: number; rightX: number } {
  let leftX = Infinity;
  let rightX = -Infinity;
  for (const p of pages) {
    for (const b of p.blocks) {
      if (b.kind === 'text') {
        leftX = Math.min(leftX, b.line.x);
        rightX = Math.max(rightX, b.line.endX);
      } else {
        leftX = Math.min(leftX, b.table.colXs[0]);
        rightX = Math.max(rightX, b.table.colXs[b.table.colXs.length - 1]);
      }
    }
  }
  // 全部为空页时兜底 2cm 边距
  if (!Number.isFinite(leftX)) {
    return { leftX: 56.7, rightX: (pages[0]?.width ?? 595) - 56.7 };
  }
  return { leftX, rightX };
}

/**
 * 将提取的页面结构构建为 docx 文档
 * 页面尺寸 / 方向取第一页；内容连续排布（不强制分页），便于后续编辑
 */
export function buildWordDocument(pages: ExtractedPage[], title: string): Document {
  const first = pages[0];
  const landscape = first.width > first.height;
  // docx 库在 LANDSCAPE 时会自动交换宽高，这里统一传纵向值
  const pageW = Math.min(first.width, first.height);
  const pageH = Math.max(first.width, first.height);
  const readW = first.width; // 阅读方向的实际页宽

  const { leftX, rightX } = contentRange(pages);
  // 页边距按正文范围贴边，限制在 [0.25in, 25% 页宽]
  const clampTwips = (pt: number) =>
    Math.min(
      Math.max(Math.round(pt * TWIPS_PER_PT), 360),
      Math.round(readW * 0.25 * TWIPS_PER_PT)
    );

  const children: (Paragraph | Table)[] = [];
  for (const p of pages) {
    if (!p.blocks.length) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `【第 ${p.pageNum} 页无可提取文本（可能为扫描图片页）】`,
              italics: true,
              color: '999999',
              size: 18,
            }),
          ],
          spacing: { before: 120, after: 120 },
        })
      );
      continue;
    }
    for (const b of p.blocks) {
      if (b.kind === 'text') {
        children.push(lineToParagraph(b.line, leftX, rightX));
      } else {
        children.push(tableToDocx(b.table));
        // 相邻表格在 Word 中会自动合并，插入空段分隔
        children.push(new Paragraph({ spacing: { after: 80 } }));
      }
    }
  }

  return new Document({
    creator: 'SSO 工具箱',
    title,
    sections: [
      {
        properties: {
          page: {
            size: {
              width: Math.round(pageW * TWIPS_PER_PT),
              height: Math.round(pageH * TWIPS_PER_PT),
              orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin: {
              top: 720,
              bottom: 720,
              left: clampTwips(leftX),
              right: clampTwips(readW - rightX),
            },
          },
        },
        children,
      },
    ],
  });
}
