# assistant-ui Migration TODO

Date: 2026-04-30

## Operating Rule

The new assistant-ui frontend is the migration target. Legacy UI remains only as
a temporary fallback for workflows that do not yet have primary-action parity in
React.

Every TODO item must declare:

- Target surface.
- Required value loop.
- Minimum parity definition.
- Fallback policy while incomplete.

## Current Sprint: Stop Routing Damage

Goal:

Make the new frontend aware of every major product surface so no legacy
workflow is silently collapsed into a generic page.

### TODO

- [x] Create the system integrity audit:
  `automation/WIKI_OPS_SYSTEM_INTEGRITY_AUDIT.md`.
- [x] Add a React Surface Registry covering Chat, Wiki Related, and Mission
  sub-surfaces.
- [x] Preserve exact sub-surface identity in root redirects and legacy nav
  redirects.
- [x] Route `surface=decisions` to the real React Decision Deck.
- [x] Add assistant-ui fallback pages for Pipeline, Spotlite, Operations, and
  Ingest until those surfaces reach parity.
- [x] Promote Paperclip from fallback to live scaffold with templates, tasks,
  events, and trigger controls.
- [x] Run TypeScript/build validation.

## Phase A: Surface Parity Shell

### Chat

- [ ] Hydrate saved project message history into assistant-ui runtime.
- [ ] Wire backend stop parity through `/api/chat/stop`.
- [ ] Add message delete and evidence promotion actions.
- [ ] Replace decorative skill chips with composer-level `@` mention search.

### Wiki Related

- [ ] Complete Decision Deck route and action parity.
- [ ] Restore evidence/compare/merge/audit context in Decision Deck.
- [x] Build Paperclip Studio with live templates, tasks, events, and trigger
  controls.
- [ ] Add Paperclip result open/download/promote actions.
- [x] Build Evidence Console with search, page preview/edit, and page status.
- [x] Add Notion-style live Markdown preview for headings, lists, checkboxes,
  links, wiki links, blockquotes, tables, and code blocks.
- [x] Apply Notion-like Wiki visual language with sidebar page tree, cover,
  page icon, properties row, document canvas, and lightweight inspector.
- [ ] Add Evidence Console advanced filters, graph, and management commands.
- [ ] Build Ingest Workbench with digest, promotion, generated path, and
  project hint.

### Mission Control / Command Center

- [ ] Repair Mission density to include project board, risk queue, decision
  queue, automation, document status, GLM usage/policy, and governance warnings.
- [ ] Build Pipeline Cockpit with Slack/Drive/OpenClaw/rclone, dry-run/run,
  stop, logs, and run history.
- [ ] Build Spotlite work/personal board with GLM refresh and personal lock.
- [ ] Build Operations admin console with settings, schedules, coverage, skill
  draft, LLM policy, and safety state.

## Phase B: Data Ownership

- [ ] Declare `runtime JSON` as canonical for chat projects and global chat
  settings.
- [ ] Mark L1 chat/global Markdown as generated projection in the UI.
- [ ] Centralize `workspaceId = rtm|personal` and `chatScope = work|personal`
  conversion in one adapter.
- [ ] Initialize `decision_queue.json` for audit clarity.
- [ ] Create a capability registry to derive both skill catalog and Paperclip
  templates.
- [ ] Create a shared status-family map for Mission rollups.

## Phase C: Legacy Retirement

- [ ] Keep `?legacy=1#view` fallback links until primary-action parity exists.
- [ ] Remove one legacy view only after React QA passes for that surface.
- [ ] Separate source changes, build outputs, runtime JSON, and generated L1
  projections in review notes.
