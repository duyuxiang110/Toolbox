/**
 * PDF 转 Word 工具
 * 将 PDF 每一页渲染为高清图片，逐页写入 Word 文档（每页一张全页图片，
 * 页面尺寸自动匹配 PDF 页面比例，还原度极高）。
 * 纯客户端处理：pdfjs-dist 渲染 + docx 生成。
 */
import { useState } from 'react';
import { Upload, Button, Empty, App, Radio, Tooltip } from 'antd';
import {
  ArrowLeftOutlined,
  InboxOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { Document, Packer, Paragraph, ImageRun, PageOrientation } from 'docx';
import moment from 'moment';
import { renderPdfPages, readFileAsArrayBuffer, type RenderedPage } from '../../utils/pdfRender';
import { formatBytes, downloadBlob, dataUrlToUint8Array } from '../../utils/imageOps';
import SortableGrid from '../../components/SortableGrid/SortableGrid';
import './convert.less';

const { Dragger } = Upload;
const MAX_SIZE = 50 * 1024 * 1024; // 50M

// 清晰度档位 → 渲染缩放倍数
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
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [quality, setQuality] = useState(2);
  const [rendering, setRendering] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');

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
    await renderPages(f, quality);
    return Upload.LIST_IGNORE;
  };

  const handleQualityChange = (val: number) => {
    setQuality(val);
    if (file) renderPages(file, val);
  };

  const handleClear = () => {
    setFile(null);
    setPages([]);
  };

  // 生成 Word
  const handleGenerate = async () => {
    if (pages.length === 0) {
      message.warning('请先上传 PDF');
      return;
    }
    setGenerating(true);
    try {
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
      const baseName = file?.name?.replace(/\.pdf$/i, '') || 'PDF转Word';
      downloadBlob(blob, `${baseName}_${moment().format('YYYYMMDD_HHmmss')}.docx`);
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
            disabled={pages.length === 0 || rendering}
            onClick={handleGenerate}
          >
            导出 Word{pages.length > 0 ? `（${pages.length} 页）` : ''}
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
            <p className="ant-upload-hint">将 PDF 每一页高清还原为 Word 页面，单个文件不超过 50M</p>
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
                {pages.length > 0 ? ` · ${pages.length} 页` : ''}
              </span>
            </div>

            <div className="convert-options">
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
              <span className="opt-label">页面以图片形式还原，排版与原 PDF 完全一致</span>
              <span className="opt-label opt-tip">提示：可拖拽页面卡片调整顺序，导出将按新顺序生成</span>
            </div>
          </>
        )}

        <div className="convert-preview">
          {rendering ? (
            <Empty description={progress || '处理中…'} className="convert-empty" />
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
