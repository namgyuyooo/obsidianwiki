# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

This is an Obsidian-based persistent wiki that follows Karpathy's "LLM Wiki" pattern - a maintained, compounding knowledge artifact rather than a loose document dump. The human curates sources and steers priorities; the agent handles filing, cross-linking, synthesis, contradiction tracking, and upkeep.

## Canonical Repository Structure

The repository operates in 4 canonical layers:

1. **Raw sources**: `obsidian/raw/` - Immutable source-of-truth inputs (preserve only, don't modify)
2. **Persistent wiki**: `obsidian/Wiki/` - Maintained knowledge layer where agents work
3. **L1 memory snapshots**: `obsidian/L1_memory/` - Compact context loaders for new sessions
4. **Schema and operating rules**: `AGENTS.md`, `obsidian/Wiki/Schema.md`, `obsidian/Wiki/Common/Wiki_Ingest_Operating_Model.md`

### L1 Memory Layer

`obsidian/L1_memory/{ProjectName}.md` files contain compact context snapshots designed to quickly restore project context at the start of new sessions. Each file must be under ~50 lines and contain:

- **한줄 요약**: One-sentence project summary (status + type + key fact)
- **프로젝트 유형**: Project type and current stage
- **현재 상태**: What is actively happening right now
- **이번 주 실무 포인트**: Immediate working-owner focus
- **핵심 결정사항**: Key decisions already made (no need to re-debate)
- **핵심 수치 / 파일**: Important numbers, file names, document references
- **미해결 이슈**: Open questions and things that still need resolution
- **다음 액션 / 미팅 전 확인**: What needs to happen next
- **주의사항 (Gotchas)**: Context traps, naming issues, common mistakes to avoid
- **드릴다운**: Wikilinks to the hub and 2–3 most relevant sub-pages

Update L1 memory files after major ingest runs, key decisions, milestones, or issue resolutions.

## Space Types

Treat top-level spaces in `obsidian/Wiki/` as one of four types:

1. `project`: execution unit with references, evidence, actions, decisions, risks, and L1 memory
2. `account`: customer umbrella across multiple projects and relationship threads
3. `common`: operating rules, automation, governance, and reusable system docs
4. `shared`: reusable assets promoted from projects for broader reuse

Do not force account/common/shared spaces into project-style evidence scaffolding unless clearly needed.

## Global Navigation Files

- `obsidian/Wiki/index.md` - Content-oriented entry point, update when adding major pages/hubs/projects
- `obsidian/Wiki/log.md` - Append-only chronological log of ingest runs, wiki restructuring, lint passes, and important query outputs

When starting wiki work: Read `obsidian/Wiki/index.md` first, then drill into relevant pages.

## Personal vs Work Separation

- Keep personal records out of the RTM work wiki by default.
- This repository is the canonical work/RTM knowledge base; it should not become a personal journal, personal calendar, or private life log.
- If an event has both personal and work implications, record the work-facing facts in the relevant RTM project space and keep personal context outside this repository.
- There is currently no personal record migration to perform; personal structure should remain empty unless the human explicitly creates a separate personal vault or namespace.

## Operating Workflows

### Event Capture and Promotion
When a new work event appears, promote it through the wiki in this order:

1. Capture the raw event in the appropriate inbox or source note
2. Register provenance in `Reference_Register.md` with links first and file-name fallback
3. Extract facts, quotes, numbers, decisions, and constraints into `Evidence_Log.md`
4. Register contradictions or unresolved mismatches in `Conflict_Register.md`
5. Record actual document/wiki changes in `Change_Log.md`
6. Update synthesized pages such as `Project_Overview.md`, `Decisions.md`, `Risks.md`, `KPI.md`
7. Refresh the relevant `obsidian/L1_memory/{ProjectName}.md`

Do not jump straight from a new event to a cleaned-up conclusion if source facts, conflicts, or version changes need to remain visible.

### Practical Operating Bias
For meaningful updates, bias toward:
1. What changed
2. What is confirmed
3. What is still conflicting
4. What action belongs to whom next
5. Which evidence supports that action

### Ingest Workflow
When new source material arrives:

1. Read source from `obsidian/raw/` or other provided location
2. Preserve provenance in `Sources.md`
3. Preserve key quotes, numbers, decisions, and constraints in `Evidence_Log.md`
4. Record contradictions in `Conflict_Register.md` (don't flatten them away)
5. Update synthesized pages: `Project_Overview.md`, `Decisions.md`, `Risks.md`, `KPI.md`
6. Add short entry to `Change_Log.md`
7. Refresh `obsidian/Wiki/index.md` if navigation changed
8. Append dated entry to `obsidian/Wiki/log.md`
9. **Update `obsidian/L1_memory/{ProjectName}.md`** to reflect status/decision/issue changes

Prefer append-style updates over destructive rewrites when historical context matters.

### Query Workflow
When answering questions using the wiki:

1. Read `obsidian/Wiki/index.md`
2. Open most relevant hub and supporting pages
3. Cite wiki pages and underlying evidence/source pages
4. If answer creates reusable knowledge, file it back as durable page or update block
5. Append to `obsidian/Wiki/log.md` when query materially expands the wiki

### Lint Workflow
Periodically check for:
- Orphan pages, missing cross-links, stale summaries
- Contradictions not in `Conflict_Register.md`
- Claims without evidence pages
- Missing `Reference_Register.md` or missing link/path/file-name fallback entries
- Project spaces missing core documents
- Project hubs missing visible current status, blockers, next actions, and evidence links
- Account hubs missing active project and next-touchpoint context
- Common/shared hubs missing promotion or reuse status
- **Stale L1 memory files** (not updated after major ingest/decision)
- **Projects in `obsidian/Wiki/` without corresponding `L1_memory/` files**

Document fixes in `obsidian/Wiki/log.md`.

## Project Space Minimum Structure

Most project folders should maintain:
- `hub.md`, `Status.md`, `Reference_Register.md`, `Project_Overview.md`
- `Sources.md`, `Evidence_Log.md`
- `Change_Log.md`, `Conflict_Register.md`
- `Action_Items.md`, `Decisions.md`, `Risks.md`
- Optional specialized pages: `KPI.md`, `Equipment.md`, `Architecture.md`

And a corresponding `obsidian/L1_memory/{ProjectName}.md` must exist.

Project hubs should act as execution briefs, not flat indexes. Keep visible:
- `운영 메모`
- `실행 현황판`
- `현재 막힘 / 충돌`
- `다음 액션`
- `최근 업데이트`
- `운영 링크`

`Reference_Register.md` should be the canonical project reference register for URLs, Slack links, Drive links, local paths, fallback file names, and where each reference is explained in the wiki.
Temporary mirror/cache paths are not canonical references and should be converted into remote folder lineage, file names, IDs, or collection-state identifiers before being written to the wiki.

`Status.md` should be the canonical project status register for label, stage, health, owner, blockers, next gate, and status history.

## Canonical Project Evidence Files

Use underscore file names for project evidence documents:

- `Reference_Register.md`
- `Sources.md`
- `Evidence_Log.md`
- `Conflict_Register.md`
- `Change_Log.md`

Avoid creating parallel space-named files such as `Evidence Log.md`, `Conflict Register.md`, or `Change Log.md` inside project folders. If older instructions mention space-named variants, treat them as conceptual labels and use the underscore file names above.

## Document Standards

- **All wiki pages require YAML frontmatter** with: `type`, `created` (ISO 8601), `updated`, `source`
- Use Obsidian wikilinks in `[[Wiki/...]]` format
- Separate interpretation from original evidence
- Include document names and dates for numbers and claims
- Don't store secrets or credentials
- Don't casually edit `obsidian/.obsidian/workspace.json` (user-local state)
- Don't overwrite unrelated in-progress user changes

## Key Operating Principles

- Think of Obsidian as the IDE, the wiki as the codebase, and the agent as the maintainer
- Every meaningful ingest or synthesis should leave the wiki more structured, linked, and navigable
- L1 memory is "working memory" — always current, always compact
- Wiki is "long-term memory" — always growing, always structured
- Raw sources are "immutable record" — never modified, always preserved

## Drive Exploration Rules

- Don't limit exploration to local wiki only — explore connected Google Drive too
- Search all accessible Drives and Shared Drives by default
- Consider folder names alongside filenames for context (Shared Drive name, parent folders, grandparent folders)
- Include folders with `RTM` in the name as first-pass analysis candidates
- Don't exclude `hwp` and `hwpx` files — investigate them with `rhwp` procedures when needed
- For business plan/proposal/report documents, collect all related candidates first, then classify as Primary/Secondary/Hold based on comprehensive criteria including folder context, filename keywords, version numbers, modification dates, and content completeness

## Schema and Templates

- `AGENTS.md` - Complete agent workflow documentation
- `obsidian/Wiki/Schema.md` - Document structure and YAML frontmatter rules
- `obsidian/Wiki/Common/Wiki_Ingest_Operating_Model.md` - 3-layer ingest model
- `obsidian/Wiki/Common/Wiki_Ingest_Templates.md` - Core document templates
- `obsidian/Wiki/Common/Wiki_Ingest_Prompt_Set.md` - Task-specific prompts

## No Build/Test Commands

This is a documentation repository (Obsidian wiki) with no build, lint, or test commands. The "code" is Markdown content in the wiki.
