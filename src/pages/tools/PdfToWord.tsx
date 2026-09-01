/**
 * PDF 转 Word 工具
 * 两种模式：
 * - 可编辑文本：提取 PDF 文本层，重建为可编辑的文字段落与表格（pdfTextExtract + docx）
 * - 图片还原：将 PDF 每一页渲染为高清图片逐页写入 Word，版面还原度极高
 * 纯客户端处理：pdfjs-dist + docx。
 */
import { useMemo, useState } from 'react';
import { Upload, Button, Empty, App, Radio, Tooltip } from 'antd';
import {
  ArrowLeftOutlined,
  InboxOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  FileTextOutlined,
  TableOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { Document, Packer, Paragraph, ImageRun, PageOrientation } from 'docx';
import moment from 'moment';
import { renderPdfPages, readFileAsArrayBuffer, type RenderedPage } from '../../utils/pdfRender';
import {
  extractPdfPages,
  mergeTextPieces,
  type ExtractedPage,
} from '../../utils/pdfTextExtract';
import { buildWordDocument } from '../../utils/pdfToWordDoc';
import { formatBytes, downloadBlob, dataUrlToUint8Array } from '../../utils/imageOps';
import SortableGrid from '../../components/SortableGrid/SortableGrid';
import './convert.less';

const { Dragger } = Upload;
const MAX_SIZE = 50 * 1024 * 1024; // 50M

// 转换模式：可编辑文本（默认） / 图片还原
type ConvertMode = 'text' | 'image';
const MODE_OPTIONS = [
  { value: 'text', label: '可编辑文本' },
  { value: 'image', label: '图片还原' },
];

// 清晰度档位 → 渲染缩放倍数（仅图片还原模式）
const QUALITY_OPTIONS = [
  { value: 1.5, label: '标准' },
  { value: 2, label: '高清' },
  { value: 3, label: '超清' },
];

// 页面基准宽度（英寸，约 A4 短边）
const PAGE_REF_INCH = 8.27;
const TWIPS_PER_INCH = 1440;
const PX_PER_INCH = 96;

interface PdfToWordProps {
  onBack: () => void;
}

export default function PdfToWord({ onBack }: PdfToWordProps) {
  const { message } = App.useApp();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<ConvertMode>('text');
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [extracted, setExtracted] = useState<ExtractedPage[] | null>(null);
  const [quality, setQuality] = useState(2);
  const [rendering, setRendering] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');

  // 文本模式统计（文本行 / 表格数 / 预览片段）
  const textStats = useMemo(() => {
    if (!extracted) return null;
    let lines = 0;
    let tables = 0;
    const previews: string[] = [];
    for (const p of extracted) {
      for (const b of p.blocks) {
        if (b.kind === 'table') {
          tables++;
        } else {
          lines++;
          if (previews.length < 24) {
            const t = mergeTextPieces(b.line.items)
              .map((pc) => pc.text)
              .join('')
              .trim();
            if (t) previews.push(t.length > 80 ? t.slice(0, 80) + '…' : t);
          }
        }
      }
    }
    return { lines, tables, previews, total: lines + tables };
  }, [extracted]);

  const renderPages = async (f: File, scale: number) => {
    setRendering(true);
    setProgress('正在解析 PDF…');
    try {
      const buffer = await readFileAsArrayBuffer(f);
      const rendered = await renderPdfPages(buffer, {
        scale,
        format: 'image/jpeg',
        quality: 0.92,
        onProgress: (done, total) => setProgress(`正在渲染页面 ${done}/${total}`),
      });
      setPages(rendered);
    } catch (err: any) {
      message.error('PDF 解析失败：' + (err?.message || '未知错误'));
      setPages([]);
    } finally {
      setRendering(false);
      setProgress('');
    }
  };

  // 提取文本层（文本模式）
  const extractText = async (f: File) => {
    setExtracting(true);
    setProgress('正在解析 PDF…');
    try {
      const buffer = await readFileAsArrayBuffer(f);
      const result = await extractPdfPages(buffer, (done, total) =>
        setProgress(`正在提取文本 ${done}/${total}`)
      );
      setExtracted(result);
      const hasContent = result.some((p) => p.blocks.length > 0);
      if (!hasContent) {
        message.warning('未检测到文本层（可能是扫描件），建议改用「图片还原」模式或 OCR 工具');
      }
    } catch (err: any) {
      message.error('PDF 解析失败：' + (err?.message || '未知错误'));
      setExtracted(null);
    } finally {
      setExtracting(false);
      setProgress('');
    }
  };

  const handleBeforeUpload = async (f: File) => {
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      message.error('请上传 PDF 文件');
      return Upload.LIST_IGNORE;
    }
    if (f.size > MAX_SIZE) {
      message.error(`文件超过 50M 限制（当前 ${formatBytes(f.size)}）`);
      return Upload.LIST_IGNORE;
    }
    setFile(f);
    setPages([]);
    setExtracted(null);
    if (mode === 'text') await extractText(f);
    else await renderPages(f, quality);
    return Upload.LIST_IGNORE;
  };

  const handleModeChange = (m: ConvertMode) => {
    if (m === mode) return;
    setMode(m);
    setPages([]);
    setExtracted(null);
    if (!file) return;
    if (m === 'text') extractText(file);
    else renderPages(file, quality);
  };

  const handleQualityChange = (val: number) => {
    setQuality(val);
    if (file && mode === 'image') renderPages(file, val);
  };

  const handleClear = () => {
    setFile(null);
    setPages([]);
    setExtracted(null);
  };

  // 当前模式的页数（用于信息条展示）
  const pageCount = mode === 'text' ? extracted?.length ?? 0 : pages.length;

  // 生成 Word
  const handleGenerate = async () => {
    const baseName = file?.name?.replace(/\.pdf$/i, '') || 'PDF转Word';
    const stamp = moment().format('YYYYMMDD_HHmmss');
    setGenerating(true);
    try {
      // ---- 可编辑文本模式：文本层 → 段落 / 表格 ----
      if (mode === 'text') {
        if (!file) {
          message.warning('请先上传 PDF');
          return;
        }
        if (textStats && textStats.total === 0) {
          message.warning('未检测到文本层，请改用「图片还原」模式或 OCR 工具');
          return;
        }
        let data = extracted;
        if (!data) {
          const buffer = await readFileAsArrayBuffer(file);
          data = await extractPdfPages(buffer);
        }
        const doc = buildWordDocument(data, baseName);
        const blob = await Packer.toBlob(doc);
        downloadBlob(blob, `${baseName}_可编辑_${stamp}.docx`);
        message.success('已导出 Word（可编辑文本）');
        return;
      }

      // ---- 图片还原模式：每页一张全页图片 ----
      if (pages.length === 0) {
        message.warning('请先上传 PDF');
        return;
      }
      const sections = pages.map((pg) => {
        const ratio = pg.height / pg.width;
        let pageWInch: number;
        let pageHInch: number;
        let orientation: (typeof PageOrientation)[keyof typeof PageOrientation];
        if (pg.width >= pg.height) {
          // 横向页面
          pageWInch = PAGE_REF_INCH / ratio;
          pageHInch = PAGE_REF_INCH;
          orientation = PageOrientation.LANDSCAPE;
        } else {
          pageWInch = PAGE_REF_INCH;
          pageHInch = PAGE_REF_INCH * ratio;
          orientation = PageOrientation.PORTRAIT;
        }

        return {
          properties: {
            page: {
              size: {
                width: Math.round(pageWInch * TWIPS_PER_INCH),
                height: Math.round(pageHInch * TWIPS_PER_INCH),
                orientation,
              },
              margin: { top: 0, right: 0, bottom: 0, left: 0 },
            },
          },
          children: [
            new Paragraph({
              children: [
                new ImageRun({
                  type: 'jpg',
                  data: dataUrlToUint8Array(pg.dataUrl),
                  transformation: {
                    width: Math.round(pageWInch * PX_PER_INCH),
                    height: Math.round(pageHInch * PX_PER_INCH),
                  },
                }),
              ],
            }),
          ],
        };
      });

      const doc = new Document({
        creator: 'SSO 工具箱',
        title: file?.name?.replace(/\.pdf$/i, '') || 'PDF 转 Word',
        sections,
      });

      const blob = await Packer.toBlob(doc);
      downloadBlob(blob, `${baseName}_${stamp}.docx`);
      message.success(`已导出 Word（共 ${pages.length} 页）`);
    } catch (err: any) {
      message.error('生成失败：' + (err?.message || '未知错误'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="convert-tool">
      <div className="convert-toolbar">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack}>
          返回工具箱
        </Button>
        <div className="convert-toolbar-right">
          {file && (
            <Button icon={<DeleteOutlined />} onClick={handleClear}>
              重新选择
            </Button>
          )}
          <Button
            type="primary"
            icon={<FileWordOutlined />}
            loading={generating}
            disabled={
              mode === 'text' ? !extracted || extracting : pages.length === 0 || rendering
            }
            onClick={handleGenerate}
          >
            {mode === 'text' ? '导出 Word（可编辑）' : `导出 Word（${pages.length} 页图片）`}
          </Button>
        </div>
      </div>

      <div className="convert-body">
        {!file ? (
          <Dragger
            accept="application/pdf,.pdf"
            showUploadList={false}
            beforeUpload={handleBeforeUpload}
            className="convert-uploader"
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽 PDF 文件到此处</p>
            <p className="ant-upload-hint">
              提取文本层生成可编辑 Word（文字 / 表格），或将每页高清还原为图片，单个文件不超过 50M
            </p>
          </Dragger>
        ) : (
          <>
            <div className="convert-fileinfo">
              <FilePdfOutlined className="fi-icon" />
              <Tooltip title={file.name}>
                <span className="fi-name">{file.name}</span>
              </Tooltip>
              <span className="fi-meta">
                {formatBytes(file.size)}
                {pageCount > 0 ? ` · ${pageCount} 页` : ''}
              </span>
            </div>

            <div className="convert-options">
              <div className="opt-item">
                <span className="opt-label">转换模式</span>
                <Radio.Group
                  value={mode}
                  onChange={(e) => handleModeChange(e.target.value as ConvertMode)}
                  optionType="button"
                  buttonStyle="solid"
                  disabled={rendering || extracting}
                  options={MODE_OPTIONS}
                />
              </div>
              {mode === 'image' && (
                <div className="opt-item">
                  <span className="opt-label">清晰度</span>
                  <Radio.Group
                    value={quality}
                    onChange={(e) => handleQualityChange(e.target.value)}
                    optionType="button"
                    buttonStyle="solid"
                    disabled={rendering}
                    options={QUALITY_OPTIONS}
                  />
                </div>
              )}
              {mode === 'text' ? (
                <>
                  <span className="opt-label">
                    提取 PDF 文本层，生成可编辑的文字与表格（扫描件请改用图片还原或 OCR）
                  </span>
                  {textStats && textStats.total > 0 && (
                    <span className="opt-label opt-tip">
                      已提取 {textStats.lines} 行文本 · {textStats.tables} 个表格
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="opt-label">页面以图片形式还原，排版与原 PDF 完全一致</span>
                  <span className="opt-label opt-tip">提示：可拖拽页面卡片调整顺序，导出将按新顺序生成</span>
                </>
              )}
            </div>
          </>
        )}

        <div className="convert-preview">
          {rendering || extracting ? (
            <Empty description={progress || '处理中…'} className="convert-empty" />
          ) : mode === 'text' ? (
            textStats && textStats.total > 0 ? (
              <div className="ptw-report">
                <div className="ptw-report-bar">
                  <FileTextOutlined />
                  共 {extracted?.length ?? 0} 页 · {textStats.lines} 行文本 · {textStats.tables}{' '}
                  个表格，导出后均为可编辑内容
                </div>
                <div className="ptw-report-lines">
                  {textStats.previews.map((t, i) => (
                    <div key={i} className="ptw-report-line">
                      {t}
                    </div>
                  ))}
                  {textStats.lines > textStats.previews.length && (
                    <div className="ptw-report-more">
                      <TableOutlined /> 其余 {textStats.lines - textStats.previews.length}{' '}
                      行内容将在导出的 Word 中呈现
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <Empty
                description="未检测到文本层（可能是扫描件），请改用「图片还原」模式或 OCR 工具"
                className="convert-empty"
              />
            )
          ) : pages.length === 0 ? (
            <Empty description="暂无可转换的页面" className="convert-empty" />
          ) : (
            <SortableGrid
              items={pages}
              getId={(pg) => pg.pageNum}
              onReorder={setPages}
              disabled={rendering}
              renderContent={(pg, index) => (
                <>
                  <div className="cc-img-wrap">
                    <img
                      src={pg.dataUrl}
                      alt={`第 ${index + 1} 页`}
                      className="cc-img"
                      draggable={false}
                    />
                  </div>
                  <div className="cc-footer">
                    {pg.width}×{pg.height}
                  </div>
                </>
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
}
