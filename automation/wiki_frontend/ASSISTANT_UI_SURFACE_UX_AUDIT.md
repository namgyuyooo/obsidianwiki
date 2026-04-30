# assistant-ui Surface UX Audit

## Purpose

The migration must not flatten operational screens into generic cards.

The correct direction is:

- Keep assistant-ui as the design system baseline.
- Preserve each page's native information density.
- Use progressive disclosure only when it improves scanning, not when it hides operational evidence.
- Separate summary, working queue, source detail, and action controls into stable regions.
- Avoid making every page look like the same three-column chat shell.

## Page-Level Analysis

### Mission Control

Page character:

- Executive and PM operating cockpit.
- Needs to answer "what should move today?" while still showing why.
- High information density is correct because it combines project status, risks, decisions, evidence, automation, and GLM usage.

Current migration issue:

- The React island over-compressed the original page into one project card plus five-question summary.
- Lost or underweighted Spotlite summary, workflow steps, bottom grids, GLM policy, governance warnings, and document/action queues.
- Good visual consistency, but weak operational fidelity.

Improvement direction:

- Use a multi-band cockpit, not a single-card dashboard.
- Top band: five operational questions plus live automation state.
- Middle band: project board with sortable/ranked cards and selected project detail.
- Right rail: automation commands, risk queue, decision queue, latest run progress.
- Bottom band: evidence queue, GLM usage/policy, governance warnings.
- Preserve raw counts and lists; do not reduce them to only three stats.

Design pattern:

- "Command cockpit": dense, multi-region, board-first.
- Summary is a navigation layer, not a replacement for detail.

### Decision Deck

Page character:

- Focused triage surface for one decision at a time.
- Lower information density than Mission Control is acceptable, but context must be close at hand.
- The core action is judgement: approve, hold, investigate, compare, ask LLM, then record.

Current migration issue:

- The card interaction is modern, but the old page had supporting context sections that are now too thin.
- Missing enough side-by-side evidence, recent decision history, compare modal affordance, and project context.

Improvement direction:

- Keep central large card.
- Add persistent evidence/context drawer below or beside the card.
- Add recent decisions and audit trail as a secondary band.
- Preserve compare workflow as a first-class action, not a hidden legacy modal.
- LLM directive should produce actionable next states, not just text.

Design pattern:

- "Review deck": focused card plus context drawer plus audit strip.
- It can be visually cleaner than Mission, but must not be context-poor.

### Chat

Page character:

- Conversational command surface.
- Needs modern assistant-ui affordances, but also project memory, skill tags, files, and knowledge promotion.
- Density should be medium: calm center, rich rails.

Current migration issue:

- The shell is visually strong, but skill tags and project settings are still panel-like rather than native composer-level interactions.
- Existing conversation history and knowledge promotion are not fully represented.
- Project rail/settings in the island are useful, but the UX still feels like controls around chat rather than integrated assistant workflow.

Improvement direction:

- Add true `@` mention search and selected tag chips inside the composer.
- Hydrate existing project messages into the thread.
- Move knowledge promotion into assistant message actions.
- Keep project/global settings in right rail, but make memory/history visible as concise expandable sections.
- Decision Deck card context should open directly as a structured chat task.

Design pattern:

- "Conversational workbench": calm chat center, rich composer, contextual rails.

### Spotlite

Page character:

- Lightweight daily/weekly digest and attention router.
- Should be easier and calmer than Mission Control.
- It should not become a full command center.

Current migration risk:

- If migrated with the same Mission shell, it will feel too heavy.
- If over-compressed, it will lose today's items, weekly items, risks, memos, projects, and GLM digest distinction.

Improvement direction:

- Use lanes: Today, Week, Risks, Memos, Priority Projects.
- GLM digest should sit as an interpretation layer above or beside raw lanes.
- Work and Personal Spotlite need different privacy/lock handling.
- Keep refresh controls visible but not dominant.

Design pattern:

- "Daily brief board": lane-based, readable, moderate density.

### Wiki / Evidence Console

Page character:

- Evidence retrieval, browsing, verification, and editing console.
- This is intentionally high-density.
- Search results, selected evidence, document preview, filters, page status, and management commands must coexist.

Current migration risk:

- A pretty card layout would be harmful if it hides filters or document content.
- This page needs more table/list/editor ergonomics than dashboard aesthetics.

Improvement direction:

- Keep three working zones: filter/navigation, result list, document preview/editor.
- Search brief should be optional and evidence-linked.
- Preserve filters for division, nature, status, project, tag, view mode, and sort.
- Make evidence selection and GLM summary traceable.
- Management command console should stay separate from normal browsing.

Design pattern:

- "Evidence IDE": dense, split-pane, keyboard-friendly, provenance-first.

### Pipeline

Page character:

- Automation cockpit for Slack/Drive collection and wiki ingestion.
- Needs step sequencing, execution safety, live logs, target analysis, and stop controls.
- High density is necessary because mistakes have operational cost.

Current migration risk:

- Reducing it to a few action cards would hide safety state and run logs.
- The page needs both guided flow and expert controls.

Improvement direction:

- Use a horizontal or vertical pipeline stepper with explicit state per step.
- Keep Slack routing, Drive target analysis, live rclone progress, and run history visible.
- Dangerous actions must be visually distinct and require clear state.
- Show dry-run vs real-run distinction everywhere.
- Surface "resume from local mirror" and collection window state.

Design pattern:

- "Automation cockpit": stepper plus live log plus safety rail.

### Paperclip Studio

Page character:

- Task factory and approval queue for skill-driven work.
- Needs templates, task composer, queue, events, result access, and approval gates.
- Medium-high density.

Current migration risk:

- Turning it into a simple form loses queue/event/result lifecycle.
- It must show what is queued, what is safe to run, and what was produced.

Improvement direction:

- Split into Template Library, Task Composer, Task Queue, Event/Result Log.
- Make safety labels and approval requirements visible.
- Results should have direct open/download/promote actions.
- Connect selected templates to Chat skill tags.

Design pattern:

- "Skill operations bench": library + composer + queue + event log.

### Ingest

Page character:

- Small but important promotion gate from raw notes into wiki candidates.
- Should be simple, but not too thin.
- Needs source text, project hint, digest result, promotion status, generated path, and next action.

Current migration risk:

- Over-designing it would slow quick capture.
- Under-designing it loses provenance and promotion trace.

Improvement direction:

- Keep two-pane write/review layout.
- Show generated Markdown path and promotion log.
- Add explicit promotion target choices.
- Support appendable dated update blocks.

Design pattern:

- "Capture and promote": fast input, visible output, provenance preserved.

### Operations

Page character:

- Settings, schedules, environment, model policies, Slack/GLM/Paperclip/rclone configuration.
- Highest form density in the app.
- It is not a dashboard; it is an admin console.

Current migration risk:

- Generic cards would make settings harder to scan and compare.
- Need grouping, validation, and change safety more than visual simplification.

Improvement direction:

- Group settings by domain: Drive/rclone, GLM models, Decision/Conflict models, Paperclip, Slack, Personal lock, safety.
- Use sticky save/status bar and dirty-state tracking.
- Keep schedules and skill catalog outside raw env settings.
- Add validation hints and "locked" labels for dangerous settings.

Design pattern:

- "Admin control plane": dense grouped forms, predictable save behavior.

## Cross-Page Design Rules

### Density Rules

- Mission, Wiki, Pipeline, Operations: high density.
- Paperclip: medium-high density.
- Chat, Decision Deck, Spotlite, Ingest: medium density.
- No migrated page should drop source lists, logs, queue state, or filters simply to look cleaner.

### Layout Rules

- Use shared surface components for consistency, but vary page composition.
- The standard shell can be adapted into bands, panes, lanes, or boards.
- Summary cards must never replace operational lists.
- A page can be beautiful and still dense.

### Information Hierarchy

Every page should explicitly decide which layers it owns:

1. Orientation: what is this page for?
2. Summary: what changed or needs attention?
3. Working set: what items can I act on now?
4. Source detail: what evidence/log/config supports it?
5. Actions: what can I safely do?
6. Audit/result: what happened after I acted?

### Migration Acceptance Criteria

Before a legacy view is hidden, the React island must preserve:

- Primary actions.
- Item counts.
- Filters/search controls.
- Live statuses.
- Queues/lists/logs.
- Source paths or provenance.
- Error and pending states.
- Enough detail to make the same operational decision as before.

## Revised Execution Priority

1. Repair Mission Control density before moving further.
2. Repair Decision Deck context and audit bands.
3. Complete Chat composer-native skills/history/promotion.
4. Migrate Spotlite with lane-based daily brief layout.
5. Migrate Wiki as evidence IDE, not dashboard.
6. Migrate Pipeline as automation cockpit.
7. Migrate Paperclip as skill operations bench.
8. Migrate Ingest as capture/promote gate.
9. Migrate Operations as dense admin control plane.
