# 部署 Runbook — 阿里云 OSS + CDN

> yinji 是 100% 静态站(无构建步骤,无后端,文件不出浏览器)。部署即静态资源分发。
> 官方入口:**`https://yinji.modiqi.com/`**(子域名)。不要挂成 `modiqi.com/yinji/`，也不要挂到 WordPress 子目录。

## 前置条件(阻塞项,需先落实)

| 事项 | 归属 | 说明 |
|------|------|------|
| 域名 | 已拍板 | `yinji.modiqi.com`，不是 `modiqi.com/yinji/` |
| 域名备案 | modiqi/DevOps | 国内 CDN + 自有域名必须备案。子域名可复用 `modiqi.com` 主体备案 |
| 阿里云 OSS bucket | modiqi | **稍后由 modiqi 在阿里云开通**。wenpai 不持有账号,未开桶之前不要上传 |
| 阿里云 AK/SK | DevOps/modiqi | AccessKey 属账号/基础设施层,需申领 |
| DNS 解析(CNAME 到 CDN) | DevOps | 域名 CNAME 指向 CDN 加速域名 |
| HTTPS 证书 | DevOps | 子域名证书或 `*.modiqi.com` 通配符 |
| CDN 回源与响应头 | DevOps | MIME、缓存、安全头在 CDN 配;OSS 对象 meta 只能覆盖一部分 |
| `ossutil` 工具 | wenpai(本机) | 上传工具,`ossutil config` 配 AK/SK/endpoint |

> wenpai 负责应用部署(资源同步 / 对象缓存头 / 静态站文件集);账号、bucket、AK/SK、DNS、证书、CDN 响应头属 DevOps/业务。

## 部署包边界(只上传这些)

```
index.html
404.html
robots.txt
sitemap.xml
llms.txt
version.json
LICENSE
THIRD_PARTY_NOTICES.md
about/
for-agents/
.well-known/
licenses/
src/          (全部 .js / .css)
vendor/       (fabric / pdf.js / pdf-lib / lucide)
public/       (favicon / og / 图标 / 示例)
```

**不要上传**: `docs/` `tests/` `tools/` `AGENTS.md` `CLAUDE.md` `README.md` `agent-manifest.json` `schemas/` `integrations/` `*.pdf`(根目录夹具) 根目录截图 `.codex/` `.git/`。

公开网站是产品入口,不是源码下载站,也不提供 MCP。本地 Agent 清单不要传到该域名。

`deploy.sh` 已按此白名单同步。`public/` 不同步 `*.py` 辅助脚本。

分享图：矢量稿 `public/og.svg`（1200×630）。当前页面 `og:image` 暂用 `public/favicon.svg`；转出 `public/og.png` 后改 meta。

## 缓存策略(关键)

无构建=无内容哈希文件名,禁止 `max-age=31536000` / `immutable`。

| 资源 | Cache-Control | 理由 |
|------|---------------|------|
| `index.html` `404.html` `about/` `for-agents/` | `no-cache`(每次校验) | 入口与说明页,发版必须立即生效 |
| `robots.txt` `sitemap.xml` `llms.txt` `.well-known/` | `no-cache` | 抓取规则随发版变 |
| `src/**` | `no-cache` | 应用代码,随发版变 |
| `vendor/**` | `max-age=300`(上限) | 文件名无哈希,不得按年缓存 |
| `public/**` | `no-cache` 或 `max-age≤300` | 图标与分享图无哈希 |

> 发版后如 CDN 有旧缓存,对 HTML + `src/` + `about/` + `for-agents/` 做刷新。不要对 vendor 做一年预热。

## MIME 与安全头(CDN 必配)

OSS 对象 `--meta` 只能带 `Cache-Control` / `Content-Type` 等。`.mjs` 若被当成 `application/octet-stream`,ES module 会加载失败。`deploy.sh` 已给 `vendor/` 写 `Content-Type:text/javascript`。其余类型请 DevOps 在 CDN 或 OSS 规则补齐:

| 后缀 | Content-Type |
|------|----------------|
| `.html` | `text/html; charset=utf-8` |
| `.js` `.mjs` | `text/javascript` |
| `.css` | `text/css; charset=utf-8` |
| `.svg` | `image/svg+xml` |
| `.png` | `image/png` |
| `.xml` | `application/xml` |
| `.txt` | `text/plain; charset=utf-8` |
| `.md` | `text/plain; charset=utf-8` |
| `.json` | `application/json` |
| `.pdf` | `application/pdf` |

OSS 静态网站托管:

- 默认首页: `index.html`
- 缺省页 / 404: `404.html`
- 子目录 `about/`、`for-agents/` 依赖各目录内 `index.html`

CDN 响应头(对象 meta 做不到,必须 DevOps 配):

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

HTML 里已有 CSP。不要在 CDN 覆盖成更松的 `script-src *`。

## 执行步骤

```bash
# 1. 等 modiqi 在阿里云开好 bucket,再向 DevOps 申领 AK/SK
ossutil config    # 填 endpoint / AccessKeyID / AccessKeySecret

# 2. 干跑确认将上传的文件集(不应出现 docs/ tools/ tests/)
cd /path/to/yinji
BUCKET=oss://<bucket-name> ./deploy.sh --dry-run

# 3. 正式同步(带缓存头)。bucket 未开之前不要跑
BUCKET=oss://<bucket-name> ./deploy.sh

# 4. OSS 控制台开启"静态网站托管": 首页 index.html, 404 页 404.html
# 5. 绑定 CDN 加速域名, 回源 OSS; HTTPS 证书由 DevOps 配
# 6. 强制 HTTPS + HTTP/2; MIME 与安全头按上表
# 7. DNS: yinji.modiqi.com CNAME → CDN 加速域名(DevOps)
```

未开桶、未配证书时停在干跑,不要把站点挂到 WordPress 或其它子目录顶替。

## 上线验收(不能只测首页)

```bash
DOMAIN=yinji.modiqi.com
curl -skI https://$DOMAIN/            | grep -i "http/\|cache-control"   # 200 + no-cache
curl -skI https://$DOMAIN/about/      | grep -i "http/"                  # 200
curl -skI https://$DOMAIN/for-agents/ | grep -i "http/"                  # 200
curl -skI https://$DOMAIN/llms.txt    | grep -i "content-type"           # text/plain
curl -skI https://$DOMAIN/vendor/pdf.min.mjs | grep -i "content-type\|cache-control"
# vendor: text/javascript; Cache-Control 为 no-cache 或 max-age≤300, 不得出现 31536000
# 浏览器实测: 打开文件→选印章→盖章→导出 PDF/PNG→批量; 移动端布局; 无 CSP 违规(控制台)
```

> 验收标准: 完整前后台流程 + 无控制台报错,不能只测首页。

## 备选

- **腾讯云 COS**: 同构,`coscli` 替 `ossutil`,静态托管 + CDN 同理。域名仍是 `yinji.modiqi.com`。
- **海外/全球访问**: OSS 源站 + Cloudflare 前置。仍禁止用 WP 子目录充当官方入口。
