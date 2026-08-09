# 印迹技术说明

## 处理边界

印迹是静态浏览器应用。PDF、印章图像、加密和哈希均在本机浏览器执行；应用没有上传接口。普通视觉盖章与数字证书签名是两条明确分离的路径。

## 图像处理

`src/modules/seal-image-processing.js` 保存原始素材，并通过从四边开始的 flood-fill 只清除“边缘连通”的近白像素。旋转先计算新包围盒，避免长方形签名在非 90 度旋转时被裁切。画布中已放置对象使用 Fabric `ColorMatrix` 实时调整 RGB，alpha 保持不变。

## 证据记录

`src/modules/evidence-manifest.js` 定义 `yinji-evidence/v1`：

- Web Crypto SHA-256 计算输入/输出哈希；
- 记录输出页数、模式、盖章坐标和显示属性；
- 人工界面把结果与同名 `.yinji.json` 写入单个 store-method ZIP；Agent CLI 分别落盘；图片来源的 source hash 使用用户选择的原图字节，而不是内部转换 PDF；
- `assurance.visualStampOnly=true` 明确限制。

验证侧车时，应重新计算 PDF SHA-256 并与 `output.sha256` 比较，同时确认 `output.filename` 和 `output.size`。

## 批量模板

`src/modules/stamp-template.js` 定义 `yinji-stamp-template/v1`。示例：

```json
{
  "schema": "yinji-stamp-template/v1",
  "pages": "1,3-5,last",
  "anchor": "bottom-right",
  "offsetX": -12,
  "offsetY": 18,
  "size": 0.18,
  "opacity": 0.85
}
```

页码表达式会去重、排序并限制在 PDF 页数内。尺寸、透明度和偏移均经过范围钳制。

## 加密保险库

`src/modules/seal-vault.js` 定义 `yinji-seal-vault/v1`：PBKDF2-SHA-256、随机 16-byte salt、250000 次迭代、AES-256-GCM、随机 12-byte IV。备份只包含密文、salt、IV 和算法参数，不保存口令。普通印章库使用 sessionStorage；旧版 localStorage 只迁入会话并等待用户明确清理。

## CLI

盖章：

```bash
node tools/ai/yinji-cli.mjs stamp \
  --pdf ./contract.pdf --seal ./seal.png \
  --template ./template.json --output-dir ./out
```

CLI 通过 CDP 驱动本机页面，产出 PDF 和证据侧车。`--dry-run` 不连接浏览器。

Agent 的 capabilities、doctor、scan、verify 和结构化错误协议见 `docs/AGENT_API.md`。

外部签名契约：

```text
<sign-command> <input.pdf> <output.pdf>
```

印迹不接收证书口令参数。参考适配器 `tools/signing/pyhanko_signer.py` 从环境变量读取：

- `YINJI_SIGN_PFX`：PKCS#12 文件路径；
- `YINJI_SIGN_PASSPHRASE`：口令；
- `YINJI_SIGN_TSA_URL`：可选 RFC 3161 时间戳服务。

调用：

```bash
YINJI_SIGN_COMMAND=./tools/signing/pyhanko_signer.py \
node tools/ai/yinji-cli.mjs sign --input ./out/a.pdf --output ./out/a-signed.pdf
```

签名环境、证书链、吊销检查和 TSA 合规性由部署方负责；这些不是浏览器视觉盖章的保证。

## 测试

```bash
# 所有 JS/MJS/Python 语法
find src tests tools/ai -type f \( -name '*.js' -o -name '*.mjs' \) -print0 | xargs -0 -n1 node --check
python3 -m py_compile tools/signing/pyhanko_signer.py

# 浏览器单元测试
# 启动 python3 -m http.server 8123 后打开 tests/index.html

node tools/ai/yinji-cli.mjs smoke --pdf ./test-fixture.pdf
node tools/ai/yinji-cli.mjs scan-check
node tools/ai/yinji-cli.mjs stamp --pdf ./test-fixture.pdf --seal demo --output-dir /tmp/yinji-out
```
