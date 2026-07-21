# 部署 Runbook — 阿里云 OSS/COS + CDN

> yinji 是 100% 静态站(无构建步骤,无后端,文件不出浏览器)。部署即静态资源分发。
> 目标: 阿里云 OSS(或腾讯云 COS)静态网站托管 + CDN 加速 + HTTPS。

## 前置条件(阻塞项,需先落实)

| 事项 | 归属 | 说明 |
|------|------|------|
| 域名确定 | modiqi(业务) | 默认建议 `yinji.modiqi.com`;最终由 modiqi 拍板 |
| 域名备案 | modiqi/DevOps | 国内 CDN + 自有域名**必须备案**。`yinji.modiqi.com` 依赖 `modiqi.com` 已备案(子域名可复用主体备案) |
| 阿里云账号 + AK/SK | DevOps/modiqi | OSS bucket 创建与 AccessKey 属账号/基础设施层,wenpai 不持有需申领 |
| DNS 解析(CNAME 到 CDN) | DevOps | 域名 CNAME 指向 CDN 加速域名 |
| `ossutil` 工具 | wenpai(本机) | 上传工具,`ossutil config` 配 AK/SK/endpoint |

> wenpai 负责应用部署(资源同步 / 缓存策略 / vhost 逻辑);账号、AK/SK、DNS、备案属 DevOps/业务,需协同。

## 部署包边界(只上传这些)

```
index.html
src/          (全部 .js / .css)
vendor/       (fabric / pdf.js / pdf-lib / lucide)
public/       (favicon / 图标)
```

**不上传**: `docs/` `tests/` `tools/` `*.pdf`(夹具) `*.png`(截图) `AGENTS.md` `CLAUDE.md` `README.md` `.codex/` `.git/`。
`deploy.sh` 已按此白名单同步。

## 缓存策略(关键)

无构建=无内容哈希文件名,故按"是否随发版变化"分层:

| 资源 | Cache-Control | 理由 |
|------|---------------|------|
| `index.html` | `no-cache`(每次校验) | 入口,发版必须立即生效 |
| `src/**` | `no-cache` 或 `max-age=300` | 应用代码,随发版变 |
| `vendor/**` | `max-age=31536000, immutable` | 第三方库,版本固定基本不变 |

> 发版后如 CDN 有旧缓存,对 `index.html` + `src/` 做 CDN 刷新(refresh),`vendor/` 走预热/长缓存。

## 执行步骤

```bash
# 1. 配置 ossutil(一次性,AK/SK 向 DevOps 申领)
ossutil config    # 填 endpoint / AccessKeyID / AccessKeySecret

# 2. 干跑确认将上传的文件集
cd ~/Projects/yinji
BUCKET=oss://<bucket-name> ./deploy.sh --dry-run

# 3. 正式同步(带缓存头)
BUCKET=oss://<bucket-name> ./deploy.sh

# 4. OSS 控制台开启"静态网站托管": 默认首页 index.html
# 5. 绑定 CDN 加速域名, 回源 OSS; 配 HTTPS 证书(LE 或已有通配符)
# 6. 强制 HTTPS + HTTP/2; index.html/src 缓存按上表设置
# 7. DNS: 域名 CNAME → CDN 加速域名(DevOps)
```

## 上线验收(不能只测首页)

```bash
DOMAIN=yinji.modiqi.com
curl -skI https://$DOMAIN/            | grep -i "http/\|cache-control"   # 200 + no-cache
curl -skI https://$DOMAIN/vendor/fabric.min.js | grep -i "cache-control"  # 长缓存
# 浏览器实测: 打开文件→选印章→盖章→导出 PDF/PNG→批量; 移动端布局; 无 CSP 违规(控制台)
```

> 验收标准遵循集群规范: 完整前后台流程 + 无控制台报错,不能只测首页。

## 备选

- **腾讯云 COS**: 同构,`coscli` 替 `ossutil`,静态托管 + CDN 同理。
- **海外/全球访问**: OSS 源站 + Cloudflare 前置,或直接 Cloudflare Pages(git 驱动免运维)。
