from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile

from ..models import ExtractedContent


NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
}


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def extract_pptx(path: Path) -> ExtractedContent:
    slides: list[str] = []
    headings: list[str] = []
    notes: list[str] = []
    with ZipFile(path) as archive:
        slide_names = sorted(
            name
            for name in archive.namelist()
            if name.startswith("ppt/slides/slide") and name.endswith(".xml")
        )
        for slide_name in slide_names:
            root = ET.fromstring(archive.read(slide_name))
            texts = [_normalize_text(node.text) for node in root.findall(".//a:t", NS) if node.text and node.text.strip()]
            texts = [text for text in texts if text]
            if texts:
                headings.append(texts[0])
                slides.append("\n".join(texts))

        note_names = sorted(
            name
            for name in archive.namelist()
            if name.startswith("ppt/notesSlides/notesSlide") and name.endswith(".xml")
        )
        for note_name in note_names:
            root = ET.fromstring(archive.read(note_name))
            note_texts = [_normalize_text(node.text) for node in root.findall(".//a:t", NS) if node.text and node.text.strip()]
            if note_texts:
                notes.append("\n".join(note_texts))

    return ExtractedContent(
        extractor_name="pptx_zip_xml",
        text="\n\n".join(slides),
        headings=headings,
        notes=notes,
    )
