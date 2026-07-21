/**
 * 工具路由 - 视频压缩 / 格式转换
 * 使用 ffmpeg-static + fluent-ffmpeg 在服务端处理
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

const router = express.Router();

// 设置 ffmpeg / ffprobe 二进制路径
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// 临时文件目录
const TMP_DIR = path.join(os.tmpdir(), 'electron-demo-video');
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// multer 配置：最大 500MB
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, TMP_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(mp4|avi|mov|mkv|webm|flv|wmv|m4v|3gp|ts|mpeg|mpg)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('不支持的视频格式'));
    }
  },
});

// 质量档位 → CRF 值（越大文件越小、画质越低）
const QUALITY_CRF = { high: 22, medium: 28, low: 34 };

// 目标分辨率 → scale 滤镜（宽度自适应保持比例）
const RESOLUTION_SCALE = {
  original: null,
  '1080p': 'scale=-2:1080',
  '720p': 'scale=-2:720',
  '480p': 'scale=-2:480',
};

// 输出格式对应的编码器
const FORMAT_CONFIG = {
  mp4: { videoCodec: 'libx264', audioCodec: 'aac', ext: '.mp4', mime: 'video/mp4' },
  webm: { videoCodec: 'libvpx-vp9', audioCodec: 'libopus', ext: '.webm', mime: 'video/webm' },
  avi: { videoCodec: 'libx264', audioCodec: 'mp3', ext: '.avi', mime: 'video/x-msvideo' },
  mov: { videoCodec: 'libx264', audioCodec: 'aac', ext: '.mov', mime: 'video/quicktime' },
  mkv: { videoCodec: 'libx264', audioCodec: 'aac', ext: '.mkv', mime: 'video/x-matroska' },
  gif: { videoCodec: null, audioCodec: null, ext: '.gif', mime: 'image/gif' },
};

/**
 * 获取视频信息（时长、尺寸、码率）
 */
function probeVideo(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const videoStream = (metadata.streams || []).find((s) => s.codec_type === 'video');
      resolve({
        duration: metadata.format?.duration || 0,
        width: videoStream?.width || 0,
        height: videoStream?.height || 0,
        bitrate: metadata.format?.bit_rate || 0,
        size: metadata.format?.size || 0,
        formatName: metadata.format?.format_name || '',
      });
    });
  });
}

/**
 * POST /api/tools/video-info
 * 获取视频元信息（上传前预览用）
 */
router.post('/video-info', upload.single('video'), async (req, res, next) => {
  const inputPath = req.file?.path;
  try {
    if (!inputPath) {
      return res.status(400).json({ success: false, message: '请上传视频文件' });
    }
    const info = await probeVideo(inputPath);
    res.json({ success: true, data: info });
  } catch (err) {
    next(err);
  } finally {
    // 清理上传的临时文件
    if (inputPath) fs.unlink(inputPath, () => {});
  }
});

/**
 * POST /api/tools/video-compress
 * 压缩 / 转换视频
 * Body (multipart): video, format, quality, resolution
 * Response: 压缩后的视频文件流
 */
router.post('/video-compress', upload.single('video'), async (req, res, next) => {
  const inputPath = req.file?.path;
  // 输出路径：基于输入文件名派生（注意 inputPath 是完整路径，需先取 basename 再替换前缀）
  const outputPath = inputPath
    ? path.join(
        path.dirname(inputPath),
        path.basename(inputPath).replace(/^upload_/, 'output_').replace(/\.[^.]+$/, '') +
          (FORMAT_CONFIG[req.body.format]?.ext || '.mp4')
      )
    : null;

  try {
    if (!inputPath) {
      return res.status(400).json({ success: false, message: '请上传视频文件' });
    }

    const format = req.body.format || 'mp4';
    const quality = req.body.quality || 'medium';
    const resolution = req.body.resolution || 'original';

    const fmtConfig = FORMAT_CONFIG[format];
    if (!fmtConfig) {
      return res.status(400).json({ success: false, message: `不支持的输出格式: ${format}` });
    }

    const crf = QUALITY_CRF[quality] ?? 28;
    const scaleFilter = RESOLUTION_SCALE[resolution] ?? null;

    await new Promise((resolve, reject) => {
      let cmd = ffmpeg(inputPath);

      if (format === 'gif') {
        // GIF 转换：限制帧率和宽度以控制体积
        const filters = ['fps=12'];
        if (scaleFilter) filters.push(scaleFilter);
        else filters.push('scale=-2:-2');
        cmd.outputOptions('-vf', filters.join(','));
        cmd.outputOptions('-loop', '0');
      } else {
        cmd.videoCodec(fmtConfig.videoCodec);
        cmd.audioCodec(fmtConfig.audioCodec);
        cmd.outputOptions('-crf', String(crf));
        cmd.outputOptions('-preset', 'fast');
        if (scaleFilter) {
          cmd.outputOptions('-vf', scaleFilter);
        }
        // mp4 流式播放优化
        if (format === 'mp4') {
          cmd.outputOptions('-movflags', '+faststart');
        }
      }

      cmd
        .output(outputPath)
        .on('end', resolve)
        .on('error', (err) => reject(new Error(`ffmpeg 处理失败: ${err.message}`)))
        .run();
    });

    // 检查输出文件
    if (!fs.existsSync(outputPath)) {
      throw new Error('压缩输出文件不存在');
    }

    const stat = fs.statSync(outputPath);
    const originalName = (req.file.originalname || 'video').replace(/\.[^.]+$/, '');
    const downloadName = `${originalName}_compressed${fmtConfig.ext}`;

    res.setHeader('Content-Type', fmtConfig.mime);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
    res.setHeader('X-Output-Size', String(stat.size));

    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on('close', () => {
      // 传输完成后清理临时文件
      fs.unlink(inputPath, () => {});
      fs.unlink(outputPath, () => {});
    });
  } catch (err) {
    // 出错时清理
    if (inputPath) fs.unlink(inputPath, () => {});
    if (outputPath) fs.unlink(outputPath, () => {});
    next(err);
  }
});

module.exports = router;
