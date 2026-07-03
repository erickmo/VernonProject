# Multiple Focus Timers — Design

**Date:** 2026-07-03
**Status:** Approved

## Problem

The focus feature backs a single, app-wide timer. Its shared store holds one
`FocusTimer | null` (localStorage `vernon.focusTimer`). Starting Focus on a
second task overwrites the first — you can only focus one task at a time.

Goal: allow several tasks to each run their own focus timer concurrently, on
both frontends (mobile `/m` and web `/w`), and surface all running timers in a
global UI. Additionally, a focused task should float to the top of the Home
plan list.

## Decisions (locked with user)

1. **Concurrent per-task timers** — each task you hit Focus on keeps its own
   independent running timer; several run at once. (Not a single multi-task
   session, not a multi-select combined block.)
2. **Mobile mini-bar = primary pill + count** — one pill (overdue-first, else
   most-recently-started) with a `+N` badge that expands a list; each row opens
   that task's overlay and has its own stop.
3. **Web gets a global surface too** — parity with mobile via a docked focus
   dock + a global overlay.
4. **Focused-first ordering** in the Home plan list only.

## Architecture

Both frontends share `frontend/src` via the `@` alias (hooks, `lib`, types).
The focus store and overlay open-state store live there and serve both. The web
UI (`@web`) is separate. Web's `FocusOverlay` is presentational (props-driven);
mobile's is store-driven.

### Shared core (`frontend/src`)

**`hooks/useFocusTimer.ts`** — the keystone.
- Internal state flips from `FocusTimer | null` to `FocusTimer[]`. Same
  localStorage key `vernon.focusTimer`.
- `FocusTimer` gains `meta?: FocusMeta` — task detail (project / deadline /
  estimate / group) now travels with the timer. This is the single source of
  truth for overlay meta, survives reload, and lets any surface (mini-bar,
  dock) reopen a task's overlay without re-supplying meta.
- `load()` migrates the legacy single-object shape: if the parsed value is one
  timer object (has `taskId`), wrap it in `[obj]`; if already an array, keep.
  So a live user mid-timer does not lose it on deploy.
- Mutators are id-scoped: `start(id, title, estMin, meta?)` pushes a new running
  timer (no-op if `id` already present); `pause(id)` / `resume(id)` /
  `reset(id)` / `stop(id)` operate on the one timer, `stop` removes it.
- `deriveFocus(t, now)` helper extracts the existing elapsed/remaining/fraction/
  hasEstimate math (shared by both hooks).
- **Hooks:**
  - `useFocusTimer(taskId)` — **scoped.** Returns the exact same shape as today
    (`{ timer, elapsedMs, remainingMs, fraction, hasEstimate, start, pause,
    resume, reset, stop }`) but bound to that one task; `timer` is that task's
    timer or `null`; no-arg controls act on `taskId`. Ticks 1×/s only while that
    timer runs. Single-task callers add the id arg — the rest of their code is
    unchanged.
  - `useFocusTimers()` — **global.** Returns `{ timers, stop }` where `timers`
    is every timer enriched with derived values, sorted overdue-first then
    most-recently-started. Ticks 1×/s while any timer runs. For the mini-bar /
    dock.
  - `useFocusedTaskIds()` — returns a `Set<string>` of running-timer taskIds,
    **membership-only** (subscribes to store mutations, NOT the 1s tick), so the
    Home plan list re-sorts on start/stop but does not re-render every second.

**`lib/focusUI.ts`** (shared) — overlay open-state.
- State becomes `{ open: boolean; taskId?: string }` (meta drops off — now on
  the timer). `openFocusOverlay(taskId)`, `closeFocusOverlay()`,
  `useFocusOverlay()`. One store drives BOTH overlays; whichever frontend is
  mounted renders its own overlay component off it.
- `FocusMeta` type stays exported here (imported by the timer store and both
  overlays).

**`lib/planDay.ts`** — add `focusedFirst(list, ids)`: stable partition that
moves focused items to the front while preserving each group's existing order.

### Mobile (`@ = frontend/src`)

- **`components/FocusMiniBar.tsx`** — rewrite to primary pill + `+N` badge.
  Uses `useFocusTimers()`. Local `expanded` state reveals a compact list above
  the pill (each row: title, time, tap→`openFocusOverlay(id)`, stop). One timer
  → visually identical to today.
- **`components/FocusOverlay.tsx`** — reads `taskId` from `useFocusOverlay()`,
  gets that timer via `useFocusTimer(activeTaskId)`, reads meta from
  `timer.meta`. Otherwise unchanged (presentational body identical).
- **`components/Fab.tsx`** — `focusing = useFocusTimers().timers.length > 0`.
- **`components/TodoCard.tsx`** — `useFocusTimer(todo.name)`; `start` now passes
  the meta object; Focus button logic otherwise unchanged.
- **`pages/ProjectItemScreen.tsx`** — `useFocusTimer(data.name)`;
  `openFocusOverlay(data.name)`; `start` passes meta.
- **`pages/Today.tsx`** — `useFocusedTaskIds()`, wrap `planGroups.today` in
  `focusedFirst`.

### Web (`@web = frontend-web/src`)

- **`components/FocusDock.tsx`** (new) — floating bottom-right pill
  `[⏱ N focusing ▾]`; click toggles a dropdown of all timers (each: title, time,
  open→`openFocusOverlay(id)`, stop). Uses `useFocusTimers()`. Web design tokens
  (canvas/surface/ink/muted/line/hover). Hidden when no timers.
- **`components/FocusHost.tsx`** (new) — reads shared `focusUI` +
  `useFocusTimer(activeTaskId)` + `timer.meta`, feeds the existing props-driven
  `FocusOverlay`. The single global web overlay.
- **`components/AppShell.tsx`** — mount `<FocusDock />` and `<FocusHost />`
  alongside CommandPalette / QuickCreate.
- **`pages/ProjectItem.tsx`** — `useFocusTimer(data.name)`; Focus button calls
  `openFocusOverlay(data.name)`; drop local `focusOpen` state and inline
  `<FocusOverlay>` (FocusHost renders it now). Live time display on the button
  stays (scoped hook).
- **`components/FocusOverlay.tsx`** — import `FocusMeta` from `@/lib/focusUI`
  instead of the local duplicate. No behavior change.
- **`pages/Home.tsx`** — `useFocusedTaskIds()`, wrap `planned` in `focusedFirst`
  (default order; column-sort in the DataTable still overrides).

## Data flow

Start focus (either frontend) → `start(id, title, est, meta)` pushes to the
array store → localStorage + all subscribers notified. Mini-bar / dock render
from `useFocusTimers()`. Tap a timer → `openFocusOverlay(id)` sets shared
`focusUI` → the mounted overlay (mobile store-driven / web FocusHost) renders
that task via `useFocusTimer(id)` + `timer.meta`. Stop → `stop(id)` removes it;
if it was the open overlay, close. Home plan list reads `useFocusedTaskIds()`
and sorts focused-first.

## Edge cases

- **Legacy migration:** old single-object localStorage value wrapped to array on
  load; malformed entries filtered.
- **Double overlay:** unified on one shared `focusUI` store → only one overlay
  open at a time, per frontend.
- **Perf:** Home plan list uses membership-only `useFocusedTaskIds()` (no 1s
  churn). Mini-bar/dock accept the 1s tick (few pills).
- **No estimate:** stopwatch mode per timer, unchanged.
- **Storage unavailable:** store stays in-memory (existing try/catch).

## Testing

Live site, no test DB — defer heavy tests. One runnable self-check on the pure
store helpers: legacy→array migration, `deriveFocus`, and `focusedFirst`
partition (assert-based, no framework).

## Out of scope

- No backend involvement (focus is client-only, as today).
- No multi-task "session" model; no multi-select combined block.
- Focused-first ordering limited to the Home plan/planned list.
