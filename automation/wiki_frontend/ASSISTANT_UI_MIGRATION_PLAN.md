# assistant-ui Migration Plan

## Direction

The frontend is moving from a large vanilla `index.html` / `app.js` control plane toward a React island architecture powered by `@assistant-ui/react`.

This migration is not allowed to flatten operational pages into generic low-density cards. The page-by-page UX audit lives in `ASSISTANT_UI_SURFACE_UX_AUDIT.md` and is the acceptance baseline for future view work.

The migration rule is incremental but decisive:

- Keep the current wiki API server and existing operational endpoints stable.
- Replace high-interaction surfaces with assistant-ui/React islands first.
- Keep one feature/domain folder per migrated surface.
- Build each island into `automation/wiki_frontend/<island-name>/` so the existing static server can keep serving the app.
- Preserve the existing evidence, project, chat, and workspace data contracts until a deliberate API migration is needed.

Feature parity note:

- `ASSISTANT_UI_FRONTEND_GAP_AUDIT.md` is the current source of truth for
  frontend feature omissions.
- `../WIKI_OPS_SYSTEM_INTEGRITY_AUDIT.md` is the system-level source of truth
  for frontend/server/data ownership conflicts, duplicated capability
  definitions, missing value loops, and structural migration risks.
- A checked migration item can mean the React scaffold or first-pass surface
  exists; it does not imply full legacy workflow parity unless the gap audit
  marks it covered.

## Current State

Phase 1 is active.

- `assistant_ui_app/` is a Vite React app using `@assistant-ui/react`.
- The GLM chat main panel is visually replaced by `/assistant-ui/index.html` in an iframe.
- The assistant-ui island now owns a top-level app shell, surface ratios, density tokens, side context panels, message width rules, and composer hierarchy.
- `LocalRuntime` is connected to the existing `/api/chat/glm/stream` endpoint.
- The attachment adapter reuses `/api/chat/files`.
- Source is organized by domain under `src/domains/chat`.
- Production build outputs to `automation/wiki_frontend/assistant-ui/`.

## Architecture Rules

- Feature code lives under `src/domains/<domain>`.
- API adapters own network calls and stream parsing.
- Runtime adapters own assistant-ui integration concerns.
- Components only render UI and localized interactions.
- Shared constants use names that explain their behavioral relationship.
- Complex conditions are named before use.
- Different UI states become separate components when they meaningfully diverge.
- Hidden side effects are avoided: fetching, logging, persistence, and rendering stay in separate functions.

## Migration Sequence

## Execution TODO

### Now

- [x] Establish assistant-ui design tokens and top-level shell.
- [x] Migrate Chat Island streaming, attachments, project settings, and skill tag payload wiring.
- [ ] Restore Decision Deck as a reachable `surface=decisions` workflow with
  legacy action parity.
- [x] Migrate Mission Control as `surface=mission`.
- [x] Mount Mission Control island into the legacy `#mission` view and hide the old DOM after primary workflow parity.
- [x] Validate Mission Control static route in the running server.
- [x] Add page-by-page information density and UX audit.
- [ ] Repair Mission Control density against the UX audit.
- [ ] Repair Decision Deck context, compare/evidence actions, and audit bands
  against the UX audit.
- [ ] Complete GLM Chat frontend parity.

### Next

- [ ] Migrate Spotlite work board as `surface=spotlite-work`.
- [ ] Migrate Wiki/Evidence Console as `surface=wiki`.
- [ ] Migrate Pipeline automation cockpit as `surface=pipeline`.
- [ ] Migrate Paperclip Studio as `surface=paperclip`.
- [ ] Migrate Ingest and Operations surfaces.

### Hardening

- [x] Normalize Chat, Decision Deck, and Mission Control around shared surface components.
- [x] Show existing chat project history inside the React GLM chat surface.
- [x] Hide the legacy chat project rail when the assistant-ui chat island is mounted.
- [ ] Replace decorative skill buttons with full keyboard `@` mention search.
- [ ] Hydrate existing chat project message history into assistant-ui runtime.
- [ ] Bridge Decision Deck card context directly into assistant-ui chat threads.
- [ ] Remove hidden legacy DOM only after React islands own primary actions.
- [ ] Run browser click QA for chat send, file upload, Decision Deck resolve, Mission refresh, and pipeline trigger.

### Non-Chat View Migration Order

The assistant-ui design system is now the top-level visual and interaction baseline for every high-interaction view, not only chat.

Execution order:

1. Decision Deck: migrate conflict triage, queue rail, approval/hold actions, and in-card LLM directive.
2. Mission Control: migrate operational command center, project cards, five-question summary, and run controls.
3. Spotlite: migrate work/personal summary boards and GLM refresh controls.
4. Wiki and Evidence Console: migrate search, selected evidence, page preview, status edits, and management commands.
5. Pipeline and Paperclip Studio: migrate automation cockpit, Slack/Drive collection controls, Paperclip task queue, and approval gates.
6. Ingest and Operations: migrate digest/promotion flows, settings, schedules, and safety panels.

Rule:

- Each view becomes a React island first, served from the same `/assistant-ui/` bundle with a `surface` query param.
- Existing backend endpoints remain stable during view migration.
- Legacy DOM is hidden only after a React island reaches feature parity for the primary workflow.
- Dense operational layouts are preferred over marketing-style hero pages.

### Phase 1: Chat Island

Status: implemented.

Scope:

- Replace the legacy GLM chat panel with assistant-ui.
- Preserve existing project rail and workspace shell.
- Connect assistant-ui streaming to `/api/chat/glm/stream`.
- Connect assistant-ui attachments to `/api/chat/files`.

Completion checks:

- `npm run build` succeeds in `assistant_ui_app`.
- `/assistant-ui/index.html` is served by the current wiki API static server.
- Existing `/api/chat/projects` data remains untouched.

### Phase 1.5: assistant-ui Design System Baseline

Status: implemented.

Scope:

- Treat assistant-ui as the primary visual system instead of a nested chat widget.
- Add a top-level React shell around the thread with brand, context, and skill surfaces.
- Define CSS tokens for color, radius, shadow, density, message width, and responsive ratios.
- Rebuild the composer as a first-class command surface with attachment, skill, and wiki affordances.

Completion checks:

- `npx tsc --noEmit` succeeds in `assistant_ui_app`.
- `npm run build` succeeds and emits the static `/assistant-ui/` bundle.
- Desktop layout uses a 3-column decision workspace; tablet/mobile collapse without hiding the composer.

### Phase 2: Chat Project Rail

Status: in progress.

Scope:

- Move project list, project selection, and project settings into the React chat island.
- Replace iframe query-param reloads with internal state.
- Keep `/api/chat/projects`, `/api/chat/global`, and memory endpoints as the source of truth.

Implemented:

- React island loads `/api/chat/projects` and `/api/chat/global`.
- Left panel now lists scoped chat projects and supports project selection.
- React controls can create, save, and delete projects.
- Global instructions can be edited and saved inside the assistant-ui shell.

Completion checks:

- Creating, selecting, renaming, and deleting chat projects works inside the React island.
- Workspace separation remains `rtm` vs `personal`.
- Legacy chat controls are removed from the hidden vanilla panel.

### Phase 3: Skill Tags and Mentions

Status: in progress.

Scope:

- Implement assistant-ui native mention/tag UX for Paperclip and skill routing.
- Move skill catalog reads into `src/domains/chat/api`.
- Send selected skill tags through the existing `skillTags` payload.

Implemented:

- React island loads `/api/skills/catalog`.
- Skill tags can be selected from the assistant-ui context panel.
- Selected skill tags are shown in the composer and sent through `/api/chat/glm/stream`.

Completion checks:

- `@` mention search shows available Paperclip/skill tags.
- Selected tags are visible before send.
- GLM stream receives `skillTags` without changing backend semantics.

### Phase 4: Knowledge Promotion

Status: planned.

Scope:

- Move message actions such as copy, retry, delete, and knowledge promotion into assistant-ui action surfaces.
- Reuse `/api/chat/evidence` and `/api/knowledge/promote`.
- Keep promotion output visible as an explicit post-message result.

Completion checks:

- Assistant messages can be promoted without returning to the legacy DOM panel.
- Message deletion/retraction still calls the existing backend.
- Promotion failures are shown inline.

### Phase 5: Decision Deck Integration

Status: planned.

Scope:

- Move Decision Deck LLM directives into assistant-ui as a contextual launch path.
- Preserve current `Decision Deck -> GLM prompt` behavior.
- Add a structured card context part instead of plain prompt concatenation when the runtime supports it.

Completion checks:

- Current card context opens in assistant-ui chat.
- User directive is preserved.
- Workspace/project routing remains correct.

### Phase 6: Mission Control and Spotlite React Islands

Status: planned.

Scope:

- Migrate high-interaction Mission Control panels into React islands.
- Keep dense operational layout; avoid marketing-style hero patterns.
- Use assistant-ui only where conversational interaction is central.

Completion checks:

- Existing dashboard commands still hit current endpoints.
- Mission state, Spotlite summaries, and GLM refresh remain equivalent.
- Layout remains scan-friendly on desktop and mobile.

### Phase 6.1: Decision Deck React Island

Status: implemented.

Scope:

- Add `surface=decisions` route to the assistant-ui React bundle.
- Fetch `/api/decision-queue` directly from React.
- Render queue rail, large decision card, status metrics, LLM directive box, and inference output with the assistant-ui design tokens.
- Support approve, hold, investigate, refresh, previous/next, and in-card GLM inference.
- Mount the island into the existing `#decisions` view through `/assistant-ui/index.html?surface=decisions`.

Completion checks:

- `npx tsc --noEmit` succeeds in `assistant_ui_app`.
- `npm run build` succeeds and emits the updated `/assistant-ui/` bundle.
- `node --check automation/wiki_frontend/app.js` still succeeds.

### Phase 7: Full Shell Migration

Status: planned.

Scope:

- Replace the remaining vanilla navigation shell with a React app.
- Keep the Node static server unless API needs justify a larger server framework move.
- Retire unused legacy DOM, handlers, and CSS after each surface is migrated.

Completion checks:

- No active view depends on hidden legacy chat DOM.
- `app.js` is either reduced to non-React legacy islands or fully retired.
- Build artifacts are reproducible from package scripts.

## Verification Routine

Run these after each phase:

```bash
cd automation/wiki_frontend/assistant_ui_app
npm run build
```

Then verify the existing server path:

```bash
curl -I http://127.0.0.1:8787/assistant-ui/index.html
```

When changing legacy glue code:

```bash
node --check automation/wiki_frontend/app.js
```
