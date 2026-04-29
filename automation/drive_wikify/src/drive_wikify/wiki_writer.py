from __future__ import annotations

from datetime import date
from pathlib import Path

from .models import DocumentRecord, ExtractedContent, ProjectDecision, ValidationResult


PROJECT_FILES = {
    "hub.md": "# {title}\n\n- [[Wiki/index]]\n",
    "Project_Overview.md": "# Project Overview\n",
    "Sources.md": "# Sources\n",
    "Evidence_Log.md": "# Evidence Log\n",
    "Conflict_Register.md": "# Conflict Register\n",
    "Change_Log.md": "# Change Log\n",
    "Decisions.md": "# Decisions\n",
    "Risks.md": "# Risks\n",
}


def _frontmatter(page_type: str, source: str = "") -> str:
    today = date.today().isoformat()
    return f"---\ntype: {page_type}\ncreated: {today}\nupdated: {today}\nsource: \"{source}\"\n---\n\n"


def _append_block(path: Path, heading: str, lines: list[str]) -> None:
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    block = f"\n## {heading}\n\n" + "\n".join(lines).rstrip() + "\n"
    path.write_text(text.rstrip() + "\n" + block, encoding="utf-8")


def ensure_project_space(project_name: str, wiki_root: Path, l1_root: Path) -> list[Path]:
    project_dir = wiki_root / project_name
    project_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for file_name, body in PROJECT_FILES.items():
        path = project_dir / file_name
        if not path.exists():
            content = _frontmatter("project" if file_name == "hub.md" else "knowledge")
            title = project_name.replace("_", " ")
            content += body.format(title=title)
            path.write_text(content, encoding="utf-8")
            written.append(path)
    l1_path = l1_root / f"{project_name}.md"
    if not l1_path.exists():
        l1_text = "\n".join(
            [
                f"# {project_name}",
                "",
                "- 한줄 요약: 신규 자동 생성 프로젝트 공간",
                "- 프로젝트 유형: 확인 필요",
                "- 현재 상태: 문서 인제스트 시작",
                "- 핵심 결정사항: 신규 프로젝트 공간 자동 생성",
                "- 핵심 수치 / 파일: 추후 업데이트",
                "- 미해결 이슈: 프로젝트 범위 확인 필요",
                "- 주의사항 (Gotchas): 자동 분기 결과 검토 필요",
                f"- 드릴다운: [[Wiki/{project_name}/hub]], [[Wiki/{project_name}/Sources]], [[Wiki/{project_name}/Evidence_Log]]",
            ]
        )
        l1_path.write_text(l1_text + "\n", encoding="utf-8")
        written.append(l1_path)
    return written


def write_project_updates(
    wiki_root: Path,
    l1_root: Path,
    record: DocumentRecord,
    extracted: ExtractedContent,
    decision: ProjectDecision,
) -> list[Path]:
    written = ensure_project_space(decision.project_name, wiki_root, l1_root)
    project_dir = wiki_root / decision.project_name
    source_name = record.title or record.file_path.name
    update_heading = f"Update - {date.today().isoformat()}"

    sources_lines = [
        f"- 문서명: {source_name}",
        f"- 형식: {record.file_path.suffix.lstrip('.').lower()}",
        f"- Drive: {record.drive_name}",
        f"- 폴더: {record.folder_path}",
        f"- 수정일: {record.modified_time or 'unknown'}",
        f"- 로컬 경로: `{record.file_path}`",
        f"- 프로젝트 판정: `{decision.action}`",
        f"- 판정 근거: {decision.reason}",
    ]
    _append_block(project_dir / "Sources.md", update_heading, sources_lines)

    excerpt = extracted.text[:1200].strip()
    evidence_lines = [
        f"- Source: {source_name}",
        f"- Extractor: `{extracted.extractor_name}`",
        f"- Heading Candidates: {', '.join(extracted.headings[:5]) if extracted.headings else '없음'}",
        "- Original:",
        f"  > {excerpt if excerpt else '본문 추출 실패 또는 비어 있음'}",
    ]
    if extracted.warnings:
        evidence_lines.append(f"- Warnings: {'; '.join(extracted.warnings)}")
    _append_block(project_dir / "Evidence_Log.md", update_heading, evidence_lines)

    if decision.branch_needed:
        conflict_lines = [
            f"- 항목: 프로젝트 분기 검토",
            f"- 내용: `{decision.matched_existing_project}`와 유사하지만 별도 분기 가능성이 감지됨",
            f"- 근거: {decision.reason}",
        ]
        _append_block(project_dir / "Conflict_Register.md", update_heading, conflict_lines)

    change_lines = [
        f"- 자동 인제스트 문서 반영: `{source_name}`",
        f"- 프로젝트 판정: `{decision.action}`",
        f"- 생성/갱신 프로젝트: `[[Wiki/{decision.project_name}/hub]]`",
    ]
    _append_block(project_dir / "Change_Log.md", update_heading, change_lines)

    written.extend(
        [
            project_dir / "Sources.md",
            project_dir / "Evidence_Log.md",
            project_dir / "Change_Log.md",
        ]
    )
    if decision.branch_needed:
        written.append(project_dir / "Conflict_Register.md")
    return written


def validate_written_project(written_files: list[Path]) -> ValidationResult:
    issues: list[str] = []
    for path in written_files:
        if path.suffix == ".md" and path.name != f"{path.stem}.md":
            continue
        if path.suffix == ".md" and path.parent.name != "L1_memory":
            text = path.read_text(encoding="utf-8")
            if path.name != f"{path.stem}.md":
                continue
            if path.name != path.stem + ".md":
                continue
            if path.name != "README.md" and path.parent.name != "L1_memory" and not text.startswith("---"):
                issues.append(f"Missing frontmatter: {path}")
    return ValidationResult(passed=not issues, issues=issues)
