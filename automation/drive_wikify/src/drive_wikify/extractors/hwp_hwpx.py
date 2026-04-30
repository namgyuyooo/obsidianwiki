from __future__ import annotations

import re
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile

from ..models import ExtractedContent


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _normalize_line(text: str) -> str:
    return re.sub(r"[ \t]+", " ", text).strip()


def _run_rhwp(path: Path) -> str | None:
    candidates = [
        ["rhwp", "dump", str(path)],
        ["python3", "-m", "rhwp", "dump", str(path)],
        [
            "/Users/rtm/Documents/GitHub/Obsidian_wiki/.tmp_rhwp/rhwp/target/release/rhwp",
            "dump",
            str(path),
        ],
        [
            "python3",
            "/Users/rtm/Documents/GitHub/Obsidian_wiki/.tmp_rhwp/rhwp/rhwp.py",
            "dump",
            str(path),
        ],
    ]
    for cmd in candidates:
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            if result.stdout.strip():
                return result.stdout
        except (subprocess.CalledProcessError, FileNotFoundError):
            continue
    return None


def _extract_rhwp_text(dump: str) -> str:
    lines: list[str] = []
    seen: set[str] = set()
    for raw_line in dump.splitlines():
        line = raw_line.strip()
        text = ""
        paragraph_match = re.search(r'텍스트:\s*"?(.*?)"?$', line)
        cell_match = re.search(r'text="(.*?)"', line)
        if paragraph_match:
            candidate = paragraph_match.group(1).strip()
            if candidate and candidate != "(빈 문단)":
                text = candidate
        elif cell_match:
            text = cell_match.group(1).strip()
        if not text:
            continue
        normalized = _normalize_line(text.replace("|", "\n"))
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
        return ExtractedContent(
            extractor_name="rhwp_dump_text" if extracted else "rhwp_dump",
            text=extracted or _normalize_text(dump),
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
        raw = "\n".join(filtered[:800])
        warnings.append("HWP extracted with string-scan fallback; verify against rhwp when possible.")
    return ExtractedContent(
        extractor_name="hwp_text_fallback",
        text=_normalize_text(raw),
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
