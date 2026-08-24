/**
 * 工具箱 - 实用功能集合
 * 每个功能独立卡片，点击进入对应工具
 * 使用 antd 6 组件，沿用系统暗色风格
 */
import { useState } from 'react';
import { Card, Tag } from 'antd';
import { FilePdfOutlined, ToolOutlined, ScanOutlined, PictureOutlined, FilePptOutlined, FileWordOutlined, FileImageOutlined, VideoCameraOutlined, SplitCellsOutlined, MergeCellsOutlined } from '@ant-design/icons';
import ImageToPdf from './tools/ImageToPdf';
import OcrTool from './tools/OcrTool';
import ImageProcessor from './tools/ImageProcessor';
import PdfToPpt from './tools/PdfToPpt';
import PdfToWord from './tools/PdfToWord';
import WordToImage from './tools/WordToImage';
import WordToPdf from './tools/WordToPdf';
import VideoCompress from './tools/VideoCompress';
import PdfSplit from './tools/PdfSplit';
import PdfMerge from './tools/PdfMerge';
import './Toolbox.less';

type ToolKey = 'image-to-pdf' | 'ocr' | 'image-processor' | 'pdf-to-ppt' | 'pdf-to-word' | 'word-to-image' | 'word-to-pdf' | 'video-compress' | 'pdf-split' | 'pdf-merge';

interface ToolMeta {
  key: ToolKey;
  title: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
  available: boolean;
}


const TOOLS: ToolMeta[] = [
  {
    key: 'image-to-pdf',
    title: '图片转 PDF',
    desc: '多张图片一键合并导出为 PDF 文档',
    icon: <FilePdfOutlined />,
    color: '#6366f1',
    available: true,
  },
  {
    key: 'ocr',
    title: '图片文字识别',
    desc: '提取图片中的中英文文字',
    icon: <ScanOutlined />,
    color: '#10b981',
    available: true,
  },
  {
    key: 'image-processor',
    title: '图片处理',
    desc: '压缩 / 改尺寸 / 改格式 / 裁剪 / 旋转',
    icon: <PictureOutlined />,
    color: '#f59e0b',
    available: true,
  },
  {
    key: 'pdf-to-ppt',
    title: 'PDF 转 PPT',
    desc: 'PDF 逐页高清转为 PowerPoint 幻灯片',
    icon: <FilePptOutlined />,
    color: '#ef4444',
    available: true,
  },
  {
    key: 'pdf-to-word',
    title: 'PDF 转 Word',
    desc: 'PDF 逐页高清还原为 Word 文档',
    icon: <FileWordOutlined />,
    color: '#2563eb',
    available: true,
  },
  {
    key: 'word-to-image',
    title: 'Word 转图片',
    desc: 'Word 文档按原始排版完整导出为 PNG / JPG',
    icon: <FileImageOutlined />,
    color: '#14b8a6',
    available: true,
  },
  {
    key: 'word-to-pdf',
    title: 'Word 转 PDF',
    desc: 'Word 文档按原始排版转为多页 PDF，几页转几页',
    icon: <FilePdfOutlined />,
    color: '#e11d48',
    available: true,
  },
  {
    key: 'pdf-split',
    title: 'PDF 拆分',
    desc: '按拆分点把一个 PDF 拆成多个，原样无损',
    icon: <SplitCellsOutlined />,
    color: '#0ea5e9',
    available: true,
  },
  {
    key: 'pdf-merge',
    title: 'PDF 合并',
    desc: '多个 PDF 按顺序合并为一个，原样无损',
    icon: <MergeCellsOutlined />,
    color: '#d946ef',
    available: true,
  },
  {
    key: 'video-compress',
    title: '视频压缩',
    desc: '压缩视频体积 / 转换视频格式',
    icon: <VideoCameraOutlined />,
    color: '#8b5cf6',
    available: true,
  },
];

export default function Toolbox() {
  const [activeTool, setActiveTool] = useState<ToolKey | null>(null);

  // 进入具体工具
  if (activeTool === 'image-to-pdf') {
    return <ImageToPdf onBack={() => setActiveTool(null)} />;
  }
  if (activeTool === 'ocr') {
    return <OcrTool onBack={() => setActiveTool(null)} />;
  }
  if (activeTool === 'image-processor') {
    return <ImageProcessor onBack={() => setActiveTool(null)} />;
  }
  if (activeTool === 'pdf-to-ppt') {
    return <PdfToPpt onBack={() => setActiveTool(null)} />;
  }
  if (activeTool === 'pdf-to-word') {
    return <PdfToWord onBack={() => setActiveTool(null)} />;
  }
  if (activeTool === 'word-to-image') {
    return <WordToImage onBack={() => setActiveTool(null)} />;
  }
  if (activeTool === 'word-to-pdf') {
    return <WordToPdf onBack={() => setActiveTool(null)} />;
  }
  if (activeTool === 'pdf-split') {
    return <PdfSplit onBack={() => setActiveTool(null)} />;
  }
  if (activeTool === 'pdf-merge') {
    return <PdfMerge onBack={() => setActiveTool(null)} />;
  }
  if (activeTool === 'video-compress') {
    return <VideoCompress onBack={() => setActiveTool(null)} />;
  }

  // 工具列表
  return (
    <div className="toolbox">
      <div className="toolbox-intro">
        <div className="toolbox-intro-icon">
          <ToolOutlined />
        </div>
        <div>
          <h3>实用工具箱</h3>
          <p>选择下方任意工具开始使用，更多功能持续加入中</p>
        </div>
      </div>

      <div className="toolbox-grid">
        {TOOLS.map((tool) => (
          <Card
            key={tool.key}
            hoverable={tool.available}
            className={`toolbox-card ${tool.available ? '' : 'disabled'}`}
            onClick={() => tool.available && setActiveTool(tool.key)}
          >
            <div className="toolbox-card-icon" style={{ background: `${tool.color}1a`, color: tool.color }}>
              {tool.icon}
            </div>
            <div className="toolbox-card-body">
              <div className="toolbox-card-title">
                {tool.title}
                {!tool.available && <Tag color="default">敬请期待</Tag>}
              </div>
              <div className="toolbox-card-desc">{tool.desc}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
