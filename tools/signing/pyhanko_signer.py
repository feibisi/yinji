#!/usr/bin/env python3
"""Yinji external signer contract using pyHanko and a PKCS#12 certificate."""

from __future__ import annotations

import os
import sys
from pathlib import Path


def fail(message: str, code: int = 2) -> None:
    print(f"yinji-pyhanko: {message}", file=sys.stderr)
    raise SystemExit(code)


def main() -> None:
    if len(sys.argv) != 3:
        fail("usage: pyhanko_signer.py <input.pdf> <output.pdf>")

    input_path = Path(sys.argv[1]).expanduser().resolve()
    output_path = Path(sys.argv[2]).expanduser().resolve()
    pfx_path = os.environ.get("YINJI_SIGN_PFX", "").strip()
    passphrase = os.environ.get("YINJI_SIGN_PASSPHRASE")
    tsa_url = os.environ.get("YINJI_SIGN_TSA_URL", "").strip()

    if not input_path.is_file():
        fail(f"input not found: {input_path}")
    if not pfx_path or not Path(pfx_path).expanduser().is_file():
        fail("set YINJI_SIGN_PFX to a readable PKCS#12 certificate")

    try:
        from pyhanko.sign import signers, timestamps
        from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
    except ImportError:
        fail("pyHanko is not installed; install it in an isolated signing environment")

    signer = signers.SimpleSigner.load_pkcs12(
        pfx_file=str(Path(pfx_path).expanduser()),
        passphrase=passphrase.encode("utf-8") if passphrase is not None else None,
    )
    if signer is None:
        fail("unable to load PKCS#12 certificate")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    timestamper = timestamps.HTTPTimeStamper(tsa_url) if tsa_url else None
    signature_meta = signers.PdfSignatureMetadata(
        field_name="YinjiSignature",
        md_algorithm="sha256",
    )

    with input_path.open("rb") as source, output_path.open("wb") as target:
        writer = IncrementalPdfFileWriter(source)
        pdf_signer = signers.PdfSigner(
            signature_meta,
            signer=signer,
            timestamper=timestamper,
        )
        pdf_signer.sign_pdf(writer, output=target)


if __name__ == "__main__":
    main()
