# Wiki Ops System Integrity Audit

Date: 2026-04-30

## Purpose

This audit checks the Wiki Ops system as one product, not as isolated frontend
screens.

Scope:

- Frontend route/surface parity between legacy `index.html/app.js` and the
  assistant-ui React app.
- Server API capability and whether each API has a clear product surface.
- Runtime data ownership, duplication, projections, and missing stores.
- Functional value flow from collection to evidence, decision, chat, and
  automation.
- Structural defects that will keep reappearing unless the migration is
  governed by a single product map.

## Executive Summary

The system is not weak because the backend lacks features. The opposite is true:
the server already contains a dense operating system for collection, search,
wiki management, GLM chat, Decision Queue, Paperclip, Spotlite, settings,
schedules, and project command-center state.

The main defect is structural mismatch:

- The legacy frontend exposes many operational workflows.
- The assistant-ui app exposes only three top-level surfaces.
- The server internally defines feature surfaces again through
  `llmPolicyCatalog`, Paperclip templates, automation commands, chat projects,
  and decision queue generation.
- Runtime data is split across JSON state, generated sparse/graph indexes, and
  Markdown/L1 projections without one visible ownership map.

The three-axis product direction is still correct:

1. Chat
2. Wiki Related
3. Mission Control / Command Center

But those axes must become containers for real sub-surfaces, not replacements
that flatten or hide existing functionality.

## Evidence Snapshot

### Frontend/API Coverage

Current endpoint usage comparison:

| Area | Legacy frontend | React assistant-ui | Missing from React |
| --- | ---: | ---: | ---: |
| Total distinct endpoint patterns | 55 | 11 | 44 |
| `wiki` | 11 | 1 | 10 |
| `automation` | 7 | 2 | 5 |
| `chat` | 10 | 4 | 6 |
| `paperclip` | 4 | 0 | 4 |
| `spotlite` | 3 | 0 | 3 |
| `slack` | 3 | 0 | 3 |
| `documents` | 2 | 0 | 2 |
| `drive` | 2 | 0 | 2 |
| `ops` | 2 | 0 | 2 |
| `decision-queue` | 2 | 2 | 0 |
| `projects` | 1 | 1 | 0 |

Server route groups currently present:

| Group | Route count |
| --- | ---: |
| `wiki` | 15 |
| `chat` | 11 |
| `automation` | 10 |
| `paperclip` | 5 |
| `drive` | 3 |
| `documents` | 3 |
| `slack` | 3 |
| `spotlite` | 3 |
| `settings` | 2 |
| `ops` | 2 |
| `skills` | 2 |
| `knowledge` | 2 |
| `decision-queue` | 1 |
| `projects` | 1 |

### Runtime Data Snapshot

| Store | Current shape |
| --- | --- |
| `automation/wiki_api/runtime/chat_projects.json` | array, 3 projects, 125663 bytes |
| `automation/wiki_api/runtime/chat_global_settings.json` | object, global instructions |
| `automation/wiki_api/runtime/knowledge_promotions.json` | array, 1 promotion candidate |
| `automation/wiki_api/runtime/decision_queue.json` | missing until first persisted queue write |
| `automation/wiki_api/runtime/paperclip_tasks.json` | array, 2 tasks |
| `automation/wiki_api/runtime/paperclip_events.json` | array, 3 events |
| `automation/wiki_api/runtime/runs.json` | array, 45 automation runs |
| `automation/wiki_api/runtime/schedules.json` | empty array |
| `automation/wiki_api/runtime/wiki_statuses.json` | status store |
| `automation/wiki_api/runtime/wiki_management_commands.json` | array, 7 commands |
| `automation/wiki_api/runtime/target_analysis.json` | array, 15 Drive target analyses |
| `automation/drive_wikify/runtime/wiki_sparse_index.json` | generated search index, about 10 MB |
| `automation/drive_wikify/runtime/wiki_graph_snapshot.json` | generated graph snapshot, about 366 KB |
| `obsidian/Wiki/**/{hub,Sources,Evidence_Log,Conflict_Register,Change_Log}.md` | 125 canonical evidence/governance files |
| `obsidian/L1_memory/GLM_Chat_Projects/*.md` | 7 projected chat/L1 memory files |

## Value Flow Map

The product should be understood as five value loops.

### 1. Collection to Evidence

Flow:

`Slack/Drive/OpenClaw/rclone -> manifest/run output -> wiki_sparse_index + wiki_graph_snapshot -> Sources/Evidence/Change/Conflict docs`

Existing backend:

- `/api/slack/*`
- `/api/drive/*`
- `/api/automation/*`
- `/api/openclaw/trigger`
- `refresh-global`
- sparse index and graph snapshot generation

Current frontend defect:

- Legacy Pipeline owns this flow.
- React assistant-ui has no Pipeline cockpit.
- Mission only exposes a tiny subset of automation trigger/status.

### 2. Evidence to Decision

Flow:

`knowledge promotion + wiki conflict signals + Paperclip results -> Decision Queue -> approve/hold/investigate -> append to target governance docs`

Existing backend:

- `/api/decision-queue`
- `/api/decision-queue/:id/resolve`
- `/api/wiki/conflict-merge`
- `/api/wiki/page`
- final verification before append

Current frontend defect:

- React has a DecisionDeck component, but app routing maps
  `surface=decisions` into generic `wiki`.
- Generic WikiWorkspace shows only a thin decision table and misses compare,
  evidence, merge, and audit context.

### 3. Evidence to Chat

Flow:

`sparse search -> graph expansion -> Paperclip/validation context -> GLM answer -> chat memory -> optional promotion`

Existing backend:

- `/api/chat/glm/stream`
- `/api/chat/files`
- `/api/chat/projects`
- `/api/chat/evidence`
- `/api/knowledge/promote`

Current frontend defect:

- React chat is the strongest migrated surface, but it still misses full
  history hydration, backend stop parity, message deletion/retraction, and
  promotion actions.
- Project/wiki linking now exists, but it is a projected contract rather than a
  product-level source of truth.

### 4. Task/Skill Operations

Flow:

`Skill catalog + Paperclip template -> task composer -> queue -> run -> event log -> result -> decision/promotion`

Existing backend:

- `/api/skills/catalog`
- `/api/skills/draft`
- `/api/paperclip/status`
- `/api/paperclip/templates`
- `/api/paperclip/tasks`
- `/api/paperclip/trigger`

Current frontend defect:

- React chat can read the skill catalog.
- React WikiWorkspace shows static Paperclip cards only.
- The real Paperclip lifecycle is absent from assistant-ui.

### 5. Command Center Operations

Flow:

`project status + document status + decision queue + automation + LLM usage/policy + schedules/settings -> operating cockpit`

Existing backend:

- `/api/projects/command-center`
- `/api/documents/core`
- `/api/documents/status`
- `/api/ops/llm-usage`
- `/api/ops/llm-policy`
- `/api/settings`
- `/api/automation/schedules`

Current frontend defect:

- React Mission is visually coherent but under-represents the actual control
  plane.
- Operations, schedules, settings, LLM policy, Spotlite, and governance warning
  surfaces are not migrated.

## Critical Findings

### P0-01. Assistant-ui routing swallows implemented workflows

Evidence:

- `index.html` maps `#decisions`, `#paperclip`, and `#wiki` to `surface=wiki`.
- React `normalizeSurface()` maps `decisions` and `paperclip` into `wiki`.
- `DecisionDeck.tsx` exists but is not imported/rendered by `App.tsx`.

Impact:

- A user can request Decision Deck, but the product opens a generic Wiki
  workspace.
- Paperclip appears as a label, not as a functional studio.
- This creates the exact perception the user reported: "the screen exists, but
  the function is missing."

Required correction:

- Keep the three top-level tabs.
- Add a real second-level surface router:
  `chat`, `wiki.decisions`, `wiki.evidence`, `wiki.paperclip`,
  `wiki.ingest`, `mission.dashboard`, `mission.pipeline`,
  `mission.spotlite`, `mission.operations`.
- Route legacy hashes to their exact sub-surface, not the broad parent.

### P0-02. The highest-value backend workflows are not visible in React

Missing React sub-surfaces:

- Pipeline automation cockpit.
- Paperclip Studio.
- Wiki/Evidence Console.
- Ingest/promotion workbench.
- Operations/settings/schedules.
- Spotlite work/personal board.

Impact:

- The migration creates a prettier but less capable product.
- Users lose access to high-value workflows unless they know legacy URLs or
  old DOM state.

Required correction:

- Do not hide legacy DOM for any workflow until React has primary-action
  parity.
- Add explicit fallback links for un-migrated sub-surfaces during transition.

### P0-03. Product value taxonomy exists in the server but not in the UI

Evidence:

`llmPolicyCatalog()` already defines surfaces such as:

- Decision Deck triage.
- Decision final approval.
- Conflict merge.
- Wiki search.
- Mission Control.
- Collection pipeline.
- Ingest digest.
- GLM chat.
- Wiki management.
- File analysis.
- Paperclip skill.
- Slack evidence ingest.

Impact:

- The backend has a strong value map.
- The frontend invented a smaller map and therefore hides important workflows.

Required correction:

- Promote the policy catalog's feature taxonomy into a canonical surface
  registry.
- Use that registry to drive navigation, route guards, missing-feature states,
  and migration checklist status.

### P0-04. Wiki Related is currently a placeholder, not an Evidence IDE

Evidence:

- Legacy Wiki uses search, page preview/edit, graph, status, management
  commands, search brief, and filters.
- React WikiWorkspace only calls Decision Queue and renders static lists/cards.

Impact:

- The "Notion-like" direction is visually suggested but not functionally true.
- Provenance-first workflows are compressed into generic cards.

Required correction:

- Build Wiki Related as a Notion-like workspace with sub-pages:
  Decisions, Evidence Console, Paperclip, Ingest.
- Evidence Console must preserve dense split panes:
  filter/nav, result list, document preview/editor, graph/management rail.

### P1-01. Runtime JSON vs Markdown/L1 projection has no visible owner contract

Evidence:

- `chat_projects.json` is canonical at runtime.
- The server projects chat projects into `obsidian/L1_memory/GLM_Chat_Projects`.
- Global chat settings are stored in JSON and projected into
  `obsidian/L1_memory/GLM_Global_Instructions.md`.

Impact:

- This is useful, but dangerous if the UI presents Markdown/L1 as editable
  source.
- Drift can occur if a future feature edits L1 directly.

Required correction:

- Declare ownership:
  `runtime JSON = write source`, `L1 markdown = generated projection`.
- Show projection path and last sync in the UI.
- If L1 editing is ever allowed, add an explicit import/reconcile command.

### P1-02. Workspace naming is inconsistent across product layers

Evidence:

- Legacy UI state uses `work` and `personal`.
- Wiki APIs use `rtm` and `personal`.
- Chat project persistence stores `work`/`personal`.
- React maps `rtm -> work` for chat and `rtm -> rtm` for wiki.

Impact:

- This works now because adapters patch it.
- It will cause future bugs in filtering, linking, and project selection.

Required correction:

- Define two explicit concepts:
  `workspaceId = rtm|personal` and `chatScope = work|personal`.
- Convert only in one adapter layer.
- Never let components hand-roll workspace conversion.

### P1-03. Skill catalog and Paperclip templates duplicate capability definitions

Evidence:

- `skillCatalog()` includes Paperclip-related skills and plugin candidates.
- `paperclipTemplates()` separately defines overlapping task templates.

Impact:

- Labels, safety states, availability, and output paths can drift.
- Chat skill tags and Paperclip task creation may disagree.

Required correction:

- Create one capability registry.
- Derive `skills/catalog` and `paperclip/templates` views from that registry.
- Keep `capabilityId`, `executionMode`, `safety`, `output`, and
  `approvalRequired` as first-class fields.

### P1-04. Decision Queue is hybrid derived state plus persisted override

Evidence:

- `decision_queue.json` is missing until a queue item is enqueued/resolved.
- `decisionQueue()` derives items from knowledge promotions and wiki conflict
  signals, then overlays persisted state.
- Paperclip completed tasks can enqueue persisted items.

Impact:

- This is smart, but hard to explain in the UI.
- A missing JSON file is not an error, but it looks like one in audits.
- Resolved derived items and manually enqueued items need different provenance.

Required correction:

- Treat the queue as a materialized view:
  `derivedCandidates + persistedOverrides + manualItems`.
- Surface `sourceType`, `derived`, and `persistedStatus` in the UI.
- Create an empty initialized `decision_queue.json` during server boot or
  setup for audit clarity.

### P1-05. Automation commands are fragmented by entrypoint

Evidence:

- `runCommand()` allows `rclone-copy`, `build-manifest`, `run`,
  `refresh-global`, and `slack-collect`.
- `/api/automation/trigger` special-cases `full-cycle`.
- `/api/automation/target-rclone-copy` is a separate targeted path.
- Paperclip handles `openclaw`, `validate`, and `glm-skill` outside
  `runCommand()`.

Impact:

- The user sees commands in different places with different safety semantics.
- Pipeline, Mission, and Paperclip can all trigger related work but with
  different affordances.

Required correction:

- Create an `OperationCommandRegistry`.
- Classify commands as `read`, `dryRun`, `localWrite`, `externalRead`,
  `approvalRequired`.
- Use the same command card component in Pipeline, Mission, and Paperclip.

### P1-06. Status concepts are scattered across multiple stores

Examples:

- `wiki_statuses.json`
- document usage/status APIs
- project command-center summaries
- automation runs
- Paperclip tasks/events
- Decision Queue statuses
- LLM usage/policy

Impact:

- The UI cannot answer "what is healthy, blocked, risky, stale, or pending" in
  one vocabulary.

Required correction:

- Define a shared status vocabulary:
  `ready`, `running`, `blocked`, `pending_review`, `approved`, `stale`,
  `failed`, `completed`.
- Keep domain-specific statuses, but map them to common status families for
  dashboard rollups.

### P2-01. Generated build assets and runtime side effects are creating noise

Evidence:

- `assistant-ui/assets/*` build hashes change.
- Runtime JSON and projected L1 markdown are frequently modified during normal
  usage.

Impact:

- It becomes harder to review intentional code changes.
- User/runtime edits can be mistaken for migration work.

Required correction:

- Decide which generated assets are intentionally versioned.
- Add a contributor note separating source changes, build outputs, runtime
  state, and generated Markdown projections.

## Duplication Matrix

| Duplicate / overlap | Current state | Risk | Target ownership |
| --- | --- | --- | --- |
| Chat projects JSON vs L1 markdown | JSON writes project data, server projects Markdown | L1 could be mistaken for source | JSON canonical, L1 generated |
| Chat global JSON vs L1 global instructions | Same pattern | Drift if hand-edited | JSON canonical, L1 generated |
| Skill catalog vs Paperclip templates | Separate definitions with overlapping skills | Label/safety drift | Capability registry canonical |
| Knowledge promotions vs Decision Queue | Promotions can become decision candidates | Candidate lifecycle unclear | Promotions source, queue materialized view |
| Paperclip results vs Decision Queue | Completed tasks enqueue review items | Result provenance hidden | Paperclip task canonical, queue review projection |
| Wiki statuses vs document statuses | Separate stores | Inconsistent dashboard health | Domain stores plus common status map |
| Sparse index vs graph snapshot vs wiki index | Generated retrieval assets | Stale retrieval if refresh hidden | `refresh-global` canonical regeneration |
| Legacy DOM vs React surfaces | Both exist during migration | Feature parity confusion | React primary, legacy fallback until parity |

## Missing Feature Matrix

| Product axis | Missing or underbuilt surface | Required minimum parity |
| --- | --- | --- |
| Chat | History hydration | Existing project messages render in assistant-ui runtime |
| Chat | Stop/delete/promote actions | `/api/chat/stop`, message delete, `/api/chat/evidence` wired |
| Chat | Native mentions | Composer-level `@skill` search, not decorative chips only |
| Wiki Related | Decision Deck | Direct route, queue rail, evidence, compare, merge, audit trail |
| Wiki Related | Evidence Console | Search, brief, page preview/edit, status, filters, graph |
| Wiki Related | Paperclip Studio | Templates, composer, queue, trigger, events, result actions |
| Wiki Related | Ingest Workbench | Digest, promotion, generated path, project hint |
| Mission | Pipeline Cockpit | Slack/Drive/OpenClaw/rclone, dry-run/run, stop, logs, run history |
| Mission | Spotlite | Work/personal digest, templates, GLM refresh, personal lock |
| Mission | Operations | Settings, schedules, LLM policy, coverage, skill draft, safety |

## Structural Recommendation

### 1. Introduce a Surface Registry

Create a single product map consumed by React routes, legacy redirects, and
migration docs.

Suggested shape:

```ts
type Surface =
  | "chat.thread"
  | "chat.projects"
  | "chat.memory"
  | "wiki.decisions"
  | "wiki.evidence"
  | "wiki.paperclip"
  | "wiki.ingest"
  | "mission.dashboard"
  | "mission.pipeline"
  | "mission.spotlite"
  | "mission.operations";
```

Each surface should declare:

- Owner domain.
- Required endpoints.
- Data stores touched.
- Density pattern.
- Migration status.
- Legacy fallback route.
- Safety level.

### 2. Keep the Three Big Tabs, Add Strong Sub-Navigation

Top level:

- Chat
- Wiki Related
- Mission Control / Command Center

Sub-surfaces:

- Chat: Thread, Projects, Memory, Promotions, Files.
- Wiki Related: Decisions, Evidence Console, Paperclip, Ingest.
- Mission: Dashboard, Pipeline, Spotlite, Operations.

### 3. Formalize Data Ownership

Data classes:

- Canonical runtime state: JSON files under `automation/wiki_api/runtime`.
- Generated retrieval state: sparse index and graph snapshot.
- Durable evidence state: Obsidian Wiki Markdown.
- Generated memory projection: L1 chat/global Markdown.
- External/source raw state: Drive/Slack local exports.

Rule:

- A UI write must declare which class it writes to.
- A generated projection must display its source and last generated time.

### 4. Make Legacy Fallback Explicit During Migration

Until parity exists:

- Assistant-ui should show "Open legacy full cockpit" for missing sub-surfaces.
- Redirects must not collapse exact legacy hashes into generic parent pages.
- Hidden DOM should only be removed after the React sub-surface passes primary
  workflow QA.

### 5. Use Page-Specific Density Patterns

Do not make every page look like chat.

| Surface | Pattern |
| --- | --- |
| Chat | Conversational workbench |
| Decision Deck | Review deck with evidence drawer |
| Evidence Console | Evidence IDE |
| Paperclip | Skill operations bench |
| Pipeline | Automation cockpit |
| Mission | Central command dashboard |
| Spotlite | Daily brief board |
| Operations | Admin control plane |
| Ingest | Capture and promote |

## Recommended Execution Order

### Phase A. Stop routing damage

1. Add the Surface Registry.
2. Route `surface=decisions` to `DecisionDeck`.
3. Route `surface=paperclip` to a real or fallback Paperclip Studio.
4. Route `surface=pipeline`, `surface=spotlite`, `surface=operations`,
   `surface=ingest` to explicit React placeholders with legacy fallback.
5. Change legacy redirects to preserve exact requested sub-surface.

### Phase B. Restore the missing value loops

1. Wiki Related: Decision Deck parity.
2. Wiki Related: Paperclip Studio.
3. Mission: Pipeline Cockpit.
4. Wiki Related: Evidence Console.
5. Mission: Operations.
6. Mission: Spotlite.
7. Chat: history, stop/delete/promote, composer mentions.

### Phase C. Remove duplication risk

1. Capability registry replaces skill/template duplication.
2. Workspace adapter centralizes `rtm/work/personal` naming.
3. Decision Queue becomes an initialized materialized view.
4. Status family map powers Mission rollups.

### Phase D. Retire legacy safely

Only remove legacy DOM and handlers after:

- React sub-surface covers primary actions.
- Endpoint calls are verified.
- Browser click QA is complete.
- Runtime write targets are documented.

## Immediate TODO

- [ ] Add `SurfaceRegistry` in the React app.
- [ ] Preserve sub-surface identity in `index.html` and `app.js` redirects.
- [ ] Render `DecisionDeck` for `surface=decisions`.
- [ ] Add `PaperclipStudio` shell with live `/api/paperclip/*` data.
- [ ] Add explicit fallback tiles for Pipeline, Spotlite, Operations, and Ingest.
- [ ] Add data ownership labels to Chat Project settings.
- [ ] Create `CapabilityRegistry` on the server or shared module.
- [ ] Initialize `decision_queue.json` with `{ "version": 1, "items": {} }`.
