from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

from .config import RuntimeConfig
from .cleanup import cleanup_processed_file
from .extractors import extract_document
from .models import DocumentRecord, ProcessedDocument
from .project_decider import decide_project
from .wiki_maintenance import refresh_global_artifacts
from .wiki_writer import validate_written_project, write_project_updates


class DriveWikifyRunner:
    def __init__(self, config: RuntimeConfig):
        self.config = config

    def load_manifest(self, manifest_path: Path) -> list[DocumentRecord]:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        records = []
        for item in payload["documents"]:
            records.append(
                DocumentRecord(
                    drive_name=item["drive_name"],
                    folder_path=item["folder_path"],
                    file_path=Path(item["file_path"]).expanduser().resolve(),
                    title=item.get("title"),
                    mime_type=item.get("mime_type"),
                    modified_time=item.get("modified_time"),
                    source_url=item.get("source_url"),
                    project_hint=item.get("project_hint"),
                )
            )
        return records

    def process_record(self, record: DocumentRecord) -> ProcessedDocument:
        extracted = extract_document(record.file_path)
        decision = decide_project(record, extracted, self.config.wiki_root)
        written_files = []
        if decision.action in {"create_new_project", "update_existing_project"} and self.config.auto_create_project_space:
            written_files = write_project_updates(
                self.config.wiki_root,
                self.config.l1_memory_root,
                record,
                extracted,
                decision,
            )
        validation = validate_written_project(written_files)
        cleanup_action = "not_requested"
        if self.config.cleanup_processed_files and decision.action in {"create_new_project", "update_existing_project"}:
            cleanup_action = cleanup_processed_file(
                ProcessedDocument(
                    record=record,
                    extracted=extracted,
                    decision=decision,
                    validation=validation,
                    written_files=written_files,
                ),
                self.config.deletion_log,
            )
        return ProcessedDocument(
            record=record,
            extracted=extracted,
            decision=decision,
            validation=validation,
            written_files=written_files,
            cleanup_action=cleanup_action,
        )

    def run(self, manifest_path: Path, output_path: Path | None = None) -> list[ProcessedDocument]:
        results = [self.process_record(record) for record in self.load_manifest(manifest_path)]
        if any(result.written_files for result in results):
            refresh_global_artifacts(self.config)
        if output_path:
            serializable = []
            for result in results:
                item = asdict(result)
                item["record"]["file_path"] = str(result.record.file_path)
                item["written_files"] = [str(path) for path in result.written_files]
                serializable.append(item)
            output_path.write_text(json.dumps({"results": serializable}, ensure_ascii=False, indent=2), encoding="utf-8")
        return results
