from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

from ..models import ExtractedContent


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _normalize_blocks(text: str) -> str:
    lines = []
    for raw_line in str(text or "").splitlines():
        line = _normalize_text(raw_line)
        if line:
            lines.append(line)
    return "\n".join(lines)


def extract_pdf(path: Path) -> ExtractedContent:
    warnings: list[str] = []
    text = ""
    try:
        import pypdf

        reader = pypdf.PdfReader(str(path))
        parts = []
        for page_number, page in enumerate(reader.pages, start=1):
            extracted = page.extract_text() or ""
            if extracted.strip():
                parts.append(f"## page {page_number}\n{_normalize_blocks(extracted)}")
        text = "\n\n".join(parts)
    except Exception as exc:  # pragma: no cover - fallback path
        warnings.append(f"pypdf extraction failed: {exc}")

    if not text.strip():
        try:
            result = subprocess.run(
                ["/usr/bin/strings", str(path)],
                capture_output=True,
                text=True,
                check=True,
            )
            text = _normalize_blocks(result.stdout)
            warnings.append("Used strings fallback for PDF extraction.")
        except Exception as exc:  # pragma: no cover - fallback path
            warnings.append(f"strings fallback failed: {exc}")

    return ExtractedContent(
        extractor_name="pypdf" if text and "Used strings" not in " ".join(warnings) else "pdf_fallback",
        text=text.strip(),
        warnings=warnings,
        metadata={"python": sys.executable},
    )
