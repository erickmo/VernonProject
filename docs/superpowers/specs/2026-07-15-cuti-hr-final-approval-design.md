# Cuti: HR final approval + leader visibility

Date: 2026-07-15
Status: Design approved, ready for plan

## Problem

Cuti/WFH (`Attendance Exception`) is currently gated by a **unanimous vote of every project leader** of the employee's Ongoing projects (shipped 2026-07-05, see `2026-07-05-cuti-leader-approval-design.md`). Three gaps:

1. The employee applying for cuti cannot see who will review it. The leader list is snapshotted server-side at request time and never shown — `approvers[]` is fetched and typed (`frontend/src/lib/types.ts:1016`) but rendered by zero components.
2. There is no HR step. Leaders are the terminal authority, and unanimity means one silent leader wedges a request in Pending forever.
3. HR is not notified of anything, because HR does not exist in the app — grep finds no `HR Manager` / `HR User` / `Attendance Manager` role. `canManageAttendance` is `System Manager` only (`frontend/src/hooks/useData.ts:802`, whose `ponytail:` comment predicts exactly this change).

## Goal

- **HR is the final approver.** Leader decisions become advisory input HR reads on the card.
- The apply form shows the employee which leaders will review, before submitting.
- HR is notified when a request lands.

## Non-goals

- Multi-stage HR (e.g. HR clerk → HR head). One HR decision is final.
- Notifying HR when the last leader votes. HR can act at any time, so the "leaders are done" moment carries no obligation.
- Leave-quota logic. Unchanged — `_check_leave_quota` fires on `validate` when `status == "Approved"`, which now happens at the HR step instead of the last leader's.
- Attendance engine. Unchanged — `on_update → exception_changed → recompute_range` still keys off parent `status`.

## Decisions

| Question | Decision |
|---|---|
| Who is HR? | New `HR Manager` role (patch-created, `desk_access: 0`), plus `System Manager` |
| When can HR decide? | Anytime, including before any leader votes |
| HR inbox | The existing admin Leave/WFH screen, upgraded — not a new page |
| Leader list on apply form | Names previewed before submit; per-leader decisions shown after |
| Leader "Reject" | An objection HR reads. Does not reject the request. |
| Leader votes after HR decides | Locked — endpoint errors |

## Architecture

### Data model

`Attendance Exception` (`vernon_project/vernon_project/doctype/attendance_exception/attendance_exception.json`) gains:

| field | type | properties |
|---|---|---|
| `hr_decision` | Select `Pending\nApproved\nRejected` | default `Pending` |
| `hr_by` | Link → User | read_only |
| `hr_decided_at` | Datetime | read_only |
| `hr_reason` | Small Text | HR's reject reason |

Parent `status` is **derived from `hr_decision` alone**. The child table `Attendance Exception Approver` is unchanged; its rows are now advisory.

`attendance/approval.py::derive_status` currently implements unanimity over leader decisions:

```python
def derive_status(decisions):
	if not decisions:
		return "Approved"
	if all(d == "Approved" for d in decisions):
		return "Approved"
	if all(d == "Rejected" for d in decisions):
		return "Rejected"
	return "Pending"
```

`derive_status` is **deleted entirely**, not rewritten. `status` and `hr_decision` share the same three Select options, so the derivation is `doc.status = doc.hr_decision` — a function wrapping an assignment earns nothing. `status` survives as a mirror because the engine, list filters and both admin screens read it; changing every reader to `hr_decision` is a far bigger diff than one assignment.

Two behaviours go with it:

- **Unanimity.** Leaders no longer gate.
- **Zero-leader auto-approve.** `derive_status([]) == "Approved"` was the escape hatch for employees on no Ongoing project. HR is final for every request, so a leaderless request now waits for HR like any other. The apply form says so ("goes straight to HR").

`distinct_leaders` is untouched — still order-preserving dedupe, still drops self.

### Migration

A patch backfills `hr_decision = status` on all existing `Attendance Exception` rows.

Without it, every already-Approved cuti derives back to `Pending` on its next save, and `exception_changed → recompute_range` silently un-excuses attendance days that were legitimately excused. The backfill is the whole reason `hr_decision` defaults to `Pending` rather than being nullable.

### Roles and gating

- Patch creates role `HR Manager`, `desk_access: 0`. Precedent: `patches/v1_0/add_lms_manager_role.py`.
- `HR Manager` joins `VERNON_ROLES` (`api/mobile.py:22`) and `VERNON_ROLE_OPTIONS` (`hooks/useData.ts:808`). That tuple is the allowlist `update_user` syncs against — `_clean_roles` (`:2040`) drops anything outside it, so a role missing from it cannot be granted from the app at all, only from a bench console.
- `_is_hr(user)` → `"HR Manager" in roles or "System Manager" in roles`. Admins keep the override they have today; it now flows through the HR path instead of a separate branch.
- `_hr_users()` → users holding `HR Manager`; **falls back to `System Manager` holders when that set is empty**. Without the fallback, a site that has not granted the role yet notifies nobody and wedges every request in Pending with no visible cause.
- The System-Manager-forces-every-approver-row override branch (`api/attendance.py:229-237`) is **deleted**. It exists only to break leader deadlock, and leader deadlock no longer exists.

### API — `vernon_project/api/attendance.py`

| endpoint | change |
|---|---|
| `my_leaders()` | **new.** `_leaders_for_employee(frappe.session.user)` → `{"status": "ok", "leaders": [...]}`. Feeds the apply-form preview. |
| `request_exception` | Also calls `_notify_hr_new_request(doc)`. Drops the inline `approval_status = "Approved" if not approvers else "Pending"` — always `Pending` now. |
| `approve_exception(exception_id, as_hr=0)` | New `as_hr` param. |
| `reject_exception(exception_id, reason=None, as_hr=0)` | New `as_hr` param. `reason` stays mandatory for both paths. |
| `_vote_exception(exception_id, decision, reason, as_hr)` | Branches: `as_hr` → `_is_hr` check → write `hr_decision`/`hr_by`/`hr_decided_at`/`hr_reason`, derive `status`, notify employee. Else → leader path: error if `hr_decision != "Pending"` (locked), write own approver row only, **no** employee notification (not terminal). |
| `hr_pending_exceptions()` | **new.** All rows with `hr_decision == "Pending"`, shaped with leader rows. Backs the HR inbox. |
| `_shape_exception_rows` | Selects `hr_decision`, `hr_by`, `hr_reason` on the parent and the per-approver `reason` on children (in the DB since 2026-07-05, never selected). Keeps `approved_count`/`total`. |
| `pending_exception_approvals` | Unchanged. Already filters to parents still `status == "Pending"`, so HR-decided requests drop out of leader inboxes. |

Authorization stays manual + `ignore_permissions=True`, matching the existing convention (the doctype grants perms to `System Manager` only).

### Notifications

All use type `"Approval"` — an invalid `type` makes `_notify` swallow the insert and the notification vanishes silently (see `vernon-notify-type-gotcha`).

- `_notify_hr_new_request(doc)` — **new.** One per `_hr_users()`: "Cuti request needs HR approval / {employee} requested Cuti: {from} → {to}". Its `reference_doctype` is the pseudo-doctype `"Attendance Exception HR"`, a third audience tag alongside the existing `"Attendance Exception Approval"` (leader queue) and `"Attendance Exception"` (requester's list). `deepLink` (`lib/notifications.ts:48`) routes on that field, so without its own tag HR's notification lands on home. `DeepLinkRoutes` gains `hrExceptions`, filled per app: `/attendance/manage/exceptions` on `/m`, `/attendance/exceptions` on `/w`.
- `_notify_leaders_new_request` — reworded. "…needs your approval" → "…needs your input", since a leader vote no longer decides anything.
- `_notify_employee_decision` — unchanged mechanics, now fires only on the HR decision.

`_notify` skips self-notification when `recipient == actor`, so an HR user filing their own cuti is not notified of it. That is correct and needs no special-casing.

### Frontend

Both apps share one hook/type/api layer: `frontend/src/` is aliased `@` from `frontend-web/vite.config.ts:33`. Hooks and types are written once.

**Shared** (`frontend/src/`):
- `lib/types.ts` — `ExceptionApprover` gains `reason?`, `decided_at?`. `AttendanceExceptionRow` gains `hr_decision`, `hr_by?`, `hr_reason?`.
- `lib/api.ts` — `myLeaders()`, `hrPendingExceptions()`; `approveException`/`rejectException` pass `as_hr`.
- `hooks/useData.ts` — `useMyLeaders()`, `useHrPendingExceptions()`; the approve/reject mutations take `as_hr`. `useRequestException` also invalidates `keys.myExceptions` — today it invalidates only `keys.myAttendance`, so a fresh request does not appear on my-requests without a manual refresh.

**Mobile** (`/m`):
- `pages/RequestException.tsx` — leader preview card above Submit: "Reviewed by: A, B, C · final approval by HR". Empty list → "No project leaders · goes straight to HR".
- `pages/MyExceptions.tsx` — replace `{approved_count}/{total} leaders approved` with a real list: one row per leader (name + decision pill), then the HR row with `hr_decision` and `hr_reason`.
- `pages/ExceptionApprovals.tsx` — buttons reworded to advisory ("Recommend" / "Object"); copy states HR decides.
- `pages/AttendanceExceptionsScreen.tsx` — becomes the HR inbox. Off `resource.list('Attendance Exception', {filters: {status: 'Pending'}})` onto `useHrPendingExceptions()`; renders each request's leader votes; a real reject-reason prompt replaces the hardcoded `'Rejected by admin'`; calls with `as_hr=1`.

**Web** (`/w`): the same two changes to `pages/ExceptionApprovals.tsx` (wording) and `pages/Exceptions.tsx` (HR inbox), in `@web` chrome.

**Web parity — new pages.** Web has never had an apply form or a my-requests list; cuti could only be filed from `/m`. Both are added so the flow works identically on either app:

- `frontend-web/src/pages/RequestException.tsx` at `/attendance/request` — same four submitted fields and the same leader-preview card, in `@web` chrome (`BentoGrid`/`BentoTile`/`Card`, `text-ink`/`text-muted`/`border-line`). Dates use the shared `DatePicker` (`@web/components/DatePicker`), never a native `<input type="date">` — `vernon-web-datepicker-convention`. The Leave/WFH selector stays a two-button segmented control, not a dropdown, so `vernon-searchable-select-convention` does not apply.
- `frontend-web/src/pages/MyExceptions.tsx` at `/attendance/my-requests` — the same per-leader decision list and HR verdict row.
- Both routes are ungated (every employee may file cuti), with nav leaves in the ungated `WORK` group of `lib/nav.ts`.
- `NotificationSheet`'s `ROUTES.myExceptions` changes from `'/'` to `'/attendance/my-requests'`. Its current value is a documented workaround for the page not existing; a cuti verdict on web has landed on home until now.

Route paths are unchanged. Gating gains one function in `hooks/useData.ts`:

```ts
export function canHrApprove(boot: Boot | undefined): boolean {
  return !!boot && (boot.roles.includes('System Manager') || boot.roles.includes('HR Manager'))
}
```

`canManageAttendance` is **not** widened, despite its `ponytail:` comment inviting exactly that. Widening it would hand HR the station, schedule, holiday and profile admin screens — none of which HR asked for — and the attendance report would break outright, since its backend gate `_require_attendance_admin` (`api/attendance.py:82`) is `System Manager` only and would 403 the screen the frontend just revealed. So the two HR inbox routes move out of the `canManageAttendance` blocks in both `App.tsx` files and under `canHrApprove`; every other attendance admin route stays where it is. The web nav leaf (`frontend-web/src/lib/nav.ts:95`) splits the same way.

## Testing

- `attendance/approval.py` keeps its `python approval.py` self-check (no frappe import), now covering only `distinct_leaders`. The `derive_status` assertions are deleted with the function; `doc.status = doc.hr_decision` has nothing to test.
- Live-site rules apply (`vernon-live-site-codefirst`): no test DB. Verification is manual on project.vernon.id after deploy — apply cuti as a normal user, confirm the leader preview matches the user's Ongoing-project leaders, confirm HR gets a notification, confirm a leader vote does not flip status, confirm HR approve flips status to Approved and the attendance day becomes Excused-Leave.
- The migration patch is verified by count: rows where `status != hr_decision` must be zero after it runs.

## Deploy

`bench migrate` (doctype fields + role patch + backfill patch), `sudo /usr/local/bin/tj-restart` (Python), `npm run build` in both frontends. Cloudflare asset-cache purge per `vernon-cloudflare-asset-cache` if bundles change.

Someone must be granted `HR Manager` after deploy, or the `_hr_users()` System-Manager fallback carries the load.
