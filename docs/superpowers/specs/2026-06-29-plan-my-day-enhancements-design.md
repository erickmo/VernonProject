# Plan-my-day enhancements — design

Date: 2026-06-29
Status: approved-pending-review

## Goal

Three groups of UX changes around daily planning, on **both** the mobile
(`frontend/`) and web (`frontend-web/`) apps:

1. **Plan-my-day drawer** — edit minutes via a "use estimate" button and a
   manual number input; float todos that already have planned minutes to the
   top; add an in-drawer search box.
2. **Todo card** — a one-tap toggle to add/remove the todo from today's plan.
3. **Homepage** — a "Today's plan" list (planned todos, fewest-minutes-first)
   placed under the plan banner, with the existing deadline lists kept
   prominent.

## Constraints / context

- **Frontend-only. No backend or doctype changes.** Everything keys off the
  existing model:
  - "Today's plan" = `Project Todo Allocation` rows with
    `allocation_date == today`, surfaced per todo as `today_allocation`
    (minutes) on the `ProjectItem` shape.
  - Writes go through the existing assignee-only endpoint
    `set_todo_allocations(project_item, allocations)` (free-form — the personal
    plan is **not** sum-to-estimate enforced).
  - "Use estimate" reads `todo.estimated` (Int minutes on `Project Todo`).
- `frontend-web/` re-uses `frontend/src` via the `@` alias, so `TodoCard`, the
  new shared hook, and `lib/format` are single shared files; web-only UI lives
  under `@web`.
- Repo: `/home/frappe/frappe-bench/apps/vernon_project` (branch `main`). The
  current shell CWD `/home/frappe/ui` is an unrelated app — all work happens in
  the vernon_project repo.

## Current state (what exists)

- `frontend/src/components/PlanDaySheet.tsx` — mobile bottom-sheet. Per-candidate
  `−15 / value / +15` steppers + `15/30/60` chips. Seeds `mins` from
  `today_allocation`. `onSave` writes today's row per touched todo, preserving
  other-day rows, via `mobileApi.setTodoAllocations`. **No** search, **no**
  sort, **no** estimate/manual edit. Renders candidates in received order.
- `frontend/src/pages/Today.tsx` — mobile homepage. `planCandidates` (memo,
  lines ~204-212) = `due_today` ∪ `overdue` ∪ (allocated `upcoming`), unsorted.
  `plannedTodayMin` = Σ `today_allocation`. Deadline group switcher
  (Today/Overdue/Upcoming) sorted by deadline. "Plan my day" banner at ~435-451
  opens the sheet.
- `frontend-web/src/pages/Today.tsx` — web homepage (Bento). Deadline groups as
  three `BentoTile`s. **No** plan drawer, **no** today-plan list.
- `frontend/src/components/TodoCard.tsx` — shared card. Focus pill + conditional
  advance button. Shows estimate and a read-only `today_allocation` pill. **No**
  plan button.
- `set_todo_allocations` (`api/mobile.py` ~1621-1656) — assignee-only; rewrites
  the `Project Todo Allocation` child table; no sum enforcement.

## Design

### A. Shared hook — `frontend/src/hooks/usePlanDay.ts` (new)

Holds all planning state + the subtle save semantics so the mobile sheet and the
new web drawer behave identically.

```ts
usePlanDay(candidates: ProjectItem[]) => {
  mins: Record<string, number>          // seeded from today_allocation || 0
  setMin(id, v): void                   // clamps Math.max(0, v)
  useEstimate(t): void                  // setMin(t.name, t.estimated || 30)
  query: string; setQuery(q): void
  visible: ProjectItem[]                // filtered by query, planned-on-top
  total: number                         // Σ mins
  saving: boolean
  save(): Promise<void>                 // writes touched todos, invalidates, toasts
}
```

Three **pure** helpers exported from the same module (so they are unit-testable
without React):

- `filterCandidates(candidates, query)` — case-insensitive substring match on
  `to_do` + `project_name`; empty query → all.
- `sortForPlanning(candidates, mins)` — todos with `mins[name] > 0` first,
  ordered by minutes descending; unplanned after, original order preserved
  (stable). `visible = sortForPlanning(filterCandidates(...), mins)`.
- `touchedDiff(candidates, mins)` — candidates where
  `(mins[name] || 0) !== (today_allocation || 0)`.
- `buildNext(allocations, today, minutes)` — `[...allocations.filter(a => a.date
  !== today), ...(minutes > 0 ? [{date: today, minutes}] : [])]`.

`save()` = for each `touchedDiff` todo, `setTodoAllocations(name,
buildNext(...))` in parallel (`Promise.all`), then invalidate `keys.dashboard` +
`keys.projectItem(name)`, toast success/error. Lifted verbatim from the current
`PlanDaySheet.onSave`.

### B. Plan-my-day drawer

**Mobile** `PlanDaySheet.tsx` — refactor to consume `usePlanDay(todos)`. Keep
the bottom-sheet shell (drag/slide, progress bar fed by `total`, footer Save).
Render `visible` instead of `todos`. Per row, alongside the existing
`−15 / +15` and `15/30/60` chips:
- the minutes value becomes a tap-to-edit `<input type="number">` bound to
  `setMin` (clamps ≥ 0);
- a small **"Use est."** button → `useEstimate(t)`.
Add a **search `<input>`** at the top of the scroll body bound to `query`.

**Web** `frontend-web/src/components/PlanDayDrawer.tsx` (new) — wraps the
existing web `Drawer` primitive (`open / onClose / title="Plan my day" /
footer=<Save> / onSubmit=save`). Body = search box + progress bar + the same row
controls. Consumes `usePlanDay(candidates)`. Mounted from web `Today.tsx`;
candidates computed with the **same rule as mobile** `planCandidates`
(`due_today` ∪ `overdue` ∪ allocated `upcoming`).

### C. Todo-card plan toggle — `TodoCard.tsx`

A new small button in the metadata row, gated on `!showAssignee` (own lists
only — you can only allocate your own todos; review/team cards unchanged):

- `today_allocation === 0` → **"+ Today"**; one tap sets today's allocation to
  `todo.estimated || 30`.
- `today_allocation > 0` → **"✓ Today"**; one tap removes today's row.

Uses the existing `useSetTodoAllocations(todo.name)` hook (correct
invalidation), with `buildNext(todo.allocations ?? [], todayISO(), minutes)`
(import `buildNext` from the shared hook module, or inline — same one-liner).
`stopPropagation` so it doesn't trigger card navigation. Disabled while pending.
The existing read-only `today_allocation` pill stays as the info display.

### D. Homepage — "Today's plan" list

Planned todos = my todos with `today_allocation > 0`, sorted **fewest-minutes
-first** via a new `byAllocationAsc` helper in `lib/format.ts`
(mirrors `byEstimatedAsc`).

- **Mobile** `Today.tsx`: build `plannedTodos` from `[...overdue, ...due_today,
  ...upcoming].filter(t => t.today_allocation > 0).sort(byAllocationAsc)`.
  Render a labeled section **directly under the "Plan my day" banner**:
  heading `Today's plan · {count} · {formatEstimate(plannedTodayMin)}`, then the
  `TodoCard`s. The existing deadline group switcher stays where it is and keeps
  its prominence (deadlines remain the primary navigation).
- **Web** `Today.tsx`: a `BentoTile` (`span="wide"`/`full`) titled
  `Today's plan · {count} · {total}` with a **"Plan my day"** button in the tile
  header that opens `PlanDayDrawer`, listing the same `plannedTodos`. The three
  deadline tiles keep their current position/prominence.

```
MOBILE  Today.tsx ("For me" lens)        WEB  Today.tsx (Bento)
┌──────────────────────────────┐         ┌─────────┬─────────┬──────────┐
│ [Plan my day]  2:30 planned ▸│         │ stats…  │ stats…  │ stats…   │
├──────────────────────────────┤         ├─────────┴─────────┴──────────┤
│ ☀ Today's plan · 3 · 2:30    │         │ ☀ Today's plan · 3 · 2:30    │
│   TodoCard  TodoCard …       │         │   [Plan my day]  TodoCards…  │
├──────────────────────────────┤         ├──────────┬─────────┬─────────┤
│ Deadlines [Today][Overdue][↑]│         │ Overdue  │ Today   │ Upcoming│
│   TodoCard  TodoCard …       │         │ cards…   │ cards…  │ cards…  │
└──────────────────────────────┘         └──────────┴─────────┴─────────┘
```

## Error handling / edge cases

- Minutes clamp to `≥ 0`; free-form (no sum-to-estimate cap — matches backend).
- Estimate of 0 → fallback `30m` (matches the existing "split to today" default).
- Empty search → all candidates. No planned todos → existing EmptyState / the
  homepage section is hidden when count is 0.
- Save/toggle failures → toast error (existing pattern); on success invalidate
  `dashboard` + `projectItem` queries so all surfaces refresh.

## Testing

One unit test (vitest, if configured — confirm in the plan) over the pure
helpers in `usePlanDay.ts`: `sortForPlanning` (planned-on-top, fewest-first via
`byAllocationAsc` is separately checked), `touchedDiff`, and `buildNext`
(preserves other-day rows, drops today's row at 0 minutes). If no runner exists,
ship an `assert`-based self-check module. The React components and homepage
layout are verified by running the app.

## Files

- **New:** `frontend/src/hooks/usePlanDay.ts`,
  `frontend-web/src/components/PlanDayDrawer.tsx`
- **Edit:** `frontend/src/components/PlanDaySheet.tsx`,
  `frontend/src/components/TodoCard.tsx`, `frontend/src/lib/format.ts`
  (`byAllocationAsc`), `frontend/src/pages/Today.tsx`,
  `frontend-web/src/pages/Today.tsx`
- **Backend:** none.

## Out of scope

- Leader "assigned allocation" (`set_assigned_allocation`) — untouched.
- Multi-day allocation editing (`AllocationCard` on the detail screen) —
  untouched.
- Scoring / points — planning is not scored.
