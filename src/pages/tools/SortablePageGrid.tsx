/**
 * 可拖拽排序的页面缩略图网格
 * 用于「PDF 转 PPT」「PDF 转 Word」等需要调整页面顺序的场景。
 * 基于原生 HTML5 拖拽事件，零额外依赖。
 */
import { useRef, useState } from 'react';
import { HolderOutlined } from '@ant-design/icons';
import type { RenderedPage } from '../../utils/pdfRender';

interface SortablePageGridProps {
  pages: RenderedPage[];
  /** 排序变化回调（返回重排后的新数组） */
  onReorder: (pages: RenderedPage[]) => void;
  /** 禁用拖拽（如渲染中） */
  disabled?: boolean;
}

export default function SortablePageGrid({ pages, onReorder, disabled }: SortablePageGridProps) {
  // 用 ref 记录当前拖拽项的最新索引（dragEnter 实时重排时会变化）
  const dragIndexRef = useRef<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    dragIndexRef.current = index;
    setDraggingIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox 需要 setData 才能触发拖拽
    e.dataTransfer.setData('text/plain', String(index));
  };

  // 拖入目标卡片时实时重排，提供流畅的视觉反馈
  const handleDragEnter = (index: number) => {
    const from = dragIndexRef.current;
    if (from === null || from === index) return;
    const next = [...pages];
    const [moved] = next.splice(from, 1);
    next.splice(index, 0, moved);
    dragIndexRef.current = index;
    setDraggingIndex(index);
    onReorder(next);
  };

  const handleDragEnd = () => {
    dragIndexRef.current = null;
    setDraggingIndex(null);
  };

  return (
    <div className="convert-grid">
      {pages.map((pg, index) => (
        <div
          key={pg.pageNum}
          className={`convert-card sortable-card${draggingIndex === index ? ' is-dragging' : ''}`}
          draggable={!disabled}
          onDragStart={(e) => handleDragStart(e, index)}
          onDragEnter={() => handleDragEnter(index)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => e.preventDefault()}
          onDragEnd={handleDragEnd}
        >
          <div className="cc-index">{index + 1}</div>
          {!disabled && <HolderOutlined className="cc-drag-handle" />}
          <div className="cc-img-wrap">
            <img src={pg.dataUrl} alt={`第 ${index + 1} 页`} className="cc-img" draggable={false} />
          </div>
          <div className="cc-footer">
            {pg.width}×{pg.height}
          </div>
        </div>
      ))}
    </div>
  );
}
