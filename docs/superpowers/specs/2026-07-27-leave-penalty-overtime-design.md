# Leave-quota penalty (lateness / early-leave) & overtime-bonus — design

Date: 2026-07-27
Status: proposed (autonomous build — decisions locked with defaults, flagged for review)

## Goal (verbatim)

> Settings globally overrideable per user group to reduce the leave quota if late or leave
> early. Use a temporary log to hold this data and deduct once it reaches 8 hours late.
>
> Working extra hours, if assigned by HR and approved by System Manager, will add this time
> too. When the total extra hours reach 8 hours, it will grant 1 day extra leave.
>
> Make all of the numbers in the system settings together with all other settings. No
> hard-coded variables in the code.

## Decisions locked (no human in the loop — flagged so they can be flipped)

1. **"User group" ⇒ Brand.** This app does not use Frappe's *User Group* doctype. Its only
   config-segmentation that already has a global→override precedent is **Brand** (per-weekday
   minimums, `default_annual_leave_quota`), resolved Brand-first-then-global by
   `report._resolve_min_minutes`. User↔Brand is via the active **Attendance Profile** row. So
   every new setting is **global in Vernon Settings, overridable per Brand**, same precedent.
   *If "group" was meant to be Member Type or Role, only the resolver changes — everything
   else is config-driven.*

2. **Lateness/early-leave "temporary log" ⇒ reuse `Daily Attendance`.** It already stores
   `late_minutes` and `early_minutes` per day (computed nightly by
   `attendance.engine.nightly_finalize`). We **derive** the accumulator by summing these; we do
   not add a redundant log doctype that could drift. The running total (minutes toward the next
   deduction) is exposed via API so the UI shows it — satisfying the "visible log" intent
   without duplicate state.

3. **Overtime needs a real doctype** — it is manual HR entry + a two-step approval, so:
   new **`Overtime Entry`** doctype (`employee`, `date`, `minutes`, `reason`, `assigned_by`,
   `status` Pending/Approved/Rejected, `approved_by`, `approved_on`).

4. **Both effects post to the existing `Cuti Ledger`** via signed rows (the app's single source
   of leave truth). Two new `entry_type` options: **`Late Penalty`** (−1/unit) and
   **`Overtime Bonus`** (+1/unit).

5. **Accumulation is per calendar year**, matching the annual Grant cycle — it resets naturally
   each Jan 1 with the new grant; no manual reset needed.

6. **Everything reconciles idempotently** (the app's established pattern): the ledger rows are a
   pure function of the source data, recomputed and self-healed, never incremented blindly.

7. **Default OFF.** Both master toggles ship at 0 — the feature is inert until an admin enables
   it per the global setting (or a Brand override). Nothing changes for users until then.

## New settings (all in Vernon Settings; every one Brand-overridable)

Global fields on **Vernon Settings** (new "Leave rules" section):

| Field | Type | Default | Meaning |
|---|---|---|---|
| `late_penalty_enabled` | Check | 0 | Master switch: accumulate lateness/early-leave → deduct leave |
| `count_early_leave_in_penalty` | Check | 1 | Include early-leave minutes in the accumulation (else late only) |
| `lateness_deduction_threshold_minutes` | Int | 480 | Minutes of accrued lateness per **1 day** deducted (8h) |
| `overtime_bonus_enabled` | Check | 0 | Master switch: approved overtime → grant leave |
| `overtime_bonus_threshold_minutes` | Int | 480 | Approved overtime minutes per **1 day** granted (8h) |

Per-**Brand** override: one `override_leave_rules` (Check) on Brand + the same five fields.
If a user's active Brand has `override_leave_rules=1`, the Brand's values win; otherwise the
global Vernon Settings values apply. One unambiguous toggle avoids the "is 0 unset or zero?"
problem. Resolver: `attendance.leave_rules.resolve(employee) -> dict`.

No literal `480` / `8` / `1` lives in code — all read from settings.

## Data flow

**Lateness → deduction** (runs inside the existing nightly job, per employee):
```
accrued = Σ(late_minutes + [early_minutes if count_early]) over Daily Attendance in `year`
target  = accrued // threshold                          # whole days owed
existing = count(Cuti Ledger where entry_type='Late Penalty', employee, year)
reconcile(existing → target): insert/delete −1 rows so count == target
```

**Overtime → grant** (runs on Overtime Entry approve/reject/trash, per employee):
```
approved = Σ(minutes) over Overtime Entry status='Approved' in `year`
target   = approved // threshold
existing = count(Cuti Ledger where entry_type='Overtime Bonus', employee, year)
reconcile(existing → target): insert/delete +1 rows so count == target
```

Both are pure floor-count reconciles → idempotent, safe to re-run, self-healing after edits.
When the respective master toggle is OFF, `target = 0` → all such rows removed (feature truly
inert / reversible).

## Modules

- **`vernon_project/attendance/leave_rules.py`** (new): `resolve(employee)` settings resolver;
  `reconcile_penalty(employee, year)`; `accrual_status(employee, year)` for the UI (accrued
  minutes, threshold, next-deduction progress). Pure helpers unit-tested.
- **`attendance/engine.py::nightly_finalize`**: after recomputing yesterday, call
  `reconcile_penalty` for each active employee (guarded by the toggle).
- **New doctype `Overtime Entry`** + controller: validates only System Manager may set
  `Approved`; `on_update`/`on_trash` → `reconcile_overtime(employee, year)`.
- **`attendance/cuti_ledger.py`**: add `reconcile_*` helpers (or extend `post_adjustment`) that
  key on (employee, year, entry_type) and insert/delete to hit a target count.
- **`Cuti Ledger.entry_type`**: add `Late Penalty`, `Overtime Bonus` options.
- **API `api/overtime.py`**: `list/create/approve/reject/delete` (role-gated) +
  `my_leave_rules_status` (accrual + overtime progress for the current user).
- **Settings**: extend `get_app_settings` / `save_app_settings` and the Brand editor endpoints
  with the new fields; expose the resolved values + accrual status through `bootstrap()`.
- **Patch**: add the two `entry_type` options and backfill nothing (default OFF → nothing to
  reconcile until enabled).

## Frontends (both /m and /w — this app ships every UI change to both)

- **Admin settings editor**: new "Aturan Cuti" group with the five global fields + a per-Brand
  override panel.
- **Overtime**: HR create/list screen; System Manager approve action; employee sees their own
  approved overtime + progress toward the next bonus day.
- **Employee attendance/cuti screen**: a small progress row — "lateness accrued X/480 → next
  deduction" and "overtime Y/480 → next bonus", only when the relevant toggle is on for them.

## Testing

- Pure unit checks (`assert`-based `__main__`) for `leave_rules.resolve` precedence and the
  floor-count reconcile math (0, exactly-threshold, over-threshold, toggle-off-clears).
- One end-to-end sanity on the live site after deploy (create Daily Attendance rows / an
  Overtime Entry, enable the toggle, confirm one −1 / +1 Cuti row appears and the balance moves).

## Out of scope

- No new "group" doctype. No change to the lateness *math* (grace/rates untouched) — we only
  consume the minutes it already produces. No per-leave-type routing (deduct/grant hit the
  default annual pool, like every other auto ledger row).
