from __future__ import annotations

from pathlib import Path

from ..models import ExtractedContent
from .docx import extract_docx
from .html import extract_html
from .hwp_hwpx import extract_hwp, extract_hwpx
from .pdf import extract_pdf
from .pptx import extract_pptx


def extract_document(path: Path) -> ExtractedContent:
    suffix = path.suffix.lower()
    if suffix == ".hwpx":
        return extract_hwpx(path)
    if suffix == ".hwp":
        return extract_hwp(path)
    if suffix == ".pdf":
        return extract_pdf(path)
    if suffix == ".docx":
        return extract_docx(path)
    if suffix == ".pptx":
        return extract_pptx(path)
    if suffix in {".html", ".htm"}:
        return extract_html(path)
    text = path.read_text(encoding="utf-8", errors="ignore")
    return ExtractedContent(extractor_name="plain_text", text=text)
