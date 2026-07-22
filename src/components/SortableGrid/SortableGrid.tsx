/**
 * 通用可拖拽排序网格组件（基于 dnd-kit）
 *
 * 统一「图片转 PDF」「PDF 转 PPT」「PDF 转 Word」等所有需要拖拽排序的场景。
 * 组件负责：网格布局、卡片外壳（边框/悬停/拖拽态）、序号徽标、拖拽把手、重排逻辑；
 * 各业务只需通过 renderContent 提供卡片内部内容，避免每个功能各写一套拖拽代码。
 */
import type { ReactNode } from 'react';
import { HolderOutlined } from '@ant-design/icons';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import './SortableGrid.less';

export interface SortableGridProps<T> {
  /** 数据列表 */
  items: T[];
  /** 从数据项取唯一 id（用作拖拽标识与 React key） */
  getId: (item: T) => UniqueIdentifier;
  /** 排序变化回调，返回重排后的新数组 */
  onReorder: (items: T[]) => void;
  /** 渲染卡片内部内容 */
  renderContent: (item: T, index: number) => ReactNode;
  /** 禁用拖拽（如处理中） */
  disabled?: boolean;
  /** 是否显示左上角序号徽标，默认 true */
  showIndex?: boolean;
  /** 是否显示右上角拖拽把手，默认 true */
  showHandle?: boolean;
  /** 网格容器附加类名 */
  className?: string;
}

interface SortableCardProps {
  id: UniqueIdentifier;
  index: number;
  disabled?: boolean;
  showIndex?: boolean;
  showHandle?: boolean;
  children: ReactNode;
}

function SortableCard({ id, index, disabled, showIndex, showHandle, children }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(disabled ? {} : listeners)}
      className={`sortable-card${isDragging ? ' is-dragging' : ''}${disabled ? ' is-disabled' : ''}`}
    >
      {showIndex && <div className="sortable-card-index">{index + 1}</div>}
      {showHandle && !disabled && (
        <div className="sortable-card-grip">
          <HolderOutlined />
        </div>
      )}
      {children}
    </div>
  );
}

export default function SortableGrid<T>({
  items,
  getId,
  onReorder,
  renderContent,
  disabled,
  showIndex = true,
  showHandle = true,
  className,
}: SortableGridProps<T>) {
  // 指针需移动 5px 才触发拖拽，避免误触点击
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((it) => getId(it) === active.id);
      const newIndex = items.findIndex((it) => getId(it) === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        onReorder(arrayMove(items, oldIndex, newIndex));
      }
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map(getId)} strategy={rectSortingStrategy}>
        <div className={`sortable-grid${className ? ` ${className}` : ''}`}>
          {items.map((item, index) => (
            <SortableCard
              key={getId(item)}
              id={getId(item)}
              index={index}
              disabled={disabled}
              showIndex={showIndex}
              showHandle={showHandle}
            >
              {renderContent(item, index)}
            </SortableCard>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
