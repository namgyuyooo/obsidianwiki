from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class DocumentRecord:
    drive_name: str
    folder_path: str
    file_path: Path
    title: str | None = None
    mime_type: str | None = None
    modified_time: str | None = None
    source_url: str | None = None
    project_hint: str | None = None


@dataclass
class ExtractedContent:
    extractor_name: str
    text: str
    headings: list[str] = field(default_factory=list)
    tables: list[list[list[str]]] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    metadata: dict[str, str] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


@dataclass
class ProjectDecision:
    action: str
    project_name: str
    reason: str
    matched_existing_project: str | None = None
    branch_needed: bool = False
    score: float = 0.0
    evidence: list[str] = field(default_factory=list)


@dataclass
class ValidationResult:
    passed: bool
    issues: list[str] = field(default_factory=list)


@dataclass
class ProcessedDocument:
    record: DocumentRecord
    extracted: ExtractedContent
    decision: ProjectDecision
    validation: ValidationResult
    written_files: list[Path] = field(default_factory=list)
    cleanup_action: str = "not_run"
