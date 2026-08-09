# 第三方软件与来源说明

本仓库将下列前端库随应用一起分发。版本通过运行时字段、文件头和与官方发布文件的 SHA-256 对照确认。

| 文件 | 项目与版本 | 许可证 | SHA-256 |
|---|---|---|---|
| `vendor/fabric.min.js` | Fabric.js 6.6.1 | MIT | `93c88a400cd447ee5f9a2907525c0d197e1214c7e9279879c68940b75e05624c` |
| `vendor/lucide.min.js` | Lucide 0.469.0 | ISC（部分 Feather 图标为 MIT） | `5de4fffddc1b41ad1226d5e986fcc552adb8ad9efd1566e71dfdcdb664f9a6c2` |
| `vendor/pdf-lib.min.js` | pdf-lib 1.17.1 | MIT | `0f9a5cad07941f0826586c94e089d89b918c46e5c17cf2d5a3c6f666e3bc694f` |
| `vendor/pdf.min.mjs` | PDF.js 4.10.38 | Apache-2.0 | `27fc2a057a00f92a4334ad06e17dbd7259912954e9fb7f76400bcca5fd190a9c` |
| `vendor/pdf.worker.min.mjs` | PDF.js 4.10.38 | Apache-2.0 | `1baa1844c89c80a5b2797c916e75ab29254be46d8e9cb53cb6364d7aad84be36` |

完整许可证文本位于 `licenses/`。

## 扫描视觉算法来源

`src/modules/scan-effect.js` 的扫描视觉算法移植自 [lookscanned.io](https://github.com/lookscanned/lookscanned.io)，原项目采用 MIT License，Copyright (c) 2022 seedgou。对应许可证见 `licenses/lookscanned-MIT.txt`。

[baicunko/scanyourpdf](https://github.com/baicunko/scanyourpdf) 仅作为设计灵感来源；水印、PDF 信息、批量处理与印迹界面为本项目实现。

## 本项目代码的授权状态

截至 2026-08-09，仓库所有者尚未为印迹自身代码声明开源许可证。第三方许可证不自动授予印迹自身代码的复制、修改或再分发权。对外发布前应由仓库所有者明确选择项目许可证或专有授权条款。
