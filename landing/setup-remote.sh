#!/usr/bin/env bash
# 首次服务器初始化：安装 nginx、建目录、写入站点配置
set -euo pipefail
REMOTE="${REMOTE:-admin@duyuxiang.cn}"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "==> 远端安装 nginx 并创建目录"
ssh "$REMOTE" 'sudo bash -s' <<'EOS'
set -euo pipefail
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -y && apt-get install -y nginx
elif command -v yum >/dev/null 2>&1; then
  yum install -y nginx
else
  echo "未识别的包管理器，请手动安装 nginx" >&2; exit 1
fi
mkdir -p /var/www/lingguang/site /var/www/lingguang/downloads
# 禁用发行版自带默认站点，避免与我们的 default_server 冲突
rm -f /etc/nginx/sites-enabled/default
systemctl enable nginx || true
EOS

echo "==> 上传站点配置并重载"
scp "$HERE/../deploy/nginx.conf" "$REMOTE:/tmp/lingguang.conf"
ssh "$REMOTE" "sudo mv /tmp/lingguang.conf /etc/nginx/conf.d/lingguang.conf && sudo nginx -t && (sudo systemctl reload nginx || sudo systemctl start nginx)"
echo "==> 初始化完成"
