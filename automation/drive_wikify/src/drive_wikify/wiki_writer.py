from __future__ import annotations

from datetime import date
from pathlib import Path

from .models import DocumentRecord, ExtractedContent, ProjectDecision, ValidationResult


PROJECT_FILES = {
    "hub.md": "# {title}\n\n- [[Wiki/index]]\n\n## 운영 메모\n- 한줄 요약: 신규 자동 생성 프로젝트 공간\n- 현재 상태: 수집 자료 검토 및 운영형 전환 필요\n- 다음 액션: Status, Business_Flow, CEO_Brief, PM_Action_Plan, Raw_Evidence_Index 확인\n\n## 운영 링크\n- [[Status]]\n- [[Business_Flow]]\n- [[CEO_Brief]]\n- [[PM_Action_Plan]]\n- [[Customer_Followup]]\n- [[Raw_Evidence_Index]]\n",
    "Project_Overview.md": "# Project Overview\n",
    "Reference_Register.md": "# Reference Register\n",
    "Sources.md": "# Sources\n",
    "Evidence_Log.md": "# Evidence Log\n",
    "Status.md": "# Status\n\n## 상태 변화 메모\n",
    "Business_Flow.md": "# Business Flow\n\n| 단계 | 상태 | 근거 | 다음 게이트 | 담당 |\n| --- | --- | --- | --- | --- |\n",
    "CEO_Brief.md": "# CEO Brief\n\n## 판단 대기\n- 확인 필요\n",
    "PM_Action_Plan.md": "# PM Action Plan\n\n| 액션 | Owner | 기한 | 선행조건 | 근거 | 상태 |\n| --- | --- | --- | --- | --- | --- |\n",
    "Customer_Followup.md": "# Customer Follow-up\n\n| 고객/상대 | 마지막 접점 | 요청/관심사 | 다음 연락 | 준비물 | 상태 |\n| --- | --- | --- | --- | --- | --- |\n",
    "Raw_Evidence_Index.md": "# Raw Evidence Index\n\n## 원문 보존 원칙\n- 파일 원문/긴 추출문/표/수치/버전/출처 위치는 요약으로 대체하지 않는다.\n- 운영 요약은 Status/CEO_Brief/PM_Action_Plan에서 별도 관리한다.\n\n| 원천 | 원문/추출 경로 | 유형 | 버전/일시 | 보존 범위 | 위키 반영 상태 |\n| --- | --- | --- | --- | --- | --- |\n",
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
                "- 현재 상태: 문서 인제스트 시작, 운영형 Status 갱신 필요",
                "- 이번 주 실무 포인트: 원문 보존 범위 확인, 프로젝트 허브 연결, 다음 액션 분리",
                "- 핵심 결정사항: 신규 프로젝트 공간 자동 생성",
                "- 핵심 수치 / 파일: 추후 업데이트",
                "- 핵심 참조 링크: 추후 업데이트",
                "- 미해결 이슈: 프로젝트 범위 확인 필요",
                "- 다음 액션 / 미팅 전 확인: Status, Business_Flow, CEO_Brief, PM_Action_Plan 보강",
                "- 주의사항 (Gotchas): 자동 분기 결과 검토 필요",
                f"- 드릴다운: [[Wiki/{project_name}/hub]], [[Wiki/{project_name}/Status]], [[Wiki/{project_name}/Raw_Evidence_Index]]",
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
    today = date.today().isoformat()
    update_heading = f"Update - {today}"
    change_event = (
        f"{today} 00:00 자동 인제스트 기록으로 `{source_name}` 수집/해석 후보가 기록되었고 "
        "원문 보존, 상태 갱신, 후속 검토가 수행/대기됨"
    )

    reference_lines = [
        "### Reference 01",
        f"- 제목: {source_name}",
        f"- 참조 유형: {'Google Drive' if record.drive_name else 'Local File'}",
        f"- URL: {record.source_url or '-'}",
        f"- fallback 파일명: {source_name}",
        f"- fallback 경로: Drive 분류: {record.drive_name or '-'} / 폴더: {record.folder_path or '-'}",
        f"- 재수집 식별자: 수정일 `{record.modified_time or 'unknown'}` / MIME `{record.mime_type or 'unknown'}`",
        "- 설명 위치: [[Project_Overview]], [[Evidence_Log]], [[Raw_Evidence_Index]], [[Status]], [[Change_Log]]",
        "- 관련 위키 문서: [[Project_Overview]], [[Evidence_Log]], [[Raw_Evidence_Index]], [[Status]], [[Change_Log]]",
        "- 읽기 상태: 자동 인제스트 등록",
        f"- 비고: 프로젝트 판정 `{decision.action}` / 판정 근거: {decision.reason}",
    ]
    _append_block(project_dir / "Reference_Register.md", update_heading, reference_lines)

    sources_lines = [
        "- 운영 메모: 링크 우선 참조는 [[Reference_Register]]에서 관리",
        f"- 문서명: {source_name}",
        f"- 형식: {record.file_path.suffix.lstrip('.').lower()}",
        f"- Drive: {record.drive_name}",
        f"- 폴더: {record.folder_path}",
        f"- 수정일: {record.modified_time or 'unknown'}",
        f"- 로컬 경로: `{record.file_path}`",
    ]
    _append_block(project_dir / "Sources.md", update_heading, sources_lines)

    evidence_excerpt = (extracted.text or "").strip()
    if len(evidence_excerpt) > 1200:
        evidence_excerpt = f"{evidence_excerpt[:1200]}\n... (full extracted text preserved in Raw_Evidence_Index.md)"
    evidence_lines = [
        f"- Source: {source_name}",
        f"- Extractor: `{extracted.extractor_name}`",
        f"- Heading Candidates: {', '.join(extracted.headings[:5]) if extracted.headings else '없음'}",
        f"- 원문 보존 위치: [[Raw_Evidence_Index]]",
        f"- 추출 길이: {len(extracted.text or '')} chars",
        "- Evidence Log 발췌:",
        f"  > {evidence_excerpt if evidence_excerpt else '본문 추출 실패 또는 비어 있음'}",
    ]
    if extracted.warnings:
        evidence_lines.append(f"- Warnings: {'; '.join(extracted.warnings)}")
    _append_block(project_dir / "Evidence_Log.md", update_heading, evidence_lines)

    raw_lines = [
        f"| {source_name} | `{record.file_path}` | {record.file_path.suffix.lstrip('.').lower() or 'unknown'} | {record.modified_time or 'unknown'} | full extracted text | pending review |",
        "",
        "### Full Extracted Text",
        "",
        "```text",
        extracted.text.strip() if extracted.text.strip() else "본문 추출 실패 또는 비어 있음",
        "```",
    ]
    if extracted.warnings:
        raw_lines.extend(["", f"- Warnings: {'; '.join(extracted.warnings)}"])
    _append_block(project_dir / "Raw_Evidence_Index.md", update_heading, raw_lines)

    status_lines = [
        f"- 상태 변화 메모: {change_event}",
        f"- 현재 단계: 자동 인제스트 완료, 사람/Decision Queue 검토 대기",
        f"- 다음 액션: 원문 보존 범위와 프로젝트 허브 연결 검토",
        f"- 연결 근거: [[Raw_Evidence_Index]], [[Evidence_Log]], [[Reference_Register]]",
    ]
    _append_block(project_dir / "Status.md", update_heading, status_lines)

    business_flow_lines = [
        f"- 입력 이벤트: `{source_name}` 자동 인제스트",
        "- 현재 흐름 영향: 원문/추출문이 보존되었고 운영 판단 레이어 반영을 검토해야 함",
        "- 확인 포인트: 고객/공정/일정/담당/상업 조건 변화 여부",
        "- 연결 근거: [[Status]], [[Raw_Evidence_Index]], [[Evidence_Log]]",
    ]
    _append_block(project_dir / "Business_Flow.md", update_heading, business_flow_lines)

    ceo_brief_lines = [
        f"- 신규 근거: `{source_name}`",
        f"- 의사결정 상태: {decision.action} / {decision.reason}",
        "- CEO 확인 포인트: 사업 영향, 리스크, 고객 대응 필요 여부",
        "- 원문 확인: [[Raw_Evidence_Index]]",
    ]
    _append_block(project_dir / "CEO_Brief.md", update_heading, ceo_brief_lines)

    pm_action_lines = [
        f"- 액션 후보: `{source_name}` 원문 검토 후 프로젝트 허브/상태/고객 follow-up 반영 여부 결정",
        "- 담당: TBD",
        "- 기한: TBD",
        "- 근거: [[Raw_Evidence_Index]], [[Status]]",
    ]
    _append_block(project_dir / "PM_Action_Plan.md", update_heading, pm_action_lines)

    customer_followup_lines = [
        f"- 신규 근거: `{source_name}`",
        "- 고객 접점 영향: 검토 대기",
        "- 다음 커뮤니케이션 후보: 원문 검토 후 필요 시 작성",
        "- 근거: [[Raw_Evidence_Index]], [[CEO_Brief]], [[PM_Action_Plan]]",
    ]
    _append_block(project_dir / "Customer_Followup.md", update_heading, customer_followup_lines)

    if decision.branch_needed:
        conflict_lines = [
            f"- 항목: 프로젝트 분기 검토",
            f"- 내용: `{decision.matched_existing_project}`와 유사하지만 별도 분기 가능성이 감지됨",
            f"- 근거: {decision.reason}",
        ]
        _append_block(project_dir / "Conflict_Register.md", update_heading, conflict_lines)

    change_lines = [
        f"- 상태 변화 메모: {change_event}",
        f"- 자동 인제스트 문서 반영: `{source_name}`",
        f"- 프로젝트 판정: `{decision.action}`",
        f"- 생성/갱신 프로젝트: `[[Wiki/{decision.project_name}/hub]]`",
        "- 원문/긴 추출문 보존 위치: `Raw_Evidence_Index.md`",
    ]
    _append_block(project_dir / "Change_Log.md", update_heading, change_lines)

    written.extend(
        [
            project_dir / "Reference_Register.md",
            project_dir / "Sources.md",
            project_dir / "Evidence_Log.md",
            project_dir / "Raw_Evidence_Index.md",
            project_dir / "Status.md",
            project_dir / "Business_Flow.md",
            project_dir / "CEO_Brief.md",
            project_dir / "PM_Action_Plan.md",
            project_dir / "Customer_Followup.md",
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
