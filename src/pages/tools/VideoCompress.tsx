/**
 * 视频压缩工具
 * 上传视频 → 选择目标格式 / 压缩质量 / 分辨率 → 服务端 ffmpeg 压缩 → 下载结果
 * 支持格式转换：MP4 / WebM / AVI / MOV / MKV / GIF
 */
import { useState, useRef } from 'react';
import { Upload, Button, Empty, App, Radio, Tooltip, Progress, Select } from 'antd';
import {
  ArrowLeftOutlined,
  InboxOutlined,
  VideoCameraOutlined,
  DeleteOutlined,
  CompressOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { formatBytes } from '../../utils/imageOps';
import './convert.less';

const { Dragger } = Upload;
const MAX_SIZE = 500 * 1024 * 1024; // 500M
const API_BASE = 'http://127.0.0.1:3900/api';

const FORMAT_OPTIONS = [
  { value: 'mp4', label: 'MP4' },
  { value: 'webm', label: 'WebM' },
  { value: 'avi', label: 'AVI' },
  { value: 'mov', label: 'MOV' },
  { value: 'mkv', label: 'MKV' },
  { value: 'gif', label: 'GIF' },
];

const QUALITY_OPTIONS = [
  { value: 'high', label: '高画质' },
  { value: 'medium', label: '均衡' },
  { value: 'low', label: '小体积' },
];

const RESOLUTION_OPTIONS = [
  { value: 'original', label: '原始分辨率' },
  { value: '1080p', label: '1080P' },
  { value: '720p', label: '720P' },
  { value: '480p', label: '480P' },
];

interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  bitrate: number;
  size: number;
  formatName: string;
}

interface VideoCompressProps {
  onBack: () => void;
}

function formatDuration(sec: number): string {
  if (!sec || !isFinite(sec)) return '--';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function VideoCompress({ onBack }: VideoCompressProps) {
  const { message } = App.useApp();
  const [file, setFile] = useState<File | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [format, setFormat] = useState('mp4');
  const [quality, setQuality] = useState('medium');
  const [resolution, setResolution] = useState('original');
  const [compressing, setCompressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultSize, setResultSize] = useState<number | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 上传后获取视频信息
  const handleBeforeUpload = async (f: File) => {
    const videoExts = /\.(mp4|avi|mov|mkv|webm|flv|wmv|m4v|3gp|ts|mpeg|mpg)$/i;
    if (!videoExts.test(f.name)) {
      message.error('请上传视频文件（支持 MP4 / AVI / MOV / MKV / WebM 等格式）');
      return Upload.LIST_IGNORE;
    }
    if (f.size > MAX_SIZE) {
      message.error(`文件超过 500M 限制（当前 ${formatBytes(f.size)}）`);
      return Upload.LIST_IGNORE;
    }
    setFile(f);
    setVideoInfo(null);
    setResultBlob(null);
    setResultSize(null);
    setProgress(0);

    // 获取视频元信息
    try {
      const formData = new FormData();
      formData.append('video', f);
      const resp = await fetch(`${API_BASE}/tools/video-info`, { method: 'POST', body: formData });
      const json = await resp.json();
      if (json.success && json.data) {
        setVideoInfo(json.data);
      }
    } catch {
      // 获取信息失败不阻塞使用
    }
    return Upload.LIST_IGNORE;
  };

  // 开始压缩
  const handleCompress = async () => {
    if (!file) return;
    setCompressing(true);
    setProgress(0);
    setResultBlob(null);
    setResultSize(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const formData = new FormData();
      formData.append('video', file);
      formData.append('format', format);
      formData.append('quality', quality);
      formData.append('resolution', resolution);

      const resp = await fetch(`${API_BASE}/tools/video-compress`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!resp.ok) {
        let errMsg = `压缩失败（HTTP ${resp.status}）`;
        try {
          const json = await resp.json();
          if (json.message) errMsg = json.message;
        } catch { /* ignore */ }
        throw new Error(errMsg);
      }

      // 读取响应流并显示进度
      const contentLength = Number(resp.headers.get('Content-Length')) || 0;
      const outputSize = Number(resp.headers.get('X-Output-Size')) || contentLength;

      if (resp.body) {
        const reader = resp.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          if (outputSize > 0) {
            setProgress(Math.min(99, Math.round((received / outputSize) * 100)));
          }
        }

        const blob = new Blob(chunks as BlobPart[], { type: resp.headers.get('Content-Type') || 'video/mp4' });
        setResultBlob(blob);
        setResultSize(blob.size);
        setProgress(100);
        message.success('压缩完成，可下载结果');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        message.info('已取消压缩');
      } else {
        message.error(err?.message || '压缩失败，请确认应用后端服务正在运行');
      }
    } finally {
      setCompressing(false);
      abortRef.current = null;
    }
  };

  // 下载结果
  const handleDownload = () => {
    if (!resultBlob || !file) return;
    const ext = FORMAT_OPTIONS.find((o) => o.value === format)?.value || 'mp4';
    const baseName = file.name.replace(/\.[^.]+$/, '');
    const url = URL.createObjectURL(resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}_compressed.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    if (compressing && abortRef.current) {
      abortRef.current.abort();
    }
    setFile(null);
    setVideoInfo(null);
    setResultBlob(null);
    setResultSize(null);
    setProgress(0);
  };

  const compressRatio =
    resultSize !== null && file ? Math.round((1 - resultSize / file.size) * 100) : null;

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
          {resultBlob ? (
            <Button type="primary" icon={<DownloadOutlined />} onClick={handleDownload}>
              下载压缩结果
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<CompressOutlined />}
              disabled={!file || compressing}
              loading={compressing}
              onClick={handleCompress}
            >
              {compressing ? '压缩中…' : '开始压缩'}
            </Button>
          )}
        </div>
      </div>

      <div className="convert-body">
        {!file ? (
          <Dragger
            accept=".mp4,.avi,.mov,.mkv,.webm,.flv,.wmv,.m4v,.3gp,.ts,.mpeg,.mpg"
            showUploadList={false}
            beforeUpload={handleBeforeUpload}
            className="convert-uploader"
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽视频文件到此处</p>
            <p className="ant-upload-hint">
              支持 MP4 / AVI / MOV / MKV / WebM 等格式，可压缩体积或转换格式，单个文件不超过 500M
            </p>
          </Dragger>
        ) : (
          <>
            <div className="convert-fileinfo">
              <VideoCameraOutlined className="fi-icon" />
              <Tooltip title={file.name}>
                <span className="fi-name">{file.name}</span>
              </Tooltip>
              <span className="fi-meta">
                {formatBytes(file.size)}
                {videoInfo ? ` · ${videoInfo.width}×${videoInfo.height} · ${formatDuration(videoInfo.duration)}` : ''}
              </span>
            </div>

            <div className="convert-options">
              <div className="opt-item">
                <span className="opt-label">输出格式</span>
                <Radio.Group
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  optionType="button"
                  buttonStyle="solid"
                  disabled={compressing}
                  options={FORMAT_OPTIONS}
                />
              </div>
              <div className="opt-item">
                <span className="opt-label">压缩质量</span>
                <Radio.Group
                  value={quality}
                  onChange={(e) => setQuality(e.target.value)}
                  optionType="button"
                  buttonStyle="solid"
                  disabled={compressing}
                  options={QUALITY_OPTIONS}
                />
              </div>
              <div className="opt-item">
                <span className="opt-label">分辨率</span>
                <Select
                  value={resolution}
                  onChange={setResolution}
                  options={RESOLUTION_OPTIONS}
                  disabled={compressing}
                  style={{ width: 140 }}
                  size="small"
                />
              </div>
            </div>

            {compressing && (
              <div style={{ margin: '16px 0' }}>
                <Progress percent={progress} status="active" strokeColor="#6366f1" />
                <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
                  正在上传并压缩视频，大文件可能需要较长时间，请耐心等待…
                </div>
              </div>
            )}

            {resultBlob && resultSize !== null && (
              <div className="video-result-card">
                <div className="video-result-row">
                  <span className="video-result-label">原始大小</span>
                  <span>{formatBytes(file.size)}</span>
                </div>
                <div className="video-result-row">
                  <span className="video-result-label">压缩后</span>
                  <span style={{ color: '#10b981', fontWeight: 600 }}>{formatBytes(resultSize)}</span>
                </div>
                {compressRatio !== null && compressRatio > 0 && (
                  <div className="video-result-row">
                    <span className="video-result-label">压缩率</span>
                    <span style={{ color: '#10b981' }}>减小 {compressRatio}%</span>
                  </div>
                )}
                {compressRatio !== null && compressRatio <= 0 && (
                  <div className="video-result-row">
                    <span className="video-result-label">提示</span>
                    <span style={{ color: '#f59e0b' }}>
                      输出未变小，可尝试降低画质或分辨率
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <div className="convert-preview">
          {!file ? null : resultBlob ? (
            <div style={{ textAlign: 'center' }}>
              <video
                controls
                style={{ maxWidth: '100%', maxHeight: 420, borderRadius: 8, background: '#000' }}
                src={URL.createObjectURL(resultBlob)}
              />
              <div style={{ marginTop: 8, color: '#888', fontSize: 12 }}>压缩结果预览</div>
            </div>
          ) : (
            <Empty description="选择参数后点击「开始压缩」" className="convert-empty" />
          )}
        </div>
      </div>
    </div>
  );
}
