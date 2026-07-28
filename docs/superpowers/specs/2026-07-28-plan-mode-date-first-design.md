# Plan Mode — date-first todo planning (both frontends)

**Date:** 2026-07-28
**Route:** `/plan` (mobile `/m`, web `/w`)
**Status:** design approved, spec under review

## Problem

There is no single surface to plan work across dates. Today the user can only
"Plan my day" (today, via a sheet/drawer) and *view* a month plan on the
Calendar. There is no way to say "give tomorrow 90 minutes of this task" or to
pull a todo from any project onto a chosen date and see the resulting day load.

## Goal

A dedicated, date-first planning screen: pick **today / tomorrow / any date**,
see that date's planned todos with minute allocations, add todos from **any**
project, and see per-day load against a target — plus a mini week strip to
balance across days.

## Key reuse (this feature is ~70% existing plumbing)

- **Data model already fits.** Each `Project Todo` carries
  `allocations = [{date, minutes, note?}]` (child rows `allocation_date` /
  `estimated_minutes`). A todo allocated 60m on Tue *is* both "on Tuesday's
  list" and "60m of load". A day's plan = every one of my todos with an
  allocation on that date; day load = Σ minutes. **No new field, no new
  doctype.**
- `mobile.py::set_todo_allocations(project_item, allocations)` already writes
  the full per-date allocation array for any date. Unchanged.
- `mobile.py::get_calendar()` already returns all my todos with their
  `allocations`. This is the read source for the plan screen. Unchanged.
- `report.py::_resolve_min_minutes(user, date)` already resolves the per-user,
  per-date daily minimum (Brand per-weekday → global per-weekday → flat, Shift
  Template override, holiday/off-day → 0). This is the **load target**.
- `usePlanDay` + helpers (`buildNext`, `planFloor`, `sortForPlanning`,
  `filterCandidates`) already implement the minute-editing + save semantics —
  and already take a **date parameter** everywhere; today it is hardcoded to
  `today`.

## What is actually new

### Backend — one whitelisted endpoint

`mobile.py::get_daily_targets(from_date, to_date)` → `{ "YYYY-MM-DD":
target_minutes }` for `frappe.session.user`, one entry per date in the inclusive
range, each computed via `_resolve_min_minutes`. Range is capped (e.g. ≤ 45
days) to bound the loop. This is the only backend addition.

*Docs:* new whitelisted endpoint → run `python3 scripts/gen_docs.py` and commit
the regenerated `docs/assets/data.js`.

### Shared logic (`frontend/src`)

1. **Generalize `usePlanDay` → `usePlanDate(candidates, targetDate)`.** Thread
   `targetDate` in place of the hardcoded `today`; read a todo's current minutes
   from `allocations[targetDate]` instead of `today_allocation`
   (`allocMinutes(t, date)` helper). `buildNext`/`planFloor` already accept the
   date. Existing callers (mobile Today sheet, web plan drawer) pass `today()` —
   behaviour unchanged. `today_allocation` stays for the dashboard/table quick
   actions.
2. **`weekLoad(todos, dates, targets)`** — pure: for each date, Σ allocation
   minutes across all todos, paired with its target. Drives the week strip and
   the day-load bar. One `*.selfcheck.ts` (project convention: assert-based
   self-check, no framework).
3. **`useDailyTargets(from, to)`** — react-query wrapper over
   `get_daily_targets`, in `useData.ts` beside `useCalendar`.

### Presentation (per platform — same capability, own design system)

**Mobile** `frontend/src/pages/PlanScreen.tsx` (Soft-Pop):
- Date strip: `◄  <human date>  ►` + `Today` / `Tomorrow` quick chips + a
  DatePicker for an arbitrary date.
- Day-load bar: `Σminutes / target(date)`; target 0 → "Nh Mm planned", no bar.
- Day list: my todos allocated to that date, each a `PlanRow`-style minute
  editor (± / preset chips / free-type, floor-clamped on blur — reuse existing
  `PlanRow`). Remove = set that date's minutes to 0 (drops the row; a
  deadline==date todo is floored, cannot drop — existing `planFloor`).
- `+ Add todo from any project`: `SearchableSelect` over my active todos
  (searchable across projects); picking one seeds its estimate as minutes.
- Mini week strip: 7 columns (Mon-first around the selected date) each a load
  bar vs its target; tap a column → jump the selected date to it.

**Web** `frontend-web/src/pages/Plan.tsx` (bento, web chrome):
- Same date-first layout and controls, in web primitives (shared `DatePicker`
  per the web-datepicker convention, `SearchableSelect`, DataTable-style day
  list). Kept symmetric to the mobile single-day layout — **not** the rejected
  week-column board.

**Routing/nav:** add `/plan` route + a nav entry in both frontends (mobile tab
bar / More; web nav per `lib/nav.ts` gate — visible to any logged-in user).

## Data flow

```
select date d
  ├─ getCalendar().todos          → todos with allocations
  ├─ get_daily_targets(week)      → target per day
  ├─ day list  = todos where allocations has date d ; minutes = allocMinutes(t,d)
  ├─ day load  = Σ minutes(d)  vs  target(d)
  ├─ edit minutes / add todo → setTodoAllocations(t, buildNext(t.allocations, d, m))
  └─ week strip = weekLoad(todos, 7 days around d, targets)
```

## Edge cases

- **target = 0** (weekend / holiday / no minimum configured) → show planned
  total, no ceiling bar.
- **deadline == selected date** → minutes floored to the estimate, cannot be
  dropped (server pins it; existing `planFloor` rule, same as today).
- **waiting / completed** todos excluded from the add pool.
- **empty day** → empty state + prominent "Add todo".
- `get_daily_targets` range capped to bound the per-date resolver loop.

## Deliberate v1 cuts (add when asked)

- **No drag-reorder persistence.** Day list auto-sorts (planned-first, most
  minutes first — reuse `sortForPlanning`). Allocation rows have no order field;
  adding one is a doctype change. Add manual ordering when actually wanted.
- **Self only.** Plan my own todos; not assign-to-others as a leader.
- **No auto-balance / overload warnings** beyond the load-bar color.

## Ship checklist

- Rebuild BOTH bundles (`frontend`, `frontend-web`).
- `python3 scripts/gen_docs.py` (new endpoint) + commit `data.js`.
- App Release row (What's New), Bahasa, `platform=Both`, semver-bumped,
  `published=1`.
- Self-check(s) for `weekLoad` (and any non-trivial shared logic).
