# Yinji 交接记录

## 2026-08-09 - [CX] 交付收口

- 集成分支：`codex/yinji-delivery`，基于审计加固分支合并扫描件功能。
- 已移除 Canon/扫描仪冒充元数据；扫描件明确为视觉模拟，签名明确为图像而非数字证书签名。
- 扫描导出按页释放临时画布，支持取消；分辨率按 PDF 点尺寸计算，界面 DPI 与实际输出一致。
- 新增批量盖章并转扫描件、水印颜色/角度、主题/关键词、扫描设置导入导出。
- 新增 `THIRD_PARTY_NOTICES.md` 与 `licenses/`；印迹自身代码尚未选择许可证，需仓库所有者决定。
- 验证：全量 JS `node --check` 通过；浏览器单元测试 105/105；smoke 通过；scan-check 17/17；批量扫描 UI 流程通过；桌面与 390px 移动端截图完成。
- Forgejo 直接推分支被策略拒绝，已通过 AGit 更新现有 PR #3：`https://feicode.com/Modiqi-com/yinji/pulls/3`。

## 2026-08-09 - [CX] 扫描入口体验修正

- 导出页改为“普通导出 / 扫描件 / 批量处理”三个一级入口；扫描参数不再藏在普通导出折叠区。
- 扫描预设增加选中态，模式切换后状态卡给出对应操作提示。
- CLI 新增 `--export-mode normal|scan|batch`；三种面板切换、105/105 单元测试、smoke、scan-check、桌面与 390px 截图均通过。

## 2026-08-09 - [CX] Agent 操作边界与二次审计

- 产品边界已固定：浏览器只做视觉盖章/扫描效果，数字签名只能调用外部签名器；印章库改为 sessionStorage，旧 localStorage 只迁移不静默删除；人工导出为单个 `.yinji.zip`，Agent 仍输出 PDF 与侧车两个文件。
- CLI 新增 `capabilities`、`doctor`、`scan`、`verify`，所有 Agent 成功/失败统一为 `yinji-agent-result/v1`；stamp/scan/sign 默认拒绝覆盖，sign 禁止覆盖输入并使用同目录临时文件原子完成。
- 安全加固：印章库只保存 PNG/JPEG/GIF/WebP 且单项不超过 8 MB；ZIP 与浏览器回传文件名拒绝目录穿越；doctor 验证应用身份和 CDP WebSocket，不把任意 HTTP 200 当成功。
- 验证：JS/MJS 全量语法与 git diff 检查通过；浏览器单元测试 124/124；smoke、scan-check 17/17、stamp、scan、verify 均通过；篡改检测、覆盖拒绝、sign 失败关闭/原子替换、旧存储迁移、人工 ZIP 系统解压和 doctor 假页面拒绝均通过。
- 审计文档：`docs/AUDIT_AGENT_READINESS_2026-08-09.md`；Agent 契约：`docs/AGENT_API.md`；边界：`docs/PRODUCT_BOUNDARIES.md`。

## 2026-08-09 - [CX] 素材处理、证据记录与自动化接口

- 修复深浅滑块只影响后续印章的问题：选中普通章立即更新，选中骑缝章任意切片时整组同步；批量选页添加的章也使用可重复调整的 Fabric ColorMatrix。
- 新增边缘连通近白背景清除；上传时默认自动处理并保留原始素材，手动“去白底”可从原图重算并更新选中的普通章。非直角旋转按新包围盒输出，长方形签名/印章不再裁切。
- 导出 PDF、扫描件、拆页、批量结果和图片来源 PNG 时生成 `yinji-evidence/v1` 侧车；记录源/结果 SHA-256、页数与盖章操作，并明确它不是数字证书签名。
- 新增 `yinji-stamp-template/v1`：页码表达式、五种锚点、偏移、尺寸和透明度；完整骑缝章被删掉任意页后，整份导出会报出缺页并停止。
- 新增 PBKDF2-SHA-256（250000 次）+ AES-256-GCM 印章库加密备份/恢复；普通 localStorage 仍是明文，用户指南已写共享设备边界。
- CLI 新增 `stamp`（CDP 本机批量盖章并写 PDF+侧车）与外部 `sign` 契约；`tools/signing/pyhanko_signer.py` 只从环境变量取 PKCS#12/口令/TSA，未配置时失败关闭。
- 文档：`docs/IMPLEMENTATION_PLAN_2026-08-09.md`、`docs/USER_GUIDE.md`、`docs/TECHNICAL_GUIDE.md`、`docs/AI_RUNBOOK.md`、`docs/CHANGELOG.md`、根 `README.md`。
- 验证：全量 JS/MJS 语法及 Python 编译通过；浏览器单元测试 121/121；smoke 6/6；scan-check 17/17；批量扫描 UI 通过；真实像素探针确认白底 alpha 255→0、中心保留 255、已放章亮度矩阵 0.35；5 页骑缝章整组亮度 0.42；删第 3 页切片后导出阻止且无产物；批量模板只处理第 1/5 页且 opacity=0.73；PDF、扫描 PDF、PNG 三类侧车重新计算 SHA-256 均匹配；外部 sign dry-run/调用契约通过；桌面 1440×960 与移动 390×844 截图完成。

## 2026-08-09 - [CX] AI 原生接口、Windows 验收与发布候选最终交接

- 当前分支 `codex/yinji-delivery`，FeiCode AGit PR #4：`https://feicode.com/Modiqi-com/yinji/pulls/4`。功能提交包括 `8843a9f`（MCP/JSON Task/Agent Skill/双层预检）、`68e6f22`（Windows PowerShell BOM JSON 兼容）；Windows 验收文档提交 `22c7cb8`。
- Agent 接入已形成闭环：`agent-manifest.json`、`yinji-agent-task/v1`、`yinji-agent-result/v1`、6 个 MCP stdio 工具和 `integrations/agents/SKILL.md`。标准顺序为 doctor → inspect → stamp/scan → verify；默认禁止覆盖，MCP 不暴露数字签名。
- 参数支持页码、锚点、偏移、大小、透明度、旋转、深浅和自动去背景；实际模板写入 evidence。浏览器批量路径先走 PDF.js 预检，拒绝损坏/加密/超过 500 页的 PDF。
- kk-pc Windows 10 `10.0.19045` x64、Node `22.23.2`：Chrome `151.0.7922.76` 和 Edge `151.0.4129.72` compatibility 均为 125/125；scan-check 17 项、MCP 真实 stamp/verify、PowerShell 5 BOM JSON Task 与 evidence verify 通过。参数 evidence 实测 `rotation=-7`、`brightness=63`、`removeBackground=true`。
- Windows 实测首次暴露 BOM JSON 解析失败，已在 `68e6f22` 修复 Task、模板和 evidence JSON 入口并增加第 15 项 Agent 合约回归；修复后的确定性 ZIP SHA-256 `ae556603d6cd570015577fd036e9f7da14f25e1fa426c5d33baff22af8ca2572` 已在 kk-pc 完整验收。
- Windows 验收文档加入后的确定性 ZIP SHA-256 为 `66a2302758470c744d7811ecfcad6b3f6fcdab543d9f6cdb40dd659c051f1174`，仅文档/manifest 与已验收包有差异，未因文档变化重复跑浏览器测试。
- 完整说明：`docs/AUDIT_AI_NATIVE_2026-08-09.md`、`docs/COMPATIBILITY_AND_RELEASE.md`、`docs/AGENT_API.md`、`README.md`。kk-pc 测试目录为 `C:\Users\feibisi-BH-PC\yinji-compat-final-20260809`，未安装系统级 Node，测试监听已停止。
- 当前仍为 `1.3.0-rc.1`。稳定/公开发布的明确阻塞是仓库所有者批准并提交 `LICENSE`；若对外声明 Windows 11 认证，需 Windows 11 实机补跑。不要加入 KMS/RBAC/多租户等共享服务复杂度，除非产品边界以后改成共享服务。

## 2026-08-25 - [CX] 印章深浅与自适应纸张底色修复

- 根因：旧深浅矩阵直接按 `0..2` 乘 RGB，低值会把彩色印章压向黑色；Fabric 6 的 `ColorMatrix` 又默认 `colorsOnly=true`，Alpha 行不会生效。现在 `0..100` 通过 Alpha 将印泥密度从 20% 调到原色，`100..200` 只把 RGB 限制暗化到 60%，并显式启用 Alpha 处理。
- 去背景从“边缘连通近白色”改为从四边估算白色、米白或浅灰纸张颜色，对整张图片中的同类底色透明化并柔化抗锯齿边缘；浅红、浅蓝等有明显色差的印泥保留。
- 界面改为“深浅：0 最浅 / 100 原色 / 200 最深”和“自动去除纸张底色”；Agent API、用户指南和变更记录同步说明兼容参数语义，evidence 字段仍为 `brightness` 与 `removeBackground`。
- 验证：5 个改动 JS 文件 `node --check` PASS；浏览器单元 131/131；Agent 合约 15/15；MCP smoke 6 个工具；真实 PDF smoke PASS；scan-check 17/17；灰底浅红夹具像素回归确认角落 Alpha=0、浅档红色像素 `[225,70,70,51]`、最深档 `[136,43,43,255]`，无页面错误。
- 共享工作区已有 `THIRD_PARTY_NOTICES.md`、两份 PDF 夹具和 8 张截图的删除状态，本次未恢复、未暂存、未提交这些既有变更；全套测试在 `/tmp/yinji-verify-0825` 隔离工作树执行。

## 2026-08-28 - [CX] 人工下载恢复原文件格式

- 用户明确要求“下载文件该是什么格式就是什么格式”。此前为避免浏览器拦截多文件下载，人工界面把 PDF/PNG 与 evidence JSON 强制打包成 `.yinji.zip`；该取舍不符合直接下载的用户预期，现已撤销。
- 普通导出、扫描件、选页、全页和逐页下载均直接输出 PDF；图片来源的图片导出直接输出 PNG。Agent CLI 仍在 `--output-dir` 同时写结果文件和 `.yinji.json`，不改变 AI 接口与校验流程。

## 2026-09-09 - [Grok] MIT / 1.3.0 / 官方子域名

- 仓库所有者已批准 MIT，根目录 `LICENSE` 与 `LICENSE-STATUS.md` 已就位；`version.json` 为 `1.3.0`，`canonicalUrl` 为 `https://yinji.modiqi.com/`。
- 官方站点是产品入口，不公开免费分发源码包或安装包。
- 人工导出为 PDF/PNG 原格式；`.yinji.json` 仅 Agent 写出。
- 视觉盖章，不是数字证书签名；扫描件是视觉模拟。文件在浏览器本地处理，不出站。
- OSS 稍后由 modiqi 在阿里云开通；CDN/DNS 由 DevOps 配合。禁止部署进 weixiaoduo-prod WordPress。
- Windows 11 仍未实机认证，不得写成已认证。
- 文档已按上述政策改 README、用户指南、兼容性门禁、CHANGELOG、DEPLOY；发布白名单加入 `LICENSE`。`src/` 业务代码本次未改。
- 旋转导出 `getRotatedSealDataUrl` 的深浅烘焙与界面滑块同一套处理（代码由并行代理改）。

## 2026-09-09 - [Grok] 后续版本与当前上线范围

- 当前上线：官方静态站给人用界面；盖章在访客浏览器里算。Agent 用本机 CLI / stdio MCP，文件走本机路径。
- 后续迭代才考虑对外收费服务。收费若仍是「网页当产品、处理在端上」，可加账号和档位。若改成「文件传到服务器代管盖章」，另做服务端，不塞进现在的静态站。
- Web MCP 若做，只绑本机 `127.0.0.1`，不上 `yinji.modiqi.com`。

## 2026-09-09 - [Grok] 预览缩放改 CSS scale

- 原先 `applyZoom` 每次 `setZoom` + `setDimensions` + `renderAll`，滑条和 Ctrl+滚轮会重分配整页位图，卡。
- 现改为 Fabric 保持适配宽度的位图，用户缩放只 `scale()` 外层，并用 rAF 合并一帧一次。
