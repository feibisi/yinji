#!/usr/bin/env bash
#
# yinji 静态站部署脚本 — 阿里云 OSS
# 只同步应上线的白名单文件,并按资源类型设置缓存头。
# 用法:
#   BUCKET=oss://your-bucket ./deploy.sh [--dry-run]
# 前置: ossutil 已 config(AK/SK/endpoint)。详见 docs/DEPLOY.md
#
set -euo pipefail

BUCKET="${BUCKET:-}"
DRY_RUN=""
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="--dry-run"
fi

if [[ -z "$BUCKET" ]]; then
  echo "错误: 需设置 BUCKET,例如 BUCKET=oss://yinji-site ./deploy.sh" >&2
  exit 1
fi

if ! command -v ossutil >/dev/null 2>&1; then
  echo "错误: 未找到 ossutil。请先安装并 ossutil config。见 docs/DEPLOY.md" >&2
  exit 1
fi

cd "$(dirname "$0")"

# 应用代码 / 入口: 随发版变化, 不缓存(每次校验)
APP_HEADER="Cache-Control:no-cache"
# 第三方库: 版本固定, 长缓存
VENDOR_HEADER="Cache-Control:max-age=31536000"

echo "==> 同步 vendor/ (长缓存) 到 $BUCKET/vendor/"
ossutil cp -r -f vendor/ "$BUCKET/vendor/" --meta "$VENDOR_HEADER" $DRY_RUN

echo "==> 同步 src/ (不缓存) 到 $BUCKET/src/"
ossutil cp -r -f src/ "$BUCKET/src/" --meta "$APP_HEADER" $DRY_RUN

echo "==> 同步 public/ 到 $BUCKET/public/"
ossutil cp -r -f public/ "$BUCKET/public/" --meta "$APP_HEADER" $DRY_RUN

echo "==> 同步 version.json (不缓存) 到 $BUCKET/"
ossutil cp -f version.json "$BUCKET/version.json" --meta "$APP_HEADER" $DRY_RUN

echo "==> 同步 index.html (不缓存, 入口最后传保证一致性) 到 $BUCKET/"
ossutil cp -f index.html "$BUCKET/index.html" --meta "$APP_HEADER" $DRY_RUN

echo "==> 完成。若 CDN 有旧缓存, 刷新 index.html 与 src/ 目录。"
