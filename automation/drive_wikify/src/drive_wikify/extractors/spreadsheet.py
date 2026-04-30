from __future__ import annotations

import csv
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile

from ..models import ExtractedContent


NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
}


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _extract_utf16_strings(blob: bytes, min_chars: int = 4) -> list[str]:
    results: list[str] = []
    current: list[str] = []
    for index in range(0, len(blob) - 1, 2):
      code = int.from_bytes(blob[index : index + 2], "little")
      char = chr(code)
      if char.isprintable() and char not in "\x00\r":
        current.append(char)
      else:
        if len(current) >= min_chars:
          results.append("".join(current))
        current = []
    if len(current) >= min_chars:
      results.append("".join(current))
    return results


def _column_label(cell_ref: str) -> str:
    match = re.match(r"([A-Z]+)", cell_ref or "")
    return match.group(1) if match else ""


def _shared_strings(archive: ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    values = []
    for item in root.findall(".//main:si", NS):
        parts = [node.text or "" for node in item.findall(".//main:t", NS)]
        values.append(_normalize_text("".join(parts)))
    return values


def _cell_value(cell: ET.Element, shared: list[str]) -> str:
    value_node = cell.find("main:v", NS)
    if value_node is None or value_node.text is None:
        inline = cell.find(".//main:t", NS)
        return _normalize_text(inline.text or "") if inline is not None else ""
    raw = value_node.text
    if cell.attrib.get("t") == "s":
        try:
            return shared[int(raw)]
        except (ValueError, IndexError):
            return raw
    return raw


def extract_xlsx(path: Path) -> ExtractedContent:
    headings: list[str] = []
    tables: list[list[list[str]]] = []
    parts: list[str] = []
    warnings: list[str] = []
    with ZipFile(path) as archive:
        shared = _shared_strings(archive)
        sheet_names = sorted(name for name in archive.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", name))
        for sheet_index, sheet_name in enumerate(sheet_names, start=1):
            root = ET.fromstring(archive.read(sheet_name))
            rows: list[list[str]] = []
            for row in root.findall(".//main:row", NS)[:80]:
                cells = []
                last_col = ""
                for cell in row.findall("main:c", NS):
                    col = _column_label(cell.attrib.get("r", ""))
                    value = _cell_value(cell, shared)
                    if value:
                        cells.append(f"{col or last_col}:{value}" if col else value)
                    last_col = col or last_col
                if cells:
                    rows.append(cells)
            if not rows:
                continue
            title = f"sheet{sheet_index}"
            headings.append(title)
            tables.append(rows[:20])
            parts.append(f"## {title}")
            parts.extend(" | ".join(row) for row in rows[:40])
            if len(rows) >= 80:
                warnings.append(f"{title}: first 80 non-empty rows extracted; inspect source for full workbook.")
    return ExtractedContent(
        extractor_name="xlsx_zip_xml",
        text="\n".join(parts),
        headings=headings,
        tables=tables,
        warnings=warnings,
    )


def extract_csv(path: Path) -> ExtractedContent:
    rows: list[list[str]] = []
    with path.open("r", encoding="utf-8-sig", errors="ignore", newline="") as handle:
        for index, row in enumerate(csv.reader(handle)):
            if index >= 120:
                break
            cleaned = [_normalize_text(cell) for cell in row]
            if any(cleaned):
                rows.append(cleaned)
    text = "\n".join(" | ".join(row) for row in rows)
    return ExtractedContent(
        extractor_name="csv_reader",
        text=text,
        tables=[rows[:40]] if rows else [],
        warnings=["CSV extraction limited to first 120 rows; inspect source for full data."] if len(rows) >= 120 else [],
    )


def extract_xls(path: Path) -> ExtractedContent:
    blob = path.read_bytes()
    ascii_matches = re.findall(rb"[ -~]{4,}", blob)
    utf16_matches = _extract_utf16_strings(blob)
    values: list[str] = []
    seen: set[str] = set()
    for item in [match.decode("utf-8", errors="ignore") for match in ascii_matches[:400]] + utf16_matches[:400]:
        normalized = _normalize_text(item)
        if len(normalized) < 2 or normalized in seen:
            continue
        seen.add(normalized)
        values.append(normalized)
    text = "\n".join(values)
    return ExtractedContent(
        extractor_name="xls_string_fallback",
        text=text,
        warnings=["Legacy .xls used string fallback with ASCII/UTF-16 scan; verify numeric cells and formulas in source workbook."],
    )
