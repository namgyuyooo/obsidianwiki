## Purpose

This repository is an Obsidian-based persistent wiki, not a loose document dump.
Use it in the spirit of Karpathy's "LLM Wiki" pattern:

- raw sources are preserved
- the wiki is a maintained, compounding artifact
- schema documents tell the agent how to ingest, answer, and lint

The human curates sources and steers priorities.
The agent does the filing, cross-linking, synthesis, contradiction tracking, and upkeep.

## Canonical Layers

1. Raw sources: `obsidian/raw/`
2. Persistent wiki: `obsidian/Wiki/`
3. L1 memory snapshots: `obsidian/L1_memory/`
4. Schema and operating rules:
   - `AGENTS.md`
   - `obsidian/Wiki/Schema.md`
   - `obsidian/Wiki/Common/Wiki_Ingest_Operating_Model.md`
   - `obsidian/Wiki/Common/Wiki_Ingest_Templates.md`

Do not treat raw sources and wiki pages as interchangeable.
Raw sources are source-of-truth inputs. Wiki pages are maintained outputs.
L1 memory snapshots are compact context loaders for new sessions — not source of truth.

## Global Files

- `obsidian/Wiki/index.md`
  - Content-oriented entrypoint
  - Update when adding major pages, hubs, or project spaces
- `obsidian/Wiki/log.md`
  - Append-only chronological log
  - Record ingest runs, wiki restructuring, lint passes, and important query outputs

When starting wiki work, read `obsidian/Wiki/index.md` first, then drill into relevant pages.

## L1 Memory Workflow

`obsidian/L1_memory/` contains one file per project: `{ProjectName}.md`

These files are **compact context snapshots** designed to be loaded at the start of a new
agent session to quickly restore project context without reading the full wiki.

### L1 Memory File Structure

Each L1 memory file must contain:
- **한줄 요약**: One-sentence project summary (status + type + key fact)
- **프로젝트 유형**: Project type and current stage
- **현재 상태**: What is actively happening right now
- **핵심 결정사항**: Key decisions already made (no need to re-debate)
- **핵심 수치 / 파일**: Important numbers, file names, document references
- **미해결 이슈**: Open questions and things that still need resolution
- **주의사항 (Gotchas)**: Context traps, naming issues, common mistakes to avoid
- **드릴다운**: Wikilinks to the hub and 2–3 most relevant sub-pages

### When to Create an L1 Memory File

- When a new project space is created in `obsidian/Wiki/`
- Immediately after: the L1 file should be initialized even if sparse

### When to Update an L1 Memory File

Update the relevant `L1_memory/{project}.md` after any of the following:
1. A major ingest run that changes project status, key decisions, or open issues
2. A key decision is made or confirmed
3. A milestone is reached (납품 완료, 계약 확정, POC 결과 발표 등)
4. An open issue is resolved
5. A new gotcha/context trap is discovered

Updates are **replace-style** (not append) since these files are meant to be small and current.
Keep each L1 file under ~50 lines. If it grows beyond that, move detail into the wiki hub.

### How to Use L1 Memory Files

When starting a new session on a specific project:
1. Read `obsidian/L1_memory/{ProjectName}.md` — this is the warm-up
2. If more context needed, open `obsidian/Wiki/{Project}/hub.md`
3. For deep dives, drill into Evidence_Log, Decisions, Risks as needed

When starting a session that spans multiple projects:
1. Read `obsidian/Wiki/index.md` to see all projects
2. Read relevant L1 memory files for the projects in scope
3. Drill into wiki pages as needed

## Ingest Workflow

When a new source arrives:

1. Read the source from `obsidian/raw/` or another explicitly provided source location.
2. Preserve provenance in the project's `Sources.md`.
3. Preserve key quotes, numbers, decisions, and constraints in `Evidence_Log.md`.
4. Record contradictions in `Conflict_Register.md` instead of flattening them away.
5. Update synthesized pages such as `Project_Overview.md`, `Decisions.md`, `Risks.md`, `KPI.md`.
6. Add a short entry to `Change_Log.md`.
7. Refresh `obsidian/Wiki/index.md` if navigation changed.
8. Append a dated entry to `obsidian/Wiki/log.md`.
9. **Update `obsidian/L1_memory/{ProjectName}.md`** to reflect any status, decision, or issue changes.

Prefer append-style updates over destructive rewrites when historical context matters.

## Query Workflow

When answering a question using the wiki:

1. Read `obsidian/Wiki/index.md`.
2. Open the most relevant hub and supporting pages.
3. Cite the wiki pages and, when needed, the underlying evidence/source pages.
4. If the answer creates reusable knowledge, file it back into the wiki as a durable page or update block.
5. Append to `obsidian/Wiki/log.md` when the query materially expands the wiki.

## Lint Workflow

Periodically check for:

- orphan pages
- missing cross-links
- stale summaries
- contradictions not registered in `Conflict_Register.md`
- claims without evidence pages
- project spaces missing core documents
- **L1 memory files that are stale** (not updated after a major ingest or decision)
- **projects in `obsidian/Wiki/` that have no corresponding `L1_memory/` file**

Document notable fixes in `obsidian/Wiki/log.md`.

## Editing Rules

- Keep frontmatter on all wiki pages.
- Prefer Obsidian wikilinks in the existing `[[Wiki/...]]` style.
- Separate interpretation from original evidence.
- Include document names and dates for numbers and claims.
- Do not store secrets or credentials.
- Do not casually edit `obsidian/.obsidian/workspace.json`; it is usually user-local state.
- Do not overwrite unrelated in-progress user changes.

## Project Space Minimum

Most project folders should keep these pages available:

- `hub.md`
- `Project_Overview.md`
- `Sources.md`
- `Evidence_Log.md`
- `Change_Log.md`
- `Conflict_Register.md`
- `Decisions.md`
- `Risks.md`
- optional specialized pages such as `KPI.md`, `Equipment.md`, `Architecture.md`

And a corresponding `obsidian/L1_memory/{ProjectName}.md` must exist.

## Practical Default

Think of Obsidian as the IDE, the wiki as the codebase, and the agent as the maintainer.
Every meaningful ingest or synthesis should leave the wiki more structured, more linked, and easier to navigate than before.

The L1 memory layer is the "working memory" — always current, always compact.
The wiki is the "long-term memory" — always growing, always structured.
Raw sources are the "immutable record" — never modified, always preserved.
