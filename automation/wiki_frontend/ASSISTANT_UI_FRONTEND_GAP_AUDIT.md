# assistant-ui Frontend Gap Audit

Date: 2026-04-30

## Scope

This audit compares the already implemented legacy Wiki Ops frontend against the
current assistant-ui React top-level app.

Evidence sources:

- Legacy screens and controls: `automation/wiki_frontend/index.html`
- Legacy frontend behavior/API wiring: `automation/wiki_frontend/app.js`
- React assistant-ui app: `automation/wiki_frontend/assistant_ui_app/src`
- Backend route inventory: `automation/wiki_api/server.mjs`

## Executive Summary

The migration is not at feature parity yet.

The legacy frontend implements 8 major views plus the sidebar graph refresh
control:

- Mission Control
- GLM Chat
- Spotlite
- Decision Deck
- Pipeline
- Wiki Browser / Evidence Console
- Ingest
- Paperclip Studio
- Operations
- Sidebar graph-map update

The assistant-ui app currently exposes only 3 top-level surfaces:

- Chat
- Wiki related
- Mission Control

That 3-axis product structure is acceptable, but the missing legacy features must
be placed inside those axes as sub-surfaces or panels. Today many are not wired
at all.

API coverage also confirms the gap:

- Legacy frontend uses 53 distinct `/api/*` endpoint patterns.
- assistant-ui React app uses 11 endpoint patterns.
- The omitted endpoint groups are mostly Wiki editing/search/graph, Paperclip,
Pipeline/Slack/Drive, Operations/settings/schedules, Spotlite, and knowledge
promotion.

## Critical Gaps

### P0. Decision Deck exists but is not reachable as its own product surface

Legacy evidence:

- Legacy nav has a dedicated `정합성 대기` view.
- Legacy Decision Deck has queue rail, evidence modal, compare modal, merge
  suggestion, keyboard actions, LLM directive, approve/hold/investigate.

React state:

- `src/domains/decisions/components/DecisionDeck.tsx` exists.
- `App.tsx` does not import or render it.
- `normalizeSurface()` maps `surface=decisions` into `wiki`, so direct Decision
  Deck entry is swallowed by the generic Wiki Workspace.

Impact:

- A major implemented workflow is hidden.
- The user cannot access the focused card-review surface even though the code
  exists.

Required fix:

- Keep the top-level `위키 관련` tab if desired, but add internal sub-tabs for
  `Decisions`, `Wiki`, and `Paperclip`.
- Route `surface=decisions` to `DecisionDeck`, not generic `WikiWorkspace`.

### P0. Wiki / Evidence Console is mostly missing

Legacy evidence:

- Legacy Wiki view includes search, selected evidence summary, document preview,
  Notion-like browser, filters, status edits, markdown editor, graph data, and
  wiki management command planning/apply.
- Legacy endpoints include `/api/wiki/search`, `/api/wiki/search/brief`,
  `/api/wiki/page`, `/api/wiki/status`, `/api/wiki/manage`,
  `/api/wiki/manage/apply`, `/api/wiki/graph`, and `/api/wiki/graph/refresh`.

React state:

- `WikiWorkspace.tsx` only renders a Decision Queue table, static Paperclip
  cards, and static operating page names.
- It does not fetch wiki search results, page markdown, graph data, status
  catalog, management commands, or page edits.

Impact:

- The migrated `위키 관련` page looks like a placeholder rather than the
  evidence IDE that existed.
- Existing high-density filters and provenance workflows are absent.

Required fix:

- Build a React `WikiEvidenceConsole` with split panes:
  filter/navigation, result list, document preview/editor, graph/management
  rail.
- Wire search, brief, page read/write, status, graph refresh, and management
  commands.

### P0. Pipeline / Slack / Drive automation cockpit is absent

Legacy evidence:

- Legacy Pipeline view includes Slack channel routing, channel selection,
  2-day preview/run, rclone dry-run/run, manifest/run/full-cycle, continue after
  collection, OpenClaw trigger, stop run, target analysis, instruction-based
  Drive target planning, live rclone progress, and run history.
- Legacy endpoints include `/api/slack/status`, `/api/slack/channels`,
  `/api/slack/collect`, `/api/drive/targets`,
  `/api/drive/instruction-targets`, `/api/automation/target-rclone-copy`,
  `/api/automation/continue-after-collection`, `/api/openclaw/trigger`, and
  `/api/automation/stop`.

React state:

- Mission Control exposes only `refresh-global`, `rclone-copy dry-run`, and
  refresh.
- There is no Pipeline surface or automation cockpit in assistant-ui.

Impact:

- The high-risk operational controls are not available from the new app.
- Users landing on assistant-ui lose the actual collection workflow.

Required fix:

- Add a `PipelineCockpit` under Mission Control / Command Center.
- Preserve dry-run vs run distinction, stop controls, Slack routing, Drive
  instruction planning, live logs, and run history.

### P0. Paperclip Studio is static, not functional

Legacy evidence:

- Legacy Paperclip Studio has bridge status, templates, task composer, task
  queue, trigger existing task, create + trigger, event log, result open, and
  markdown download.
- Legacy endpoints include `/api/paperclip/status`, `/api/paperclip/templates`,
  `/api/paperclip/tasks`, `/api/paperclip/tasks/:id/trigger`, and
  `/api/paperclip/trigger`.

React state:

- `WikiWorkspace.tsx` has static Paperclip description cards only.
- No templates, task queue, bridge status, event log, trigger controls, or
  result actions are wired.

Impact:

- The visible label says Paperclip, but the actual task factory is missing.

Required fix:

- Add `PaperclipStudio` under `위키 관련`.
- Wire bridge status, template library, task composer, queue, trigger actions,
  events, and result open/download/promote.

### P1. Operations / settings / schedules admin console is missing

Legacy evidence:

- Legacy Operations includes status metrics, coverage, schedules, env/settings,
  GLM model policies, Slack/rclone/Paperclip config, skill draft generation, and
  safety state.
- Legacy endpoints include `/api/status`, `/api/settings`, `/api/coverage`,
  `/api/automation/schedules`, and `/api/skills/draft`.

React state:

- No Operations surface exists.
- Mission only reads automation status and trigger.

Impact:

- Users cannot manage model settings, schedules, or operational safety controls
  in the new app.

Required fix:

- Add `OperationsControlPlane` under Mission Control / Command Center.
- Group forms by domain and preserve save/status/dirty-state behavior.

### P1. Spotlite work/personal board is missing

Legacy evidence:

- Legacy Spotlite supports work/personal summaries, GLM refresh, templates, and
  personal PIN lock.
- Legacy endpoints include `/api/spotlite`, `/api/spotlite/glm-refresh`, and
  `/api/spotlite/templates`.

React state:

- No Spotlite component or route exists.

Impact:

- Daily/weekly attention routing disappears from the assistant-ui app.
- Personal/work boundary UI is not represented.

Required fix:

- Add `SpotliteBoard` under Mission Control / Command Center.
- Keep work and personal modes separate; preserve personal lock behavior.

### P1. Ingest / knowledge promotion is missing

Legacy evidence:

- Legacy Ingest has project hint, source text, digest generation, promotion
  candidate save, generated markdown output, and promotion status.
- Legacy Chat also supports assistant-message knowledge promotion.
- Legacy endpoints include `/api/llm/digest`, `/api/knowledge/promote`, and
  `/api/chat/evidence`.

React state:

- Chat message action bar only has copy and regenerate.
- No Ingest surface exists.
- No promotion workflow is available from assistant-ui.

Impact:

- The evidence-preserving wiki workflow loses its promotion gate.

Required fix:

- Add message-level `Promote to wiki` actions.
- Add `IngestWorkbench` under Wiki related or Command Center.

### P1. Chat parity is incomplete

Implemented in React:

- Streaming to `/api/chat/glm/stream`
- File upload via assistant-ui attachment adapter
- Chat project list/create/save/delete
- Global instructions
- Skill tag selection
- Wiki project link settings
- Existing project history display

Missing from legacy parity:

- Stop endpoint parity via `/api/chat/stop` is not directly wired; assistant-ui
  cancel may only cancel client runtime unless backend abort is confirmed.
- Project memory add/delete is absent.
- Message delete/retract is absent.
- Knowledge promotion from assistant messages is absent.
- Runtime settings for model/max tokens/context mode are absent.
- True keyboard `@` mention search is absent; the current `@스킬` button is
  decorative.
- Existing messages are shown as `ProjectHistory`, not fully hydrated into the
  assistant-ui thread runtime.

Required fix:

- Wire memories and message actions.
- Add native mention search in composer.
- Route cancel to backend stop when a GLM request is active.
- Hydrate historical messages into the assistant-ui thread model or make history
  an explicit collapsible transcript.

### P1. Mission Control is under-featured relative to legacy

React currently has:

- Command dashboard
- Project radar
- Selected project action/risk/evidence summary
- Automation status
- `refresh-global` and `rclone-copy dry-run`

Missing from legacy parity:

- Spotlite summary band
- Five-question mission answer fields as distinct live output
- Project brief modes such as CEO Brief, PM Action, Customer Follow-up, Risk
  Review
- Decision queue approve/hold shortcuts
- Core document status update actions
- GLM usage list
- LLM model/prompt policy panel and apply settings
- Project governance warnings
- Mission command input to chat/pipeline
- Open wiki hub action
- Full automation step/result/history detail

Required fix:

- Expand Mission into a multi-band cockpit instead of one dashboard card.
- Move Pipeline/Operations/Spotlite into the Command Center axis as sub-surfaces.

### P2. Workspace switching is missing in assistant-ui

Legacy evidence:

- Legacy shell has `wiki-space-select` for work/personal.

React state:

- assistant-ui reads `workspace` from URL but has no visible workspace switch.

Impact:

- Users can land in `rtm` but cannot intentionally switch to personal inside the
  new shell.

Required fix:

- Add a workspace switcher in the top product frame.
- Preserve the hard personal/work data boundary.

## Missing Endpoint Groups in assistant-ui

The React app currently does not consume the following already-used legacy
endpoint groups:

- Automation: stop, schedules, continue-after-collection, target-rclone-copy
- Drive/Slack pipeline: drive targets, instruction targets, Slack status,
  channels, collect
- Wiki/Evidence: search, search brief, graph, graph refresh, page read/write,
  status, management command/apply, project governance
- Paperclip: status, templates, tasks, trigger, task trigger
- Operations: status, settings, coverage, skills draft
- Spotlite: summary, GLM refresh, templates
- Knowledge promotion: digest, promote, chat evidence
- Documents/LLM policy: core documents, document status, llm usage, llm policy

## Recommended Migration Order

1. Routing correction and sub-surface shell
   - Keep top tabs: `채팅`, `위키 관련`, `Mission Control`.
   - Add sub-tabs inside `위키 관련`: `Decision Deck`, `Wiki Evidence`,
     `Paperclip`.
   - Add sub-tabs inside `Mission Control`: `Dashboard`, `Pipeline`,
     `Spotlite`, `Operations`.

2. P0 workflow restoration
   - Make `DecisionDeck` reachable.
   - Implement `WikiEvidenceConsole`.
   - Implement `PaperclipStudio`.
   - Implement `PipelineCockpit`.

3. P1 operational completeness
   - Implement `OperationsControlPlane`.
   - Implement `SpotliteBoard`.
   - Implement `IngestWorkbench` and message promotion.
   - Complete chat memory/history/message/runtime controls.

4. Hardening
   - Add browser click QA for each restored workflow.
   - Remove legacy DOM only after the React sub-surface reaches action parity.
   - Keep endpoint contracts stable during frontend migration.

## Acceptance Checklist

- `surface=decisions` opens a real Decision Deck, not the generic wiki page.
- Wiki related has functional Decision, Evidence, and Paperclip sections.
- Mission Control has functional Dashboard, Pipeline, Spotlite, and Operations
  sections.
- Chat has project link, memory, message actions, promotion, files, stop, model
  controls, and real skill mentions.
- All high-risk automation actions show dry-run/run/stop state clearly.
- No existing backend endpoint that had a legacy UI is left without a reachable
  assistant-ui entry point unless it is explicitly marked deprecated.
