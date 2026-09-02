/**
 * PDF 转 Word 工具
 * 两种模式：
 * - 可编辑文本：pdfplumber 提取文本和表格 → python-docx 生成
 * - 图片还原：PDF 每页渲染为图片嵌入 Word
 * 通过云端 Python API 处理。
 */
import { useState, useRef, useEffect } from 'react';
import { Upload, Button, Empty, App, Radio, Tooltip } from 'antd';
import {
  ArrowLeftOutlined,
  InboxOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  DeleteOutlined,
  StopOutlined,
} from '@ant-design/icons';
import moment from 'moment';
import { api } from '../../api/client';
import { formatBytes, downloadBlob } from '../../utils/imageOps';
import './convert.less';

const { Dragger } = Upload;
const MAX_SIZE = 50 * 1024 * 1024;

type ConvertMode = 'text' | 'image';
const MODE_OPTIONS = [
  { value: 'text', label: '可编辑文本' },
  { value: 'image', label: '图片还原' },
];

interface PdfToWordProps {
  onBack: () => void;
}

export default function PdfToWord({ onBack }: PdfToWordProps) {
  const { message } = App.useApp();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<ConvertMode>('text');
  const [generating, setGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleBack = () => {
    abortRef.current?.abort();
    onBack();
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setGenerating(false);
    message.info('已取消转换');
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
    return Upload.LIST_IGNORE;
  };

  const handleGenerate = async () => {
    if (!file) {
      message.warning('请先上传 PDF');
      return;
    }
    const baseName = file.name.replace(/\.pdf$/i, '') || 'PDF转Word';
    const stamp = moment().format('YYYYMMDD_HHmmss');
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating(true);
    try {
      const { blob, filename } = await api.pdfToWord(file, mode, controller.signal);
      downloadBlob(blob, filename);
      message.success(`已导出 Word（${mode === 'text' ? '可编辑文本' : '图片还原'}）`);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        message.error('转换失败：' + (err?.message || '网络错误'));
      }
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  };

  const handleClear = () => {
    abortRef.current?.abort();
    setFile(null);
  };

  return (
    <div className="convert-tool">
      <div className="convert-toolbar">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={handleBack}>
          返回工具箱
        </Button>
        <div className="convert-toolbar-right">
          {generating && (
            <Button danger icon={<StopOutlined />} onClick={handleCancel}>
              取消转换
            </Button>
          )}
          {file && (
            <Button icon={<DeleteOutlined />} onClick={handleClear}>
              重新选择
            </Button>
          )}
          <Button
            type="primary"
            icon={<FileWordOutlined />}
            loading={generating}
            disabled={!file}
            onClick={handleGenerate}
          >
            {mode === 'text' ? '导出 Word（可编辑）' : '导出 Word（图片还原）'}
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
              云端 pdfplumber 提取文本/表格生成可编辑 Word，或逐页图片还原，单个文件不超过 50M
            </p>
          </Dragger>
        ) : (
          <>
            <div className="convert-fileinfo">
              <FilePdfOutlined className="fi-icon" />
              <Tooltip title={file.name}>
                <span className="fi-name">{file.name}</span>
              </Tooltip>
              <span className="fi-meta">{formatBytes(file.size)}</span>
            </div>

            <div className="convert-options">
              <div className="opt-item">
                <span className="opt-label">转换模式</span>
                <Radio.Group
                  value={mode}
                  onChange={(e) => setMode(e.target.value as ConvertMode)}
                  optionType="button"
                  buttonStyle="solid"
                  disabled={generating}
                  options={MODE_OPTIONS}
                />
              </div>
              {mode === 'text' ? (
                <span className="opt-label">
                  提取 PDF 文本层，生成可编辑的文字与表格（扫描件请改用图片还原）
                </span>
              ) : (
                <span className="opt-label">页面以图片形式还原，排版与原 PDF 完全一致</span>
              )}
            </div>
          </>
        )}

        <div className="convert-preview">
          {generating ? (
            <Empty description="正在服务器端转换…" className="convert-empty" />
          ) : file ? (
            <Empty
              description={`已选择 ${mode === 'text' ? '可编辑文本' : '图片还原'} 模式，点击「导出 Word」开始转换`}
              className="convert-empty"
            />
          ) : (
            <Empty description="暂无文件" className="convert-empty" />
          )}
        </div>
      </div>
    </div>
  );
}
