/**
 * 图片转 PDF 工具
 * 支持多图上传、预览、删除、拖拽排序，一键合并导出 PDF
 * 使用 antd 6 + jsPDF + dnd-kit
 */
import { useState } from 'react';
import { Upload, Button, Empty, App, Tooltip } from 'antd';
import {
  ArrowLeftOutlined,
  InboxOutlined,
  FilePdfOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { jsPDF } from 'jspdf';
import moment from 'moment';
import SortableGrid from '../../components/SortableGrid/SortableGrid';
import './ImageToPdf.less';

const { Dragger } = Upload;

// 单张图片大小上限：10M
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

interface ImageItem {
  uid: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  format: 'JPEG' | 'PNG';
  size: number;
}

interface ImageToPdfProps {
  onBack: () => void;
}

let uidSeed = 0;

export default function ImageToPdf({ onBack }: ImageToPdfProps) {
  const { message } = App.useApp();
  const [images, setImages] = useState<ImageItem[]>([]);
  const [generating, setGenerating] = useState(false);

  // 读取图片文件为 dataURL 并获取尺寸
  const readImage = (file: File): Promise<ImageItem> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const img = new window.Image();
        img.onload = () => {
          resolve({
            uid: `img-${Date.now()}-${uidSeed++}`,
            name: file.name,
            dataUrl,
            width: img.width,
            height: img.height,
            format: file.type.includes('png') ? 'PNG' : 'JPEG',
            size: file.size,
          });
        };
        img.onerror = () => reject(new Error('图片解析失败'));
        img.src = dataUrl;
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsDataURL(file);
    });

  // 拦截上传，自行处理文件
  const handleBeforeUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      message.error(`「${file.name}」不是图片文件，已跳过`);
      return Upload.LIST_IGNORE;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      message.error(
        `「${file.name}」大小为 ${(file.size / 1024 / 1024).toFixed(1)}M，超过 10M 限制，已跳过`
      );
      return Upload.LIST_IGNORE;
    }
    try {
      const item = await readImage(file);
      setImages((prev) => [...prev, item]);
    } catch {
      message.error(`「${file.name}」读取失败`);
    }
    return Upload.LIST_IGNORE; // 阻止 antd 默认上传行为
  };

  const handleRemove = (uid: string) => {
    setImages((prev) => prev.filter((img) => img.uid !== uid));
  };

  const handleClear = () => {
    setImages([]);
  };

  // 生成 PDF
  const handleGenerate = async () => {
    if (images.length === 0) {
      message.warning('请先添加图片');
      return;
    }
    setGenerating(true);
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = 210;
      const pageH = 297;
      const margin = 10;
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2;

      images.forEach((img, index) => {
        if (index > 0) pdf.addPage();
        // 等比缩放适配页面
        const ratio = Math.min(maxW / img.width, maxH / img.height, 1.5);
        const w = img.width * ratio;
        const h = img.height * ratio;
        const x = (pageW - w) / 2;
        const y = (pageH - h) / 2;
        pdf.addImage(img.dataUrl, img.format, x, y, w, h);
      });

      pdf.save(`图片合并_${moment().format('YYYY-MM-DD HH:mm:ss')}.pdf`);
      message.success(`已导出 PDF（共 ${images.length} 页）`);
    } catch (err: any) {
      message.error('生成失败：' + (err.message || '未知错误'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="tool-image-pdf">
      <div className="tool-toolbar">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack}>
          返回工具箱
        </Button>
        <div className="tool-toolbar-right">
          {images.length > 0 && <Button onClick={handleClear}>清空</Button>}
          <Button
            type="primary"
            icon={<FilePdfOutlined />}
            loading={generating}
            onClick={handleGenerate}
            disabled={images.length === 0}
          >
            生成 PDF{images.length > 0 ? `（${images.length}）` : ''}
          </Button>
        </div>
      </div>

      <Dragger
        multiple
        accept="image/*"
        showUploadList={false}
        beforeUpload={handleBeforeUpload}
        className="pdf-uploader"
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">点击或拖拽图片到此处</p>
        <p className="ant-upload-hint">
          支持 JPG / PNG / WEBP 等格式，单张不超过 10M，可一次选择多张；上传后拖动卡片调整顺序
        </p>
      </Dragger>

      {images.length === 0 ? (
        <Empty description="暂无图片，请上传" className="pdf-empty" />
      ) : (
        <SortableGrid
          items={images}
          getId={(img) => img.uid}
          onReorder={setImages}
          renderContent={(img) => (
            <>
              <img
                src={img.dataUrl}
                alt={img.name}
                className="pdf-preview-img"
                draggable={false}
              />
              <div className="pdf-preview-footer">
                <Tooltip title={img.name}>
                  <span className="pdf-preview-name">{img.name}</span>
                </Tooltip>
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemove(img.uid)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </>
          )}
        />
      )}
    </div>
  );
}
