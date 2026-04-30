# assistant-ui Migration Plan

## Direction

The frontend is moving from a large vanilla `index.html` / `app.js` control plane toward a React island architecture powered by `@assistant-ui/react`.

The migration rule is incremental but decisive:

- Keep the current wiki API server and existing operational endpoints stable.
- Replace high-interaction surfaces with assistant-ui/React islands first.
- Keep one feature/domain folder per migrated surface.
- Build each island into `automation/wiki_frontend/<island-name>/` so the existing static server can keep serving the app.
- Preserve the existing evidence, project, chat, and workspace data contracts until a deliberate API migration is needed.

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

Status: next.

Scope:

- Move project list, project selection, and project settings into the React chat island.
- Replace iframe query-param reloads with internal state.
- Keep `/api/chat/projects`, `/api/chat/global`, and memory endpoints as the source of truth.

Completion checks:

- Creating, selecting, renaming, and deleting chat projects works inside the React island.
- Workspace separation remains `rtm` vs `personal`.
- Legacy chat controls are removed from the hidden vanilla panel.

### Phase 3: Skill Tags and Mentions

Status: planned.

Scope:

- Implement assistant-ui native mention/tag UX for Paperclip and skill routing.
- Move skill catalog reads into `src/domains/chat/api`.
- Send selected skill tags through the existing `skillTags` payload.

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
