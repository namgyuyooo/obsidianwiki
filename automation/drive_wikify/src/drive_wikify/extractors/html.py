from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

from ..models import ExtractedContent


class _ReportHtmlParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.headings: list[str] = []
        self.title = ""
        self._skip_depth = 0
        self._current_heading: str | None = None
        self._heading_buffer: list[str] = []
        self._in_title = False
        self._title_buffer: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag in {"script", "style", "svg", "canvas", "noscript"}:
            self._skip_depth += 1
            return
        if tag == "title":
            self._in_title = True
            self._title_buffer = []
        if tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            self._current_heading = tag
            self._heading_buffer = []
        if tag in {"p", "div", "section", "article", "li", "tr", "br", "table"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"script", "style", "svg", "canvas", "noscript"} and self._skip_depth:
            self._skip_depth -= 1
            return
        if self._skip_depth:
            return
        if tag == "title":
            self._in_title = False
            self.title = " ".join(" ".join(self._title_buffer).split())
        if tag == self._current_heading:
            heading = " ".join(" ".join(self._heading_buffer).split())
            if heading:
                self.headings.append(heading)
                self.parts.append(f"\n## {heading}\n")
            self._current_heading = None
            self._heading_buffer = []
        if tag in {"p", "div", "section", "article", "li", "tr", "table"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        text = " ".join(data.split())
        if not text:
            return
        if self._in_title:
            self._title_buffer.append(text)
        if self._current_heading:
            self._heading_buffer.append(text)
        else:
            self.parts.append(text)


def extract_html(path: Path) -> ExtractedContent:
    raw = path.read_text(encoding="utf-8", errors="ignore")
    parser = _ReportHtmlParser()
    parser.feed(raw)
    text = "\n".join(line.strip() for line in "".join(parser.parts).splitlines() if line.strip())
    return ExtractedContent(
        extractor_name="html_report_parser",
        text=text,
        headings=parser.headings,
        metadata={"title": parser.title} if parser.title else {},
        warnings=["HTML scripts/styles/svg/canvas were skipped; verify embedded chart-only evidence if needed."],
    )
