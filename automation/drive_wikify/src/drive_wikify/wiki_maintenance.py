from __future__ import annotations

import json
import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from .config import RuntimeConfig


TOKEN_RE = re.compile(r"[0-9A-Za-z가-힣_]{2,}")
WIKI_LINK_RE = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]")
MD_LINK_RE = re.compile(r"\[[^\]]+\]\(([^)]+\.md)(?:#[^)]+)?\)")
STOPWORDS = {
    "wiki",
    "index",
    "hub",
    "log",
    "project",
    "common",
    "source",
    "sources",
    "evidence",
    "change",
    "conflict",
    "register",
    "updated",
    "created",
    "type",
}


@dataclass
class WikiPage:
    title: str
    path: str
    root_kind: str
    project_key: str
    frontmatter: dict[str, str]
    markdown: str
    headings: list[str]
    links: list[str]
    mtime: str


def _walk_markdown(root: Path) -> list[Path]:
    return sorted(path for path in root.rglob("*.md") if path.is_file())


def _parse_frontmatter(markdown: str) -> dict[str, str]:
    if not markdown.startswith("---\n"):
        return {}
    end = markdown.find("\n---", 4)
    if end == -1:
        return {}
    frontmatter = {}
    for line in markdown[4:end].splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        frontmatter[key.strip()] = value.strip().strip('"').strip("'")
    return frontmatter


def _title_from_markdown(path: str, markdown: str) -> str:
    for line in markdown.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return Path(path).stem


def _extract_headings(markdown: str) -> list[str]:
    return [line.lstrip("#").strip() for line in markdown.splitlines() if line.startswith("#")]


def _extract_links(markdown: str) -> list[str]:
    links = []
    for regex in (WIKI_LINK_RE, MD_LINK_RE):
        for match in regex.finditer(markdown):
            target = match.group(1).strip()
            if target:
                links.append(target)
    return links


def _normalize_link_key(value: str) -> str:
    return Path(str(value).replace("\\", "/")).stem.strip().lower()


def _tokenize(value: str) -> list[str]:
    tokens = []
    for token in TOKEN_RE.findall(value.lower()):
        if token in STOPWORDS:
            continue
        tokens.append(token)
    return tokens


def _weighted_counter(page: WikiPage) -> Counter[str]:
    counter: Counter[str] = Counter()
    for token in _tokenize(page.title):
        counter[token] += 5
    for token in _tokenize(page.path.replace("/", " ")):
        counter[token] += 3
    for heading in page.headings:
        for token in _tokenize(heading):
            counter[token] += 2
    for token in _tokenize(page.markdown):
        counter[token] += 1
    return counter


def _project_key_from_path(relative_path: str) -> tuple[str, str]:
    parts = Path(relative_path).parts
    if len(parts) < 3:
        return "wiki", "wiki"
    if parts[1] == "L1_memory":
        return "memory", parts[1]
    return parts[2], parts[1]


def _relative_vault_path(path: Path, root: Path) -> str:
    try:
        vault_root = root.parents[1]
        return str(path.relative_to(vault_root)).replace("\\", "/")
    except (IndexError, ValueError):
        return str(path).replace("\\", "/")


def _load_pages(config: RuntimeConfig) -> list[WikiPage]:
    pages: list[WikiPage] = []
    roots = [
        ("wiki", config.wiki_root),
        ("l1_memory", config.l1_memory_root),
    ]
    for root_kind, root in roots:
        if not root.exists():
            continue
        for path in _walk_markdown(root):
            markdown = path.read_text(encoding="utf-8")
            relative_path = _relative_vault_path(path, root)
            project_key, _ = _project_key_from_path(relative_path)
            stat = path.stat()
            pages.append(
                WikiPage(
                    title=_title_from_markdown(relative_path, markdown),
                    path=relative_path,
                    root_kind=root_kind,
                    project_key=project_key,
                    frontmatter=_parse_frontmatter(markdown),
                    markdown=markdown,
                    headings=_extract_headings(markdown),
                    links=_extract_links(markdown),
                    mtime=datetime.fromtimestamp(stat.st_mtime).isoformat(),
                )
            )
    return sorted(pages, key=lambda item: item.path)


def _runtime_dir(config: RuntimeConfig) -> Path:
    return config.repo_root() / "automation" / "drive_wikify" / "runtime"


def build_sparse_search_index(config: RuntimeConfig) -> dict:
    pages = _load_pages(config)
    doc_vectors: dict[str, Counter[str]] = {}
    doc_lengths: dict[str, int] = {}
    document_frequency: Counter[str] = Counter()
    postings: dict[str, list[dict[str, float | int | str]]] = defaultdict(list)

    for page in pages:
        vector = _weighted_counter(page)
        if not vector:
            continue
        doc_vectors[page.path] = vector
        doc_lengths[page.path] = sum(vector.values())
        for token in vector:
            document_frequency[token] += 1

    total_docs = max(len(doc_vectors), 1)
    avg_doc_len = sum(doc_lengths.values()) / total_docs if doc_lengths else 0.0
    k1 = 1.5
    b = 0.75

    for page in pages:
        vector = doc_vectors.get(page.path)
        if not vector:
            continue
        length = doc_lengths[page.path]
        for token, tf in vector.items():
            df = document_frequency[token]
            idf = math.log(1 + (total_docs - df + 0.5) / (df + 0.5))
            denom = tf + k1 * (1 - b + b * (length / avg_doc_len if avg_doc_len else 1.0))
            bm25 = idf * ((tf * (k1 + 1)) / denom) if denom else 0.0
            postings[token].append(
                {
                    "path": page.path,
                    "score": round(bm25, 6),
                    "tf": tf,
                }
            )

    documents = []
    for page in pages:
        documents.append(
            {
                "path": page.path,
                "title": page.title,
                "root_kind": page.root_kind,
                "project_key": page.project_key,
                "type": page.frontmatter.get("type", ""),
                "updated": page.frontmatter.get("updated", ""),
                "mtime": page.mtime,
                "headings": page.headings[:12],
            }
        )

    payload = {
        "generated_at": datetime.now().isoformat(),
        "version": 1,
        "index_type": "sparse_bm25",
        "tokenizer": "regex_ko_en_numeric",
        "stats": {
            "documents": len(documents),
            "terms": len(postings),
            "avg_doc_len": round(avg_doc_len, 2),
        },
        "documents": documents,
        "terms": {
            token: sorted(items, key=lambda item: (-float(item["score"]), str(item["path"])))
            for token, items in sorted(postings.items())
        },
    }
    runtime_dir = _runtime_dir(config)
    runtime_dir.mkdir(parents=True, exist_ok=True)
    (runtime_dir / "wiki_sparse_index.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return payload


def sparse_search(config: RuntimeConfig, query: str, limit: int = 10) -> list[dict]:
    index_path = _runtime_dir(config) / "wiki_sparse_index.json"
    if not index_path.exists():
        build_sparse_search_index(config)
    payload = json.loads(index_path.read_text(encoding="utf-8"))
    documents = {item["path"]: item for item in payload.get("documents", [])}
    scores: dict[str, float] = defaultdict(float)
    matched_terms: dict[str, list[str]] = defaultdict(list)
    for token in _tokenize(query):
        for posting in payload.get("terms", {}).get(token, []):
            path = str(posting["path"])
            scores[path] += float(posting["score"])
            matched_terms[path].append(token)
    ranked = sorted(scores.items(), key=lambda item: (-item[1], item[0]))[:limit]
    results = []
    for path, score in ranked:
        document = documents.get(path, {})
        results.append(
            {
                "path": path,
                "title": document.get("title", Path(path).stem),
                "score": round(score, 6),
                "matched_terms": sorted(set(matched_terms[path])),
                "project_key": document.get("project_key", ""),
                "root_kind": document.get("root_kind", ""),
            }
        )
    return results


def build_graph_and_navigation(config: RuntimeConfig) -> dict:
    pages = _load_pages(config)
    by_title = {_normalize_link_key(page.title): page for page in pages}
    by_path = {_normalize_link_key(page.path): page for page in pages}
    nodes = []
    edges = []
    adjacency: dict[str, set[str]] = defaultdict(set)

    for page in pages:
        nodes.append(
            {
                "id": page.path,
                "title": page.title,
                "project_key": page.project_key,
                "root_kind": page.root_kind,
                "type": page.frontmatter.get("type", ""),
            }
        )
        for raw_link in page.links:
            target = by_title.get(_normalize_link_key(raw_link)) or by_path.get(_normalize_link_key(raw_link))
            if not target or target.path == page.path:
                continue
            edge_key = (page.path, target.path)
            if target.path in adjacency[page.path]:
                continue
            adjacency[page.path].add(target.path)
            adjacency[target.path].add(page.path)
            edges.append({"source": edge_key[0], "target": edge_key[1], "label": raw_link})

    degree_map = {page.path: len(adjacency.get(page.path, set())) for page in pages}
    orphan_pages = sorted([page.path for page in pages if degree_map.get(page.path, 0) == 0])
    top_pages = sorted(
        (
            {
                "path": page.path,
                "title": page.title,
                "degree": degree_map.get(page.path, 0),
                "project_key": page.project_key,
            }
            for page in pages
        ),
        key=lambda item: (-item["degree"], item["path"]),
    )[:25]

    project_stats: dict[str, dict[str, int | str]] = {}
    for page in pages:
        item = project_stats.setdefault(
            page.project_key,
            {
                "project_key": page.project_key,
                "pages": 0,
                "memory_pages": 0,
                "links": 0,
            },
        )
        item["pages"] += 1
        item["links"] += degree_map.get(page.path, 0)
        if page.root_kind == "l1_memory":
            item["memory_pages"] += 1

    project_rows = sorted(project_stats.values(), key=lambda item: (-int(item["pages"]), str(item["project_key"])))
    payload = {
        "generated_at": datetime.now().isoformat(),
        "version": 1,
        "stats": {
            "pages": len(pages),
            "edges": len(edges),
            "orphan_pages": len(orphan_pages),
            "projects": len(project_rows),
        },
        "nodes": [
            {**node, "degree": degree_map.get(node["id"], 0)}
            for node in sorted(nodes, key=lambda item: (-degree_map.get(item["id"], 0), item["id"]))
        ],
        "edges": edges,
        "top_pages": top_pages,
        "orphan_pages": orphan_pages,
        "projects": project_rows,
    }
    runtime_dir = _runtime_dir(config)
    runtime_dir.mkdir(parents=True, exist_ok=True)
    (runtime_dir / "wiki_graph_snapshot.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    _write_navigation_page(config, payload)
    _ensure_index_link(config)
    return payload


def _write_navigation_page(config: RuntimeConfig, payload: dict) -> None:
    today = datetime.now().date().isoformat()
    stats = payload["stats"]
    top_pages = payload["top_pages"][:12]
    orphan_pages = payload["orphan_pages"][:20]
    projects = payload["projects"][:20]
    lines = [
        "---",
        "type: index",
        f"created: {today}",
        f"updated: {today}",
        'source: "automation/drive_wikify global navigation generator"',
        "---",
        "",
        "# Wiki Global Navigation",
        "",
        "이 문서는 위키 전체 갱신 상태를 전역 관점에서 요약하는 자동 생성 네비게이션 맵입니다.",
        "",
        "## Global Snapshot",
        f"- 생성 시각: `{payload['generated_at']}`",
        f"- 총 페이지: `{stats['pages']}`",
        f"- 총 링크 엣지: `{stats['edges']}`",
        f"- 고아 페이지: `{stats['orphan_pages']}`",
        f"- 프로젝트/공간 수: `{stats['projects']}`",
        "",
        "## High Connectivity Pages",
    ]
    for item in top_pages:
        lines.append(f"- [[{item['path'].replace('obsidian/', '')[:-3]}]]: degree `{item['degree']}`")
    lines.extend(["", "## Project Coverage"])
    for item in projects:
        lines.append(
            f"- `{item['project_key']}`: pages `{item['pages']}`, memory `{item['memory_pages']}`, graph links `{item['links']}`"
        )
    lines.extend(["", "## Orphan Pages"])
    if orphan_pages:
        for path in orphan_pages:
            lines.append(f"- [[{path.replace('obsidian/', '')[:-3]}]]")
    else:
        lines.append("- 없음")
    lines.extend(
        [
            "",
            "## Runtime Outputs",
            "- `automation/drive_wikify/runtime/wiki_sparse_index.json`",
            "- `automation/drive_wikify/runtime/wiki_graph_snapshot.json`",
            "",
            "## Operational Meaning",
            "- 위키 업데이트 후 sparse 검색 인덱스와 그래프맵이 함께 재생성됩니다.",
            "- 새 문서가 생겨도 이 문서를 보면 전역 연결성, 누락 링크, 프로젝트 커버리지를 바로 확인할 수 있습니다.",
        ]
    )
    target = config.wiki_root / "Common" / "Wiki_Global_Navigation.md"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _ensure_index_link(config: RuntimeConfig) -> None:
    index_path = config.wiki_root / "index.md"
    if not index_path.exists():
        return
    text = index_path.read_text(encoding="utf-8")
    wiki_link = "[[Wiki/Common/Wiki_Global_Navigation]]"
    if wiki_link in text:
        return
    marker = "## Common Knowledge and Maps"
    insertion = "- [[Wiki/Common/Wiki_Global_Navigation]]: 전역 sparse 검색/그래프/고아 페이지 상태를 보여주는 자동 생성 네비게이션 맵\n"
    if marker in text:
        text = text.replace(marker, f"{marker}\n\n{insertion}", 1)
    else:
        text = text.rstrip() + "\n\n## Common Knowledge and Maps\n\n" + insertion
    index_path.write_text(text, encoding="utf-8")


def refresh_global_artifacts(config: RuntimeConfig) -> dict:
    sparse = build_sparse_search_index(config)
    graph = build_graph_and_navigation(config)
    return {
        "generated_at": datetime.now().isoformat(),
        "sparse_index": sparse["stats"],
        "graph": graph["stats"],
        "navigation_page": str(config.wiki_root / "Common" / "Wiki_Global_Navigation.md"),
    }
