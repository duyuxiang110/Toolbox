#!/usr/bin/env bash
# 日常一键部署：构建官网 -> 校验 dmg -> rsync 上传 -> 重载 nginx -> 自检
set -euo pipefail
REMOTE="${REMOTE:-root@114.55.11.191}"
HERE="$(cd "$(dirname "$0")" && pwd)"
VERSION="$(node -p "require('$HERE/../package.json').version")"
RELEASE_DIR="$HERE/../../LingGuang-release"
SITE_URL="http://114.55.11.191"

echo "==> 版本: $VERSION"

echo "==> 校验安装包"
for ARCH in arm64 x64; do
  f="$RELEASE_DIR/LingGuang-$VERSION-$ARCH.dmg"
  if [ ! -f "$f" ]; then
    echo "缺少 $f" >&2
    echo "请先在主项目根目录执行: npm run electron:build:mac" >&2
    exit 1
  fi
done

echo "==> 构建官网"
npm run build

echo "==> 上传站点与安装包"
rsync -avz --delete "$HERE/dist/" "$REMOTE:/var/www/lingguang/site/"
rsync -avz \
  "$RELEASE_DIR/LingGuang-$VERSION-arm64.dmg" \
  "$RELEASE_DIR/LingGuang-$VERSION-x64.dmg" \
  "$REMOTE:/var/www/lingguang/downloads/"

echo "==> 重载 nginx"
ssh "$REMOTE" "nginx -t && nginx -s reload"

echo "==> 自检"
curl -sfI "$SITE_URL/" | head -1
for ARCH in arm64 x64; do
  curl -sfI "$SITE_URL/downloads/LingGuang-$VERSION-$ARCH.dmg" \
    | grep -iE 'HTTP|content-disposition' || { echo "dmg 链接异常: $ARCH" >&2; exit 1; }
done
echo "==> 部署完成: $SITE_URL"
