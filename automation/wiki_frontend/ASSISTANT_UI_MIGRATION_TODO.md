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

- [x] Hydrate saved project message history into assistant-ui runtime.
- [x] Wire backend stop parity through `/api/chat/stop`.
- [x] Add message delete and evidence promotion actions.
- [x] Replace decorative skill chips with composer-level `@` mention search.
- [x] Add composer-level `@` wiki project mentions and pass them into GLM
  retrieval/project binding.

### Wiki Related

- [x] Complete Decision Deck route and action parity.
- [x] Restore evidence/compare/merge/audit context in Decision Deck.
- [x] Build Paperclip Studio with live templates, tasks, events, and trigger
  controls.
- [x] Add Paperclip result open/download/promote actions.
- [x] Build Evidence Console with search, page preview/edit, and page status.
- [x] Add Notion-style live Markdown preview for headings, lists, checkboxes,
  links, wiki links, blockquotes, tables, and code blocks.
- [x] Apply Notion-like Wiki visual language with sidebar page tree, cover,
  page icon, properties row, document canvas, and lightweight inspector.
- [x] Add project/folder-centered Wiki navigation for Project, Account, Common,
  and Memory groups.
- [x] Add Evidence Console search filters and sorting for status, document
  type, updated date, title, size, and relevance.
- [x] Promote live Markdown preview to the primary reading canvas with the
  source editor as the secondary panel.
- [x] Add Evidence Console graph map and management command planning/apply
  controls.
- [x] Build Ingest Workbench with digest, promotion, generated path, and
  project hint.

### Mission Control / Command Center

- [x] Repair Mission density to include project board, risk queue, decision
  queue, automation, document status, GLM usage/policy, and governance warnings.
- [x] Build Pipeline Cockpit with Slack/Drive/OpenClaw/rclone, dry-run/run,
  stop, logs, and run history.
- [x] Build Spotlite work/personal board with GLM refresh and personal lock.
- [x] Build Operations admin console with settings, schedules, coverage, skill
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

## Screen Improvement Backlog

Goal:

Make each surface carry the right amount of information for its job instead of
compressing every page into the same simplified card layout.

### TODO

- [x] App Shell: apply one top-level product frame for all React surfaces,
  including full-bleed layout rules, persistent workspace/project context,
  right-rail behavior, and mobile stacked navigation.
- [x] Chat: rebuild the composer as a GPT/Claude-grade command surface with
  `@` project/wiki mentions, skill tags, file chips, enter/send parity,
  stop/regenerate/delete, and evidence promotion actions.
- [x] Wiki: split Notion-like read mode and edit mode, add folder/project
  tree, graph drawer, command drawer, page properties, and primary live
  preview without stealing reading space.
- [x] Decision Deck: convert to a 3-pane review cockpit with queue,
  evidence compare, merge/audit trail, and explicit approve/reject/apply
  actions.
- [x] Paperclip: extend the current result workbench with result preview,
  generated-file trace, Decision Queue handoff, download, and promotion
  action.
- [x] Mission Control: raise information density with project radar,
  risk/decision lanes, automation timeline, document status, GLM policy,
  and governance warnings in one central command dashboard.
- [x] Pipeline/Spotlite/Operations: replace fallback placeholders with live
  run controls, logs, schedules, settings, and safety state before removing
  legacy routes.
- [ ] State System: standardize empty, loading, error, offline, and stale-data
  states across every surface with consistent recovery actions.

## Phase C: Legacy Retirement

- [ ] Keep `?legacy=1#view` fallback links until primary-action parity exists.
- [ ] Remove one legacy view only after React QA passes for that surface.
- [ ] Separate source changes, build outputs, runtime JSON, and generated L1
  projections in review notes.
