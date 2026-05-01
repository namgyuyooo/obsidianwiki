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

## Space Types

Treat each top-level workspace in `obsidian/Wiki/` as one of four operating space types.
Do not force all spaces into one template.

1. `project`
   - Delivery, proposal, PoC, R&D, or execution unit
   - Owns references, evidence, actions, decisions, risks, and an L1 memory file
2. `account`
   - Customer/account umbrella over multiple projects
   - Focuses on active projects, relationship-level blockers, and next touchpoints
3. `common`
   - Operating rules, automation, indexes, governance, and cross-project control docs
4. `shared`
   - Reusable assets promoted from projects for wider reuse

When editing or creating a hub, make the space type obvious through structure and links.
Do not create project-style evidence scaffolding inside `account`, `common`, or `shared` unless there is a clear reason.

## Personal vs Work Separation

- Keep personal records out of the RTM work wiki by default.
- This repository is the canonical work/RTM knowledge base, not a personal journal or private life log.
- If an event has both personal and work implications, record only the work-facing facts in the relevant RTM project space and keep personal context outside this repository.
- If a personal wiki is created, it should live in a separate vault/repository/service with its own raw sources, `Wiki/`, `L1_memory/`, automation state, and connector/auth context.
- Personal and work should be separated at folder root, source root, and service/account level where possible; do not mix both domains inside one `obsidian/Wiki/` tree.
- The personal wiki may mirror this repository's skeleton and operating logic, but it is a sibling system, not a namespace inside this work repository.
- There is currently no personal record migration to perform inside this repository; personal structure should remain empty here unless the human explicitly changes the repo scope.

## L1 Memory Workflow

`obsidian/L1_memory/` contains one file per project: `{ProjectName}.md`

These files are **compact context snapshots** designed to be loaded at the start of a new
agent session to quickly restore project context without reading the full wiki.

### L1 Memory File Structure

Each L1 memory file must contain:
- **한줄 요약**: One-sentence project summary (status + type + key fact)
- **프로젝트 유형**: Project type and current stage
- **현재 상태**: What is actively happening right now
- **이번 주 실무 포인트**: The 1-3 working-owner priorities right now
- **핵심 결정사항**: Key decisions already made (no need to re-debate)
- **핵심 수치 / 파일**: Important numbers, file names, document references
- **핵심 참조 링크**: The main Slack/web/Drive/local references or fallback file names
- Do not persist temporary mirror/cache paths as canonical references. Prefer remote folder lineage, file names, IDs, and collection-state identifiers.
- **미해결 이슈**: Open questions and things that still need resolution
- **다음 액션 / 미팅 전 확인**: What must happen next
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
2. Preserve provenance in the project's `Reference_Register.md` with links first and file-name fallback.
3. Register source inventory in `Sources.md` and preserve long raw extracts or full extracted text in `Raw_Evidence_Index.md`.
4. Preserve key quotes, numbers, decisions, and constraints in `Evidence_Log.md`; do not replace source content with a short summary.
5. Record contradictions in `Conflict_Register.md` instead of flattening them away.
   Only do this when two facts, numbers, versions, scopes, or decisions cannot practically both be treated as current truth.
   If the item is really a TODO, stage interpretation, project-boundary note, or review question, route it to `Action_Items.md`, `Status.md`, `Risks.md`, `Decisions.md`, or the hub instead.
6. Append a status-change memo to `Status.md` in the form: `YYYY-MM-DD HH:mm [source] 기준으로 [change]가 기록되었고 [action]이 수행/대기됨`.
7. Update operating pages such as `Business_Flow.md`, `CEO_Brief.md`, `PM_Action_Plan.md`, `Customer_Followup.md`, `Project_Overview.md`, `Decisions.md`, `Risks.md`, `KPI.md`.
8. Add a short entry to `Change_Log.md`.
9. Refresh `obsidian/Wiki/index.md` if navigation changed.
10. Append a dated entry to `obsidian/Wiki/log.md`.
11. **Update `obsidian/L1_memory/{ProjectName}.md`** to reflect any status, decision, issue, or reference changes.

Prefer append-style updates over destructive rewrites when historical context matters.

## Decisions Workflow

`Decisions.md` is not only a final decision memo.
Its primary operating purpose is to review and refine scattered wiki spaces into the right canonical space.

- Intake-specific spaces created from Slack, Google Drive, knowledge injection, or filesystem ingestion are provisional by default.
- Do not assume a new source automatically deserves a new canonical `project` space.
- Review whether the new material should:
  - merge into an existing `project`
  - promote into a new canonical `project`
  - roll up under an `account`
  - stay in `common` as operating knowledge
  - promote into `shared` as a reusable asset
  - remain separate because scope/timeframe/customer truly differ
- Record the review in `Decisions.md` with:
  - source intake type
  - candidate spaces reviewed
  - LLM recommendation
  - user-confirmed choice when available
  - evidence and follow-up wiki changes
- Approval logs and raw automation audit events do not belong in `Decisions.md` unless they are rewritten as durable operational judgments.

## Event Capture and Promotion

When a new work event appears, promote it through the wiki in this order:

1. Capture the raw event in the appropriate inbox or source note.
2. Register provenance in `Reference_Register.md` using URL/link first, file name/path fallback second.
3. Extract facts, quotes, numbers, decisions, and constraints into `Evidence_Log.md`.
4. Register contradictions or unresolved mismatches in `Conflict_Register.md`.
   Do not register weak uncertainty such as `정합성 확인 필요`, `범위 확인 필요`, `구조 해석 필요`, `미팅 때 물어볼 것` as conflict unless an explicit contradictory fact is already present.
5. Preserve long raw extracts and file-level source detail in `Raw_Evidence_Index.md`.
6. Record actual document/wiki changes in `Change_Log.md`.
7. Append a concrete status-change memo to `Status.md`.
8. Update operating pages such as `Business_Flow.md`, `CEO_Brief.md`, `PM_Action_Plan.md`, `Customer_Followup.md`, `Project_Overview.md`, `Decisions.md`, `Risks.md`, `KPI.md`.
9. Refresh the relevant `obsidian/L1_memory/{ProjectName}.md`.

Do not jump straight from a new event to a cleaned-up conclusion if source facts, conflicts, or version changes need to remain visible.
Do not over-promote weak uncertainty into `Conflict_Register.md` when the more practical move is to update `Action_Items.md`, `Decisions.md`, `Risks.md`, `Status.md`, or the hub.
Do not store approval logs, wiki management logs, or merge metadata in `Conflict_Register.md`; those belong in `Change_Log.md`, global logs, or automation audit files.

## Practical Operating Logic

The wiki should help run work, not only explain work.
Bias every meaningful update toward these questions:

1. What changed?
2. What is confirmed?
3. What is still unconfirmed or conflicting?
4. What action now belongs to whom?
5. What evidence supports that action?

If an update does not improve at least one of those five, it is probably too cosmetic.
When possible, be proactive instead of passive: say what should be reviewed next, which wiki page should change, and whether you can update it directly.

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
- `Conflict_Register.md` entries that are really scope notes, structure notes, stage interpretations, or meeting questions
- `Conflict_Register.md` polluted with approval logs, wiki management logs, or automation metadata
- references missing URL/path/file-name fallback in `Reference_Register.md`
- claims without evidence pages
- project spaces missing core documents
- intake-specific duplicate project spaces that were never reviewed in `Decisions.md`
- project hubs that do not expose current status, blockers, next actions, and evidence links near the top
- account hubs that do not expose active projects and relationship-level next steps
- common/shared hubs that do not expose promotion queues or reuse targets
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
- Prefer practical recommendations over vague conflict surfacing. Generic "정합성 확인 필요" notes should become concrete review/update suggestions unless they are tied to an explicit contradictory fact.

## Project Space Minimum

Most project folders should keep these pages available:

- `hub.md`
- `Status.md`
- `Reference_Register.md`
- `Project_Overview.md`
- `Sources.md`
- `Evidence_Log.md`
- `Raw_Evidence_Index.md`
- `Business_Flow.md`
- `CEO_Brief.md`
- `PM_Action_Plan.md`
- `Customer_Followup.md`
- `Change_Log.md`
- `Conflict_Register.md`
- `Action_Items.md`
- `Decisions.md`
- `Risks.md`
- optional specialized pages such as `KPI.md`, `Equipment.md`, `Architecture.md`

And a corresponding `obsidian/L1_memory/{ProjectName}.md` must exist.

`Decisions.md` is the canonical integration-review register for a project.
Use it to track:

- representative wiki space for the work
- merge or separation decisions across Slack/Drive/knowledge/filesystem intake paths
- user-confirmed choices and LLM recommendations
- reasons a candidate was merged, held, kept separate, or promoted elsewhere
- which wiki pages must be updated after the decision

Project hubs should expose these sections near the top:

- `## 운영 메모`
- `## 실행 현황판`
- `## 현재 막힘 / 충돌`
- `## 다음 액션`
- `## 최근 업데이트`
- `## 운영 링크`

The hub is not a mere contents page. It is the first execution brief for the project.

`Status.md` is the canonical project status register.

`Reference_Register.md` is the canonical project reference register.
Use it to track:

- the best available Slack/web/Drive/local links
- fallback file names when a stable URL is unavailable
- collection-state identifiers such as Slack channel id, `last_export_path`, or Drive `file id`
- remote folder lineage such as Shared Drive name and parent folder path
- never temporary mirror/cache paths as long-term reference values
- where the content is explained in the wiki
- related documents and operating pages
- access notes or read status

`Status.md` is the canonical project status register.
Use it to track:

- current status label
- current stage
- health
- current owner/contact
- blockers
- next gate or milestone
- status history
- concrete change-event memos in the form `YYYY-MM-DD HH:mm [source] 기준으로 [change]가 기록되었고 [action]이 수행/대기됨`
- Decision Queue outcomes that changed operating state

`Raw_Evidence_Index.md` is the canonical raw/extracted evidence preservation index.
Use it to track:

- long raw extracts or full extracted text that would be lost in a summary
- tables, numbers, version chains, extraction warnings, and file-level provenance
- source paths and extraction output paths
- which operating pages consumed the evidence and which items still need Decision Queue review

## Account/Common/Shared Hub Minimum

Account hubs should expose:

- active linked projects
- current commercial or relationship status
- account-wide blockers or escalation points
- next touchpoints
- links to underlying project hubs

Common hubs should expose:

- active operating models
- promotion queues
- automation or governance entrypoints
- cross-project assets currently in use

Shared hubs should expose:

- reusable assets
- which project or common pages should consume them
- promotion provenance from the originating project

## Canonical Project Evidence Files

Use underscore file names for project evidence and reference documents:

- `Reference_Register.md`
- `Sources.md`
- `Evidence_Log.md`
- `Raw_Evidence_Index.md`
- `Status.md`
- `Business_Flow.md`
- `CEO_Brief.md`
- `PM_Action_Plan.md`
- `Customer_Followup.md`
- `Conflict_Register.md`
- `Change_Log.md`

Avoid creating parallel space-named files such as `Evidence Log.md`, `Conflict Register.md`, or `Change Log.md` inside project folders. If older instructions mention space-named variants, treat them as conceptual labels and use the underscore file names above.

## Practical Default

Think of Obsidian as the IDE, the wiki as the codebase, and the agent as the maintainer.
Every meaningful ingest or synthesis should leave the wiki more structured, more linked, and easier to navigate than before.

The L1 memory layer is the "working memory" — always current, always compact.
The wiki is the "long-term memory" — always growing, always structured.
Raw sources are the "immutable record" — never modified, always preserved.
