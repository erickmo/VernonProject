# Todo Context Menu (right-click / long-press) — Design

Date: 2026-07-19
Status: Approved for planning

## Goal

Add a context menu to todo rows, opened by **right-click on web** and **long-press on
mobile**, exposing quick actions grouped by the three entities a todo belongs to:
Project Group, Project Detail, and the Todo itself. No new backend; every action reuses an
existing flow.

## Menu structure

Platform-native submenus:

- **Web** — anchored popover at the cursor. Three top-level rows, each flying out a submenu
  on hover/focus.
- **Mobile** — one bottom action-sheet with three labeled sections; every action is a direct
  tap (no drilling into sub-sheets).

Groups and actions:

| Group | Actions |
|---|---|
| Project Group | Open · Edit · Add Meeting |
| Project Detail | Open · Edit |
| Todo | Open · Edit · Focus · Add focus note · Add/Remove from Today · Duplicate |

Excluded (declined by user): Advance status, Reject.

## Action wiring

Everything reuses existing routes, providers, overlays, and mutations.

| Action | Implementation |
|---|---|
| Group → Open | `navigate('/project/:project')` |
| Group → Edit | `navigate('/project/:project?edit=1')` |
| Group → Add Meeting | mount `CreateMeetingSheet` (mobile) / `CreateMeetingDialog` (web), prop `project={todo.project}` |
| Detail → Open | `navigate('/project-detail/:project_detail')` |
| Detail → Edit | `navigate('/project/:project?editDetail=:project_detail')` (project page owns the detail-edit form on both platforms) |
| Todo → Open | `navigate('/project-item/:name')` |
| Todo → Edit | `navigate('/project-item/:name?edit=1')` |
| Todo → Focus | mirror `useFocusPill.onFocusPill`: if not active → `focus.start(name, to_do, estimated, …)` + open overlay when fullscreen; if active+fullscreen → `openFocusOverlay(name)` |
| Todo → Add focus note | mount `FocusNoteSheet` (mobile) / `FocusNoteDialog` (web), props `{todoId: name, title: to_do}` |
| Todo → Add/Remove from Today | the card's existing today-allocation mutation (`useSetTodoAllocations` + `buildNext`) |
| Todo → Duplicate | `navigate('/project-item/:name?duplicate=1')` |

### Deep-link edit intent

Edit and Duplicate open forms that today live as **page-local state** and cannot be mounted
from a globally-rendered menu. So they navigate to the entity's page carrying a query-param
intent; the destination page reads it on mount, opens its existing form, then clears the param
(so a refresh/back doesn't re-trigger).

Pages that must read an intent param:

| Param | Page(s) | Existing form opened |
|---|---|---|
| `?edit=1` on `/project/:name` | mobile `ProjectScreen`, web `Project` | `ProjectFormSheet` / `ProjectFormDialog` |
| `?editDetail=:detail` on `/project/:name` | mobile `ProjectScreen`, web `Project` | `ProjectDetailEditSheet` / `ProjectDetailFormDialog` |
| `?edit=1` on `/project-item/:name` | mobile `ProjectItemScreen`, web `ProjectItem` | inline `EditForm` |
| `?duplicate=1` on `/project-item/:name` | mobile `ProjectItemScreen`, web `ProjectItem` | `CreateProjectItemSheet` (duplicate/follow-up flow) |

Each page: `useSearchParams` → `useEffect` opens the form when the param is present, then
`setSearchParams({}, { replace: true })` to strip it.

## Architecture

Mirrors two patterns already in the codebase:
1. `AdvanceProvider` / `RejectProvider` — a provider mounted once that owns a confirm overlay and
   exposes a hook the cards call.
2. Focus overlays — a shared contract (`focusUI.ts`) with per-frontend UI implementations.

### Shared context (in `frontend/src`, resolved by both frontends via `@`)

- `TodoContextMenuContext` + `useTodoContextMenu()` returning `open(todo, event)`.
- Lives in shared `frontend/src` so the **shared `TodoCard`** imports a single hook that works in
  both builds. The menu *UI* is platform-specific, but the *contract* is shared.

### Per-platform provider implementations

- **Mobile** (`frontend/src`): renders the bottom action-sheet (existing `fixed inset-0` sheet
  markup). Owns `CreateMeetingSheet` + `FocusNoteSheet` it can open. Mounted once in
  `frontend/src/App.tsx` beside the other providers.
- **Web** (`frontend-web/src`): renders the cursor-anchored popover with hover fly-out submenus
  (reuse `Popover` for positioning + outside/Esc close). Owns `CreateMeetingDialog` +
  `FocusNoteDialog`. Mounted once in `frontend-web/src/App.tsx`.

Both provide the same `TodoContextMenuContext`, so `useTodoContextMenu()` resolves to whichever
provider is mounted.

### Triggers

- **Shared `TodoCard`** (`frontend/src/components/TodoCard.tsx`): the root `<button>` gains
  `onContextMenu` (web) and long-press pointer handlers (mobile) → `open(todo, e)`.
  - Web: `onContextMenu` calls `preventDefault()` then `open`.
  - Mobile: pointer-timer at `LONG_MS = 450` (same as `Fab.tsx`). A `longFired` ref suppresses the
    card's `onClick` navigate when the long-press fires. Cancel the timer on pointer-move beyond a
    small threshold so horizontal swipe (SwipeProjectLists) and vertical scroll are unaffected, and
    on `pointerleave` / `pointercancel`.
- **Web `todoTable` rows** (`frontend-web/src/lib/todoTable.tsx`): same `onContextMenu` → `open(row, e)`.

### Menu target

The menu is built from the todo/row object. Required fields:

- Always: `name`, `to_do`, `project`, `project_name`, `project_detail`, `project_detail_title`.
- For Focus and Today toggle: `estimated`, `allocations`, `today_allocation`.

`TodoCard` passes a full `ProjectItem` — all fields present. **First implementation step:** confirm
the `todoTable` row type carries these fields. For any field a table row lacks, that action falls
back to a deep-link (e.g. Today toggle → `navigate('/project-item/:name')`) rather than acting in
place. Focus-note and the navigation actions need only always-present fields, so they work
everywhere regardless.

## Edge cases & interaction

- Long-press must not fight swipe/scroll: cancel on movement threshold (reuse `Fab` guard shape).
- Suppress the native browser context menu on web (`preventDefault`).
- Closing: outside-click / Esc (web `Popover` already does this); mobile sheet backdrop tap.
- A menu opened from a card that then unmounts (list refetch) must not leave the meeting/focus-note
  overlay orphaned — those overlays live in the **provider**, not the card, so they persist
  independently of the triggering row. This is the reason for the provider architecture.
- Only one menu open at a time (provider holds single `open` target state).

## Testing

Live site, code-first (no test DB) — defer automated tests to a final phase per project
convention. Manual verification per platform: right-click a card on /w (Home, Review, project
table), long-press a card on /m (Today, Review, project lists); exercise each action; confirm
deep-link intents open the right form and strip the query param.

## Out of scope

- No new DocType or endpoint (so no `gen_docs.py` run).
- Advance / Reject actions.
- Meeting linkage to Detail or Todo (meetings tie to Project only, unchanged).

## Shipping

User-visible on both frontends → after it ships (bundles rebuilt + live), add an **App Release**
"What's New" row (Bahasa, both platforms) per project convention.
