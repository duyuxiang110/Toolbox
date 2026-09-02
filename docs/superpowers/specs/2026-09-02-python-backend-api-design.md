# Python 后端 API 设计：Word转图 / OCR / PDF转Word

## 背景

灵光桌面应用（Electron + React）目前三个核心功能纯前端处理，识别度和转换质量受限：

- **Word 转图片**：mammoth 解析 docx → HTML，html2canvas 截图。排版还原差，复杂表格/页眉页脚丢失。
- **图片 OCR**：tesseract.js 浏览器端识别。中文识别率低，形近字混淆严重。
- **PDF 转 Word**：pdfjs-dist 提取文本 + docx 生成。表格结构退化为散文本，排版对齐差。

改造目标：将三个功能迁移到 Python 后端（FastAPI + LibreOffice + PaddleOCR + pdfplumber），大幅提升转换质量和识别率。附带改造 WordToPdf（同样依赖 mammoth+html2canvas）。

## 约束

- 阿里云轻量服务器：2核 2GB，已运行 MySQL + Nginx（官网静态页）
- 服务器 IP：114.55.11.191
- 完全替换：前端本地处理逻辑全部移除，不保留降级方案
- OCR 方案：自建 PaddleOCR（不用云端 API）
- 部署方式：直装（不用 Docker），最省内存

## 架构

```
Electron 桌面端（React 前端）
  ├── 本地 Express (127.0.0.1:3900)          ← 现有，不动
  │     认证 / 用户管理 / 视频压缩
  │
  └── 云端 Python API (114.55.11.191:80)     ← 新增
        Nginx /api/v2/ → 反代 → FastAPI (127.0.0.1:8000)
        │
        ├── Word 转图片（LibreOffice headless → pdf2image）
        ├── Word 转 PDF（LibreOffice headless 直接转换）
        ├── 图片 OCR（PaddleOCR PP-OCRv4 mobile）
        └── PDF 转 Word（pdfplumber + python-docx）
```

两套后端并存：本地 Express 管认证和轻量功能，云端 Python 管重计算。前端通过 axios 分别调用两个地址，共用同一套 JWT Token。

## Python 后端

### 目录结构

**本地开发目录**（独立项目，不在灵光 Electron 项目内）：

```
/Users/duyuxiang/Desktop/灵光-api/       ← 本地 Python 项目（独立）
├── app/
├── requirements.txt
├── .gitignore
└── README.md
```

**服务器部署目录**：

```
/opt/lingguang-api/                     ← 服务器部署路径
├── app/
│   ├── main.py                # FastAPI 入口，CORS / 路由挂载 / 启动时预加载 PaddleOCR
│   ├── config.py              # 配置：上传目录、文件大小限制、JWT 密钥
│   ├── deps.py                # 认证依赖：解析 Bearer Token（与 Express 共用密钥）
│   ├── concurrency.py         # asyncio.Semaphore(1) 限制重计算同时只跑 1 个
│   ├── routes/
│   │   ├── word_to_image.py   # POST /api/v2/word-to-image
│   │   ├── word_to_pdf.py     # POST /api/v2/word-to-pdf
│   │   ├── ocr.py             # POST /api/v2/ocr
│   │   └── pdf_to_word.py    # POST /api/v2/pdf-to-word
│   └── services/
│       ├── word_service.py    # LibreOffice 子进程管理 + pdf2image 渲染
│       ├── ocr_service.py     # PaddleOCR 封装（模型常驻）
│       └── pdf_service.py     # pdfplumber 提取 + python-docx 生成
├── requirements.txt
└── lingguang-api.service      # systemd 服务单元
```

### API 端点

| 端点 | 方法 | 输入 | 输出 | 处理方式 |
|------|------|------|------|----------|
| `/api/v2/word-to-image` | POST | FormData(file, dpi, format) | JSON `{ images: [base64...] }` | LibreOffice docx→PDF → pdf2image 逐页渲染 |
| `/api/v2/word-to-pdf` | POST | FormData(file) | 二进制 PDF 文件流 | LibreOffice docx→PDF 直接转换 |
| `/api/v2/ocr` | POST | FormData(file, lang) | JSON `{ text, confidence }` | PaddleOCR 推理 |
| `/api/v2/pdf-to-word` | POST | FormData(file, mode) | 二进制 docx 文件流 | pdfplumber 提取文本+表格 → python-docx 生成 |

### 并发控制

```python
# concurrency.py
import asyncio

heavy_semaphore = asyncio.Semaphore(1)   # LibreOffice / PaddleOCR 同时只跑 1 个
light_semaphore = asyncio.Semaphore(2)   # pdfplumber 文本提取可跑 2 个
```

### 认证

- 与 Express 共用 JWT 密钥 `sso-secret-key-change-in-production-2024`
- `deps.py` 解析 `Authorization: Bearer <token>` 并验证签名
- 不查数据库，仅做 JWT 签名验证
- 未带 Token 或 Token 无效返回 401

### 文件生命周期

```
上传 → /tmp/lingguang/uploads/xxx.docx
处理 → /tmp/lingguang/work/xxx/
输出 → /tmp/lingguang/output/xxx.docx
返回 → 响应发送后 BackgroundTasks 清理临时文件
兜底 → crontab 每小时清理超过 1 小时的残留文件
```

### Python 依赖

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
python-multipart==0.0.9
paddleocr==2.8.1
paddlepaddle==2.6.1
pdf2image==1.17.0
pdfplumber==0.11.0
python-docx==1.1.0
PyJWT==2.8.0
```

## 前端改造

### API 客户端扩展（src/api/client.ts）

- 新增 `CLOUD_BASE_URL = 'http://114.55.11.191/api/v2'`
- 新增 `this.cloud` axios 实例，baseURL 指向云端 API
- 复用 `onRequest` 拦截器（附加 Authorization Token）
- 超时设为 120 秒（大文件转换耗时）
- 新增方法：`wordToImage()`, `wordToPdf()`, `ocr()`, `pdfToWord()`
- 二进制下载（Word→PDF、PDF→Word）复用现有 `download` 模式

### 四个工具组件改造

#### WordToImage.tsx

- 移除 `convertWordToImages` 导入
- `doConvert` 改为调用 `api.wordToImage(file, dpi, format)`
- 清晰度选项从 scale 1/2/3 改为 DPI 150/300
- 格式选择 PNG/JPG 保留，作为 API 参数
- 预览、单张下载、ZIP 打包逻辑不变

#### OcrTool.tsx

- 移除 `tesseract.js`、`preprocessForOcr` 导入
- 移除预处理模式选择器、增强预览开关、预处理预览图
- `handleRecognize` 改为调用 `api.ocr(file, lang)`
- 语言选择保留，作为 API 参数
- 进度展示简化为 loading 状态（PaddleOCR 无实时进度回调）
- 结果展示（文本 + 置信度 + 耗时）不变

#### PdfToWord.tsx

- 移除 `extractPdfPages`、`buildWordDocument`、`renderPdfPages`、`Document`/`Packer`/`ImageRun` 等导入
- 移除 `SortableGrid`（不再需要页面拖拽排序）
- 移除文本统计预览（行数/表格数/预览片段）
- `handleGenerate` 改为调用 `api.pdfToWord(file, mode)` 下载 docx
- 转换模式 text/image 保留，作为 API 参数

#### WordToPdf.tsx（附带改造）

- 移除 `convertWordToImages`、`jsPDF` 导入
- 改为调用 `api.wordToPdf(file)` 下载 PDF
- 移除清晰度选项（LibreOffice 原生 PDF 质量）

### 删除的源文件

| 文件 | 原用途 |
|------|--------|
| `src/utils/wordToImages.ts` | mammoth+html2canvas 转换 |
| `src/utils/wordToPdf.ts` | 复用 wordToImages + jsPDF |
| `src/utils/imagePreprocess.ts` | OCR 前端预处理 |
| `src/utils/pdfTextExtract.ts` | PDF 文本提取 |
| `src/utils/pdfToWordDoc.ts` | docx 文档构建 |
| `src/types/mammoth.d.ts` | mammoth 类型声明 |
| `eng.traineddata` | tesseract.js 语言模型（根目录） |

### 保留的源文件

| 文件 | 仍被使用 |
|------|----------|
| `src/utils/pdfRender.ts` | PdfSplit、PdfToPpt（页面渲染缩略图） |
| `src/utils/pdfEdit.ts` | PdfMerge、PdfSplit（PDF 拆合并） |
| `src/utils/imageOps.ts` | ImageProcessor 等多个工具 |

### 从 package.json 移除的依赖

| 依赖 | 原用途 | 移除原因 |
|------|--------|----------|
| `mammoth` | docx→HTML 解析 | 后端 LibreOffice 替代 |
| `html2canvas` | HTML→Canvas 截图 | 后端 LibreOffice 替代 |
| `tesseract.js` | 浏览器端 OCR | 后端 PaddleOCR 替代 |
| `jspdf` | 前端 PDF 生成 | 后端 LibreOffice 替代 |
| `docx` | 前端 docx 生成 | 后端 python-docx 替代 |

打包体积预计减少 ~15MB。

## 部署方案

### 服务器初始化

```bash
# 1. 创建 2GB swap
fallocate -l 2G /swapfile
chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# 2. 安装系统依赖
apt-get update
apt-get install -y python3 python3-pip python3-venv \
    libreoffice libreoffice-writer \
    poppler-utils \
    libgl1-mesa-glx libglib2.0-0 \
    fonts-noto-cjk fonts-wqy-zenhei

# 3. 创建应用目录
mkdir -p /opt/lingguang-api /tmp/lingguang/{uploads,work,output}
```

中文字体（`fonts-noto-cjk`）是必需的，否则 LibreOffice 中文渲染乱码。

### Nginx 配置

在现有 `nginx.conf` 的 server 块内新增：

```nginx
location /api/v2/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    client_max_body_size 60M;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
    proxy_buffering off;
}
```

### systemd 服务

```ini
# /etc/systemd/system/lingguang-api.service
[Unit]
Description=LingGuang Python API
After=network.target mysql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/lingguang-api
ExecStart=/opt/lingguang-api/venv/bin/uvicorn app.main:app \
    --host 127.0.0.1 --port 8000 --workers 1
Restart=always
RestartSec=5
MemoryMax=1.5G
OOMScoreAdjust=500
ReadWritePaths=/tmp/lingguang

[Install]
WantedBy=multi-user.target
```

### 临时文件清理

- 第一层：请求完成后 FastAPI BackgroundTasks 立即清理
- 第二层：crontab 每小时清理超过 1 小时的残留文件
  - `0 * * * * find /tmp/lingguang -mindepth 1 -mmin +60 -delete`

## 错误处理

### 错误场景与对策

| 环节 | 错误场景 | 处理方式 | HTTP 状态 |
|------|----------|----------|------------|
| 文件上传 | 文件过大 | 前端校验 + 后端限制 | 413 |
| 文件上传 | 格式不符（扩展名伪造） | 后端校验 magic bytes | 422 |
| LibreOffice | 转换超时（文件损坏） | subprocess 60 秒超时 → kill 进程 | 500 |
| LibreOffice | 进程僵尸/泄露 | 每次调用后 kill 进程组，systemd Restart 兜底 | — |
| LibreOffice | 内存不足被 OOM kill | systemd 检测 → 返回 503 → 自动重启 | 503 |
| PaddleOCR | 模型加载失败 | 启动时预加载，失败则 OCR 端点返回 503，其他端点不受影响 | 503 |
| PaddleOCR | 推理异常（图片损坏） | try/catch 捕获 → 返回 500 | 500 |
| pdfplumber | PDF 加密/损坏 | 捕获异常 → 提示用户 | 422 |
| 并发 | 信号量等待超 120 秒 | 返回 429 "服务器繁忙" | 429 |
| 临时文件 | 磁盘满 | 写入前检查剩余空间 <500MB → 拒绝请求 | 507 |

### LibreOffice 子进程管理

```python
async def convert_with_libreoffice(input_path: str, output_dir: str, target_format: str):
    cmd = [
        'libreoffice', '--headless', '--norestore', '--nolockcheck',
        '--convert-to', target_format,
        '--outdir', output_dir,
        input_path,
    ]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
        if proc.returncode != 0:
            raise RuntimeError(f"LibreOffice 失败: {stderr.decode()}")
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise RuntimeError("LibreOffice 转换超时（60秒），文件可能损坏")
```

### 前端错误处理

```typescript
const ERROR_MESSAGES: Record<number, string> = {
  413: '文件超过大小限制',
  422: '文件格式不支持或已损坏',
  429: '服务器繁忙，请稍后重试',
  500: '服务器处理失败，请稍后重试',
  503: '服务暂不可用，正在恢复中…',
};
// 失败后提供重试按钮，保留已选文件
```

前端加载状态：上传中 → 服务器处理中（120秒内不超时）→ 成功展示结果 / 失败显示错误+重试。

### 内存保护策略

```
2GB 物理内存分配预算：
┌─────────────────────────┬──────────┐
│ MySQL                   │ ~300MB   │
│ Nginx                   │ ~20MB    │
│ FastAPI + PaddleOCR常驻  │ ~350MB   │
│ LibreOffice 峰值（按需） │ ~400MB   │
│ 系统 + 其他              │ ~200MB   │
├─────────────────────────┼──────────┤
│ 合计峰值                 │ ~1270MB  │
│ Swap 兜底                │ 2048MB   │
│ 安全余量                 │ ~770MB   │
└─────────────────────────┴──────────┘
```

systemd `MemoryMax=1.5G` 确保 Python 服务不会挤死 MySQL。信号量 `Semaphore(1)` 确保 LibreOffice 和 PaddleOCR 不会同时运行。

## 预期效果

| 功能 | 改造前 | 改造后 |
|------|--------|--------|
| Word 转图片 | mammoth+html2canvas，排版还原 ~60% | LibreOffice 渲染，还原度 ~98% |
| Word 转 PDF | mammoth+html2canvas+jsPDF，同上 | LibreOffice 原生转换，还原度 ~98% |
| 图片 OCR | tesseract.js，中文识别率 ~70% | PaddleOCR PP-OCRv4，识别率 95%+ |
| PDF 转 Word | pdfjs-dist 文本提取，表格丢失 | pdfplumber 表格提取+python-docx，还原度 ~85% |

前端代码量：每个组件从 ~200-400 行 → ~100-150 行。
前端依赖：减少 5 个 npm 包，打包体积减小 ~15MB。
