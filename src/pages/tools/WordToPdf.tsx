/**
 * Word 转 PDF 工具
 * 上传 .docx，通过云端 LibreOffice 转换为高质量 PDF。
 */
import { useState } from 'react';
import { Upload, Button, Empty, App, Tooltip } from 'antd';
import {
  ArrowLeftOutlined,
  InboxOutlined,
  FileWordOutlined,
  FilePdfOutlined,
  DeleteOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { api } from '../../api/client';
import { formatBytes, downloadBlob } from '../../utils/imageOps';
import './convert.less';

const { Dragger } = Upload;
const MAX_SIZE = 30 * 1024 * 1024;

interface WordToPdfProps {
  onBack: () => void;
}

interface PdfResult {
  blob: Blob;
  url: string;
  size: number;
}

export default function WordToPdf({ onBack }: WordToPdfProps) {
  const { message } = App.useApp();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<PdfResult | null>(null);
  const [converting, setConverting] = useState(false);

  const doConvert = async (f: File) => {
    setConverting(true);
    setResult((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    try {
      const { blob } = await api.wordToPdf(f);
      const url = URL.createObjectURL(blob);
      setResult({ blob, url, size: blob.size });
      message.success('转换完成');
    } catch (err: any) {
      message.error('转换失败：' + (err?.message || '网络错误'));
      setResult(null);
    } finally {
      setConverting(false);
    }
  };

  const handleBeforeUpload = async (f: File) => {
    const isDocx =
      f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      f.name.toLowerCase().endsWith('.docx');
    if (!isDocx) {
      message.error('请上传 .docx 格式的 Word 文档');
      return Upload.LIST_IGNORE;
    }
    if (f.size > MAX_SIZE) {
      message.error(`文件超过 30M 限制（当前 ${formatBytes(f.size)}）`);
      return Upload.LIST_IGNORE;
    }
    setFile(f);
    await doConvert(f);
    return Upload.LIST_IGNORE;
  };

  const handleClear = () => {
    setResult((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setFile(null);
  };

  const baseName = file?.name?.replace(/\.docx$/i, '') || 'Word转PDF';

  const handleDownload = () => {
    if (!result) return;
    downloadBlob(result.blob, `${baseName}.pdf`);
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
            icon={<DownloadOutlined />}
            disabled={!result || converting}
            onClick={handleDownload}
          >
            下载 PDF
          </Button>
        </div>
      </div>

      <div className="convert-body">
        {!file ? (
          <Dragger
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            showUploadList={false}
            beforeUpload={handleBeforeUpload}
            className="convert-uploader"
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽 Word 文档（.docx）到此处</p>
            <p className="ant-upload-hint">通过云端 LibreOffice 转换为高质量 PDF，排版还原度 ~98%，单个文件不超过 30M</p>
          </Dragger>
        ) : (
          <div className="convert-fileinfo">
            <FileWordOutlined className="fi-icon" />
            <Tooltip title={file.name}>
              <span className="fi-name">{file.name}</span>
            </Tooltip>
            <span className="fi-meta">
              {formatBytes(file.size)}
              {result ? ` · PDF ${formatBytes(result.size)}` : ''}
            </span>
          </div>
        )}

        <div className="convert-preview">
          {converting ? (
            <Empty description="正在服务器端转换…" className="convert-empty" />
          ) : !result ? (
            <Empty description="暂无转换结果" className="convert-empty" />
          ) : (
            <div className="wordpdf-preview">
              <div className="wordpdf-preview-head">
                <FilePdfOutlined />
                <span>{baseName}.pdf · {formatBytes(result.size)}</span>
              </div>
              <iframe
                className="wordpdf-preview-frame"
                title="PDF 预览"
                src={result.url}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
