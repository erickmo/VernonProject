# Plan page: per-project lazy load + aggregate week strip

**Date:** 2026-08-19
**Status:** Design approved (pending spec review)
**Both frontends:** `frontend/` (/m) and `frontend-web/` (/w) — ships to both.

## Problem

The Plan page (`/m/plan`, `/w/plan`) fetches the user's entire open todo pool in one
`get_calendar` call, then filters client-side. After earlier fixes (date memoization,
`open_only`, `mine`) a System Manager still pulls ~739 todos / ~1 MB because the page's
default "By project" week board and "add from any project" picker are cross-project by
design. Payload and client render scale with how many todos you own, not with what you
are actually looking at.

## Goal

Load **one project's** todos at a time. Keep the week strip **global** (true daily
capacity across all your projects) but drive it from a tiny aggregate instead of the
full pool. Payload becomes independent of account size: one project's todos (tens) + 7
numbers.

## Decisions (locked with user)

1. **Whole page is per-project.** Pick a project → the three view modes (By date / By
   project board / Peta) all operate on that one project. No cross-project default view,
   no "add from any project" picker.
2. **Week strip stays global.** It sums *my* capacity across ALL projects per date, even
   though the lists below show only the picked project. Capacity planning is the point.
3. **Optimistic strip updates.** Editing an allocation patches the strip in place
   (`strip[oldDay] -= old; strip[newDay] += new`) — no refetch mid-edit. Save / board
   drag invalidates the aggregate (7 numbers) to reconcile.
4. **Default project = last-used** (localStorage), falling back to most-recently-modified
   project the user leads/owns/is assigned to.

## What is NOT lost

- Cross-project "what's due today" already lives on the **home/dashboard**
  (`get_dashboard` due_today/overdue/upcoming buckets). The plan page dropping its
  cross-project day list orphans nothing; the strip still shows global load.
- Peta already fetches its own `get_project_blueprint` scoped to one project — unchanged.

## Architecture

### Backend (`vernon_project/api/mobile.py`)

**1. `get_calendar(open_only=0, mine=0, project=None)`** — add optional `project`.
When set: permission-check (`project in _visible_projects()`, else throw), then fetch
only that project's todos via the existing `_fetch_todos([project], statuses=…)` path.
All existing shaping (`_shape_todo`, alloc maps, name maps) is reused unchanged. `mine`
is ignored when `project` is set (you picked the project; the client scope toggle filters
within it, same as today).

**2. `get_plan_week_load(from_date, to_date)`** (new, whitelisted) →
`{"YYYY-MM-DD": total_minutes}`.

```sql
SELECT a.allocation_date AS d, SUM(a.estimated_minutes) AS m
FROM `tabProject Todo Allocation` a
JOIN `tabProject Todo` t   ON a.parent = t.name
JOIN `tabProject Detail` pd ON t.project_detail = pd.name
JOIN `tabProject` p        ON pd.project = p.name
WHERE t.status IN (Planned, Done, Checked)          -- open only
  AND a.allocation_date BETWEEN %(from)s AND %(to)s
  AND (t.assigned_to = %(me)s OR p.project_leader = %(me)s OR p.project_owner = %(me)s)
GROUP BY a.allocation_date
```

Range-capped ≤ 45 days (mirror `get_daily_targets`). Returns a handful of rows. This is
`weekLoad()` (planDay.ts:34, `Σ allocMinutes` per date over the mine pool) reproduced in
SQL — the self-check asserts equality.

### Frontend

Shared logic in `frontend/src` (imported as `@` by web); presentation per frontend.

- **Project picker:** `SearchableSelect` at the top of both Plan screens. Options from
  the existing cached `useProjects()` (project cards, not todos), narrowed to projects the
  user leads/owns/is assigned to. Selection persisted to `localStorage` (`plan:lastProject`).
- **`usePlanProject(project)`** (new hook, `@/hooks/useData`) →
  `mobileApi.calendar(true, false, project)`; query key `['calendar','project', project]`.
  Replaces `usePlanPool()` in `Plan.tsx` and `PlanScreen.tsx`.
- **`usePlanWeekLoad(from, to)`** (new hook) → `get_plan_week_load`; query key
  `['plan-week-load', from, to]`. Drives the strip globally; independent of picked project.
- **`api.ts`:** extend `calendar(openOnly, mine, project?)`; add
  `planWeekLoad(from, to)`.
- **`usePlanDate` (`@/hooks/usePlanDay`):** on edit, in addition to updating local `mins`,
  patch the week-load cache via `queryClient.setQueryData(['plan-week-load',…], patch)`
  applying the per-todo delta to old/new day. On `save()` success (and on board drag in
  `PlanProjectBoard`), invalidate `['plan-week-load']` and `['calendar','project',project]`.

### Data flow

```
mount
  ├─ useProjects()            (cached; picker options)
  ├─ resolve default project  (localStorage → most-recent)
  ├─ usePlanWeekLoad(wk0,wk6) (7 numbers, global)     ─┐ strip
  └─ usePlanProject(project)  (one project's todos)   ─┘ lists/board/peta

edit allocation (by-date editor)
  ├─ usePlanDate.setMin(...)          → local mins (selected day)
  └─ patch ['plan-week-load']         → strip[old]-=Δ, strip[new]+=Δ  (instant)

save()  /  board drag
  ├─ write allocations (setTodoAllocations)
  ├─ invalidate ['plan-week-load']         (refetch 7 numbers, reconcile)
  └─ invalidate ['calendar','project',P]   (refetch one project)
```

## Error handling

- `get_plan_week_load`: range guard (throw if `to < from` or span > 45), same as
  `get_daily_targets`. Aggregate is scoped to the caller (mine union) — no cross-user leak.
- `get_calendar(project=…)`: throws `PermissionError` if the project is not visible to
  the caller.
- Optimistic patch is best-effort; the invalidate-on-save refetch is the source of truth,
  so a wrong optimistic delta self-corrects on the next save. On save error the existing
  toast fires and the refetch restores the true strip.

## Testing

- **Self-check (Python, live console):** for a heavy user, assert
  `get_plan_week_load(wk0,wk6)[d] == Σ allocations on d from get_calendar(open_only=1,
  mine=1)` for every date in the week. This proves the SQL aggregate equals the pool sum.
- **planDay.ts pure fns** already have `planDay.selfcheck.ts`; add an assert that the
  optimistic patch (apply delta to a map) is inverse-consistent (apply +Δ then −Δ →原).
- Manual: pick project, move a todo across days, watch the strip update instantly and
  match after save; switch projects; reload lands on last-used project.

## Rollout

- Backend: edit `mobile.py`, `bench restart` (standing approval).
- Frontend: rebuild BOTH bundles (`npm run build` in `frontend/` and `frontend-web/`).
- Docs: new whitelisted endpoint `get_plan_week_load` → run `python3 scripts/gen_docs.py`,
  commit regenerated `docs/assets/data.js`.
- What's New: one App Release row (Bahasa, platform Both) — "Halaman Rencana kini per-
  proyek, jauh lebih ringan; bilah minggu tetap lihat kapasitas semua proyek."

## Out of scope (YAGNI)

- Cross-project add picker / cross-project day list (covered by dashboard).
- Making the full `useCalendar` (calendar/search) lazy — separate concern, not the
  complaint.
- Multi-project board (viewing several projects at once) — the per-project decision
  explicitly replaces it.
