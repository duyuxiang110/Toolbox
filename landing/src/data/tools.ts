export interface Tool {
  key: string
  title: string
  desc: string
  icon: string
}

export const tools: Tool[] = [
  { key: 'image-to-pdf', title: '图片转 PDF', desc: '多张图片一键合并导出为 PDF 文档', icon: 'image-to-pdf' },
  { key: 'ocr', title: '图片文字识别', desc: '提取图片中的中英文文字', icon: 'ocr' },
  { key: 'image-processor', title: '图片处理', desc: '压缩 / 改尺寸 / 改格式 / 裁剪 / 旋转', icon: 'image' },
  { key: 'pdf-to-ppt', title: 'PDF 转 PPT', desc: 'PDF 逐页高清转为 PowerPoint 幻灯片', icon: 'pdf-to-ppt' },
  { key: 'pdf-to-word', title: 'PDF 转 Word', desc: 'PDF 逐页高清还原为 Word 文档', icon: 'pdf-to-word' },
  { key: 'word-to-image', title: 'Word 转图片', desc: 'Word 文档按原始排版完整导出为 PNG / JPG', icon: 'word-to-image' },
  { key: 'word-to-pdf', title: 'Word 转 PDF', desc: 'Word 文档按原始排版转为多页 PDF，几页转几页', icon: 'word-to-pdf' },
  { key: 'pdf-split', title: 'PDF 拆分', desc: '按拆分点把一个 PDF 拆成多个，原样无损', icon: 'split' },
  { key: 'pdf-merge', title: 'PDF 合并', desc: '多个 PDF 按顺序合并为一个，原样无损', icon: 'merge' },
  { key: 'video-compress', title: '视频压缩', desc: '压缩视频体积 / 转换视频格式', icon: 'video' },
]

export interface Highlight {
  title: string
  desc: string
  icon: string
}

export const highlights: Highlight[] = [
  { title: '全程本地处理', desc: '文件不上传任何服务器，转换在你的电脑上完成，隐私无忧。', icon: 'shield' },
  { title: '一键极速转换', desc: '拖入文件即开始，无需复杂配置，几秒出结果。', icon: 'bolt' },
  { title: '所见即所得', desc: 'PDF 与 Word 互转尽力还原原始排版与表格样式。', icon: 'layout' },
  { title: '双架构支持', desc: 'Apple 芯片与 Intel 芯片的 Mac 均可原生运行。', icon: 'chip' },
]
