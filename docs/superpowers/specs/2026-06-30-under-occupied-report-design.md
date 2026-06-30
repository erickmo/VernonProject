# Under-Occupied report — design

**Date:** 2026-06-30
**Status:** approved (brainstorm), pending implementation plan

## Goal

A report that answers "who is **not occupied enough**" — active users whose
assigned estimated time over a date range falls below the daily floor, minus a
tolerance margin. Sibling to the existing **Daily Estimated Time** report.

Spans two repos:
- **Backend:** `vernon_project` (`vernon_project/api/report.py`, `Vernon Settings`).
- **Frontend (the report UI):** `/home/frappe/ui` (`src/features/reports/`) — the
  same web app that hosts Daily Estimated Time. (The mobile/web `vernon_project`
  frontends only host the *settings* change, see below.)

## Threshold semantics (resolved)

The user said "max estimate", but `Vernon Settings.max_estimated_minutes` (1440)
is a **per-todo** sanity cap, not a daily capacity. The real "occupied enough"
target is the per-user daily floor `min_daily_estimated_minutes` (default 480) —
the same threshold the Daily Estimated Time report flags days below. This report
reuses that floor. The new **tolerance margin** is a separate global setting.

## Definition

For each active user (`_active_users()`: enabled System Users, excl.
Guest/Administrator) over the inclusive range `[from_date, to_date]`
(`day_count` = number of days):

- `assigned_total` = Σ assigned minutes across the range, using the **assigned**
  series (NOT planned): explicit `Project Todo Assigned Allocation` rows + the
  virtual default (a todo with no explicit assigned rows contributes its whole
  `estimated` on its `deadline`), excluding `🚫 Cancelled` todos. Identical
  semantics to the Daily report's `assigned_rows`.
- `avg_daily` = `round(assigned_total / day_count)`.
- `threshold` = `min_daily_estimated_minutes` (Vernon Settings).
- `tolerance` = `under_occupied_tolerance_minutes` (new Vernon Settings field).
- `effective` = `max(0, threshold - tolerance)`.
- `under_days` = count of days where that day's assigned total `< effective`.
- `deficit` = Σ over days of `max(0, threshold - assigned_day)` — total minutes
  below the floor. Busy days do **not** cancel idle days (per-day shortfall sum,
  not a net total).
- **Inclusion:** the user is under-occupied iff `avg_daily < effective`. Only
  under-occupied users are returned.
- **Sort:** `deficit` descending (most free capacity first).

### Weekend caveat

No holiday/working-day calendar exists in the app (the Daily report ignores
weekends too). Days with zero assignment (typically weekends) count as full
deficit. Mitigation: the report's date range **defaults to the current week
Mon–Fri** (5 days); the user can widen it. `ponytail:` documented — add a real
working-day/holiday calendar only if asked; do not build one speculatively.

## Backend (`vernon_project`)

### 1. New setting `under_occupied_tolerance_minutes`

`vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json`:
- Add field after `min_daily_estimated_minutes`: `Int`, `non_negative: 1`,
  `default: "60"`, label `"Under-Occupied Tolerance (minutes)"`,
  description: "A day counts as under-occupied when assigned minutes fall below
  (Min Daily − this tolerance). Used by the Under-Occupied report."
- Add to `field_order` right after `min_daily_estimated_minutes`.

Seed patch `patches/v1_0/seed_under_occupied_tolerance.py` (mirror
`seed_min_daily_estimated_minutes.py`: set the single value to 60 if unset) +
register in `patches.txt`.

Expose in the app-settings API (user chose "settings UI"):
- `vernon_project/api/mobile.py` `get_app_settings` / `save_app_settings` — add
  `under_occupied_tolerance_minutes` to the read and the writable allow-list.

(The `min_daily_estimated_minutes` floor stays doctype-form-only as today —
out of scope unless the user later asks to surface it in the settings UI.)

### 2. Extract shared assigned-series helper in `report.py`

`vernon_project/api/report.py`: lift the `assigned_rows` construction
(currently inline in `daily_estimated_time`, lines ~137–169 — explicit query +
`todos_with_explicit` dedup + virtual-default query) into:

```python
def _assigned_minutes(names, from_date, to_date):
    """[{user, day, minutes}] of assigned estimated minutes for the given
    users in [from_date, to_date]. Explicit Project Todo Assigned Allocation
    rows + virtual default (whole estimate on deadline) for todos with none.
    Excludes 🚫 Cancelled. Returns [] when names is empty."""
```

Refactor `daily_estimated_time` to call it (no behavior change — DRY so both
reports share one definition of "assigned"). `test_report.py` already covers the
daily report, so this refactor is regression-guarded.

### 3. New endpoint `under_occupied`

```python
@frappe.whitelist()
def under_occupied(from_date, to_date):
    _require_system_manager()
    # validate range (reuse the daily endpoint's checks: end >= start,
    # span <= MAX_SPAN_DAYS)
    threshold = frappe.db.get_single_value("Vernon Settings", "min_daily_estimated_minutes") or 0
    tolerance = frappe.db.get_single_value("Vernon Settings", "under_occupied_tolerance_minutes") or 0
    effective = max(0, int(threshold) - int(tolerance))
    dates = _date_list(from_date, to_date)
    users = _active_users()
    names = [u["name"] for u in users]
    assigned = _assigned_minutes(names, from_date, to_date) if names else []
    # pivot assigned -> {user: {day: minutes}} (same pivot as _build_daily_matrix)
    # per user: assigned_total, avg_daily, under_days, deficit
    # include iff avg_daily < effective; sort deficit desc
    return {
        "threshold": int(threshold), "tolerance": int(tolerance), "effective": effective,
        "from_date": str(getdate(from_date)), "to_date": str(getdate(to_date)),
        "day_count": len(dates),
        "rows": [ {user, full_name, assigned_total, avg_daily, under_days, deficit} ... ],
    }
```

Gate reuse: `under_occupied` enforces `_require_system_manager()`; the nav/page
"can view" check reuses the existing `daily_estimated_time_access` endpoint (same
System-Manager rule) — no new access endpoint.

### 4. Tests `test_report.py`

Add cases: (a) a user below `effective` on average is included; (b) a user at/
above `effective` is excluded; (c) tolerance boundary — user exactly at
`effective` excluded, one minute under included; (d) empty roster → `rows: []`;
(e) `deficit`/`under_days` arithmetic on a mixed busy/idle user.

## Frontend (`/home/frappe/ui`)

Clone the 4-file Daily Estimated Time pattern under `src/features/reports/`:

- **`useUnderOccupied.ts`** — `useFrappeGetCall('vernon_project.api.report.under_occupied', { from_date, to_date })`, unwrap `{message}` (mirror `useDailyEstimatedTime.ts`).
- **`types.ts`** — append `UnderOccupiedRow` (`user, full_name, assigned_total, avg_daily, under_days, deficit`) and `UnderOccupiedResponse` (`threshold, tolerance, effective, from_date, to_date, day_count, rows`).
- **`UnderOccupiedPage.tsx`** — date-range pickers (default **Mon–Fri** current week — adapt `defaultWeek()` to drop Sat/Sun); MetricCards: "Under-Occupied Users" (`rows.length`), "Total Free Capacity" (Σ `deficit`, `formatDuration`), "Avg Daily Assigned" (mean of `avg_daily`); `DataTable` columns: User, Avg Daily (`formatDuration`), Target (`threshold`), Under-days (`under_days` / `day_count`), Deficit (`formatDuration`). `NoAccessState` when `!canView` or a 403 (mirror the daily page). Gate via existing `useCanViewDailyEstimatedTime`.
- **`registry.ts`** — add `UNDER_OCCUPIED: ReportModule` (`key: 'under-occupied'`, label `'Under-Occupied'`, `to: '/reports/under-occupied'`, a suitable lucide icon) and push to `reportsModules`. Sidebar maps `reportsModules`, so the nav entry appears automatically (gated `systemManager`).
- **`src/app/router.tsx`** — add the import + a `{ path: 'under-occupied', element: <UnderOccupiedPage /> }` child route (routes are hand-listed, not derived from the registry).

## Out of scope (YAGNI)

- Working-day / holiday calendar (mitigated by Mon–Fri default range).
- Per-user capacity overrides (no per-user max exists; the global floor is reused).
- Mobile-app surface for this report (web only, like Daily Estimated Time).
- Surfacing `min_daily_estimated_minutes` in the settings UI (doctype form today).
- Per-item nav gating (the REPORTS group is gated by one System-Manager check).

## Deploy notes (per repo conventions)

- `vernon_project`: edit source, `npx tsc --noEmit` for the settings-UI TS, run
  the `test_report.py` cases via bench, commit **source only** per task. The new
  doctype field + patch need `bench migrate` to apply on the live site.
- `/home/frappe/ui`: `npx tsc --noEmit` (0), one atomic `npm run build` at the
  very end (not per-task) — `public/` serves live from disk.
- The user (erickmo) commits in parallel; re-check HEAD before each task.
