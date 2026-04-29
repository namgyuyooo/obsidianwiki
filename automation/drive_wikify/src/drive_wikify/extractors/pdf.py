from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

from ..models import ExtractedContent


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def extract_pdf(path: Path) -> ExtractedContent:
    warnings: list[str] = []
    text = ""
    try:
        import pypdf

        reader = pypdf.PdfReader(str(path))
        parts = []
        for page in reader.pages:
            extracted = page.extract_text() or ""
            if extracted.strip():
                parts.append(extracted)
        text = "\n".join(parts)
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
            text = result.stdout
            warnings.append("Used strings fallback for PDF extraction.")
        except Exception as exc:  # pragma: no cover - fallback path
            warnings.append(f"strings fallback failed: {exc}")

    return ExtractedContent(
        extractor_name="pypdf" if text and "Used strings" not in " ".join(warnings) else "pdf_fallback",
        text=_normalize_text(text),
        warnings=warnings,
        metadata={"python": sys.executable},
    )
