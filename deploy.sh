#!/usr/bin/env bash
#
# yinji 静态站部署脚本 — 阿里云 OSS
# 只同步应上线的白名单文件,并按资源类型设置缓存头。
# 用法:
#   BUCKET=oss://your-bucket ./deploy.sh [--dry-run]
# 前置: ossutil 已 config(AK/SK/endpoint)。详见 docs/DEPLOY.md
#
# 不上传: docs/ tests/ tools/ AGENTS.md CLAUDE.md README.md
#         agent-manifest.json schemas/ integrations/ 夹具与截图
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

# 无内容哈希文件名: 禁止一年长缓存。vendor 与 src 同档。
APP_HEADER="Cache-Control:no-cache"
VENDOR_HEADER="Cache-Control:max-age=300#Content-Type:text/javascript"
HTML_HEADER="Cache-Control:no-cache#Content-Type:text/html;charset=utf-8"
TEXT_HEADER="Cache-Control:no-cache#Content-Type:text/plain;charset=utf-8"
XML_HEADER="Cache-Control:no-cache#Content-Type:application/xml"

echo "==> 同步 vendor/ (短缓存 ≤300s, JS MIME) 到 $BUCKET/vendor/"
ossutil cp -r -f vendor/ "$BUCKET/vendor/" --meta "$VENDOR_HEADER" $DRY_RUN

echo "==> 同步 src/ (不缓存) 到 $BUCKET/src/"
ossutil cp -r -f src/ "$BUCKET/src/" --meta "$APP_HEADER" $DRY_RUN

echo "==> 同步 public/ 到 $BUCKET/public/"
for f in public/*; do
  [[ -e "$f" ]] || continue
  base=$(basename "$f")
  [[ "$base" == *.py ]] && continue
  if [[ -d "$f" ]]; then
    ossutil cp -r -f "$f/" "$BUCKET/public/$base/" --meta "$APP_HEADER" $DRY_RUN
  else
    ossutil cp -f "$f" "$BUCKET/public/$base" --meta "$APP_HEADER" $DRY_RUN
  fi
done

echo "==> 同步 about/"
ossutil cp -r -f about/ "$BUCKET/about/" --meta "$HTML_HEADER" $DRY_RUN

echo "==> 同步 for-agents/"
ossutil cp -r -f for-agents/ "$BUCKET/for-agents/" --meta "$HTML_HEADER" $DRY_RUN

echo "==> 同步 .well-known/"
ossutil cp -r -f .well-known/ "$BUCKET/.well-known/" --meta "$TEXT_HEADER" $DRY_RUN

echo "==> 同步 licenses/"
ossutil cp -r -f licenses/ "$BUCKET/licenses/" --meta "$TEXT_HEADER" $DRY_RUN

echo "==> 同步根文件"
ossutil cp -f version.json "$BUCKET/version.json" --meta "$APP_HEADER" $DRY_RUN
ossutil cp -f robots.txt "$BUCKET/robots.txt" --meta "$TEXT_HEADER" $DRY_RUN
ossutil cp -f sitemap.xml "$BUCKET/sitemap.xml" --meta "$XML_HEADER" $DRY_RUN
ossutil cp -f llms.txt "$BUCKET/llms.txt" --meta "$TEXT_HEADER" $DRY_RUN
ossutil cp -f LICENSE "$BUCKET/LICENSE" --meta "$TEXT_HEADER" $DRY_RUN
ossutil cp -f THIRD_PARTY_NOTICES.md "$BUCKET/THIRD_PARTY_NOTICES.md" --meta "$TEXT_HEADER" $DRY_RUN
ossutil cp -f 404.html "$BUCKET/404.html" --meta "$HTML_HEADER" $DRY_RUN
ossutil cp -f index.html "$BUCKET/index.html" --meta "$HTML_HEADER" $DRY_RUN

echo "==> 完成。若 CDN 有旧缓存, 刷新 index.html、about/、for-agents/ 与 src/。"
echo "==> MIME 与安全响应头仍须在 CDN 配齐, 见 docs/DEPLOY.md。"
