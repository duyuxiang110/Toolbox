# 图片去水印功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增「图片去水印」工具：前端橡皮擦涂抹蒙版 → 后端 LaMa AI 重绘 → 对比滑杆展示与下载。

**Architecture:** 前端在 `灵光` 仓库按现有工具模式新增页面（双画布涂抹 + clip-path 对比滑杆）；后端在 `~/Desktop/灵光-api` 仓库按 `ocr.py` 模式新增 `/api/v2/remove-watermark`（simple-lama-inpainting，懒加载常驻，无兜底、失败明确报错）。

**Tech Stack:** React + antd + TypeScript（前端）；FastAPI + simple-lama-inpainting + Pillow + OpenCV（后端）；pytest（后端测试）。

**Spec:** `docs/superpowers/specs/2026-11-17-watermark-remover-design.md`

---

## 后端（~/Desktop/灵光-api，独立 git 仓库，main 分支）

### Task 1: 配置与依赖

**Files:**
- Modify: `app/config.py`（MAX_FILE_SIZES 加 `"watermark": 10 * 1024 * 1024`）
- Modify: `requirements.txt`（加 `simple-lama-inpainting==0.1.2`、`Pillow`）

- [ ] Step 1: 修改 config.py 与 requirements.txt
- [ ] Step 2: `venv/bin/pip install -r requirements.txt` 本地安装验证（拉取 torch，耗时较长）
- [ ] Step 3: Commit `feat: 去水印接口配置与依赖`

### Task 2: watermark_service.py（TDD）

**Files:**
- Create: `app/services/watermark_service.py`
- Test: `tests/test_watermark.py`

- [ ] Step 1: 写失败测试（mock SimpleLama，验证：蒙版 resize 到原图尺寸、二值化+膨胀后传入模型、JPG 输出质量 95、PNG 无损输出、模型异常向上抛）
- [ ] Step 2: `venv/bin/python -m pytest tests/test_watermark.py -v` 确认 FAIL
- [ ] Step 3: 实现 service：模块级懒加载单例 `_get_lama()`；`remove_watermark(image_path, mask_path, output_path) -> str`（PIL 读图转 RGB → 蒙版灰度 → NEAREST resize → >127 二值化 → cv2.dilate 5px → SimpleLama 推理 → 按扩展名保存）
- [ ] Step 4: pytest 确认 PASS
- [ ] Step 5: Commit `feat: LaMa 去水印服务`

### Task 3: 路由与注册（TDD）

**Files:**
- Create: `app/routes/watermark.py`
- Modify: `app/main.py`（import + include_router prefix="/api/v2"）
- Test: `tests/test_watermark.py`（追加路由测试）

- [ ] Step 1: 写失败路由测试（TestClient：无 token 401、错误扩展名 422、超 10MB 413、成功路径 mock service 返回 200 + 正确 media_type/filename）
- [ ] Step 2: pytest 确认 FAIL
- [ ] Step 3: 实现路由（照抄 ocr.py 校验链：validate_file_extension → MAX_FILE_SIZES → check_disk_space → check_memory → heavy_semaphore + run_in_executor → FileResponse(filename=原名_去水印.ext)，background_tasks 清理；service 异常转 503「AI 模型处理失败，请稍后重试」）；main.py 注册
- [ ] Step 4: pytest 全量 PASS（`venv/bin/python -m pytest tests/ -v`）
- [ ] Step 5: Commit `feat: /remove-watermark 路由`

## 前端（灵光仓库，main 分支）

### Task 4: API client

**Files:**
- Modify: `src/api/client.ts`

- [ ] Step 1: 新增 `removeWatermark(file: File, mask: Blob, signal?: AbortSignal): Promise<{ blob: Blob; filename: string }>`（POST `/v2/remove-watermark`，FormData: file+mask(PNG, filename=mask.png)，blob 响应，content-disposition 解析文件名，兜底 `原名_去水印.png`，AbortError 语义同 pdfToWord）
- [ ] Step 2: `npx tsc --noEmit` 通过
- [ ] Step 3: Commit（与 Task 5/6 合并提交亦可）

### Task 5: WatermarkRemover 页面

**Files:**
- Create: `src/pages/tools/WatermarkRemover.tsx`
- Create: `src/pages/tools/WatermarkRemover.less`

- [ ] Step 1: 状态机 idle→edit→processing→result；Dragger 上传（10MB、图片扩展名校验）；加载 Image 得原图尺寸
- [ ] Step 2: 双画布（底图 + 蒙版层 `rgba(255,80,80,0.35)`），pointer events 涂抹，笔刷滑块 5~100px + 圆圈光标预览，笔画栈 `{points,size}[]`，撤销/清空后全量重绘
- [ ] Step 3: 蒙版导出（离屏画布按原图分辨率重绘笔画，坐标/粗细乘 scale=origW/displayW，黑底白字 PNG toBlob）；空栈提示「请先涂抹水印区域」
- [ ] Step 4: 调 api.removeWatermark（AbortController + Spin + 取消按钮）；失败 message.error
- [ ] Step 5: 结果对比滑杆：底层效果图、顶层原图 `clip-path: inset(0 (100-p)% 0 0)`，p 默认 50，pointer 拖动手柄；「下载结果」「重新涂抹」「换一张图」
- [ ] Step 6: `npx tsc --noEmit` 通过

### Task 6: Toolbox 注册与整体验证

**Files:**
- Modify: `src/pages/Toolbox.tsx`

- [ ] Step 1: ToolKey 加 `'watermark-remover'`；TOOLS 加卡片（icon `ClearOutlined`，color `#f43f5e`）；import + activeTool 分支
- [ ] Step 2: `npm run build` 通过
- [ ] Step 3: Commit `feat(图片去水印): 涂抹蒙版+LaMa AI 去除+对比滑杆`
- [ ] Step 4: 自查 review（前后端限制一致 10MB/扩展名、路由已注册、接口路径一致、类型检查通过）

## 交付说明（写给用户）

- 服务器部署：`cd ~/Desktop/灵光-api && ./deploy/deploy.sh`（首次装 torch 约 2GB 磁盘、耗时较长）
- LaMa 模型预下载（服务器不通 GitHub 时）：本地下载 big-lama.pt 后 scp 到服务器 `~/.cache/torch/hub/checkpoints/`
- 前端发版走既有流程（版本号 + electron:build + npm run release）
