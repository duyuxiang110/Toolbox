/**
 * Word 转图片工具
 * 上传 .docx，通过云端 API 将文档转换为高质量图片。
 */
import { useState, useRef, useEffect } from 'react';
import { Upload, Button, Empty, App, Radio, Tooltip } from 'antd';
import {
  ArrowLeftOutlined,
  InboxOutlined,
  FileWordOutlined,
  PictureOutlined,
  DeleteOutlined,
  DownloadOutlined,
  StopOutlined,
} from '@ant-design/icons';
import JSZip from 'jszip';
import moment from 'moment';
import { api } from '../../api/client';
import { formatBytes, downloadDataUrl } from '../../utils/imageOps';
import './convert.less';

const { Dragger } = Upload;
const MAX_SIZE = 30 * 1024 * 1024;

const QUALITY_OPTIONS = [
  { value: 150, label: '标准' },
  { value: 300, label: '高清' },
];

interface WordToImageProps {
  onBack: () => void;
}

export default function WordToImage({ onBack }: WordToImageProps) {
  const { message } = App.useApp();
  const [file, setFile] = useState<File | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [dpi, setDpi] = useState(150);
  const [format, setFormat] = useState<'png' | 'jpg'>('png');
  const [converting, setConverting] = useState(false);
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
    setConverting(false);
    message.info('已取消转换');
  };

  const doConvert = async (f: File, d: number, fmt: 'png' | 'jpg') => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setConverting(true);
    try {
      const resp = await api.wordToImage(f, d, fmt, controller.signal);
      if (resp.success && resp.data) {
        setImages(resp.data.images.map(b64 => `data:image/${fmt === 'jpg' ? 'jpeg' : 'png'};base64,${b64}`));
        message.success(`转换完成（共 ${resp.data.images.length} 张）`);
      } else if (resp.code !== 'CANCELED') {
        message.error('转换失败：' + (resp.message || '未知错误'));
        setImages([]);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        message.error('转换失败：' + (err?.message || '网络错误'));
        setImages([]);
      }
    } finally {
      setConverting(false);
      abortRef.current = null;
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
    setImages([]);
    await doConvert(f, dpi, format);
    return Upload.LIST_IGNORE;
  };

  const reconvert = (next: { dpi?: number; format?: 'png' | 'jpg' }) => {
    const d = next.dpi ?? dpi;
    const fmt = next.format ?? format;
    if (next.dpi !== undefined) setDpi(d);
    if (next.format !== undefined) setFormat(fmt);
    if (file) doConvert(file, d, fmt);
  };

  const handleClear = () => {
    abortRef.current?.abort();
    setFile(null);
    setImages([]);
  };

  const ext = format === 'png' ? 'png' : 'jpg';
  const baseName = file?.name?.replace(/\.docx$/i, '') || 'Word转图片';

  const handleDownloadOne = (dataUrl: string, index: number) => {
    downloadDataUrl(dataUrl, `${baseName}_第${index + 1}页.${ext}`);
  };

  const handleDownloadAll = async () => {
    if (images.length === 0) return;
    if (images.length === 1) {
      handleDownloadOne(images[0], 0);
      return;
    }
    const zip = new JSZip();
    images.forEach((dataUrl, i) => {
      const base64 = dataUrl.split(',')[1];
      zip.file(`${baseName}_第${i + 1}页.${ext}`, base64, { base64: true });
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}_${moment().format('YYYYMMDD_HHmmss')}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('打包下载已开始');
  };

  return (
    <div className="convert-tool">
      <div className="convert-toolbar">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={handleBack}>
          返回工具箱
        </Button>
        <div className="convert-toolbar-right">
          {converting && (
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
            icon={<DownloadOutlined />}
            disabled={images.length === 0 || converting}
            onClick={handleDownloadAll}
          >
            {images.length > 1 ? `下载全部 ZIP（${images.length}）` : '下载图片'}
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
            <p className="ant-upload-hint">通过云端 LibreOffice 转换为高质量图片，排版还原度 ~98%，单个文件不超过 30M</p>
          </Dragger>
        ) : (
          <>
            <div className="convert-fileinfo">
              <FileWordOutlined className="fi-icon" />
              <Tooltip title={file.name}>
                <span className="fi-name">{file.name}</span>
              </Tooltip>
              <span className="fi-meta">
                {formatBytes(file.size)}
                {images.length > 0 ? ` · ${images.length} 张` : ''}
              </span>
            </div>

            <div className="convert-options">
              <div className="opt-item">
                <span className="opt-label">清晰度</span>
                <Radio.Group
                  value={dpi}
                  onChange={(e) => reconvert({ dpi: e.target.value })}
                  optionType="button"
                  buttonStyle="solid"
                  disabled={converting}
                  options={QUALITY_OPTIONS}
                />
              </div>
              <div className="opt-item">
                <span className="opt-label">格式</span>
                <Radio.Group
                  value={format}
                  onChange={(e) => reconvert({ format: e.target.value })}
                  optionType="button"
                  buttonStyle="solid"
                  disabled={converting}
                >
                  <Radio.Button value="png">PNG</Radio.Button>
                  <Radio.Button value="jpg">JPG</Radio.Button>
                </Radio.Group>
              </div>
            </div>
          </>
        )}

        <div className="convert-preview">
          {converting ? (
            <Empty description="正在转换…" className="convert-empty" />
          ) : images.length === 0 ? (
            <Empty description="暂无转换结果" className="convert-empty" />
          ) : (
            <div className="convert-result-imgs">
              {images.map((src, i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <img src={src} alt={`第 ${i + 1} 页`} className="result-img" />
                  <div style={{ marginTop: 8 }}>
                    <Button
                      size="small"
                      icon={<PictureOutlined />}
                      onClick={() => handleDownloadOne(src, i)}
                    >
                      下载第 {i + 1} 张
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
