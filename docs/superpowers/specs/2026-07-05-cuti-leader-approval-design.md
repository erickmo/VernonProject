# Cuti / Leave — Multi-Leader Approval

**Date:** 2026-07-05
**Status:** Approved design, ready for implementation plan
**Scope:** Route Attendance Exception (Leave + WFH) approval from single-admin to a unanimous multi-leader gate.

## Problem

Leave/cuti already exists as the `Attendance Exception` doctype (`exception_type = Leave | WFH`). An employee requests one (`api/attendance.py` `request_exception` → `status = Pending`); an admin/System Manager flips `status` to `Approved`, and the attendance engine short-circuits that day to `Excused-Leave` / `Excused-WFH` with zero penalty (`attendance/engine.py` `_approved_exception`, `evaluate_day`).

Requirement: approval must come from the **project leaders** of the projects the employee is involved in — **all of them** — not from an admin.

## Requirements (decided)

1. **Applies to both** `Leave` and `WFH` exceptions.
2. **Approver set** = distinct `project_leader` of every **Ongoing** project the employee is a team member of (`Project.status = "Ongoing"`).
3. **Self-exclude:** the employee never approves their own request. If the resulting approver set is empty (no ongoing projects, or the employee is the only leader), the request **auto-approves** (immediately excused).
4. **Unanimity both ways:** request becomes `Approved` only when **all** approvers approve; becomes `Rejected` only when **all** approvers reject. Any mixed/partial state stays `Pending`.
5. Reject requires a reason (non-empty after `.strip()`), matching the existing todo reject convention.

## Design principle

**Do not modify the attendance engine.** It already excuses a day when `Attendance Exception.status == "Approved"`. This feature only changes *how* `status` is set — replacing manual admin approval with a derived multi-leader gate. `hooks.py` already wires `Attendance Exception.on_update → triggers.exception_changed → recompute_range`, so recompute fires automatically on every status change.

## Data model

### New child doctype: `Attendance Exception Approver` (`istable: 1`)

| field | type | notes |
|-------|------|-------|
| `approver` | Link → User | reqd |
| `decision` | Select `Pending / Approved / Rejected` | default `Pending` |
| `decided_at` | Datetime | read-only, stamped on vote |
| `reason` | Small Text | reject reason |
| `projects` | Small Text | read-only; optional — ongoing projects this leader covers, for UI context |

### `Attendance Exception` — additions

- `approvers` — Table → `Attendance Exception Approver`
- `status` (existing, `Pending / Approved / Rejected`) — now a **derived** field (computed from `approvers`), still what the engine reads. Do **not** hand-edit except admin override.
- `approver` (existing single Link) — repurposed as "last actor" (informational). No engine dependency.
- Employee `reason` (existing) — unchanged (the request reason).

## Approver set — snapshot at request time

In `request_exception` (both types), after inserting the exception:

```
member_projects = DISTINCT `tabProject Team`.parent WHERE user = employee
ongoing         = [p for p in member_projects if Project(p).status == "Ongoing"]
leaders         = distinct { Project(p).project_leader for p in ongoing } - { employee }   # self-exclude
if not leaders:
    status = "Approved"                 # auto-approve, no rows
else:
    approvers = [ row(approver=L, decision="Pending", projects=<ongoing projects L leads>) for L in leaders ]
    status = "Pending"
```

Snapshot semantics: the `approvers` rows are fixed at request time. Later changes to team membership or `project_leader` do not rewrite an open request. (Re-snapshot only if the request is edited/re-submitted — out of scope for v1.)

## Status derivation — `_recompute_exception_status(doc)`

```
rows = doc.approvers
if not rows:                              status = "Approved"   # auto-approve
elif all(r.decision == "Approved"):       status = "Approved"
elif all(r.decision == "Rejected"):       status = "Rejected"
else:                                      status = "Pending"
```

Called after every vote and after building the approver set. Mixed votes (some approve, some reject, none pending) → stays `Pending` per requirement #4; resolved by a leader changing their vote or by admin override (below). While `Pending`, the day is not excused.

## API — mirror the Project Todo approve/reject convention

Both `@frappe.whitelist()`, manual permission check + `save(ignore_permissions=True)` (matches `api/project_todo.py`).

- **`approve_exception(exception_id)`**
  - load doc; `user = frappe.session.user`
  - find `user`'s row in `doc.approvers`; if none and user is System Manager → **admin override** (force `status = "Approved"`); if none and not admin → error
  - set row `decision = "Approved"`, `decided_at = now()`, clear `reason`
  - `_recompute_exception_status(doc)`; `save(ignore_permissions=True)`; notify employee on terminal transition
- **`reject_exception(exception_id, reason)`**
  - `reason = (reason or "").strip()`; empty → error (`"Alasan penolakan wajib diisi."`)
  - same lookup; admin (no row) → force `status = "Rejected"`
  - set row `decision = "Rejected"`, `decided_at = now()`, `reason = reason`
  - recompute; save; notify employee
- **Votes are mutable** — a leader may call either endpoint again to change their vote until (and even after) a terminal state; recompute runs each time.
- **UI gating helper** `_can_approve_exception(doc, user)` → `True` if `user` owns an `approvers` row (or is System Manager). Mirror into the mobile `_shape_*` payload as a boolean, matching the `can_advance` / `can_reject` pattern in `api/mobile.py`.

## Notifications (reuse `_notify(recipient, type, title, body, reference_doctype, reference_name, actor)`)

- On request created (status `Pending`): notify **each** approver leader — "Cuti/WFH awaiting your approval".
- On terminal `Approved` / `Rejected`: notify the **employee** (include rejection reason if rejected).
- Progress-per-vote notification to employee: optional.

## Frontend (both `/m` mobile = `frontend/` and `/w` web = `frontend-web/`)

- **Request form** (`RequestException.tsx` + web equivalent): inputs unchanged. Optional polish — preview the computed approver list ("Needs approval from: A, B, C" or "Auto-approved — no project leader").
- **Leader inbox:** list exceptions where the current user is a `Pending` approver → Approve / Reject(reason) actions calling the two new endpoints. The existing admin exceptions screen (`AttendanceExceptionsScreen.tsx` mobile, `Exceptions.tsx` web) stays for System Manager override.
- **Employee status view:** show per-leader progress — "2/3 approved" and a chip per approver with its `decision`.

## Edge cases

- **Zero approvers** (no ongoing projects, or employee is the sole leader): auto-approve on creation.
- **Deadlock** (mixed final votes, no pending): stays `Pending`; resolved by a leader flipping their vote or a System Manager force via the override path.
- **Employee is a leader of some of their own projects:** excluded from their own approver set (self-exclude).
- **A leader leads multiple of the employee's projects:** one row (distinct leader), one vote.
- **Leader/team changes after request:** snapshot holds; open request keeps its original approvers.

## Migration / backward compatibility

- Existing `Attendance Exception` rows have no `approvers` rows. They keep their current admin-set `status`. `_recompute_exception_status` is only invoked by the new endpoints / new-request path, so legacy rows are untouched unless someone acts on them (at which point no rows → would compute `Approved`; acceptable, and only reachable via the new UI which won't surface legacy rows to leaders). No data backfill required.
- Engine, penalty logic, `Excused-Leave` / `Excused-WFH`, holiday/off-day handling: **unchanged**.

## Testing (defer heavy tests per live-site convention; include core logic checks)

- Unit: `_recompute_exception_status` truth table — empty→Approved, all-approved→Approved, all-rejected→Rejected, mixed→Pending.
- Unit: approver-set builder — self-exclude, distinct leaders, Ongoing-only filter, empty→auto-approve.
- Integration (bench console on live, final phase): request → all leaders approve → day becomes `Excused-Leave`; one leader rejects → stays `Pending`, day not excused.

## Out of scope (YAGNI — add when asked)

- Leave balance / quota / accrual.
- Cuti categories beyond the existing `Leave` / `WFH`.
- Per-project rows (vs per-distinct-leader).
- Re-snapshot of approvers on team change.
- Indonesian relabeling of the doctype (labels can be added at the frontend layer separately).
