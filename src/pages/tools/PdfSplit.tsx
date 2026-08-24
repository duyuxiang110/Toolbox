/**
 * PDF 拆分工具
 * 上传一个 PDF，通过在页面之间设置「拆分点」把它拆成多个 PDF。
 * - 逐页缩略图预览，点击页脚「此页后拆开」即可设置/取消拆分点
 * - 支持「逐页拆分」「每 N 页拆分」「清除拆分点」快捷操作
 * - 拆分结果保留原始矢量内容（文字/图形不失真），多文件打包为 ZIP 下载
 * 纯客户端处理：pdfjs-dist 生成缩略图 + pdf-lib 拆分。
 */
import { useState } from 'react';
import { Upload, Button, Empty, App, Tooltip, InputNumber } from 'antd';
import {
  ArrowLeftOutlined,
  InboxOutlined,
  FilePdfOutlined,
  DeleteOutlined,
  ScissorOutlined,
  SplitCellsOutlined,
} from '@ant-design/icons';
import JSZip from 'jszip';
import moment from 'moment';
import { renderPdfPages, type RenderedPage } from '../../utils/pdfRender';
import { splitPdfByCuts, readFileAsArrayBuffer } from '../../utils/pdfEdit';
import { formatBytes, downloadBlob } from '../../utils/imageOps';
import './convert.less';

const { Dragger } = Upload;
const MAX_SIZE = 50 * 1024 * 1024; // 50M

interface PdfSplitProps {
  onBack: () => void;
}

export default function PdfSplit({ onBack }: PdfSplitProps) {
  const { message } = App.useApp();
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  // 在这些页码「之后」拆开（1-based）
  const [cuts, setCuts] = useState<Set<number>>(new Set());
  const [everyN, setEveryN] = useState<number>(1);
  const [rendering, setRendering] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [progress, setProgress] = useState('');

  const total = pages.length;

  const renderThumbs = async (f: File) => {
    setRendering(true);
    setProgress('正在解析 PDF…');
    try {
      const buffer = await readFileAsArrayBuffer(f);
      const rendered = await renderPdfPages(buffer, {
        scale: 1,
        maxEdge: 360,
        format: 'image/jpeg',
        quality: 0.7,
        onProgress: (done, t) => setProgress(`正在生成预览 ${done}/${t}`),
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
    setCuts(new Set());
    await renderThumbs(f);
    return Upload.LIST_IGNORE;
  };

  const handleClear = () => {
    setFile(null);
    setPages([]);
    setCuts(new Set());
  };

  // 切换某页之后的拆分点（最后一页不能作为拆分点）
  const toggleCut = (pageNum: number) => {
    if (pageNum >= total) return;
    setCuts((prev) => {
      const next = new Set(prev);
      if (next.has(pageNum)) next.delete(pageNum);
      else next.add(pageNum);
      return next;
    });
  };

  // 逐页拆分：每页之后都拆
  const cutEachPage = () => {
    const next = new Set<number>();
    for (let p = 1; p < total; p++) next.add(p);
    setCuts(next);
  };

  // 每 N 页拆分
  const cutEveryN = () => {
    const n = Math.floor(everyN);
    if (!n || n < 1) {
      message.warning('请输入有效的页数');
      return;
    }
    if (n >= total) {
      message.warning('每份页数已不小于总页数，无需拆分');
      return;
    }
    const next = new Set<number>();
    for (let p = n; p < total; p += n) next.add(p);
    setCuts(next);
  };

  const clearCuts = () => setCuts(new Set());

  // 计算每页所属的份序号（第几份），以及各份的页码范围
  const segmentOfPage = (pageNum: number) => {
    let seg = 1;
    for (let p = 1; p < pageNum; p++) if (cuts.has(p)) seg++;
    return seg;
  };

  const segmentRanges = (): Array<[number, number]> => {
    const sorted = [...cuts].filter((n) => n >= 1 && n < total).sort((a, b) => a - b);
    const boundaries = [0, ...sorted, total];
    const ranges: Array<[number, number]> = [];
    for (let i = 0; i < boundaries.length - 1; i++) {
      ranges.push([boundaries[i] + 1, boundaries[i + 1]]);
    }
    return ranges;
  };

  const segCount = cuts.size + 1;

  const handleSplit = async () => {
    if (!file || total === 0) {
      message.warning('请先上传 PDF');
      return;
    }
    if (cuts.size === 0) {
      message.warning('请至少设置一个拆分点');
      return;
    }
    setSplitting(true);
    setProgress('正在拆分…');
    try {
      const bytes = await readFileAsArrayBuffer(file);
      const segments = await splitPdfByCuts(bytes, [...cuts]);
      const base = file.name.replace(/\.pdf$/i, '') || 'PDF';

      const zip = new JSZip();
      segments.forEach((seg, i) => {
        const name =
          seg.start === seg.end
            ? `${base}_第${i + 1}份_第${seg.start}页.pdf`
            : `${base}_第${i + 1}份_第${seg.start}-${seg.end}页.pdf`;
        zip.file(name, seg.bytes);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `${base}_拆分_${moment().format('YYYYMMDD_HHmmss')}.zip`);
      message.success(`已拆分为 ${segments.length} 个 PDF（打包为 ZIP）`);
    } catch (err: any) {
      message.error('拆分失败：' + (err?.message || '未知错误'));
    } finally {
      setSplitting(false);
      setProgress('');
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
            icon={<ScissorOutlined />}
            loading={splitting}
            disabled={total === 0 || rendering || cuts.size === 0}
            onClick={handleSplit}
          >
            开始拆分{cuts.size > 0 ? `（${segCount} 个文件）` : ''}
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
            <p className="ant-upload-hint">在页面之间设置拆分点，把一个 PDF 拆成多个，单个文件不超过 50M</p>
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
                {total > 0 ? ` · ${total} 页` : ''}
              </span>
            </div>

            <div className="convert-options">
              <div className="opt-item">
                <Button size="small" onClick={cutEachPage} disabled={rendering || total < 2}>
                  逐页拆分
                </Button>
              </div>
              <div className="opt-item">
                <span className="opt-label">每</span>
                <InputNumber
                  size="small"
                  min={1}
                  max={Math.max(1, total - 1)}
                  value={everyN}
                  onChange={(v) => setEveryN(Number(v) || 1)}
                  style={{ width: 68 }}
                  disabled={rendering || total < 2}
                />
                <span className="opt-label">页</span>
                <Button size="small" onClick={cutEveryN} disabled={rendering || total < 2}>
                  按此拆分
                </Button>
              </div>
              <div className="opt-item">
                <Button size="small" onClick={clearCuts} disabled={rendering || cuts.size === 0}>
                  清除拆分点
                </Button>
              </div>
              {cuts.size > 0 && (
                <span className="opt-tip">
                  将生成 {segCount} 个：
                  {segmentRanges()
                    .map(([s, e]) => (s === e ? `${s}` : `${s}-${e}`))
                    .join(' / ')}
                </span>
              )}
            </div>
          </>
        )}

        <div className="convert-preview">
          {rendering ? (
            <Empty description={progress || '处理中…'} className="convert-empty" />
          ) : total === 0 ? (
            <Empty description="暂无页面" className="convert-empty" />
          ) : (
            <div className="split-grid">
              {pages.map((pg) => {
                const isCut = cuts.has(pg.pageNum);
                const isLast = pg.pageNum >= total;
                return (
                  <div
                    key={pg.pageNum}
                    className={`split-card${isCut ? ' cut-after' : ''}`}
                  >
                    <div className="split-seg-badge">第 {segmentOfPage(pg.pageNum)} 份</div>
                    <div className="cc-img-wrap">
                      <img src={pg.dataUrl} alt={`第 ${pg.pageNum} 页`} className="cc-img" draggable={false} />
                    </div>
                    <div className="split-card-footer">
                      <span className="split-page-no">第 {pg.pageNum} 页</span>
                      {!isLast && (
                        <Button
                          type={isCut ? 'primary' : 'default'}
                          size="small"
                          icon={<ScissorOutlined />}
                          onClick={() => toggleCut(pg.pageNum)}
                        >
                          {isCut ? '已拆开' : '此页后拆开'}
                        </Button>
                      )}
                    </div>
                    {isCut && <div className="split-cut-line"><SplitCellsOutlined /></div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
