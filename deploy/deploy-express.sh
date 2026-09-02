#!/bin/bash
set -e

APP_DIR="/opt/lingguang-express"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== 1. 安装 Node.js ==="
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
  apt-get install -y nodejs
fi
echo "Node: $(node --version)"

echo "=== 2. 部署代码 ==="
sudo mkdir -p "$APP_DIR"
sudo cp -r "$HERE/electron/server" "$APP_DIR/server"
sudo cp "$HERE/deploy/express-package.json" "$APP_DIR/package.json"
sudo cp "$HERE/deploy/express-server-config.js" "$APP_DIR/server/config/index.js"

echo "=== 3. 安装依赖 ==="
cd "$APP_DIR"
sudo npm install --production

echo "=== 4. 设置权限 ==="
sudo chown -R www-data:www-data "$APP_DIR"

echo "=== 5. 安装 systemd 服务 ==="
sudo cp "$HERE/deploy/lingguang-express.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable lingguang-express

echo "=== 6. 启动服务 ==="
sudo systemctl restart lingguang-express
sleep 2
sudo systemctl status lingguang-express --no-pager || true

echo "=== 完成 ==="
echo "Express API: http://127.0.0.1:3900/api/health"
