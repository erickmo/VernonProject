# Per-weekday minimum minutes (shift-resolved)

**Date:** 2026-07-13
**Status:** Approved, pre-implementation

## Problem

Daily minimum minutes is one global flat number (`Vernon Settings.min_daily_estimated_minutes`, default 480), same for every user every day. It drives auto-plan fill and the "daily minimum missed" underperformed banner. There is no per-weekday variation, no per-user variation, and no assignment-time overload warning.

Goal: make the daily minimum vary **per user, per weekday**, with a **calendar override** per date, and use that resolved number in three places — auto-plan, underperformed warning, and a new assignment-time overload warning.

## Decisions (locked)

1. **Reuse the shift system** (per-user). Per-weekday variation already comes from `Shift Assignment` (Mon–Sun checkboxes + effective dates) → `Shift Template`. Calendar override = existing `Attendance Holiday` (date → 0) + dated shift-assignment ranges. No new per-date doctype.
2. **Minimum source = a new field on Shift Template.** Fallback chain: field → shift length (end−start) → global `min_daily_estimated_minutes`.
3. **Assignment warning = overload.** Warn when assigning a todo would push the user's day total above the minimum + tolerance (reuses the existing-but-unwired `over_occupied` rule and `under_occupied_tolerance_minutes`). Non-blocking.

## Data model

- **New field `Shift Template.minimum_estimated_minutes`** — Int, optional (blank = use fallback). Non-negative.
- `Vernon Settings.min_daily_estimated_minutes` (480) unchanged — now the **global fallback** for users without a shift-derived minimum. No migration; users without shift setup keep current behavior.

## Core: one resolver

New `_resolve_min_minutes(user, date)` in `vernon_project/api/report.py`, mirroring the existing `_resolve_expected`:

1. Holiday on that date → **0**.
2. Shift assignment covers the date **and** the weekday checkbox is on →
   `template.minimum_estimated_minutes` if set → else shift length (`end − start`) → else global `min_daily_estimated_minutes`.
3. Has shift assignment(s) but the weekday is **off** → **0** (day off; never flag, never force-fill).
4. **No** shift setup at all → global `min_daily_estimated_minutes` (preserves today's behavior).

Reuses the assignment/holiday resolution already in `_resolve_expected` / `_expected_minutes` / `_holidays_by_user`.

## Wiring (three uses)

### A. Underperformed banner
`_previous_shift_shortfall` already finds the user's most recent scheduled shift day. Change only its threshold: from flat `min_daily_estimated_minutes` to `_resolve_min_minutes(user, that_date)`. Rule unchanged: `under = assigned < minimum`. Payload `minimum` now reflects the resolved per-date value.

### B. Auto-plan
The auto-plan fill target is fed from the shortfall payload's `minimum` today. Add `today_minimum = _resolve_min_minutes(user, today)` to that payload (the previous-shift-day and today can differ once minimums are per-date). `frontend/src/hooks/usePlanDay.ts` (and web equivalent) switch the `minMinutes` passed to `autoFillPlan` from `minimum` to `today_minimum`. `autoFillPlan` itself is unchanged (`min <= 0` already means base-only, which correctly handles days off).

### C. Assignment overload (new)
New whitelisted `assignment_overload_check(user, date, added_minutes)` returning
`{over, assigned, minimum, tolerance}` where:
- `minimum = _resolve_min_minutes(user, date)`
- `tolerance = under_occupied_tolerance_minutes` (60)
- `assigned` = user's already-allocated minutes for `date` (same source as `over_occupied`)
- `over = assigned + added_minutes > minimum + tolerance`

Frontend: on assignee change in `ProjectItemScreen.tsx` and `CreateProjectItemSheet.tsx` (mobile) and their web counterparts, call the check with the todo's **due date** (fallback: today) and its `estimated`. Render a **non-blocking** warning banner: `Overloads <user> on <date>: <assigned+added> of <minimum> min.` No save block.

## Scope

**Backend** (`vernon_project/`):
- `shift_template.json`: add `minimum_estimated_minutes`.
- `report.py`: add `_resolve_min_minutes`; edit `_previous_shift_shortfall` (+ `my_previous_shift_shortfall` payload gains `today_minimum`); add `assignment_overload_check`.

**Frontend** (both `frontend/` and `frontend-web/`):
- `usePlanDay.ts`: feed `today_minimum` into `autoFillPlan`.
- Assignee pickers (`ProjectItemScreen`, `CreateProjectItemSheet` + web): overload warning banner + `api.ts` binding + hook.

**Tests / self-checks:**
- `test_report.py`: cases for `_resolve_min_minutes` (holiday → 0, weekday off → 0, template field set, blank → shift length, no shift → global) and for `assignment_overload_check`.
- `planDay.selfcheck.ts`: confirm auto-plan uses `today_minimum` (day-off `today_minimum=0` → base-only).

## Explicitly skipped (YAGNI)

- No per-date custom-minutes doctype — holidays already cover the override need; add only if per-date minimums independent of holidays are later required.
- No blocking on overload — warning only.
- No 7-field per-weekday editor in Vernon Settings — shift templates hold the per-weekday values.

## Deploy

Schema (new field) → `bench migrate`; Python → `sudo /usr/local/bin/tj-restart`; frontends → build (mobile `/m`, web `/w`) + cache-bust per existing conventions.
