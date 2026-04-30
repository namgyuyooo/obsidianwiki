from __future__ import annotations

import re
import os
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile

from ..models import ExtractedContent


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _normalize_line(text: str) -> str:
    return re.sub(r"[ \t]+", " ", text).strip()


def _heading_candidates(text: str) -> list[str]:
    headings: list[str] = []
    seen: set[str] = set()
    for line in text.splitlines():
        normalized = _normalize_line(line)
        if not normalized or len(normalized) > 120:
            continue
        if not re.match(r"^(?:□|■|※|[0-9]+(?:\.[0-9]+)*\.?|[가-힣A-Za-z]+\.)", normalized):
            continue
        if normalized in seen:
            continue
        seen.add(normalized)
        headings.append(normalized)
    return headings[:80]


def _clean_rhwp_text(value: str) -> str:
    text = value.strip().strip('"')
    text = text.replace('\\"', '"')
    parts = [_normalize_line(part) for part in text.split("|")]
    return "\n".join(part for part in parts if part)


def _escape_markdown_cell(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", "<br>")


def _render_markdown_table(rows: list[list[str]]) -> str:
    if not rows:
        return ""
    width = max(len(row) for row in rows)
    normalized_rows = [row + [""] * (width - len(row)) for row in rows]
    header = normalized_rows[0]
    separator = ["---"] * width
    body = normalized_rows[1:] or [[""] * width]
    rendered = [
        f"| {' | '.join(_escape_markdown_cell(cell) for cell in header)} |",
        f"| {' | '.join(separator)} |",
    ]
    rendered.extend(f"| {' | '.join(_escape_markdown_cell(cell) for cell in row)} |" for row in body)
    return "\n".join(rendered)


def _extract_rhwp_tables(dump: str) -> list[list[list[str]]]:
    tables: list[list[list[str]]] = []
    current: dict[str, object] | None = None
    for raw_line in dump.splitlines():
        line = raw_line.strip()
        table_match = re.search(r"\[(\d+)\]\s+표:\s+(\d+)행×(\d+)열", line)
        if table_match:
            if current:
                tables.append(_finalize_rhwp_table(current))
            current = {
                "table_id": table_match.group(1),
                "rows": int(table_match.group(2)),
                "cols": int(table_match.group(3)),
                "cells": [],
            }
            continue
        if not current:
            continue
        cell_match = re.search(
            r'\[(\d+)\]\s+셀\[\d+\]\s+r=(\d+),c=(\d+)\s+rs=(\d+),cs=(\d+).*?text="(.*?)"$',
            line,
        )
        if not cell_match:
            continue
        if cell_match.group(1) != current["table_id"]:
            continue
        current["cells"].append({
            "row": int(cell_match.group(2)),
            "col": int(cell_match.group(3)),
            "rowspan": int(cell_match.group(4)),
            "colspan": int(cell_match.group(5)),
            "text": _clean_rhwp_text(cell_match.group(6)),
        })
    if current:
        tables.append(_finalize_rhwp_table(current))
    return [table for table in tables if table and any(any(cell for cell in row) for row in table)]


def _finalize_rhwp_table(table: dict[str, object]) -> list[list[str]]:
    row_count = int(table.get("rows", 0) or 0)
    col_count = int(table.get("cols", 0) or 0)
    grid = [["" for _ in range(max(col_count, 1))] for _ in range(max(row_count, 1))]
    for cell in table.get("cells", []):
        row = int(cell["row"])
        col = int(cell["col"])
        rowspan = max(1, int(cell["rowspan"]))
        colspan = max(1, int(cell["colspan"]))
        text = str(cell["text"] or "")
        if row >= len(grid) or col >= len(grid[0]):
            continue
        grid[row][col] = text
        for row_offset in range(rowspan):
            for col_offset in range(colspan):
                next_row = row + row_offset
                next_col = col + col_offset
                if next_row >= len(grid) or next_col >= len(grid[0]):
                    continue
                if next_row == row and next_col == col:
                    continue
                if not grid[next_row][next_col]:
                    grid[next_row][next_col] = ""
    return grid


def _run_rhwp(path: Path) -> str | None:
    env_bin = os.environ.get("RHWP_BIN", "").strip()
    candidates = [
        [env_bin, "dump", str(path)] if env_bin else [],
        [
            "/Users/rtm/Documents/GitHub/Obsidian_wiki/.tmp_rhwp/rhwp/target/release/rhwp",
            "dump",
            str(path),
        ],
        [
            "/host/Users/rtm/Documents/GitHub/Obsidian_wiki/.tmp_rhwp/rhwp/target/release/rhwp",
            "dump",
            str(path),
        ],
        [
            "python3",
            "/Users/rtm/Documents/GitHub/Obsidian_wiki/.tmp_rhwp/rhwp/rhwp.py",
            "dump",
            str(path),
        ],
        ["rhwp", "dump", str(path)],
        ["python3", "-m", "rhwp", "dump", str(path)],
    ]
    for cmd in [item for item in candidates if item]:
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                check=True,
                timeout=90,
                encoding="utf-8",
                errors="replace",
            )
            if result.stdout.strip():
                return result.stdout
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            continue
    return None


def _extract_rhwp_text(dump: str) -> str:
    lines: list[str] = []
    seen: set[str] = set()
    for raw_line in dump.splitlines():
        line = raw_line.strip()
        text = ""
        paragraph_match = re.search(r'^텍스트:\s*(.+?)\s*$', line)
        cell_match = re.search(r'text="(.*?)"', line)
        if paragraph_match:
            candidate = paragraph_match.group(1).strip()
            if candidate and candidate != "(빈 문단)":
                text = candidate
        elif cell_match:
            text = cell_match.group(1).strip()
        if not text:
            continue
        cleaned = _clean_rhwp_text(text)
        if not cleaned:
            continue
        for piece in cleaned.splitlines():
            normalized = _normalize_line(piece)
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            lines.append(normalized)
    return "\n".join(lines)


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


def _extract_ascii_strings(blob: bytes, min_chars: int = 4) -> list[str]:
    matches = re.findall(rb"[ -~]{%d,}" % min_chars, blob)
    return [match.decode("ascii", errors="ignore") for match in matches]


def extract_hwp(path: Path) -> ExtractedContent:
    dump = _run_rhwp(path)
    warnings: list[str] = []
    if dump:
        extracted = _extract_rhwp_text(dump)
        tables = _extract_rhwp_tables(dump)
        markdown_tables = [_render_markdown_table(table) for table in tables if table]
        combined_text = extracted
        if markdown_tables:
            combined_text = "\n\n".join([
                extracted,
                "## 추출 표",
                *[f"### 표 {index}\n{table_md}" for index, table_md in enumerate(markdown_tables, start=1)],
            ]).strip()
        if extracted:
            return ExtractedContent(
                extractor_name="rhwp_dump_text",
                text=combined_text,
                headings=_heading_candidates(extracted),
                tables=tables,
                warnings=warnings,
            )
        warnings.append("rhwp dump succeeded but yielded no body text; fallback applied.")
        return ExtractedContent(
            extractor_name="rhwp_dump",
            text=_normalize_text(dump),
            warnings=warnings,
        )
    try:
        blob = path.read_bytes()
    except OSError:
        blob = b""
    if not blob:
        warnings.append("HWP extraction failed; no readable fallback text.")
        raw = ""
    else:
        utf16_strings = _extract_utf16_strings(blob)
        ascii_strings = _extract_ascii_strings(blob)
        candidates = utf16_strings + ascii_strings
        filtered = []
        seen = set()
        for item in candidates:
            normalized = _normalize_text(item)
            if len(normalized) < 4:
                continue
            if normalized in seen:
                continue
            seen.add(normalized)
            filtered.append(normalized)
        meaningful = [item for item in filtered if re.search(r"[가-힣A-Za-z]{2,}", item)]
        raw = "\n".join((meaningful or filtered)[:800])
        warnings.append("HWP extracted with string-scan fallback; verify against rhwp when possible.")
    return ExtractedContent(
        extractor_name="hwp_text_fallback",
        text=raw,
        headings=_heading_candidates(raw),
        warnings=warnings,
    )


def extract_hwpx(path: Path) -> ExtractedContent:
    texts: list[str] = []
    headings: list[str] = []
    warnings: list[str] = []
    with ZipFile(path) as archive:
        for name in archive.namelist():
            if not name.endswith(".xml"):
                continue
            if "Contents/" not in name and "content" not in name.lower():
                continue
            try:
                root = ET.fromstring(archive.read(name))
            except ET.ParseError:
                warnings.append(f"XML parse failed for {name}")
                continue
            for node in root.iter():
                if node.text and node.text.strip():
                    text = _normalize_text(node.text)
                    if text:
                        texts.append(text)
                        if len(text) < 80:
                            headings.append(text)
    return ExtractedContent(
        extractor_name="hwpx_zip_xml",
        text="\n".join(dict.fromkeys(texts)),
        headings=list(dict.fromkeys(headings[:50])),
        warnings=warnings,
    )
