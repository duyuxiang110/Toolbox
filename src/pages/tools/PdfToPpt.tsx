/**
 * PDF 转 PPT 工具
 * 将 PDF 每一页渲染为高清图片，逐页放入 PPT 幻灯片（每页一张幻灯片）。
 * 纯客户端处理：pdfjs-dist 渲染 + pptxgenjs 生成。
 */
import { useState } from 'react';
import { Upload, Button, Empty, App, Radio, Tooltip } from 'antd';
import {
  ArrowLeftOutlined,
  InboxOutlined,
  FilePdfOutlined,
  FilePptOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import PptxGenJS from 'pptxgenjs';
import moment from 'moment';
import { renderPdfPages, readFileAsArrayBuffer, type RenderedPage } from '../../utils/pdfRender';
import { formatBytes } from '../../utils/imageOps';
import SortablePageGrid from './SortablePageGrid';
import './convert.less';

const { Dragger } = Upload;
const MAX_SIZE = 50 * 1024 * 1024; // 50M

// 清晰度档位 → 渲染缩放倍数
const QUALITY_OPTIONS = [
  { value: 1.5, label: '标准' },
  { value: 2, label: '高清' },
  { value: 3, label: '超清' },
];

interface PdfToPptProps {
  onBack: () => void;
}

export default function PdfToPpt({ onBack }: PdfToPptProps) {
  const { message } = App.useApp();
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [quality, setQuality] = useState(2);
  const [rendering, setRendering] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');

  // 渲染 PDF 页面
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
      setProgress('');
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

  // 切换清晰度 → 重新渲染
  const handleQualityChange = (val: number) => {
    setQuality(val);
    if (file) renderPages(file, val);
  };

  const handleClear = () => {
    setFile(null);
    setPages([]);
  };

  // 生成 PPT
  const handleGenerate = async () => {
    if (pages.length === 0) {
      message.warning('请先上传 PDF');
      return;
    }
    setGenerating(true);
    try {
      const pptx = new PptxGenJS();
      // 以首页宽高比定义幻灯片尺寸（宽固定 10 英寸）
      const first = pages[0];
      const slideW = 10;
      const slideH = 10 * (first.height / first.width);
      pptx.defineLayout({ name: 'PDF_PAGE', width: slideW, height: slideH });
      pptx.layout = 'PDF_PAGE';
      pptx.author = 'SSO 工具箱';
      pptx.title = file?.name?.replace(/\.pdf$/i, '') || 'PDF 转 PPT';

      const slideRatio = slideW / slideH;
      pages.forEach((pg) => {
        const slide = pptx.addSlide();
        slide.background = { color: 'FFFFFF' };
        // 等比适配（contain）居中，避免不同尺寸页面被拉伸变形
        const pageRatio = pg.width / pg.height;
        let w: number;
        let h: number;
        let x: number;
        let y: number;
        if (pageRatio > slideRatio) {
          w = slideW;
          h = slideW / pageRatio;
          x = 0;
          y = (slideH - h) / 2;
        } else {
          h = slideH;
          w = slideH * pageRatio;
          x = (slideW - w) / 2;
          y = 0;
        }
        slide.addImage({ data: pg.dataUrl, x, y, w, h });
      });

      const baseName = file?.name?.replace(/\.pdf$/i, '') || 'PDF转PPT';
      await pptx.writeFile({ fileName: `${baseName}_${moment().format('YYYYMMDD_HHmmss')}.pptx` });
      message.success(`已导出 PPT（共 ${pages.length} 张幻灯片）`);
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
            icon={<FilePptOutlined />}
            loading={generating}
            disabled={pages.length === 0 || rendering}
            onClick={handleGenerate}
          >
            导出 PPT{pages.length > 0 ? `（${pages.length} 页）` : ''}
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
            <p className="ant-upload-hint">将 PDF 每一页转为一张 PPT 幻灯片，单个文件不超过 50M</p>
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
              <span className="opt-label">清晰度越高，图片越清晰，文件也越大</span>
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
            <SortablePageGrid pages={pages} onReorder={setPages} disabled={rendering} />
          )}
        </div>
      </div>
    </div>
  );
}
