/**
 * 图片文字识别工具（OCR）
 * 通过云端 PaddleOCR 识别图片中的中英文文字，识别率 95%+
 * 双栏工作台布局：左侧图片输入 → 右侧识别结果
 */
import { useState } from 'react';
import { Upload, Button, Select, Empty, App, Tooltip } from 'antd';
import {
  ArrowLeftOutlined,
  ScanOutlined,
  CopyOutlined,
  DeleteOutlined,
  ReloadOutlined,
  PictureOutlined,
} from '@ant-design/icons';
import { api } from '../../api/client';
import './OcrTool.less';

const { Dragger } = Upload;

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const LANG_OPTIONS = [
  { value: 'ch', label: '简体中文 + 英文' },
  { value: 'en', label: '英文' },
];

interface OcrImage {
  dataUrl: string;
  file: File;
  name: string;
  size: number;
  width: number;
  height: number;
}

interface OcrToolProps {
  onBack: () => void;
}

export default function OcrTool({ onBack }: OcrToolProps) {
  const { message } = App.useApp();
  const [image, setImage] = useState<OcrImage | null>(null);
  const [lang, setLang] = useState('ch');
  const [recognizing, setRecognizing] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [result, setResult] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [confidence, setConfidence] = useState<number | null>(null);

  const readImage = (file: File): Promise<OcrImage> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const img = new window.Image();
        img.onload = () =>
          resolve({ dataUrl, file, name: file.name, size: file.size, width: img.width, height: img.height });
        img.onerror = () => reject(new Error('图片解析失败'));
        img.src = dataUrl;
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsDataURL(file);
    });

  const handleBeforeUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      message.error(`「${file.name}」不是图片文件`);
      return Upload.LIST_IGNORE;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      message.error(`「${file.name}」超过 10M 限制`);
      return Upload.LIST_IGNORE;
    }
    try {
      const item = await readImage(file);
      setImage(item);
      setResult('');
      setConfidence(null);
    } catch {
      message.error(`「${file.name}」读取失败`);
    }
    return Upload.LIST_IGNORE;
  };

  const handleRecognize = async () => {
    if (!image) {
      message.warning('请先上传图片');
      return;
    }
    setRecognizing(true);
    setResult('');
    setConfidence(null);
    setStatusText('正在上传并识别…');
    const start = Date.now();

    try {
      const resp = await api.ocr(image.file, lang);
      if (resp.success && resp.data) {
        setResult(resp.data.text);
        setConfidence(resp.data.confidence);
        setElapsed(Date.now() - start);
        if (resp.data.text) {
          message.success('识别完成');
        } else {
          message.info('未识别到文字，请尝试更清晰的图片');
        }
      } else {
        message.error('识别失败：' + (resp.message || '未知错误'));
      }
    } catch (err: any) {
      message.error('识别失败：' + (err?.message || '网络错误'));
    } finally {
      setRecognizing(false);
      setStatusText('');
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result);
      message.success('已复制到剪贴板');
    } catch {
      message.error('复制失败，请手动选择文本');
    }
  };

  const handleClearImage = () => {
    setImage(null);
    setResult('');
    setConfidence(null);
  };

  const hasResult = result.length > 0;

  return (
    <div className="ocr-tool">
      <div className="ocr-toolbar">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack}>
          返回工具箱
        </Button>
        <div className="ocr-toolbar-right">
          <Select
            value={lang}
            onChange={setLang}
            options={LANG_OPTIONS}
            disabled={recognizing}
            style={{ width: 150 }}
            popupMatchSelectWidth={false}
          />
          <Button
            type="primary"
            icon={<ScanOutlined />}
            loading={recognizing}
            onClick={handleRecognize}
            disabled={!image}
          >
            {recognizing ? '识别中' : '开始识别'}
          </Button>
        </div>
      </div>

      <div className="ocr-workspace">
        <section className="ocr-pane ocr-pane-image">
          <div className="ocr-pane-header">
            <span className="ocr-pane-tag">输入</span>
            <h4>图片源</h4>
          </div>

          {!image ? (
            <Dragger
              accept="image/*"
              showUploadList={false}
              beforeUpload={handleBeforeUpload}
              className="ocr-uploader"
            >
              <p className="ant-upload-drag-icon">
                <PictureOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽图片到此处</p>
              <p className="ant-upload-hint">支持 JPG / PNG 等，不超过 10M；云端 PaddleOCR 识别率 95%+</p>
            </Dragger>
          ) : (
            <div className="ocr-image-box">
              <img
                src={image.dataUrl}
                alt={image.name}
                className="ocr-image-preview"
              />
              <div className="ocr-image-meta">
                <Tooltip title={image.name}>
                  <span className="ocr-image-name">{image.name}</span>
                </Tooltip>
                <span className="ocr-image-info">
                  {image.width} × {image.height} · {(image.size / 1024).toFixed(0)} KB
                </span>
                <div className="ocr-image-actions">
                  <Button size="small" icon={<ReloadOutlined />} onClick={handleClearImage}>
                    重新选择
                  </Button>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="ocr-pane ocr-pane-result">
          <div className="ocr-pane-header">
            <span className="ocr-pane-tag ocr-pane-tag-out">输出</span>
            <h4>识别结果</h4>
            {hasResult && (
              <div className="ocr-result-actions">
                <Button size="small" icon={<CopyOutlined />} onClick={handleCopy}>
                  复制
                </Button>
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setResult('')}>
                  清空
                </Button>
              </div>
            )}
          </div>

          {recognizing && (
            <div className="ocr-progress">
              <div className="ocr-progress-status">{statusText}</div>
              <p className="ocr-progress-hint">服务器正在识别，请耐心等待…</p>
            </div>
          )}

          {!recognizing && !hasResult && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={image ? '点击「开始识别」提取图中文字' : '请先在左侧上传图片'}
              className="ocr-empty"
            />
          )}

          {!recognizing && hasResult && (
            <>
              <div className="ocr-result-text">{result}</div>
              <div className="ocr-result-stats">
                <span className="ocr-stat">
                  <b>{result.replace(/\s/g, '').length}</b> 字符
                </span>
                {confidence !== null && (
                  <span className="ocr-stat">
                    置信度 <b>{confidence}%</b>
                  </span>
                )}
                <span className="ocr-stat">
                  耗时 <b>{(elapsed / 1000).toFixed(1)}s</b>
                </span>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
