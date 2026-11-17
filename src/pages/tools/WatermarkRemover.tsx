/**
 * 图片去水印工具
 * - 橡皮擦手动涂抹水印区域（淡红色半透明，粗细可调 5~100px）
 * - 笔画栈支持逐笔撤销与一键清空
 * - 点「去除水印」导出原图分辨率黑白蒙版，调云端 LaMa AI 修复
 * - 结果用左右拖动分割线对比：左=原图，右=去除后
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Button, Empty, App, Slider, Spin, Tooltip } from 'antd';
import {
  ArrowLeftOutlined,
  InboxOutlined,
  PictureOutlined,
  DeleteOutlined,
  UndoOutlined,
  ClearOutlined,
  DownloadOutlined,
  EditOutlined,
  StopOutlined,
  HighlightOutlined,
} from '@ant-design/icons';
import { api } from '../../api/client';
import { formatBytes, downloadBlob } from '../../utils/imageOps';
import './convert.less';
import './WatermarkRemover.less';

const { Dragger } = Upload;
const MAX_SIZE = 10 * 1024 * 1024; // 与后端 MAX_FILE_SIZES.watermark 一致
const ALLOW_EXTS = ['.jpg', '.jpeg', '.png', '.bmp', '.webp'];
const STROKE_COLOR = 'rgba(255, 80, 80, 0.35)';
// 显示区域上限（等比缩放适配）
const MAX_DISPLAY_W = 860;
const MAX_DISPLAY_H = 560;

interface Point {
  x: number;
  y: number;
}

/** 一笔涂抹：显示坐标系下的点集 + 笔刷粗细（显示像素） */
interface Stroke {
  points: Point[];
  size: number;
}

interface WatermarkRemoverProps {
  onBack: () => void;
}

/** 在 2d 上下文里按点集画一笔（圆头连线） */
function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, color: string, scale = 1) {
  const { points, size } = stroke;
  if (points.length === 0) return;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = size * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x * scale, points[0].y * scale, (size * scale) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x * scale, points[0].y * scale);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x * scale, points[i].y * scale);
  }
  ctx.stroke();
}

export default function WatermarkRemover({ onBack }: WatermarkRemoverProps) {
  const { message } = App.useApp();
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number } | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [brushSize, setBrushSize] = useState(32);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ url: string; blob: Blob; filename: string } | null>(null);
  const [splitP, setSplitP] = useState(50);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const compareRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef<Stroke | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // 跟踪最新 objectURL，供卸载时释放（避免闭包捕获旧值）
  const imageUrlRef = useRef('');
  const resultUrlRef = useRef<string | null>(null);
  imageUrlRef.current = imageUrl;
  resultUrlRef.current = result?.url ?? null;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
  }, []);

  // 底图画布：图片加载后绘制缩放原图
  useEffect(() => {
    const canvas = baseCanvasRef.current;
    if (!canvas || !displaySize || !imageUrl) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = displaySize.w;
      canvas.height = displaySize.h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, displaySize.w, displaySize.h);
    };
    img.src = imageUrl;
  }, [imageUrl, displaySize]);

  // 蒙版画布：笔画栈变化（撤销/清空/落笔提交）后全量重绘
  useEffect(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas || !displaySize) return;
    canvas.width = displaySize.w;
    canvas.height = displaySize.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokes.forEach((s) => drawStroke(ctx, s, STROKE_COLOR));
  }, [strokes, displaySize]);

  const handleBeforeUpload = (f: File) => {
    const ext = `.${f.name.split('.').pop()?.toLowerCase() || ''}`;
    if (!ALLOW_EXTS.includes(ext)) {
      message.error('仅支持 JPG / PNG / BMP / WEBP 图片');
      return Upload.LIST_IGNORE;
    }
    if (f.size > MAX_SIZE) {
      message.error(`图片超过 10M 限制（当前 ${formatBytes(f.size)}）`);
      return Upload.LIST_IGNORE;
    }
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(MAX_DISPLAY_W / img.naturalWidth, MAX_DISPLAY_H / img.naturalHeight, 1);
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      if (result) URL.revokeObjectURL(result.url);
      setFile(f);
      setImageUrl(url);
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      setDisplaySize({
        w: Math.round(img.naturalWidth * scale),
        h: Math.round(img.naturalHeight * scale),
      });
      setStrokes([]);
      setResult(null);
      setSplitP(50);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      message.error('图片加载失败，请换一张试试');
    };
    img.src = url;
    return Upload.LIST_IGNORE;
  };

  // ===== 涂抹交互 =====

  const getCanvasPoint = (e: React.PointerEvent): Point => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (processing || !displaySize) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = getCanvasPoint(e);
    drawingRef.current = { points: [p], size: brushSize };
    const ctx = maskCanvasRef.current?.getContext('2d');
    if (ctx) drawStroke(ctx, drawingRef.current, STROKE_COLOR);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = getCanvasPoint(e);
    setCursor(p);
    const stroke = drawingRef.current;
    if (!stroke) return;
    const last = stroke.points[stroke.points.length - 1];
    stroke.points.push(p);
    const ctx = maskCanvasRef.current?.getContext('2d');
    if (ctx) {
      // 增量画最新线段，保证涂抹跟手
      ctx.strokeStyle = STROKE_COLOR;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  };

  const handlePointerUp = () => {
    const stroke = drawingRef.current;
    drawingRef.current = null;
    if (stroke && stroke.points.length > 0) {
      setStrokes((prev) => [...prev, stroke]);
    }
  };

  const handleUndo = () => setStrokes((prev) => prev.slice(0, -1));
  const handleClearStrokes = () => setStrokes([]);

  /** 按原图分辨率导出黑白蒙版 PNG（黑底、白色笔画） */
  const exportMaskBlob = useCallback((): Promise<Blob | null> => {
    if (!naturalSize || !displaySize) return Promise.resolve(null);
    const canvas = document.createElement('canvas');
    canvas.width = naturalSize.w;
    canvas.height = naturalSize.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return Promise.resolve(null);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const scale = naturalSize.w / displaySize.w;
    strokes.forEach((s) => drawStroke(ctx, s, '#fff', scale));
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  }, [strokes, naturalSize, displaySize]);

  const handleRemove = async () => {
    if (!file) return;
    if (strokes.length === 0) {
      message.warning('请先涂抹水印区域');
      return;
    }
    const maskBlob = await exportMaskBlob();
    if (!maskBlob) {
      message.error('蒙版生成失败，请重试');
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setProcessing(true);
    try {
      const { blob, filename } = await api.removeWatermark(file, maskBlob, controller.signal);
      if (result) URL.revokeObjectURL(result.url);
      setResult({ url: URL.createObjectURL(blob), blob, filename });
      setSplitP(50);
      message.success('水印去除完成');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        message.error('去除失败：' + (err?.message || '网络错误'));
      }
    } finally {
      setProcessing(false);
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setProcessing(false);
    message.info('已取消去除');
  };

  // ===== 对比滑杆 =====

  const updateSplit = (clientX: number) => {
    const el = compareRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const p = ((clientX - rect.left) / rect.width) * 100;
    setSplitP(Math.min(100, Math.max(0, p)));
  };

  const handleCompareDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    updateSplit(e.clientX);
  };

  const handleCompareMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // 仅在按住拖动（pointer capture 中）时更新分割线
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      updateSplit(e.clientX);
    }
  };

  const handleReset = () => {
    abortRef.current?.abort();
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    if (result) URL.revokeObjectURL(result.url);
    setFile(null);
    setImageUrl('');
    setNaturalSize(null);
    setDisplaySize(null);
    setStrokes([]);
    setResult(null);
  };

  // ===== 渲染 =====

  return (
    <div className="convert-tool">
      <div className="convert-toolbar">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack}>
          返回工具箱
        </Button>
        <div className="convert-toolbar-right">
          {processing && (
            <Button danger icon={<StopOutlined />} onClick={handleCancel}>
              取消
            </Button>
          )}
          {file && !processing && (
            <Button icon={<DeleteOutlined />} onClick={handleReset}>
              换一张图
            </Button>
          )}
          {result ? (
            <>
              <Button icon={<EditOutlined />} onClick={() => setResult(null)}>
                重新涂抹
              </Button>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                onClick={() => downloadBlob(result.blob, result.filename)}
              >
                下载结果
              </Button>
            </>
          ) : (
            <Button
              type="primary"
              icon={<HighlightOutlined />}
              loading={processing}
              disabled={!file || strokes.length === 0}
              onClick={handleRemove}
            >
              去除水印
            </Button>
          )}
        </div>
      </div>

      <div className="convert-body">
        {!file ? (
          <Dragger
            accept={ALLOW_EXTS.join(',')}
            showUploadList={false}
            beforeUpload={handleBeforeUpload}
            className="convert-uploader"
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽图片到此处</p>
            <p className="ant-upload-hint">
              涂抹水印区域后由云端 LaMa AI 模型修复重绘，支持 JPG / PNG / BMP / WEBP，不超过 10M
            </p>
          </Dragger>
        ) : result ? (
          <div className="wm-result-wrap">
            <div
              className="wm-compare"
              ref={compareRef}
              style={{ width: displaySize?.w, height: displaySize?.h }}
              onPointerDown={handleCompareDown}
              onPointerMove={handleCompareMove}
            >
              <img className="wm-layer" src={result.url} alt="去除后" draggable={false} />
              <img
                className="wm-layer wm-layer-before"
                src={imageUrl}
                alt="原图"
                draggable={false}
                style={{ clipPath: `inset(0 ${100 - splitP}% 0 0)` }}
              />
              <div className="wm-split-line" style={{ left: `${splitP}%` }}>
                <div className="wm-split-grip">⇔</div>
              </div>
              <span className="wm-tag wm-tag-left">原图</span>
              <span className="wm-tag wm-tag-right">去除后</span>
            </div>
            <div className="wm-hint">拖动分割线对比：往右看原图，往左看去除效果</div>
          </div>
        ) : (
          <>
            <div className="convert-fileinfo">
              <PictureOutlined className="fi-icon" />
              <Tooltip title={file.name}>
                <span className="fi-name">{file.name}</span>
              </Tooltip>
              <span className="fi-meta">
                {formatBytes(file.size)}
                {naturalSize ? ` · ${naturalSize.w}×${naturalSize.h}` : ''}
              </span>
            </div>

            <div className="convert-options wm-options">
              <div className="opt-item wm-brush">
                <span className="opt-label">橡皮擦大小</span>
                <Slider
                  min={5}
                  max={100}
                  value={brushSize}
                  onChange={setBrushSize}
                  disabled={processing}
                  style={{ width: 180 }}
                />
                <span className="wm-brush-val">{brushSize}px</span>
              </div>
              <Button icon={<UndoOutlined />} disabled={strokes.length === 0 || processing} onClick={handleUndo}>
                撤销一笔
              </Button>
              <Button icon={<ClearOutlined />} disabled={strokes.length === 0 || processing} onClick={handleClearStrokes}>
                清空涂抹
              </Button>
              <span className="opt-label wm-strokes-count">已涂 {strokes.length} 笔</span>
            </div>

            <div className="convert-preview wm-canvas-preview">
              {processing ? (
                <div className="wm-processing">
                  <Spin size="large" />
                  <div className="wm-processing-text">AI 正在重绘涂抹区域…</div>
                  <div className="wm-processing-sub">首次调用需加载模型，可能较慢</div>
                </div>
              ) : (
                displaySize && (
                  <div
                    className="wm-canvas-wrap"
                    style={{ width: displaySize.w, height: displaySize.h }}
                    onMouseLeave={() => setCursor(null)}
                  >
                    <canvas ref={baseCanvasRef} className="wm-canvas" width={displaySize.w} height={displaySize.h} />
                    <canvas
                      ref={maskCanvasRef}
                      className="wm-canvas wm-canvas-mask"
                      width={displaySize.w}
                      height={displaySize.h}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                    />
                    {cursor && (
                      <div
                        className="wm-brush-cursor"
                        style={{
                          width: brushSize,
                          height: brushSize,
                          left: cursor.x - brushSize / 2,
                          top: cursor.y - brushSize / 2,
                        }}
                      />
                    )}
                  </div>
                )
              )}
            </div>
          </>
        )}

        {file && !result && !processing && (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="按住鼠标涂抹水印区域（淡红色），可调橡皮擦大小，涂完点「去除水印」"
            className="convert-empty wm-foot-hint"
          />
        )}
      </div>
    </div>
  );
}
