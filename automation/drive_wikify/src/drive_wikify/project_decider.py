from __future__ import annotations

import re
import unicodedata
from pathlib import Path

from .models import DocumentRecord, ExtractedContent, ProjectDecision


STOPWORDS = {
    "final",
    "draft",
    "제출",
    "제출서류",
    "최종",
    "통합",
    "작성중",
    "계획서",
    "연구개발계획서",
    "사업계획서",
    "보고서",
    "발표자료",
}

EXPLICIT_ALIASES = {
    "pixel": "Pixel_AIVoucher_Project",
    "픽셀": "Pixel_AIVoucher_Project",
    "zeus": "ZEUS_AIVoucher_Project",
    "제우스": "ZEUS_AIVoucher_Project",
    "psk": "PSK_Project",
    "현대모비스": "HyundaiMobis_Project",
    "hyundaimobis": "HyundaiMobis_Project",
}


def _tokenize(value: str) -> set[str]:
    value = unicodedata.normalize("NFC", value)
    tokens = re.findall(r"[A-Za-z0-9가-힣_]+", value)
    cleaned = {token.lower() for token in tokens if len(token) > 1}
    return {token for token in cleaned if token not in STOPWORDS}


def _candidate_name(record: DocumentRecord, extracted: ExtractedContent) -> str:
    title = record.title or record.file_path.stem
    parts = [record.drive_name, record.folder_path, title]
    if extracted.headings:
        parts.extend(extracted.headings[:3])
    return " ".join(parts)


def _match_explicit_alias(candidate_name: str) -> str | None:
    lowered = unicodedata.normalize("NFC", candidate_name).lower()
    for alias, project_name in EXPLICIT_ALIASES.items():
        if alias in lowered:
            return project_name
    return None


def _extract_year(text: str) -> str | None:
    text = unicodedata.normalize("NFC", text)
    match = re.search(r"(20\d{2})", text)
    return match.group(1) if match else None


def _best_existing_project(candidate_tokens: set[str], wiki_root: Path):
    best_name = None
    best_score = 0.0
    for child in wiki_root.iterdir():
        if not child.is_dir():
            continue
        if child.name in {"Common", "Shared"} or child.name.endswith("_Account"):
            continue
        project_tokens = _tokenize(child.name.replace("_", " "))
        if not project_tokens:
            continue
        overlap = len(candidate_tokens & project_tokens)
        score = overlap / max(len(project_tokens), 1)
        if score > best_score:
            best_name = child.name
            best_score = score
    return best_name, best_score


def _make_project_name(record: DocumentRecord, extracted: ExtractedContent) -> str:
    year = _extract_year(f"{record.folder_path} {record.drive_name} {record.file_path.stem}") or "Project"
    headings = " ".join(extracted.headings[:3])
    preferred = headings or record.file_path.stem
    tokens = [token for token in _tokenize(preferred) if token not in {"rtm_yng", "rtm"}]
    stem = "_".join(tokens[:6]) if tokens else record.file_path.stem
    raw = f"{year}_{stem}"
    raw = re.sub(r"[^A-Za-z0-9가-힣]+", "_", raw)
    raw = re.sub(r"_+", "_", raw).strip("_")
    if not raw.endswith("_Project"):
        raw = f"{raw}_Project"
    return raw


def decide_project(record: DocumentRecord, extracted: ExtractedContent, wiki_root: Path) -> ProjectDecision:
    candidate_name = _candidate_name(record, extracted)
    candidate_tokens = _tokenize(candidate_name)
    alias_project = _match_explicit_alias(candidate_name)
    best_name, best_score = _best_existing_project(candidate_tokens, wiki_root)
    evidence = sorted(candidate_tokens)[:12]
    year = _extract_year(candidate_name)

    if record.project_hint:
        return ProjectDecision(
            action="update_existing_project",
            project_name=record.project_hint,
            matched_existing_project=record.project_hint,
            reason="Manifest provided explicit project hint.",
            score=1.0,
            evidence=evidence,
        )

    if alias_project:
        branch_needed = bool(best_name and best_name != alias_project and best_score >= 0.45)
        return ProjectDecision(
            action="update_existing_project" if not branch_needed else "hold_for_human_review",
            project_name=alias_project if not branch_needed else _make_project_name(record, extracted),
            matched_existing_project=alias_project,
            branch_needed=branch_needed,
            score=max(best_score, 0.9),
            reason="Matched explicit alias from file name or extracted headings." if not branch_needed else "Alias matched but overlaps another project strongly; branch review needed.",
            evidence=evidence,
        )

    if best_name and best_score >= 0.55:
        branch_needed = year is not None and year not in best_name
        return ProjectDecision(
            action="update_existing_project" if not branch_needed else "hold_for_human_review",
            project_name=best_name if not branch_needed else _make_project_name(record, extracted),
            matched_existing_project=best_name,
            branch_needed=branch_needed,
            score=best_score,
            reason="Matched existing project by token overlap." if not branch_needed else "Existing project overlaps, but year differs enough to require branch review.",
            evidence=evidence,
        )

    return ProjectDecision(
        action="create_new_project",
        project_name=_make_project_name(record, extracted),
        matched_existing_project=best_name,
        branch_needed=False,
        score=best_score,
        reason="No strong existing project match; creating a new project space candidate.",
        evidence=evidence,
    )
