/**
 * PDF 文本层提取与版面重建
 * 优先直接解析 operator list 重建逐段文本几何（内容流原生粒度，列起点不丢），
 * 解析失败时降级 getTextContent；再基于坐标 / 字号 / 字体信息重建「行 → 表格」结构：
 * 分栏检测 → 基线行聚类 → 词间空格推断 → 列对齐表格检测。
 * 纯客户端计算，供「PDF 转 Word（可编辑文本）」使用。
 */
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFPageProxy } from 'pdfjs-dist';
// Vite 以 URL 形式引入 worker，避免打包进主 bundle（与 pdfRender 共用同一实例，重复设置无害）
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/** 同一样式（字号 / 粗斜体 / 字体 / 颜色）的连续文字片段 */
export interface TextPiece {
  text: string;
  bold: boolean;
  italic: boolean;
  /** 字号（pt） */
  fontSize: number;
  /** PDF 原始字体名（如 "ABCDEE+SimSun" / "Helvetica-Bold"），供字体映射 */
  font: string;
  /** 文字颜色（RRGGBB，无 #，默认黑不设值） */
  color?: string;
}

/** pdfjs 文本项归一化后的最小单元（保留几何位置，供表格列分配） */
export interface RawItem {
  str: string;
  x: number;
  y: number;
  w: number;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  /** PDF 原始字体名 */
  font: string;
  /** 文字颜色（RRGGBB，无 #，默认黑不设值） */
  color?: string;
}

/** 重建出的一行文本（items 按 x 升序；文字片段在消费端合并） */
export interface ExtractedLine {
  items: RawItem[];
  /** 行起点 x（pt） */
  x: number;
  /** 行结束 x（pt） */
  endX: number;
  /** 基线 y（pt，自页面顶部向下） */
  y: number;
  /** 行主导字号（pt） */
  fontSize: number;
}

/** 检测出的表格：rows[行][列] = 单元格文字片段（空单元格为空数组） */
export interface ExtractedTable {
  rows: TextPiece[][][];
  /** 各列起点 x（pt），末位为最后一列右界（长度 = 列数 + 1） */
  colXs: number[];
}

export type LayoutBlock =
  | { kind: 'text'; line: ExtractedLine }
  | { kind: 'table'; table: ExtractedTable };

export interface ExtractedPage {
  pageNum: number;
  /** 页面宽（pt） */
  width: number;
  /** 页面高（pt） */
  height: number;
  blocks: LayoutBlock[];
}

/** 提取 PDF 全部页面的文本层并重建版面结构（无文本层的页面 blocks 为空） */
export async function extractPdfPages(
  data: ArrayBuffer,
  onProgress?: (done: number, total: number) => void
): Promise<ExtractedPage[]> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data) });
  const pdf = await loadingTask.promise;
  const pages: ExtractedPage[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    // operator list 双重作用：① 触发字体对象注册到 commonObjs（否则读不到原始字体名）；
    // ② 作为文本提取数据源 —— getTextContent 会把间隙 <= 0.6em 的相邻文本段合并成
    // 单 item（列起点丢失，紧凑表格无法识别），内容流原生粒度没有此问题
    const opList = await page.getOperatorList();
    let items: RawItem[];
    try {
      items = extractItemsFromOpList(opList, page, viewport.height);
    } catch {
      items = []; // 异常结构时降级
    }
    if (!items.length) {
      const content = await page.getTextContent();
      const fontStyles = collectFontStyles(page, content.styles);
      items = content.items.flatMap((item): RawItem[] => {
        if (!('str' in item) || !item.str.trim()) return []; // 跳过 marked-content / 纯空白项
        const tr = item.transform;
        // 水平文本的字号约等于变换矩阵纵向缩放，异常时退化为 bbox 高度
        const fs = Math.hypot(tr[2], tr[3]) || Math.hypot(tr[0], tr[1]) || item.height || 10;
        const style = fontStyles.get(item.fontName) || NO_STYLE;
        return [
          {
            str: item.str,
            x: tr[4],
            y: viewport.height - tr[5], // 基线 y：转为自页面顶部向下
            w: item.width || 0,
            fontSize: Math.round(fs * 2) / 2, // 半点粒度归整，抑制噪声
            bold: style.bold,
            italic: style.italic,
            font: style.font,
          },
        ];
      });
    }

    pages.push({
      pageNum: i,
      width: viewport.width,
      height: viewport.height,
      blocks: items.length ? rebuildLayout(items, viewport.width) : [],
    });
    page.cleanup();
    onProgress?.(i, pdf.numPages);
  }

  await loadingTask.destroy();
  return pages;
}

/** 字体样式信息（粗斜体 + 原始字体名） */
interface FontStyle {
  bold: boolean;
  italic: boolean;
  font: string;
}

const NO_STYLE: FontStyle = { bold: false, italic: false, font: '' };

/** 从字体对象池解析单个字体样式（原始字体名 → 粗斜体推断），未注册时退化为常规样式 */
function resolveFontStyle(page: PDFPageProxy, key: string): FontStyle {
  let name = '';
  try {
    // getOperatorList 后 FontFaceObject 已注册，原始名在 .name（兼容 .data.name 结构）
    const pool = page as unknown as {
      commonObjs: { get: (k: string) => { name?: string; data?: { name?: string } } | undefined };
    };
    const font = pool.commonObjs.get(key);
    name = String(font?.name ?? font?.data?.name ?? '');
  } catch {
    /* 字体对象尚未注册时忽略 */
  }
  return {
    bold: /bold|black|heavy|semib|[-,]bd\b/i.test(name),
    italic: /italic|oblique|[-,]it\b/i.test(name),
    font: name,
  };
}

/** 批量解析 getTextContent styles 的字体样式表 */
function collectFontStyles(page: PDFPageProxy, styles: Record<string, unknown>) {
  const map = new Map<string, FontStyle>();
  for (const key of Object.keys(styles)) map.set(key, resolveFontStyle(page, key));
  return map;
}

/** 版面重建：分栏 → 逐栏行聚类 → 全局列锚点 → 表格检测（左栏块先于右栏） */
function rebuildLayout(items: RawItem[], pageW: number): LayoutBlock[] {
  const blocks: LayoutBlock[] = [];
  for (const col of detectColumns(items, pageW)) {
    const colItems = items.filter((it) => it.x >= col.from && it.x < col.to);
    if (!colItems.length) continue;
    const lines = groupIntoLines(colItems);
    blocks.push(...detectTables(lines, globalAnchors(colItems, lines)));
  }
  return blocks;
}

/**
 * 分栏检测：在正文范围内寻找贯穿的空白竖带（左右内容量均足够），
 * 将页面切分为多栏；无法切分时返回单栏
 */
function detectColumns(items: RawItem[], pageW: number): { from: number; to: number }[] {
  const binCount = Math.max(2, Math.ceil(pageW));
  const bins = new Uint8Array(binCount);
  for (const it of items) {
    const s = Math.max(0, Math.floor(it.x));
    const e = Math.min(binCount - 1, Math.ceil(it.x + it.w));
    for (let b = s; b <= e; b++) bins[b] = 1;
  }

  // 只在正文范围（5% ~ 95% 页宽）内找零覆盖竖带
  const lo = Math.floor(pageW * 0.05);
  const hi = Math.ceil(pageW * 0.95);
  const gaps: { from: number; to: number }[] = [];
  let start = -1;
  for (let b = lo; b <= hi; b++) {
    if (!bins[b]) {
      if (start < 0) start = b;
    } else if (start >= 0) {
      gaps.push({ from: start, to: b - 1 });
      start = -1;
    }
  }
  if (start >= 0) gaps.push({ from: start, to: hi });

  const minGap = pageW * 0.06;
  const total = items.length;
  const cols: { from: number; to: number }[] = [];
  let prev = 0;
  for (const g of gaps) {
    if (g.to - g.from < minGap) continue;
    // 竖带两侧内容量都要足够，避免把居中标题 / 封面页误判为多栏
    const left = items.filter((it) => it.x < g.from).length;
    const right = items.filter((it) => it.x > g.to).length;
    if (Math.min(left, right) < Math.max(4, total * 0.15)) continue;
    cols.push({ from: prev, to: g.from });
    prev = g.to + 1;
  }
  cols.push({ from: prev, to: pageW });
  return cols.length > 1 ? cols : [{ from: 0, to: pageW }];
}

/** 按基线 y 聚类为行（容差可容纳上下标偏移，小于最小行距不会误合并） */
function groupIntoLines(items: RawItem[]): ExtractedLine[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const groups: RawItem[][] = [];
  for (const it of sorted) {
    const g = groups[groups.length - 1];
    const base = g?.[0];
    if (!base || Math.abs(it.y - base.y) > Math.max(1.5, Math.max(base.fontSize, it.fontSize) * 0.45)) {
      groups.push([it]);
    } else {
      g.push(it);
    }
  }
  return groups.map((g) => {
    const lineItems = [...g].sort((a, b) => a.x - b.x);
    return {
      items: lineItems,
      x: lineItems[0].x,
      endX: Math.max(...lineItems.map((it) => it.x + it.w)),
      y: g[0].y,
      fontSize: dominantFontSize(lineItems),
    };
  });
}

/**
 * 将 x 升序的文本项合并为样式连续的文字片段（按间隙推断词间空格）。
 * 延迟到消费端调用：普通行直接合并，表格单元格按列内子集合并
 */
export function mergeTextPieces(items: RawItem[]): TextPiece[] {
  if (!items.length) return [];
  const pieces: TextPiece[] = [];
  let text = '';
  let curFs = items[0].fontSize;
  let curBold = items[0].bold;
  let curItalic = items[0].italic;
  let curFont = items[0].font;
  let curColor = items[0].color;
  let prevEnd = items[0].x;

  const flush = () => {
    if (!text) return;
    pieces.push({ text, bold: curBold, italic: curItalic, fontSize: curFs, font: curFont, color: curColor });
    text = '';
  };

  for (const it of items) {
    // PDF 文本项通常不含词间空格，按间隙补齐
    const gap = it.x - prevEnd;
    if (text && gap > Math.max(1, Math.min(curFs, it.fontSize) * 0.22) && !text.endsWith(' ')) {
      text += ' ';
    }
    if (
      it.bold !== curBold ||
      it.italic !== curItalic ||
      Math.abs(it.fontSize - curFs) > 1 ||
      it.font !== curFont ||
      it.color !== curColor
    ) {
      flush();
      curFs = it.fontSize;
      curBold = it.bold;
      curItalic = it.italic;
      curFont = it.font;
      curColor = it.color;
    }
    text += it.str;
    prevEnd = it.x + it.w;
  }
  flush();
  return pieces;
}

/** 行主导字号：按字符数取众数 */
function dominantFontSize(items: RawItem[]): number {
  const counter = new Map<number, number>();
  for (const it of items) counter.set(it.fontSize, (counter.get(it.fontSize) || 0) + it.str.length);
  let best = items[0].fontSize;
  let bestCount = -1;
  for (const [fs, n] of counter) {
    if (n > bestCount) {
      best = fs;
      bestCount = n;
    }
  }
  return best;
}

/** 锚点对齐容差：随栏内平均字号缩放 */
function anchorTol(items: RawItem[]): number {
  const avgFs = items.reduce((s, it) => s + it.fontSize, 0) / Math.max(1, items.length);
  return Math.max(2.5, avgFs * 0.35);
}

/**
 * 全局列锚点：将栏内所有文本项起点 x 聚类，保留被 >= 2 个不同行命中的锚点。
 * 表格的本质特征是「多行内容在相同 x 位置起始」，与单元格间距大小无关
 */
function globalAnchors(items: RawItem[], lines: ExtractedLine[]): number[] {
  const tol = anchorTol(items);
  const xs = [...new Set(items.map((it) => Math.round(it.x)))].sort((a, b) => a - b);

  // 起点聚类（加权平均锚点位置）
  const clusters: { x: number; n: number }[] = [];
  for (const x of xs) {
    const last = clusters[clusters.length - 1];
    if (last && x - last.x <= tol) {
      last.x = (last.x * last.n + x) / (last.n + 1);
      last.n++;
    } else {
      clusters.push({ x, n: 1 });
    }
  }

  return clusters
    .filter((c) => lines.filter((l) => l.items.some((it) => Math.abs(it.x - c.x) <= tol)).length >= 2)
    .map((c) => Math.round(c.x));
}

/** 行命中的锚点下标集合（行内文本项起点落在锚点附近，去重） */
function hitAnchorSet(line: ExtractedLine, anchors: number[], tol: number): number[] {
  const hits = new Set<number>();
  for (const it of line.items) {
    for (let a = 0; a < anchors.length; a++) {
      if (Math.abs(it.x - anchors[a]) <= tol) {
        hits.add(a);
        break;
      }
    }
  }
  return [...hits];
}

/** 在行序列中识别连续列对齐的表格块，其余按普通文本行输出 */
function detectTables(lines: ExtractedLine[], anchors: number[]): LayoutBlock[] {
  if (anchors.length < 2) {
    return lines.map((line) => ({ kind: 'text' as const, line }));
  }
  const tol = anchorTol(lines.flatMap((l) => l.items));
  const blocks: LayoutBlock[] = [];

  let i = 0;
  while (i < lines.length) {
    const base = hitAnchorSet(lines[i], anchors, tol);
    if (base.length >= 2) {
      // 收集后续行：命中锚点须是表格锚点集的子集（允许空单元格）且不少于 2 个
      let j = i + 1;
      while (j < lines.length) {
        const hits = hitAnchorSet(lines[j], anchors, tol);
        if (hits.length >= 2 && hits.every((a) => base.includes(a))) j++;
        else break;
      }

      // 首列内容过窄（编号 / 项目符号列表）不视为表格
      if (j - i >= 2) {
        const group = lines.slice(i, j);
        const firstX = anchors[base[0]];
        const colItems = group.flatMap((l) => l.items.filter((it) => Math.abs(it.x - firstX) <= tol));
        const firstColW = Math.max(...colItems.map((it) => it.x + it.w)) - firstX;
        const maxFs = Math.max(...group.flatMap((l) => l.items.map((it) => it.fontSize)), 1);
        if (firstColW >= maxFs * 2.5) {
          blocks.push(buildTable(group, base.map((a) => anchors[a])));
          i = j;
          continue;
        }
      }
    }

    blocks.push({ kind: 'text', line: lines[i] });
    i++;
  }
  return blocks;
}

/** 将连续对齐的行组装为表格（item 按起点归属列，列边界取相邻锚点中点） */
function buildTable(lines: ExtractedLine[], colAnchors: number[]): LayoutBlock {
  const bounds: number[] = [];
  for (let k = 0; k + 1 < colAnchors.length; k++) bounds.push((colAnchors[k] + colAnchors[k + 1]) / 2);

  let lastEnd = colAnchors[colAnchors.length - 1];
  const rows: TextPiece[][][] = [];
  for (const line of lines) {
    const cells: RawItem[][] = colAnchors.map(() => []);
    for (const it of line.items) {
      // 起点落在哪一列（越过第 c 个列边界即属于第 c + 1 列）
      let c = 0;
      while (c < bounds.length && it.x >= bounds[c]) c++;
      cells[c].push(it);
      if (c === colAnchors.length - 1) lastEnd = Math.max(lastEnd, it.x + it.w);
    }
    rows.push(cells.map((cellItems) => mergeTextPieces(cellItems)));
  }

  return { kind: 'table', table: { rows, colXs: [...colAnchors, lastEnd] } };
}

/* ---------------- opList 逐段文本提取 ---------------- */

/** opList 中解码后的字形对象（worker 已完成 CID→Unicode 映射与宽度解码） */
interface OpGlyph {
  unicode?: string;
  width?: number;
  isSpace?: boolean;
}

/** PDF 变换矩阵 [a, b, c, d, e, f] */
type Matrix = [number, number, number, number, number, number];

const IDENT: Matrix = [1, 0, 0, 1, 0, 0];

/** PDF 矩阵乘法 m1·m2（先应用 m2 再 m1），语义与 pdf.js Util.transform 一致 */
function mul(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/** opList 矩阵参数兼容 Array / 类数组对象 / TypedArray */
function argMatrix(a: unknown): Matrix {
  const v = (i: number) => Number((a as Record<string, unknown>)[i] ?? 0);
  return [v(0), v(1), v(2), v(3), v(4), v(5)];
}

/**
 * 直接解析 operator list 重建每段文本的精确几何（PDF 文本状态机）。
 * 每次 showText / TJ 大位移拆分各成一个 RawItem —— 内容流原生粒度：
 * 列起点不会像 getTextContent 那样被小间隙合并吞掉，紧凑表格得以识别。
 * 覆盖文本矩阵、行定位、字距、字号、字体、图形状态栈及全部文本显示操作码
 */
function extractItemsFromOpList(
  opList: { fnArray: number[]; argsArray: unknown[] },
  page: PDFPageProxy,
  pageH: number
): RawItem[] {
  const O = pdfjsLib.OPS;
  const items: RawItem[] = [];
  const styleCache = new Map<string, FontStyle>();
  const styleFor = (id: string): FontStyle => {
    let s = styleCache.get(id);
    if (!s) {
      s = resolveFontStyle(page, id);
      styleCache.set(id, s);
    }
    return s;
  };

  // 图形状态（q/g 保存 CTM 与文本状态；Tm/Tlm 属文本对象状态，BT 时重置）
  let ctm: Matrix = IDENT;
  let tm: Matrix = IDENT;
  let tlm: Matrix = IDENT;
  let fontId = '';
  let fontSize = 10;
  let charSpace = 0;
  let wordSpace = 0;
  let hScale = 100;
  let leading = 0;
  let rise = 0;
  let fillColor = '';
  const gsStack: {
    ctm: Matrix;
    fontId: string;
    fontSize: number;
    charSpace: number;
    wordSpace: number;
    hScale: number;
    leading: number;
    rise: number;
    fillColor: string;
  }[] = [];

  // 当前累积段：同 BT 块内同字体、几何连续的字形串
  let segStr = '';
  let segM: Matrix = IDENT; // 段起始合成矩阵（线性部分段内恒定，仅 e/f 随推进变化）
  let segAdv = 0; // 文本空间累计推进
  let segTail = 0; // 末字形的 charSpace/wordSpace 尾巴（不计入段宽）

  const flushSeg = () => {
    const str = segStr;
    const adv = Math.max(0, segAdv - segTail);
    const color = fillColor;
    segStr = '';
    segAdv = 0;
    segTail = 0;
    if (!str.trim()) return;
    const style = styleFor(fontId);
    items.push({
      str,
      x: segM[4],
      y: pageH - (segM[5] + segM[3] * rise), // 基线（含 Ts 偏移），转为自顶部向下
      w: Math.abs(segM[0] * adv),
      fontSize: Math.round(Math.hypot(segM[2], segM[3]) * fontSize * 2) / 2,
      bold: style.bold,
      italic: style.italic,
      font: style.font,
      color: color || undefined,
    });
  };

  /** T*：行矩阵下移 leading，文本矩阵跟随 */
  const nextLineStart = () => {
    tlm = mul(tlm, [1, 0, 0, 1, 0, -leading]);
    tm = tlm;
  };

  /** 渲染一段字形数组（Tj / TJ 展开后的混合数组，number 为 TJ 位移），逐字形推进文本矩阵 */
  const showGlyphs = (glyphs: (OpGlyph | number)[]) => {
    for (const g of glyphs) {
      if (typeof g === 'number') {
        applyTjAdjust(g);
        continue;
      }
      const ch = typeof g?.unicode === 'string' ? g.unicode : '';
      if (!ch) continue; // 未映射字形（无 Unicode 映射）
      const space = g.isSpace === true || ch === ' ';
      if (!segStr) {
        segM = mul(ctm, tm);
        segAdv = 0;
        segTail = 0;
      }
      segStr += space ? ' ' : ch;
      const adv =
        ((g.width ?? 0) / 1000) * fontSize * (hScale / 100) +
        charSpace +
        (space ? wordSpace : 0);
      segTail = charSpace + (space ? wordSpace : 0);
      segAdv += adv;
      tm = mul(tm, [1, 0, 0, 1, adv, 0]);
    }
  };

  /** TJ 数值位移：小位移视为字距吸收，大位移（>0.22em，与词间空格推断阈值一致）拆段 */
  const applyTjAdjust = (num: number) => {
    const adv = -(num / 1000) * fontSize * (hScale / 100);
    const m = mul(ctm, tm);
    const fsEff = Math.hypot(m[2], m[3]) * fontSize;
    if (segStr && Math.abs(m[0] * adv) > Math.max(1, fsEff * 0.22)) flushSeg();
    tm = mul(tm, [1, 0, 0, 1, adv, 0]);
  };

  const { fnArray, argsArray } = opList;
  for (let k = 0; k < fnArray.length; k++) {
    const fn = fnArray[k];
    const args = (argsArray[k] ?? []) as unknown[];

    if (fn === O.showText) {
      showGlyphs(args[0] as (OpGlyph | number)[]);
    } else if (fn === O.showSpacedText) {
      // TJ 混合数组：number = 位移，字形子数组递归处理（新版 pdf.js 已展开进 showText，防御保留）
      for (const el of args[0] as (number | (OpGlyph | number)[])[]) {
        if (typeof el === 'number') applyTjAdjust(el);
        else showGlyphs(el);
      }
    } else if (fn === O.nextLineShowText) {
      flushSeg();
      nextLineStart();
      showGlyphs(args[0] as (OpGlyph | number)[]);
    } else if (fn === O.nextLineSetSpacingShowText) {
      flushSeg();
      wordSpace = Number(args[0]) || 0;
      charSpace = Number(args[1]) || 0;
      leading = Number(args[2]) || 0;
      nextLineStart();
      showGlyphs(args[3] as (OpGlyph | number)[]);
    } else if (fn === O.setTextMatrix) {
      flushSeg();
      tlm = argMatrix(args[0]);
      tm = tlm;
    } else if (fn === O.moveText) {
      flushSeg();
      tlm = mul(tlm, [1, 0, 0, 1, Number(args[0]) || 0, Number(args[1]) || 0]);
      tm = tlm;
    } else if (fn === O.setLeadingMoveText) {
      flushSeg();
      const tx = Number(args[0]) || 0;
      const ty = Number(args[1]) || 0;
      leading = -ty;
      tlm = mul(tlm, [1, 0, 0, 1, tx, ty]);
      tm = tlm;
    } else if (fn === O.nextLine) {
      flushSeg();
      nextLineStart();
    } else if (fn === O.beginText) {
      flushSeg();
      tm = IDENT;
      tlm = IDENT;
    } else if (fn === O.setFont) {
      flushSeg();
      fontId = String(args[0]);
      fontSize = Number(args[1]) || 10;
    } else if (fn === O.setCharSpacing) {
      flushSeg();
      charSpace = Number(args[0]) || 0;
    } else if (fn === O.setWordSpacing) {
      flushSeg();
      wordSpace = Number(args[0]) || 0;
    } else if (fn === O.setHScale) {
      flushSeg();
      hScale = Number(args[0]) || 100;
    } else if (fn === O.setTextRise) {
      flushSeg();
      rise = Number(args[0]) || 0;
    } else if (fn === O.setLeading) {
      leading = Number(args[0]) || 0;
    } else if (fn === O.save) {
      flushSeg();
      gsStack.push({ ctm, fontId, fontSize, charSpace, wordSpace, hScale, leading, rise, fillColor });
    } else if (fn === O.restore) {
      flushSeg(); // 先用当前状态结算段，再恢复图形状态
      const s = gsStack.pop();
      if (s) {
        ({ ctm, fontId, fontSize, charSpace, wordSpace, hScale, leading, rise, fillColor } = s);
      }
    } else if (fn === O.setFillRGBColor || fn === O.setFillGray || fn === O.setFillCMYKColor) {
      // 填充色（文字颜色）：pdf.js v6 编译为 CSS 十六进制字符串（如 "#ff0000"），
      // 兼容旧版 [r,g,b] 数字形态；变色前结算当前段，纯黑视为默认色不记录
      flushSeg();
      const a0 = args[0];
      if (typeof a0 === 'string' && /^#[0-9a-f]{6}$/i.test(a0)) {
        const hex = a0.slice(1).toUpperCase();
        fillColor = hex === '000000' ? '' : hex;
      } else {
        const nums = args.map((v) => Number(v) || 0);
        if (nums.length >= 3) {
          const hex = nums
            .slice(0, 3)
            .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'));
          fillColor = hex[0] === '00' && hex[1] === '00' && hex[2] === '00' ? '' : hex.join('').toUpperCase();
        }
      }
    } else if (fn === O.transform) {
      flushSeg();
      ctm = mul(ctm, argMatrix(args));
    }
  }
  flushSeg();

  // 同位置重复绘制（模拟粗体 / 阴影等技巧）去重
  const seen = new Set<string>();
  return items.filter((it) => {
    const key = `${Math.round(it.x)},${Math.round(it.y)},${it.str}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
