场景一：只改官网页面（landing/ 里的代码）
  cd /Users/duyuxiang/Desktop/灵光/landing
  ./deploy.sh
  一条命令：重新构建 → 上传 → 重载 → 自检。安装包不动，版本号不用改。

场景二：改了主应用功能（要发新安装包）
  # ① 改版本号：编辑根目录 package.json，把 "version": "1.0.1" 改成 "1.1.0"
  # ② 重新打包 dmg（约几分钟，产物在 ../LingGuang-release/）
  cd /Users/duyuxiang/Desktop/灵光
  npm run electron:build:mac
  # ③ 部署（会自动校验新版本的两份 dmg 存在，缺了会报错拦住你）
  cd landing
  ./deploy.sh

场景三：改了 nginx 配置（deploy/nginx.conf）
  scp /Users/duyuxiang/Desktop/灵光/deploy/nginx.conf root@114.55.11.191:/etc/nginx/conf.d/lingguang.conf
  ssh root@114.55.11.191 'nginx -t && nginx -s reload'

旧版本安装包会留在服务器上（下载目录的 rsync 没带删除），多次发版后会占磁盘（每个版本约 578M）。想清理时：
  ssh root@114.55.11.191 'cd /var/www/lingguang/downloads && ls'   # 先看有哪些
  # 确认后删旧版本：
  ssh root@114.55.11.191 'rm /var/www/lingguang/downloads/LingGuang-1.0.1-*.dmg'


（1）你改了什么	（2）属于	（3）要做什么
1.改了 landing/ 里的页面、样式、文案	2.官网迭代	3.直接 ./deploy.sh，不用改版本号、不用打包
1.改了 electron/ 或根目录 src/（比如加个新工具、修 OCR bug）	2.主应用迭代	3.改版本号 → npm run electron:build:mac → ./deploy.sh
1.两边都改了	2.都算	3.按主应用的完整流程走