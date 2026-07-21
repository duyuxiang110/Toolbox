/**
 * 图片处理工具
 * 压缩（目标体积/质量档位）· 改尺寸（等比/指定尺寸）· 改格式（PNG/JPG）· 裁剪（自由/固定比例）· 旋转
 * 纯 Canvas 客户端处理，零服务器负载
 */
import { useMemo, useState } from 'react';
import { Upload, Button, Tabs, InputNumber, Radio, Slider, Select, Empty, App, Tooltip, Switch } from 'antd';
import {
  ArrowLeftOutlined,
  PictureOutlined,
  PlusOutlined,
  DownloadOutlined,
  CompressOutlined,
  ExpandOutlined,
  SwapOutlined,
  BlockOutlined,
  RotateRightOutlined,
  DeleteOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import JSZip from 'jszip';
import {
  loadImage,
  readFileAsImage,
  formatBytes,
  downloadDataUrl,
  compressToTarget,
  compressWithQuality,
  resizeByPercent,
  resizeByLongEdge,
  resizeToExact,
  resizeToFit,
  convertFormat,
  rotateImage,
  cropImage,
  type OpResult,
} from '../../utils/imageOps';
import './ImageProcessor.less';

const { Dragger } = Upload;
const MAX_SIZE = 10 * 1024 * 1024;

type OpKey = 'compress' | 'resize' | 'format' | 'crop' | 'rotate';

interface WorkImage {
  id: string;
  name: string;
  dataUrl: string;
  originalDataUrl: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  size: number;
  originalSize: number;
}

const extOf = (dataUrl: string) => (dataUrl.startsWith('data:image/png') ? 'png' : 'jpg');
const withExt = (name: string, ext: string) =>
  /\.[^.]+$/.test(name) ? name.replace(/\.[^.]+$/, `.${ext}`) : `${name}.${ext}`;

const ASPECT_OPTIONS = [
  { value: 'free', label: '自由比例' },
  { value: '1:1', label: '1:1 正方形' },
  { value: '4:3', label: '4:3' },
  { value: '3:2', label: '3:2' },
  { value: '16:9', label: '16:9 宽屏' },
];
const aspectToNumber = (v: string): number | undefined => {
  if (v === 'free') return undefined;
  const [a, b] = v.split(':').map(Number);
  return a / b;
};

export default function ImageProcessor({ onBack }: { onBack: () => void }) {
  const { message } = App.useApp();
  const [images, setImages] = useState<WorkImage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [op, setOp] = useState<OpKey>('compress');
  const [processing, setProcessing] = useState(false);

  // 压缩参数
  const [level, setLevel] = useState<'hd' | 'balanced'>('balanced');
  const [targetKB, setTargetKB] = useState<number | null>(200);
  // 缩放参数
  const [resizeMode, setResizeMode] = useState<'percent' | 'longedge' | 'exact'>('percent');
  const [percent, setPercent] = useState(50);
  const [longEdge, setLongEdge] = useState(1080);
  const [exactW, setExactW] = useState(800);
  const [exactH, setExactH] = useState(600);
  const [lockRatio, setLockRatio] = useState(true);
  // 格式参数
  const [targetFormat, setTargetFormat] = useState<'png' | 'jpg'>('jpg');
  const [jpgQuality, setJpgQuality] = useState(90);
  // 裁剪参数
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspectKey, setAspectKey] = useState('free');
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const selected = useMemo(() => images.find((i) => i.id === selectedId) || null, [images, selectedId]);

  // ===== 上传 =====
  const handleBeforeUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      message.error(`「${file.name}」不是图片文件`);
      return Upload.LIST_IGNORE;
    }
    if (file.size > MAX_SIZE) {
      message.error(`「${file.name}」超过 10M 限制，已跳过`);
      return Upload.LIST_IGNORE;
    }
    try {
      const { dataUrl, width, height } = await readFileAsImage(file);
      const item: WorkImage = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        dataUrl,
        originalDataUrl: dataUrl,
        width,
        height,
        originalWidth: width,
        originalHeight: height,
        size: file.size,
        originalSize: file.size,
      };
      setImages((prev) => [...prev, item]);
      setSelectedId(item.id);
    } catch {
      message.error(`「${file.name}」读取失败`);
    }
    return Upload.LIST_IGNORE;
  };

  // ===== 批量应用（压缩/缩放/格式） =====
  const applyToAll = async (
    fn: (el: HTMLImageElement) => Promise<OpResult>,
    successMsg: string
  ) => {
    if (images.length === 0) {
      message.warning('请先上传图片');
      return;
    }
    setProcessing(true);
    try {
      const updated: WorkImage[] = [];
      for (const img of images) {
        const el = await loadImage(img.dataUrl);
        const res = await fn(el);
        const ext = extOf(res.dataUrl);
        updated.push({
          ...img,
          dataUrl: res.dataUrl,
          width: res.width,
          height: res.height,
          size: res.size,
          name: withExt(img.name, ext),
        });
      }
      setImages(updated);
      message.success(`${successMsg}（共 ${updated.length} 张）`);
    } catch {
      message.error('处理失败，请重试');
    } finally {
      setProcessing(false);
    }
  };

  const handleCompress = () =>
    applyToAll(async (el) => {
      if (targetKB && targetKB > 0) return compressToTarget(el, targetKB, level);
      return compressWithQuality(el, level === 'hd' ? 0.85 : 0.65);
    }, '压缩完成');

  const handleResize = () =>
    applyToAll(async (el) => {
      if (resizeMode === 'percent') return resizeByPercent(el, percent);
      if (resizeMode === 'longedge') return resizeByLongEdge(el, longEdge);
      return lockRatio ? resizeToFit(el, exactW, exactH) : resizeToExact(el, exactW, exactH);
    }, '尺寸调整完成');

  const handleFormat = () =>
    applyToAll(
      (el) => convertFormat(el, targetFormat === 'png' ? 'image/png' : 'image/jpeg', jpgQuality / 100),
      `已转换为 ${targetFormat.toUpperCase()}`
    );

  // ===== 单张应用（旋转/裁剪） =====
  const applyToSelected = async (fn: (el: HTMLImageElement) => Promise<OpResult>, successMsg: string) => {
    if (!selected) {
      message.warning('请先在左侧选择一张图片');
      return;
    }
    setProcessing(true);
    try {
      const el = await loadImage(selected.dataUrl);
      const res = await fn(el);
      setImages((prev) =>
        prev.map((i) =>
          i.id === selected.id
            ? { ...i, dataUrl: res.dataUrl, width: res.width, height: res.height, size: res.size }
            : i
        )
      );
      message.success(successMsg);
    } catch {
      message.error('处理失败，请重试');
    } finally {
      setProcessing(false);
    }
  };

  const handleRotate = (angle: number) => applyToSelected((el) => rotateImage(el, angle), '旋转完成');

  const handleCrop = () =>
    applyToSelected((el) => {
      if (!croppedAreaPixels) return Promise.reject(new Error('no area'));
      return cropImage(el, croppedAreaPixels);
    }, '裁剪完成');

  // ===== 重置 / 删除 / 下载 =====
  const handleReset = () => {
    setImages((prev) =>
      prev.map((i) => ({
        ...i,
        dataUrl: i.originalDataUrl,
        width: i.originalWidth,
        height: i.originalHeight,
        size: i.originalSize,
        name: i.name,
      }))
    );
    message.success('已恢复为原图');
  };

  const handleRemove = (id: string) => {
    setImages((prev) => prev.filter((i) => i.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleDownloadOne = (img: WorkImage) => downloadDataUrl(img.dataUrl, img.name);

  const handleDownloadAll = async () => {
    if (images.length === 0) return;
    const zip = new JSZip();
    images.forEach((img, i) => {
      const base64 = img.dataUrl.split(',')[1];
      zip.file(`${String(i + 1).padStart(2, '0')}_${img.name}`, base64, { base64: true });
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `processed_images_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('打包下载已开始');
  };

  // ===== 各功能控制面板 =====
  const controlPanels: Record<OpKey, React.ReactNode> = {
    compress: (
      <div className="imgproc-controls">
        <div className="ctrl-row">
          <span className="ctrl-label">压缩程度</span>
          <Radio.Group value={level} onChange={(e) => setLevel(e.target.value)} optionType="button" buttonStyle="solid">
            <Radio.Button value="hd">高清</Radio.Button>
            <Radio.Button value="balanced">均衡</Radio.Button>
          </Radio.Group>
        </div>
        <div className="ctrl-row">
          <span className="ctrl-label">目标体积</span>
          <InputNumber
            value={targetKB}
            onChange={(v) => setTargetKB(v)}
            min={10}
            max={10240}
            addonAfter="KB/张"
            placeholder="留空则按档位质量压缩"
            style={{ width: 200 }}
          />
        </div>
        <p className="ctrl-hint">
          {level === 'hd' ? '高清：优先画质，体积可能略大' : '均衡：画质与体积兼顾'}
          {targetKB ? `，并确保每张 ≤ ${targetKB}KB（超出将自动降质量/缩尺寸）` : ''}
        </p>
        <Button type="primary" block loading={processing} onClick={handleCompress} icon={<CompressOutlined />}>
          压缩全部（{images.length} 张）
        </Button>
      </div>
    ),
    resize: (
      <div className="imgproc-controls">
        <div className="ctrl-row">
          <span className="ctrl-label">缩放方式</span>
          <Radio.Group value={resizeMode} onChange={(e) => setResizeMode(e.target.value)} optionType="button" buttonStyle="solid">
            <Radio.Button value="percent">等比缩放</Radio.Button>
            <Radio.Button value="exact">指定尺寸</Radio.Button>
          </Radio.Group>
        </div>
        {resizeMode === 'percent' && (
          <>
            <div className="ctrl-row">
              <span className="ctrl-label">缩放比例</span>
              <Slider
                value={percent}
                onChange={setPercent}
                min={5}
                max={150}
                style={{ flex: 1 }}
                // marks={{ 50: '50%', 100: '100%', 200: '200%' }}
              />
              <InputNumber value={percent} onChange={(v) => setPercent(v || 100)} min={5} max={400} addonAfter="%" style={{ width: 110 }} />
            </div>
            <div className="ctrl-row">
              <span className="ctrl-label">或按长边</span>
              <InputNumber value={longEdge} onChange={(v) => setLongEdge(v || 1080)} min={16} max={8000} addonAfter="px" style={{ width: 140 }} />
              <Button size="small" onClick={() => { setResizeMode('percent'); }}>
                使用长边模式
              </Button>
            </div>
          </>
        )}
        {resizeMode === 'exact' && (
          <>
            <div className="ctrl-row">
              <span className="ctrl-label">宽 × 高</span>
              <InputNumber value={exactW} onChange={(v) => setExactW(v || 100)} min={1} max={10000} addonAfter="px" style={{ width: 120 }} />
              <span className="ctrl-x">×</span>
              <InputNumber value={exactH} onChange={(v) => setExactH(v || 100)} min={1} max={10000} addonAfter="px" style={{ width: 120 }} />
            </div>
            <div className="ctrl-row">
              <span className="ctrl-label">锁定比例</span>
              <Switch checked={lockRatio} onChange={setLockRatio} checkedChildren="开" unCheckedChildren="关" />
              <span className="ctrl-hint-inline">{lockRatio ? '等比适配到框内，不变形' : '拉伸到精确尺寸'}</span>
            </div>
          </>
        )}
        <Button type="primary" block loading={processing} onClick={handleResize} icon={<ExpandOutlined />}>
          调整全部尺寸（{images.length} 张）
        </Button>
      </div>
    ),
    format: (
      <div className="imgproc-controls">
        <div className="ctrl-row">
          <span className="ctrl-label">目标格式</span>
          <Radio.Group value={targetFormat} onChange={(e) => setTargetFormat(e.target.value)} optionType="button" buttonStyle="solid">
            <Radio.Button value="jpg">JPG</Radio.Button>
            <Radio.Button value="png">PNG</Radio.Button>
          </Radio.Group>
        </div>
        {targetFormat === 'jpg' && (
          <div className="ctrl-row">
            <span className="ctrl-label">输出质量</span>
            <Slider value={jpgQuality} onChange={setJpgQuality} min={10} max={100} style={{ flex: 1 }} />
            <span className="ctrl-val">{jpgQuality}%</span>
          </div>
        )}
        <p className="ctrl-hint">{targetFormat === 'jpg' ? 'JPG 体积小，透明区域将填充白底' : 'PNG 无损，保留透明通道'}</p>
        <Button type="primary" block loading={processing} onClick={handleFormat} icon={<SwapOutlined />}>
          转换全部格式（{images.length} 张）
        </Button>
      </div>
    ),
    crop: (
      <div className="imgproc-controls">
        <div className="ctrl-row">
          <span className="ctrl-label">裁剪比例</span>
          <Select
            value={aspectKey}
            onChange={(v) => {
              setAspectKey(v);
              setCrop({ x: 0, y: 0 });
              setZoom(1);
            }}
            options={ASPECT_OPTIONS}
            style={{ width: 150 }}
          />
        </div>
        <div className="ctrl-row">
          <span className="ctrl-label">缩放</span>
          <Slider value={zoom} onChange={setZoom} min={1} max={4} step={0.1} style={{ flex: 1 }} />
          <span className="ctrl-val">{zoom.toFixed(1)}x</span>
        </div>
        <p className="ctrl-hint">在右侧预览中拖动、缩放调整裁剪区域，仅作用于当前选中图片</p>
        <Button type="primary" block loading={processing} onClick={handleCrop} disabled={!selected} icon={<BlockOutlined />}>
          裁剪当前图片
        </Button>
      </div>
    ),
    rotate: (
      <div className="imgproc-controls">
        <p className="ctrl-hint">旋转仅作用于当前选中图片</p>
        <div className="ctrl-rotate-btns">
          <Button onClick={() => handleRotate(-90)} disabled={processing} icon={<RotateRightOutlined style={{ transform: 'scaleX(-1)' }} />}>
            左转 90°
          </Button>
          <Button onClick={() => handleRotate(90)} disabled={processing} icon={<RotateRightOutlined />}>
            右转 90°
          </Button>
          <Button onClick={() => handleRotate(180)} disabled={processing}>
            旋转 180°
          </Button>
        </div>
      </div>
    ),
  };

  return (
    <div className="imgproc">
      {/* 顶部工具栏 */}
      <div className="imgproc-toolbar">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack}>
          返回工具箱
        </Button>
        <div className="imgproc-toolbar-right">
          <Upload accept="image/*" multiple showUploadList={false} beforeUpload={handleBeforeUpload}>
            <Button icon={<PlusOutlined />}>添加图片</Button>
          </Upload>
          <Tooltip title="恢复所有图片为原始状态">
            <Button icon={<UndoOutlined />} onClick={handleReset} disabled={images.length === 0}>
              重置
            </Button>
          </Tooltip>
          <Button type="primary" icon={<DownloadOutlined />} onClick={handleDownloadAll} disabled={images.length === 0}>
            打包下载
          </Button>
        </div>
      </div>

      <div className="imgproc-body">
        {/* 左侧：图片列表 */}
        <aside className="imgproc-sidebar">
          <div className="imgproc-sidebar-title">
            图片列表 <span className="imgproc-count">{images.length}</span>
          </div>
          {images.length === 0 ? (
            <Dragger accept="image/*" multiple showUploadList={false} beforeUpload={handleBeforeUpload} className="imgproc-uploader">
              <p className="ant-upload-drag-icon">
                <PictureOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽图片</p>
              <p className="ant-upload-hint">支持多选，单张 ≤ 10M</p>
            </Dragger>
          ) : (
            <div className="imgproc-list">
              {images.map((img) => (
                <div
                  key={img.id}
                  className={`imgproc-item ${img.id === selectedId ? 'active' : ''}`}
                  onClick={() => setSelectedId(img.id)}
                >
                  <img src={img.dataUrl} alt={img.name} className="imgproc-item-thumb" />
                  <div className="imgproc-item-info">
                    <Tooltip title={img.name}>
                      <span className="imgproc-item-name">{img.name}</span>
                    </Tooltip>
                    <span className="imgproc-item-meta">
                      {img.width}×{img.height} · {formatBytes(img.size)}
                    </span>
                  </div>
                  <div className="imgproc-item-actions">
                    <Tooltip title="下载">
                      <Button
                        type="text"
                        size="small"
                        icon={<DownloadOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadOne(img);
                        }}
                      />
                    </Tooltip>
                    <Tooltip title="移除">
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemove(img.id);
                        }}
                      />
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* 右侧：操作区 */}
        <main className="imgproc-main">
          <Tabs
            activeKey={op}
            onChange={(k) => setOp(k as OpKey)}
            items={[
              { key: 'compress', label: <span><CompressOutlined /> 压缩</span> },
              { key: 'resize', label: <span><ExpandOutlined /> 改尺寸</span> },
              { key: 'format', label: <span><SwapOutlined /> 改格式</span> },
              { key: 'crop', label: <span><BlockOutlined /> 裁剪</span> },
              { key: 'rotate', label: <span><RotateRightOutlined /> 旋转</span> },
            ]}
          />

          <div className="imgproc-workarea">
            {/* 控制面板 */}
            <div className="imgproc-panel">{controlPanels[op]}</div>

            {/* 预览区 */}
            <div className="imgproc-preview">
              {!selected ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="请先在左侧上传或选择图片"
                  className="imgproc-preview-empty"
                />
              ) : op === 'crop' ? (
                <div className="imgproc-cropbox">
                  <Cropper
                    image={selected.dataUrl}
                    crop={crop}
                    zoom={zoom}
                    aspect={aspectToNumber(aspectKey)}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
                  />
                </div>
              ) : (
                <div className="imgproc-preview-box">
                  <img src={selected.dataUrl} alt={selected.name} className="imgproc-preview-img" />
                  <div className="imgproc-preview-meta">
                    {selected.width} × {selected.height} px · {formatBytes(selected.size)}
                    {selected.size !== selected.originalSize && (
                      <span className="imgproc-preview-delta">
                        （原 {formatBytes(selected.originalSize)}，
                        {selected.size < selected.originalSize ? '已减小' : '已增大'}{' '}
                        {Math.abs(Math.round(((selected.size - selected.originalSize) / selected.originalSize) * 100))}%）
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
