---
name: yinji
description: Use Yinji to inspect, visually stamp, adjust, scan-simulate and verify local PDF files through MCP or a JSON task contract.
---

# Yinji Agent Skill

1. Call `yinji_capabilities`, then `yinji_doctor`.
2. Call `yinji_inspect` for every input PDF. Stop on encrypted, malformed or oversized input.
3. Ask the user which seal is authorized and where it should appear. Never infer legal authority from a filename.
4. Call `yinji_stamp` or `yinji_scan` with a new output directory and a semantic template.
5. Use `anchor`, `offsetX`, `offsetY`, `size`, `opacity`, `rotation`, `brightness` and `removeBackground` instead of screen coordinates.
6. Call `yinji_verify` on the returned `.yinji.json` before reporting success.
7. State that the output contains a visual stamp, not a certificate-backed digital signature.

Do not enable `force` unless the user explicitly authorizes replacing existing output. Do not upload files, retain seals, or invoke an external signer unless a separate approved workflow provides that authority.
