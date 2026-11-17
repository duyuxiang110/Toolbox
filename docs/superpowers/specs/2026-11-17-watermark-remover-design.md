# 图片去水印（AI 涂抹修复）设计文档

日期：2026-11-17
状态：已获用户批准

## 目标

在灵光工具箱新增「图片去水印」工具：用户上传一张图片，用可调粗细的橡皮擦手动涂抹水印区域（淡红色半透明显示，支持逐笔撤销与一键清空），点击「去除水印」后由服务器端 LaMa AI 模型重绘涂抹区域，前端用左右拖动分割线对比原图与效果图，并支持下载结果。

## 技术选型（已调研比选）

- **AI 内核：LaMa（big-lama 模型）**，通过 pip 包 `simple-lama-inpainting` 接入。
  - 比选过程：star 最高的 IOPaint（23.3k）已归档停止维护且是完整应用壳；advimman/lama（10.4k）为研究代码不可产品化；zuruoke/watermark-removal（5.2k）走自动检测路线与手动涂抹交互不符且权重在 Google Drive。IOPaint 默认擦除模型与 simple-lama-inpainting 是同一个 big-lama，故直接用轻量封装。
- **不做 OpenCV inpaint 兜底**（用户决策）：LaMa 失败直接报明确错误，避免静默返回劣质结果。OpenCV 仅用于图像处理（读图、蒙版 resize、膨胀、编码）。

## 架构与数据流

```
上传图片 → 画布涂抹（本地笔画栈） → 点「去除水印」
  → 前端按原图分辨率导出黑白蒙版 PNG（白=涂抹区）
  → POST /api/v2/remove-watermark（file=原图, mask=蒙版, Bearer Token）
  → 后端 LaMa 重绘 → FileResponse 返回结果图
  → 前端对比滑杆展示 → 下载
```

涉及两个仓库：
- 前端：`灵光`（本仓库）
- 后端：`~/Desktop/灵光-api`（FastAPI，部署在 duyuxiang.cn 服务器 /opt/lingguang-api）

## 前端设计（灵光仓库）

### 新文件

- `src/pages/tools/WatermarkRemover.tsx`：工具主页面
- `src/pages/tools/WatermarkRemover.less`：样式

### 注册

- `src/pages/Toolbox.tsx`：`ToolKey` 联合类型加 `'watermark-remover'`；`TOOLS` 数组加卡片（标题「图片去水印」，描述「AI 涂抹去除水印，效果前后对比」）；加 `activeTool` 分支渲染
- `src/api/client.ts`：新增 `removeWatermark(file: File, mask: Blob, signal?)`，POST `/v2/remove-watermark`，blob 响应模式（同 `pdfToWord`，从 content-disposition 解析文件名）

### 涂抹画布

- 三层状态机：上传（Dragger）→ 编辑（画布+工具栏）→ 结果（对比滑杆）；处理中覆盖 Spin+取消
- 双画布叠放：底层画等比缩放后的原图，顶层透明画布画蒙版笔画，颜色 `rgba(255, 80, 80, 0.35)` 淡红半透明
- 笔刷：pointer events（兼容鼠标/触控板），按住拖动连续涂抹，线段圆头连接；粗细滑块 5~100px；画布上跟随圆圈光标预览笔刷大小
- 笔画栈：每笔（pointerdown→pointerup）存 `{points, size}`；「撤销」弹栈后全量重绘蒙版画布；「清空」清栈重绘
- 蒙版导出：离屏画布按**原图分辨率**重绘笔画栈（坐标与笔刷粗细按 原图宽/显示宽 比例换算），白底黑字反转输出：黑底、白色笔画，`toBlob('image/png')`
- 空蒙版（笔画栈为空）点「去除水印」→ 提示「请先涂抹水印区域」

### 结果对比滑杆

- 底层铺效果图，顶层铺原图并用 `clip-path: inset(0 (100-p)% 0 0)` 裁剪出左侧 p% 区域 → **左侧原图（未去除）、右侧效果图（已去除）**
- 分割线手柄 pointer 拖动改变 p（默认 50%）；往右拖看更多原图，往左拖看更多效果图（与用户需求方向一致）
- 纯 CSS + pointer 实现，不引第三方库
- 按钮：「下载结果」（downloadBlob）、「重新涂抹」（回编辑态，笔画保留）、「换一张图」（全部重置）

### 限制与错误处理

- 前端 MAX_SIZE = 10MB（与后端一致），格式 jpg/jpeg/png/bmp/webp
- 请求失败 message.error；507 提示服务器资源不足稍后再试；AbortController 取消静默（同现有工具）

## 后端设计（灵光-api 仓库）

### 新文件

- `app/routes/watermark.py`：路由，模式照抄 `ocr.py`
- `app/services/watermark_service.py`：LaMa 推理服务
- `tests/test_watermark.py`：单测

### 修改

- `app/config.py`：`MAX_FILE_SIZES` 加 `"watermark": 10 * 1024 * 1024`
- `app/main.py`：注册 `watermark.router`，前缀 `/api/v2`
- `requirements.txt`：加 `simple-lama-inpainting`、`Pillow`（opencv-python 由 simple-lama 依赖带入，与 paddleocr 一致不用 headless 版避免 cv2 冲突）

### 路由 `POST /remove-watermark`

- 入参：`file: UploadFile`（原图）+ `mask: UploadFile`（PNG 蒙版）
- 校验链（同 ocr.py）：扩展名（jpg/jpeg/png/bmp/webp）→ 大小 10MB → 磁盘空间 → `check_memory` → `heavy_semaphore`（全局串行）→ `run_in_executor` 跑同步推理
- 成功：`FileResponse`，media_type 按输入格式（png→image/png，其余→image/jpeg），filename 为 `原名_去水印.ext`
- 清理：`background_tasks` 清 work_dir 与上传临时文件
- LaMa 异常：503 + 明确 message「AI 模型处理失败，请稍后重试」

### 服务 `watermark_service.py`

- LaMa 懒加载模块级单例：首次请求加载后常驻内存（约 500MB），受 heavy_semaphore 保护不会并发加载
- 依赖版本用 `simple-lama-inpainting==0.1.0`（0.1.1+ 要求 Python≥3.10，服务器为 apt python3）
- **大图内存控制**（systemd `MemoryMax` 硬顶约束）：0.1.0 无内置缩放，长边 > `MAX_INFERENCE_SIDE`（默认 1600，环境变量 LAMA_MAX_SIDE 可调）时走「裁剪-修复-贴回」：只裁蒙版包围盒 + margin（15% 或至少 64px）区域推理，结果贴回原图，修复区外像素零损失
- `remove_watermark(image_path, mask_path, output_path) -> str`：
  1. PIL 读原图（转 RGB）；读蒙版转灰度
  2. 蒙版尺寸与原图不一致 → resize 到原图尺寸（最近邻）
  3. 蒙版二值化（>127）后膨胀 5px（覆盖水印半透明边缘光晕）；全黑蒙版抛 ValueError（路由转 422）
  4. `SimpleLama()(image, mask)` 推理；异常上抛（路由转 503）
  5. 按扩展名保存（JPG 质量 95 / PNG 无损）
- 模型文件通过 `LAMA_MODEL` 环境变量指向预置路径 `/opt/lingguang-api/models/big-lama.pt`（约 196MB，下载源 GitHub releases）；指向不存在的文件会直接报错而非运行时下载，避免服务器连不上 GitHub 时首请求挂死

## 部署注意点

- `deploy.sh` 首次安装 torch CPU 需约 2GB 磁盘与较长下载时间（阿里云 pip 镜像）
- LaMa 模型预置：本地下载 big-lama.pt 后 scp 到服务器 `/opt/lingguang-api/models/`（service 文件已设 `LAMA_MODEL` 指向该路径）
- `lingguang-api.service` 已调整：`MemoryMax` 1.5G→2G（LaMa 常驻 + 推理峰值），新增 `LAMA_MODEL` 环境变量与 models 目录创建；服务器需重新安装 unit 文件并 `systemctl daemon-reload`
- 服务重启后首次去水印请求慢（模型加载约十几秒），属预期
- nginx `/api/v2/` 已验证：client_max_body_size 60M、proxy_read_timeout 120s，满足 10MB 图 + CPU 推理耗时

## 测试

- 后端 pytest：service 预处理逻辑（mock SimpleLama：蒙版 resize/膨胀/保存格式）、路由校验（401/422/413）
- 前端：`tsc --noEmit` + `vite build` 通过；`electron:dev` 手动验证涂抹/撤销/清空/对比滑杆/下载全流程
