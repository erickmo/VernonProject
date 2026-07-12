# Postpone Project / Project Detail — Design

Date: 2026-07-12
App: vernon_project (both frontends: `/m` mobile, `/w` web)

## Goal

Let an authorized user **postpone** a whole Project or a single Project Detail by
picking a **new deadline date**. Every active todo underneath shifts by the same
relative delta, so the plan's internal spacing is preserved. Works in both
directions — the new date may be earlier (pull the schedule forward).

## Data model (verified)

- **Project Todo** is a standalone doctype linked upward by `project_detail`
  (reqd) and a denormalized `project`. It is not a child table, so a bulk shift
  is a per-row query + save.
- Todo date fields to shift: `start_date`, `deadline`, `leader_deadline`,
  `owner_deadline`, `recurring_until`, and child-table allocation dates
  (`allocations[].allocation_date`, `assigned_allocation[].allocation_date`).
- Todo datetime **actuals** (`planned_started_at`, `done_started_at`,
  `checked_started_at`, `phase_completed_at`, `waiting_since`, `developed_at`,
  `tested_at`, `completed_at`, `rejected_at`) are history — **not** shifted.
  `next_occurrence` is read-only and recomputes on save — not shifted manually.
- **Project** dates: `start_date`, `deadline`.
- **Project Detail** dates: `latest_deadline` (editable, user-set — the detail's
  own deadline; **not** a rollup), `latest_todo` (read-only rollup = max todo
  deadline), `project_deadline` (read-only, `fetch_from: project.deadline`).

### Constraints respected

- `validate_start_date` requires `start_date ≤ deadline`. A uniform delta on both
  preserves the ordering — no violation.
- `validate_done_todo_fields` locks `start_date`/`deadline`/`assigned_to`/
  `estimated` once status is `🟠 Done` or `✅ Completed`. We skip those todos, so
  the lock never triggers.
- The existing recurrence math `build_occurrence` (project_todo.py:701) already
  does `add_days(value, delta)` on the same fields — same pattern, reused.

## Backend

New module `vernon_project/api/postpone.py`, one whitelisted method:

```python
@frappe.whitelist()
def postpone(target_type, target_name, new_date):
    # target_type ∈ {"Project", "Project Detail"}
```

Behavior:

1. **Permission (trust boundary, enforced):**
   `frappe.has_permission(target_type, "write", target_name, throw=True)`.
2. **Anchor / delta:**
   - Project → anchor = `Project.deadline`.
   - Project Detail → anchor = `latest_deadline`; if unset, `max(deadline)` over
     the detail's active todos.
   - `delta = getdate(new_date) - getdate(anchor)` (days).
   - If anchor missing or `delta == 0` → return a no-op result
     `{"shifted_count": 0, "skipped_count": 0, "delta_days": 0}`.
3. **Scope — active todos only:**
   `frappe.get_all("Project Todo", {<project|project_detail>: target_name,
   "status": ["not in", ["🚫 Cancelled", "🟠 Done", "✅ Completed"]]})`.
4. **Shift each todo:** load the doc, `add_days(delta)` on `start_date`,
   `deadline`, `leader_deadline`, `owner_deadline`, `recurring_until`, and each
   `allocations` / `assigned_allocation` row's `allocation_date`; then
   `doc.save(ignore_permissions=True)`. Full save keeps rollups, point,
   `next_occurrence`, and notifications consistent.
5. **Shift container:**
   - Project → `start_date += delta`, `deadline = new_date`; save. Per-detail
     `latest_deadline` is **not** touched at project level — each detail's
     read-only `latest_todo` rollup already recomputes from the shifted todos, so
     the effective deadline stays truthful. Only detail-level postpone edits a
     detail's own `latest_deadline`.
   - Project Detail → `latest_deadline = anchor + delta` (i.e. `new_date` when it
     was the anchor); save (rollups recompute on save).
6. **Atomicity:** rely on the Frappe request transaction — any `throw` mid-loop
   rolls back the entire operation. No partial shifts.
7. **Return:** `{"shifted_count", "skipped_count", "delta_days"}` for the toast.

`skipped_count` = count of scoped-out todos (Done/Completed/Cancelled) under the
target, for an honest "N moved, M left in place" summary.

## Frontend (shared logic + one small surface per platform)

Shared (`frontend/src`, `@` alias, used by both SPAs):

- `mobileApi.postpone(targetType, targetName, newDate)` in `lib/api.ts` →
  `api.post('vernon_project.api.postpone.postpone', {...})`.
- `usePostpone()` in `hooks/useData.ts` — mutation invalidating the standard
  project cache keys (`project`, `project-detail`, `project-item`,
  `keys.projects`, `keys.dashboard`), matching the existing convention.

Web (`/w`):

- `PostponeDialog.tsx` — Dialog primitive + native `<input type="date">` (date
  convention) showing the current anchor date and a live "moves everything by
  +N days" preview. Confirm calls `usePostpone`.
- Wire a **Postpone** item into the existing `OverflowMenu`s: `Project.tsx`
  (per-project actions + per-detail-row kebab) and `ProjectDetail.tsx` header.

Mobile (`/m`):

- `PostponeSheet.tsx` — bottom-sheet with the same date input + preview.
- Wire a **Postpone** action on `ProjectScreen.tsx` (per-project + per-detail).

On success: toast `Moved N tasks by +X days` (existing toast util). The dialog
computes the `+N days` preview client-side from the already-loaded anchor date;
the **server** re-reads the anchor and is authoritative for the actual shift, so
client/server can never disagree.

## Explicitly out of scope (YAGNI — add when asked)

- Live impact count inside the dialog — the server returns `shifted_count` in the
  success toast instead.
- Shifting Done/Completed todos — historical + field-locked; excluded per the
  "active only" decision.
- Refreshing each detail's `project_deadline` display immediately after a
  project-level postpone — it is `fetch_from: project.deadline` and refreshes on
  that detail's next save. Known-minor, not chased.
- Any date-picker library — native `<input type="date">` per the repo convention.

## Test / verification

- Backend self-check: a todo under a project with `deadline` D, postpone to
  D+7 → todo's `start_date`/`deadline`/`leader_deadline`/`owner_deadline` each
  +7 days; a `✅ Completed` sibling unchanged; `delta_days == 7`; negative delta
  (earlier date) pulls dates back. Assert `start_date ≤ deadline` still holds.
- Manual E2E on the live site after deploy (per project convention: build both
  frontends, `sudo /usr/local/bin/tj-restart`, browser-verify the Postpone
  action on a project and on a detail).
