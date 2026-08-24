/**
 * PDF 合并工具
 * 上传多个 PDF，拖拽调整顺序后合并为一个 PDF。
 * - 显示每个文件的页数与大小，可拖拽排序、单个移除
 * - 合并结果保留原始矢量内容（文字/图形不失真）
 * 纯客户端处理：pdf-lib 合并。
 */
import { useState } from 'react';
import { Upload, Button, Empty, App, Tooltip } from 'antd';
import {
  ArrowLeftOutlined,
  InboxOutlined,
  FilePdfOutlined,
  MergeCellsOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import moment from 'moment';
import SortableGrid from '../../components/SortableGrid/SortableGrid';
import { mergePdfs, getPdfPageCount, readFileAsArrayBuffer } from '../../utils/pdfEdit';
import { formatBytes, downloadBlob } from '../../utils/imageOps';
import './convert.less';

const { Dragger } = Upload;
const MAX_SIZE = 50 * 1024 * 1024; // 单文件 50M

interface PdfFileItem {
  uid: string;
  name: string;
  size: number;
  pages: number;
  file: File;
}

let uidSeed = 0;

interface PdfMergeProps {
  onBack: () => void;
}

export default function PdfMerge({ onBack }: PdfMergeProps) {
  const { message } = App.useApp();
  const [items, setItems] = useState<PdfFileItem[]>([]);
  const [merging, setMerging] = useState(false);

  const handleBeforeUpload = async (f: File) => {
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      message.error(`「${f.name}」不是 PDF 文件，已跳过`);
      return Upload.LIST_IGNORE;
    }
    if (f.size > MAX_SIZE) {
      message.error(`「${f.name}」超过 50M 限制，已跳过`);
      return Upload.LIST_IGNORE;
    }
    try {
      const buffer = await readFileAsArrayBuffer(f);
      const pages = await getPdfPageCount(buffer);
      setItems((prev) => [
        ...prev,
        { uid: `pdf-${Date.now()}-${uidSeed++}`, name: f.name, size: f.size, pages, file: f },
      ]);
    } catch (err: any) {
      message.error(`「${f.name}」解析失败：` + (err?.message || '未知错误'));
    }
    return Upload.LIST_IGNORE;
  };

  const handleRemove = (uid: string) => {
    setItems((prev) => prev.filter((it) => it.uid !== uid));
  };

  const handleClear = () => setItems([]);

  const totalPages = items.reduce((sum, it) => sum + it.pages, 0);

  const handleMerge = async () => {
    if (items.length < 2) {
      message.warning('请至少添加 2 个 PDF');
      return;
    }
    setMerging(true);
    try {
      // 按当前顺序读取各文件字节
      const buffers = await Promise.all(items.map((it) => readFileAsArrayBuffer(it.file)));
      const merged = await mergePdfs(buffers);
      const blob = new Blob([merged as BlobPart], { type: 'application/pdf' });
      downloadBlob(blob, `PDF合并_${moment().format('YYYYMMDD_HHmmss')}.pdf`);
      message.success(`已合并 ${items.length} 个 PDF（共 ${totalPages} 页）`);
    } catch (err: any) {
      message.error('合并失败：' + (err?.message || '未知错误'));
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="convert-tool">
      <div className="convert-toolbar">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack}>
          返回工具箱
        </Button>
        <div className="convert-toolbar-right">
          {items.length > 0 && <Button onClick={handleClear}>清空</Button>}
          <Button
            type="primary"
            icon={<MergeCellsOutlined />}
            loading={merging}
            disabled={items.length < 2}
            onClick={handleMerge}
          >
            合并导出{items.length > 0 ? `（${items.length} 个）` : ''}
          </Button>
        </div>
      </div>

      <div className="convert-body">
        <Dragger
          multiple
          accept="application/pdf,.pdf"
          showUploadList={false}
          beforeUpload={handleBeforeUpload}
          className="convert-uploader"
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽多个 PDF 到此处</p>
          <p className="ant-upload-hint">
            可一次选择多个，单个不超过 50M；添加后拖动卡片调整合并顺序
          </p>
        </Dragger>

        <div className="convert-preview">
          {items.length === 0 ? (
            <Empty description="暂无文件，请添加至少 2 个 PDF" className="convert-empty" />
          ) : (
            <SortableGrid
              items={items}
              getId={(it) => it.uid}
              onReorder={setItems}
              disabled={merging}
              renderContent={(it) => (
                <div className="merge-card-inner">
                  <FilePdfOutlined className="merge-card-icon" />
                  <Tooltip title={it.name}>
                    <div className="merge-card-name">{it.name}</div>
                  </Tooltip>
                  <div className="merge-card-meta">
                    {it.pages} 页 · {formatBytes(it.size)}
                  </div>
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    className="merge-card-remove"
                    onClick={() => handleRemove(it.uid)}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    移除
                  </Button>
                </div>
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
}
