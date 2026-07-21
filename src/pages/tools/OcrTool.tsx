/**
 * 图片文字识别工具（OCR）
 * 基于 Tesseract.js，支持中英文混排识别
 * 内置图像预处理增强管线（放大/灰度/对比度/降噪/二值化），大幅提升识别准确率
 * 双栏工作台布局：左侧图片输入 → 右侧识别结果
 */
import { useEffect, useRef, useState } from 'react';
import { Upload, Button, Select, Progress, Empty, App, Tooltip, Switch } from 'antd';
import {
  ArrowLeftOutlined,
  ScanOutlined,
  CopyOutlined,
  DeleteOutlined,
  ReloadOutlined,
  PictureOutlined,
} from '@ant-design/icons';
import { createWorker } from 'tesseract.js';
import { loadImage } from '../../utils/imageOps';
import { preprocessForOcr, OCR_MODE_OPTIONS, type OcrPreprocessMode } from '../../utils/imagePreprocess';
import './OcrTool.less';

const { Dragger } = Upload;

// 单张图片大小上限：10M
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

// 识别语言选项
const LANG_OPTIONS = [
  { value: 'chi_sim+eng', label: '简体中文 + 英文' },
  { value: 'chi_sim', label: '简体中文' },
  { value: 'eng', label: '英文' },
];

// Tesseract 状态 → 中文提示
const STATUS_MAP: Record<string, string> = {
  'loading tesseract core': '正在加载识别引擎…',
  'initializing tesseract': '正在初始化引擎…',
  'loading language traineddata': '正在下载/加载语言模型（首次较慢）…',
  'initializing api': '正在准备识别接口…',
  'recognizing text': '正在识别文字…',
};

interface OcrImage {
  dataUrl: string;
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
  const [lang, setLang] = useState('chi_sim+eng');
  const [recognizing, setRecognizing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [result, setResult] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [confidence, setConfidence] = useState<number | null>(null);
  const workerRef = useRef<any>(null);

  // 预处理增强
  const [preprocessMode, setPreprocessMode] = useState<OcrPreprocessMode>('auto');
  const [previewProcessed, setPreviewProcessed] = useState(false);
  const [processedPreview, setProcessedPreview] = useState<{ dataUrl: string; width: number; height: number } | null>(null);

  // 实时生成增强预览图
  useEffect(() => {
    let cancelled = false;
    if (!image || !previewProcessed || preprocessMode === 'none') {
      setProcessedPreview(null);
      return;
    }
    loadImage(image.dataUrl)
      .then((el) => preprocessForOcr(el, preprocessMode))
      .then((res) => {
        if (!cancelled) setProcessedPreview(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [image, preprocessMode, previewProcessed]);

  // 读取图片为 dataURL 并获取尺寸
  const readImage = (file: File): Promise<OcrImage> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const img = new window.Image();
        img.onload = () =>
          resolve({ dataUrl, name: file.name, size: file.size, width: img.width, height: img.height });
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
      message.error(`「${file.name}」超过 10M 限制，已跳过`);
      return Upload.LIST_IGNORE;
    }
    try {
      const item = await readImage(file);
      setImage(item);
      setResult('');
      setConfidence(null);
      setProgress(0);
    } catch {
      message.error(`「${file.name}」读取失败`);
    }
    return Upload.LIST_IGNORE;
  };

  // 开始识别
  const handleRecognize = async () => {
    if (!image) {
      message.warning('请先上传图片');
      return;
    }
    setRecognizing(true);
    setProgress(0);
    setResult('');
    setConfidence(null);
    setStatusText('正在预处理增强图像…');
    const start = Date.now();

    try {
      // 1. 预处理增强：放大/灰度/对比度/降噪/二值化，显著提升识别准确率
      const imgEl = await loadImage(image.dataUrl);
      const processed = await preprocessForOcr(imgEl, preprocessMode);

      setStatusText('正在加载识别引擎…');
      const worker = await createWorker(lang, 1, {
        logger: (m: any) => {
          const text = STATUS_MAP[m.status] || m.status;
          setStatusText(text);
          if (m.status === 'recognizing text') {
            setProgress(Math.round((m.progress || 0) * 100));
          }
        },
      });
      workerRef.current = worker;

      // 2. 优化识别参数：保留词间空格，提高排版还原度
      await worker.setParameters({
        preserve_interword_spaces: '1',
      });

      // 3. 识别（使用预处理后的图像）
      const ret = await worker.recognize(processed.dataUrl);
      const text = (ret.data.text || '').trim();
      setResult(text);
      setConfidence(typeof ret.data.confidence === 'number' ? Math.round(ret.data.confidence) : null);
      setElapsed(Date.now() - start);
      await worker.terminate();
      workerRef.current = null;

      if (text) {
        message.success('识别完成');
      } else {
        message.info('未识别到文字，请尝试更清晰的图片');
      }
    } catch (err: any) {
      message.error('识别失败：' + (err?.message || '未知错误，请确认网络可下载语言模型'));
      if (workerRef.current) {
        workerRef.current.terminate().catch(() => {});
        workerRef.current = null;
      }
    } finally {
      setRecognizing(false);
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
    setProgress(0);
  };

  const hasResult = result.length > 0;

  return (
    <div className="ocr-tool">
      {/* 顶部工具栏 */}
      <div className="ocr-toolbar">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack}>
          返回工具箱
        </Button>
        <div className="ocr-toolbar-right">
          <Tooltip title="识别前对图像做放大/降噪/二值化等增强，可显著提升准确率">
            <Select
              value={preprocessMode}
              onChange={(v) => setPreprocessMode(v)}
              options={OCR_MODE_OPTIONS}
              disabled={recognizing}
              style={{ width: 160 }}
              popupMatchSelectWidth={false}
            />
          </Tooltip>
          <Tooltip title="在左侧预览增强处理后的图像">
            <span className="ocr-preview-switch">
              <Switch
                size="small"
                checked={previewProcessed}
                onChange={setPreviewProcessed}
                disabled={recognizing || !image || preprocessMode === 'none'}
              />
              预览增强
            </span>
          </Tooltip>
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

      {/* 双栏工作台 */}
      <div className="ocr-workspace">
        {/* 左侧：图片输入 */}
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
              <p className="ant-upload-hint">支持 JPG / PNG 等，不超过 10M；首次识别需联网加载语言模型</p>
            </Dragger>
          ) : (
            <div className="ocr-image-box">
              <img
                src={previewProcessed && processedPreview ? processedPreview.dataUrl : image.dataUrl}
                alt={image.name}
                className="ocr-image-preview"
              />
              {previewProcessed && processedPreview && (
                <div className="ocr-enhanced-badge">
                  已增强 {processedPreview.width} × {processedPreview.height}
                </div>
              )}
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

        {/* 右侧：识别结果 */}
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

          {/* 识别中：进度 */}
          {recognizing && (
            <div className="ocr-progress">
              <div className="ocr-progress-status">{statusText}</div>
              <Progress
                percent={progress}
                status="active"
                strokeColor={{ from: '#6366f1', to: '#8b5cf6' }}
                trailColor="rgba(255,255,255,0.06)"
              />
              <p className="ocr-progress-hint">
                首次使用某种语言时需下载对应模型，请耐心等待；识别在本地完成，不上传服务器
              </p>
            </div>
          )}

          {/* 空状态 */}
          {!recognizing && !hasResult && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={image ? '点击「开始识别」提取图中文字' : '请先在左侧上传图片'}
              className="ocr-empty"
            />
          )}

          {/* 结果文本 */}
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
