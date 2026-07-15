# Cuti HR Final Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make HR the final approver of cuti/WFH, demote project-leader votes to advisory input HR reads, show the employee their leader list when applying, and notify HR of every new request.

**Architecture:** A new `hr_decision` field on `Attendance Exception` becomes the sole source of parent `status` (they share Select options, so the derivation is one assignment and `derive_status` is deleted). The `Attendance Exception Approver` child table survives untouched but stops gating. A patch-created `HR Manager` role gates a new HR inbox — the existing admin Leave/WFH screen, upgraded. The attendance engine is not touched: `on_update → exception_changed → recompute_range` still keys off `status`.

**Tech Stack:** Frappe v15 (Python), React 18 + TypeScript + React Query + Tailwind. Two frontends: `frontend/` = mobile `/m`, `frontend-web/` = web `/w`; `frontend/src` is aliased `@` in **both** (`frontend-web/vite.config.ts:33`), so hooks/types/api are written once and consumed twice.

## Global Constraints

- **Live site, no test DB** (`vernon-live-site-codefirst`). There is no pytest suite for this app. The only automated check is `approval.py`'s `python approval.py` self-check, which imports no frappe. Everything else is verified by reading and by manual E2E on project.vernon.id after deploy.
- **Notification `type` must be `"Approval"`** — an invalid type makes `_notify` swallow the insert and the notification vanishes silently (`vernon-notify-type-gotcha`).
- **Every dropdown uses `SearchableSelect`/`MultiSelectSearch`** (`vernon-searchable-select-convention`). No new native `<select>`. This plan adds none.
- **Never `alert()`/`confirm()`/`prompt()`** (`vernon-no-alert-use-dialog`) — use a dialog/Sheet.
- **Both frontends must be rebuilt** if `frontend/src` changes, because both compile it.
- Indonesian user-facing copy where the surrounding code already uses it (e.g. the existing `"Alasan penolakan wajib diisi."`). English elsewhere, matching each file.
- Roles are created by **patches**, not fixtures — `hooks.py` has no `fixtures` key.
- Tabs, not spaces, in Python files (this app's existing style).

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `vernon_project/patches/v1_0/add_hr_manager_role.py` | **create** — makes the `HR Manager` role | 1 |
| `vernon_project/patches/v1_0/backfill_exception_hr_decision.py` | **create** — `hr_decision = status` on existing rows | 2 |
| `vernon_project/patches.txt` | register both patches | 1, 2 |
| `vernon_project/api/mobile.py:22` | `VERNON_ROLES` gains `HR Manager` so it is grantable in-app | 1 |
| `.../doctype/attendance_exception/attendance_exception.json` | 4 new HR fields | 2 |
| `vernon_project/attendance/approval.py` | delete `derive_status`; keep `distinct_leaders` | 3 |
| `vernon_project/api/attendance.py` | HR helpers, HR voting path, `my_leaders`, `hr_pending_exceptions`, HR notification | 4 |
| `frontend/src/lib/types.ts` | HR fields on the row type | 5 |
| `frontend/src/lib/api.ts` | `myLeaders`, `hrPendingExceptions`, `as_hr` on vote calls | 5 |
| `frontend/src/lib/notifications.ts` | route the HR pseudo-doctype | 5 |
| `frontend/src/hooks/useData.ts` | new hooks, `canHrApprove`, `HR Manager` in `VERNON_ROLE_OPTIONS` | 5 |
| `frontend/src/pages/NotificationsScreen.tsx` | mobile HR route in `ROUTES` | 5 |
| `frontend-web/src/components/NotificationSheet.tsx` | web HR route in `ROUTES` | 5 |
| `frontend/src/pages/RequestException.tsx` | leader preview | 6 |
| `frontend/src/pages/MyExceptions.tsx` | per-leader decisions + HR verdict | 6 |
| `frontend/src/pages/ExceptionApprovals.tsx` | advisory wording | 7 |
| `frontend/src/pages/AttendanceExceptionsScreen.tsx` | mobile HR inbox | 7 |
| `frontend/src/App.tsx` | mobile HR inbox route moves under `canHrApprove` | 7 |
| `frontend-web/src/pages/ExceptionApprovals.tsx` | advisory wording | 8 |
| `frontend-web/src/pages/Exceptions.tsx` | web HR inbox | 8 |
| `frontend-web/src/App.tsx` | web HR inbox route moves under `canHrApprove` | 8 |
| `frontend-web/src/lib/nav.ts` | HR inbox nav leaf splits out of the attendance-admin group | 8 |

---

### Task 1: `HR Manager` role, creatable and grantable

**Files:**
- Create: `vernon_project/patches/v1_0/add_hr_manager_role.py`
- Modify: `vernon_project/patches.txt` (append)
- Modify: `vernon_project/api/mobile.py:22`

**Interfaces:**
- Consumes: nothing.
- Produces: a Frappe Role named exactly `HR Manager`, assignable through the existing user-admin screens.

`VERNON_ROLES` is the allowlist `update_user` syncs against: `_clean_roles` (`api/mobile.py:2040`) drops anything outside it, and `update_user` (`:2099`) only adds/removes within it. A role absent from that tuple cannot be granted from the app at all. That is why this task touches `mobile.py`.

- [ ] **Step 1: Write the role patch**

Create `vernon_project/patches/v1_0/add_hr_manager_role.py` (mirrors `add_lms_manager_role.py` exactly):

```python
import frappe

ROLE = "HR Manager"


def execute():
	"""Create the HR Manager role. Idempotent."""
	if not frappe.db.exists("Role", ROLE):
		frappe.get_doc({
			"doctype": "Role",
			"role_name": ROLE,
			"desk_access": 0,
		}).insert(ignore_permissions=True)
	frappe.db.commit()
```

- [ ] **Step 2: Register the patch**

Append to `vernon_project/patches.txt` (the file currently ends with `vernon_project.patches.v1_0.create_partner_role`):

```
vernon_project.patches.v1_0.add_hr_manager_role
```

- [ ] **Step 3: Make the role grantable in-app**

In `vernon_project/api/mobile.py:22`, change:

```python
VERNON_ROLES = ("Project Owner", "Project Leader", "Project Admin", "Project Team", "Points Granter")
```

to:

```python
VERNON_ROLES = ("Project Owner", "Project Leader", "Project Admin", "Project Team", "Points Granter", "HR Manager")
```

- [ ] **Step 4: Run the patch and verify the role exists**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate
```
Expected: migrate completes; `add_hr_manager_role` appears in the executed-patch output (or is skipped as already-run on a re-run).

Verify:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
import frappe
print("role exists:", frappe.db.exists("Role", "HR Manager"))
from vernon_project.api.mobile import VERNON_ROLES
print("grantable:", "HR Manager" in VERNON_ROLES)
EOF
```
Expected: `role exists: HR Manager` and `grantable: True`.

(Heredoc, not `bench execute` — `bench execute` cannot import app modules; see `frappe-bench-delete-gotchas`. Keep the snippet loop-free per `vernon-bench-console-stdin-gotcha`.)

- [ ] **Step 5: Commit**

```bash
git add vernon_project/patches/v1_0/add_hr_manager_role.py vernon_project/patches.txt vernon_project/api/mobile.py
git commit -m "feat(cuti): add HR Manager role, grantable from user admin"
```

---

### Task 2: `hr_decision` fields + backfill

**Files:**
- Modify: `vernon_project/vernon_project/doctype/attendance_exception/attendance_exception.json:8,17`
- Create: `vernon_project/patches/v1_0/backfill_exception_hr_decision.py`
- Modify: `vernon_project/patches.txt` (append)

**Interfaces:**
- Consumes: nothing.
- Produces: fields `hr_decision` (Select `Pending\nApproved\nRejected`, default `Pending`), `hr_by` (Link User, read_only), `hr_decided_at` (Datetime, read_only), `hr_reason` (Small Text) on `Attendance Exception`. Task 4 reads and writes all four.

The backfill is not optional. Without it, every already-Approved cuti derives back to `Pending` on its next save, and `exception_changed → recompute_range` un-excuses attendance days that were legitimately excused.

- [ ] **Step 1: Add the fields to the doctype JSON**

In `attendance_exception.json`, replace the `field_order` line (line 8):

```json
 "field_order": ["employee", "exception_type", "from_date", "to_date", "status", "approver", "reason", "approvers"],
```

with:

```json
 "field_order": ["employee", "exception_type", "from_date", "to_date", "status", "approver", "reason", "approvers", "hr_decision", "hr_by", "hr_decided_at", "hr_reason"],
```

and replace the `approvers` field entry (line 17):

```json
  {"fieldname": "approvers", "fieldtype": "Table", "label": "Approvers", "options": "Attendance Exception Approver"}
```

with:

```json
  {"fieldname": "approvers", "fieldtype": "Table", "label": "Approvers", "options": "Attendance Exception Approver"},
  {"fieldname": "hr_decision", "fieldtype": "Select", "label": "HR Decision", "options": "Pending\nApproved\nRejected", "default": "Pending", "in_list_view": 1},
  {"fieldname": "hr_by", "fieldtype": "Link", "label": "HR Decided By", "options": "User", "read_only": 1},
  {"fieldname": "hr_decided_at", "fieldtype": "Datetime", "label": "HR Decided At", "read_only": 1},
  {"fieldname": "hr_reason", "fieldtype": "Small Text", "label": "HR Reason"}
```

Note the comma added to the `approvers` line — it is no longer last.

- [ ] **Step 2: Write the backfill patch**

Create `vernon_project/patches/v1_0/backfill_exception_hr_decision.py`:

```python
import frappe


def execute():
	"""Seed hr_decision from the pre-HR parent status.

	Before HR existed, `status` was the unanimous-leader verdict and was the
	whole truth. Now `status` mirrors `hr_decision`, so any historical row left
	at the Pending default would derive back to Pending on its next save and
	silently un-excuse attendance days that were legitimately excused.
	Idempotent: only touches rows still out of sync.
	"""
	frappe.db.sql(
		"""
		UPDATE `tabAttendance Exception`
		SET hr_decision = status
		WHERE hr_decision IS NULL OR hr_decision != status
		"""
	)
	frappe.db.commit()
```

- [ ] **Step 3: Register the patch**

Append to `vernon_project/patches.txt`, **after** `add_hr_manager_role`:

```
vernon_project.patches.v1_0.backfill_exception_hr_decision
```

- [ ] **Step 4: Migrate and verify zero drift**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate
```
Expected: completes without error.

Verify:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
import frappe
drift = frappe.db.sql("SELECT COUNT(*) FROM `tabAttendance Exception` WHERE hr_decision IS NULL OR hr_decision != status")[0][0]
print("rows out of sync:", drift)
print("by status:", frappe.db.sql("SELECT status, hr_decision, COUNT(*) FROM `tabAttendance Exception` GROUP BY status, hr_decision"))
EOF
```
Expected: `rows out of sync: 0`, and every group has `status == hr_decision`.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/doctype/attendance_exception/attendance_exception.json vernon_project/patches/v1_0/backfill_exception_hr_decision.py vernon_project/patches.txt
git commit -m "feat(cuti): hr_decision fields on Attendance Exception + backfill"
```

---

### Task 3: Delete `derive_status`

**Files:**
- Modify: `vernon_project/attendance/approval.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `approval.py` exports **only** `distinct_leaders(leaders, employee) -> list[str]`. Task 4 must stop importing `derive_status`.

`status` and `hr_decision` share the same three Select options, so the derivation is `doc.status = doc.hr_decision`. A function wrapping an assignment earns nothing. Unanimity and zero-leader auto-approve die with it — deliberately: HR is final for every request, including one from an employee with no leaders.

- [ ] **Step 1: Replace the file**

Write `vernon_project/attendance/approval.py` in full:

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# Pure approval logic for Attendance Exception. No frappe / DB imports here on
# purpose — keeps it unit-testable via `python approval.py`.
#
# There is no derive_status(): since 2026-07-15 HR is the final approver, and
# `status` is a straight mirror of `hr_decision` (same Select options), so the
# whole derivation is one assignment in api/attendance.py. Leader decisions are
# advisory and gate nothing.


def distinct_leaders(leaders, employee):
	"""Order-preserving distinct leaders, excluding the requester and falsy."""
	seen = []
	for leader in leaders:
		if leader and leader != employee and leader not in seen:
			seen.append(leader)
	return seen


if __name__ == "__main__":
	assert distinct_leaders(["a", "a", "b", None, ""], "z") == ["a", "b"]
	assert distinct_leaders(["a", "z", "b"], "z") == ["a", "b"]  # self excluded
	assert distinct_leaders([], "z") == []
	print("approval.py self-check OK")
```

- [ ] **Step 2: Run the self-check**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project && python vernon_project/attendance/approval.py
```
Expected: `approval.py self-check OK`

- [ ] **Step 3: Verify nothing else imports the deleted function**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project && grep -rn "derive_status" --include=*.py .
```
Expected: only `vernon_project/api/attendance.py:12` (the import) and `:245` (the call) — both rewritten in Task 4. **Do not commit this task alone**; it lands with Task 4.

---

### Task 4: HR approval path in the API

**Files:**
- Modify: `vernon_project/api/attendance.py:12` (import), `:163-178` (leader notify copy), `:195-264` (request + vote + endpoints), `:267-289` (`_shape_exception_rows`)

**Interfaces:**
- Consumes: `distinct_leaders` (Task 3); `hr_decision`/`hr_by`/`hr_decided_at`/`hr_reason` fields (Task 2); role `HR Manager` (Task 1).
- Produces, for Task 5's api layer:
  - `my_leaders()` → `{"status": "ok", "leaders": ["a@x.com", ...]}`
  - `hr_pending_exceptions()` → `{"status": "ok", "rows": [...]}`
  - `approve_exception(exception_id, as_hr=0)` → `{"status": "ok", "approval_status": str}` | `{"status": "error", "message": str}`
  - `reject_exception(exception_id, reason=None, as_hr=0)` → same shape
  - each shaped row gains `hr_decision`, `hr_by`, `hr_reason`, and per-approver `reason`
  - HR notifications carry `reference_doctype = "Attendance Exception HR"`

- [ ] **Step 1: Fix the import**

`api/attendance.py:12` currently reads:

```python
from vernon_project.attendance.approval import derive_status, distinct_leaders
```

Change to:

```python
from vernon_project.attendance.approval import distinct_leaders
```

- [ ] **Step 2: Add the HR helpers**

Insert immediately after `_leaders_for_employee` (which ends at `:156`) and before `_exc_label`:

```python
def _is_hr(user):
	roles = frappe.get_roles(user)
	return "HR Manager" in roles or "System Manager" in roles


def _hr_users():
	"""Who to notify about a new request.

	HR Manager holders, falling back to System Managers when nobody holds the
	role yet — otherwise a site that deploys before granting it notifies nobody
	and wedges every request at Pending with no visible cause.
	"""
	users = [
		r.parent for r in frappe.get_all(
			"Has Role",
			filters={"parenttype": "User", "role": "HR Manager"},
			fields=["parent"],
		)
	]
	if not users:
		users = [
			r.parent for r in frappe.get_all(
				"Has Role",
				filters={"parenttype": "User", "role": "System Manager"},
				fields=["parent"],
			)
		]
	enabled = frappe.get_all(
		"User",
		filters={"name": ["in", users], "enabled": 1},
		fields=["name"],
	) if users else []
	return sorted({u.name for u in enabled})
```

- [ ] **Step 3: Add the HR notification and reword the leader one**

Replace `_notify_leaders_new_request` (`:163-178`) in full — only the title string changes, plus a new function below it:

```python
def _notify_leaders_new_request(doc, leaders):
	from vernon_project.api.mobile import _notify
	label = _exc_label(doc)
	for leader in leaders:
		_notify(
			leader,
			"Approval",
			# Advisory since 2026-07-15: HR decides. Wording says "input", not
			# "approval", so a leader does not think the cuti waits on them.
			_("{0} request needs your input").format(label),
			_("{0} requested {1}: {2} → {3}").format(doc.employee, label, doc.from_date, doc.to_date),
			# Pseudo-doctype (cf. "Wallet"): the leader's approval queue and the
			# requester's own list are different screens, and the real doctype is
			# identical for both. Tag the audience here so the apps can route it.
			"Attendance Exception Approval",
			doc.name,
			doc.employee,
		)


def _notify_hr_new_request(doc):
	from vernon_project.api.mobile import _notify
	label = _exc_label(doc)
	for hr in _hr_users():
		_notify(
			hr,
			"Approval",
			_("{0} request needs HR approval").format(label),
			_("{0} requested {1}: {2} → {3}").format(doc.employee, label, doc.from_date, doc.to_date),
			# Third audience, third pseudo-doctype -> routes to the HR inbox.
			"Attendance Exception HR",
			doc.name,
			doc.employee,
		)
```

`_notify` skips self-notification when `recipient == actor` (`api/mobile.py:262`), so an HR user filing their own cuti is not notified of it. That is correct and needs no special-casing here.

- [ ] **Step 4: Add `my_leaders`**

Insert directly above `request_exception` (`:195`):

```python
@frappe.whitelist()
def my_leaders():
	"""The leaders who will review the caller's next request. Preview only —
	request_exception re-snapshots at insert time and that snapshot is the one
	that counts."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please log in"), frappe.PermissionError)
	return {"status": "ok", "leaders": _leaders_for_employee(user)}
```

- [ ] **Step 5: Drop the auto-approve from `request_exception`**

Replace `request_exception`'s body (`:195-219`) with:

```python
@frappe.whitelist()
def request_exception(from_date, to_date, exception_type, reason=None):
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please log in"), frappe.PermissionError)
	if exception_type not in ("WFH", "Leave"):
		return {"status": "error", "message": _("Invalid type.")}
	if getdate(to_date) < getdate(from_date):
		return {"status": "error", "message": _("To Date cannot be before From Date.")}
	leaders = _leaders_for_employee(user)
	approvers = [{"approver": leader, "decision": "Pending"} for leader in leaders]
	doc = frappe.get_doc({
		"doctype": "Attendance Exception",
		"employee": user,
		"from_date": from_date,
		"to_date": to_date,
		"exception_type": exception_type,
		"reason": reason,
		# Always Pending now: HR is the final approver, so a leaderless request
		# waits for HR like any other (the old empty-approvers auto-approve is
		# gone with derive_status).
		"status": "Pending",
		"hr_decision": "Pending",
		"approvers": approvers,
	}).insert(ignore_permissions=True)
	if leaders:
		_notify_leaders_new_request(doc, leaders)
	_notify_hr_new_request(doc)
	return {"status": "ok", "name": doc.name, "approval_status": "Pending"}
```

- [ ] **Step 6: Rewrite the voting path**

Replace `_vote_exception`, `approve_exception` and `reject_exception` (`:222-264`) with:

```python
def _vote_exception(exception_id, decision, reason, as_hr=False):
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please log in"), frappe.PermissionError)
	doc = frappe.get_doc("Attendance Exception", exception_id)

	if as_hr:
		if not _is_hr(user):
			return {"status": "error", "message": _("Only HR can decide this request.")}
		doc.hr_decision = decision
		doc.hr_by = user
		doc.hr_decided_at = now_datetime()
		doc.hr_reason = reason if decision == "Rejected" else None
		# status is a straight mirror of hr_decision — same Select options.
		doc.status = decision
	else:
		row = next((r for r in doc.approvers if r.approver == user), None)
		if row is None:
			return {"status": "error", "message": _("You are not an approver for this request.")}
		if doc.hr_decision != "Pending":
			return {"status": "error", "message": _("HR has already decided this request.")}
		row.decision = decision
		row.decided_at = now_datetime()
		row.reason = reason if decision == "Rejected" else None
		# Advisory only: a leader vote never moves doc.status.

	doc.approver = user
	doc.save(ignore_permissions=True)  # on_update -> exception_changed recomputes the day
	if as_hr and doc.status in ("Approved", "Rejected"):
		_notify_employee_decision(doc, doc.status, reason, actor=user)
	return {"status": "ok", "approval_status": doc.status}


@frappe.whitelist()
def approve_exception(exception_id, as_hr=0):
	return _vote_exception(exception_id, "Approved", None, as_hr=cint(as_hr) == 1)


@frappe.whitelist()
def reject_exception(exception_id, reason=None, as_hr=0):
	reason = (reason or "").strip()
	if not reason:
		return {"status": "error", "message": _("Alasan penolakan wajib diisi.")}
	return _vote_exception(exception_id, "Rejected", reason, as_hr=cint(as_hr) == 1)
```

Three deletions worth naming: the System-Manager-forces-every-row override branch is gone (it existed only to break leader deadlock, which no longer exists — admins now decide through the HR path, which `_is_hr` admits them to); the `derive_status` call is gone; and the leader path no longer notifies the employee, because a leader vote is not a verdict.

`as_hr` arrives over HTTP as the string `"1"`, hence `cint`. `cint` is already imported at the top of this file.

- [ ] **Step 7: Widen `_shape_exception_rows` and add the HR inbox endpoint**

Replace `_shape_exception_rows` (`:267-289`) with:

```python
def _shape_exception_rows(names):
	if not names:
		return []
	excs = frappe.get_all(
		"Attendance Exception",
		filters={"name": ["in", names]},
		fields=[
			"name", "employee", "exception_type", "from_date", "to_date",
			"status", "reason", "hr_decision", "hr_by", "hr_reason",
		],
		order_by="from_date desc",
	)
	appr = frappe.get_all(
		"Attendance Exception Approver",
		filters={"parent": ["in", names]},
		fields=["parent", "approver", "decision", "reason"],
	)
	by_parent = {}
	for a in appr:
		by_parent.setdefault(a.parent, []).append({
			"approver": a.approver,
			"decision": a.decision,
			"reason": a.reason,
		})
	for e in excs:
		rows = by_parent.get(e["name"], [])
		e["approvers"] = rows
		e["approved_count"] = sum(1 for r in rows if r["decision"] == "Approved")
		e["total"] = len(rows)
	return excs


@frappe.whitelist()
def hr_pending_exceptions():
	"""Every request still awaiting an HR verdict, with the leaders' advisory
	votes attached so HR can read them on the card."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please log in"), frappe.PermissionError)
	if not _is_hr(user):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	names = [
		r.name for r in frappe.get_all(
			"Attendance Exception",
			filters={"hr_decision": "Pending"},
			fields=["name"],
			limit_page_length=0,
		)
	]
	return {"status": "ok", "rows": _shape_exception_rows(names)}
```

`pending_exception_approvals` is left alone: it already filters to parents still `status == "Pending"`, and since `status` mirrors `hr_decision`, HR-decided requests drop out of leader inboxes on their own.

- [ ] **Step 8: Verify the module imports and the wiring is sound**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
import frappe, inspect
from vernon_project.api import attendance as A
print("derive_status gone:", not hasattr(A, "derive_status"))
print("approve sig:", inspect.signature(A.approve_exception))
print("reject sig:", inspect.signature(A.reject_exception))
print("hr users:", A._hr_users())
print("is_hr(Administrator):", A._is_hr("Administrator"))
EOF
```
Expected: `derive_status gone: True`; `approve sig: (exception_id, as_hr=0)`; `reject sig: (exception_id, reason=None, as_hr=0)`; `hr users:` a non-empty list (System Managers, via the fallback, until the role is granted); `is_hr(Administrator): True`.

- [ ] **Step 9: Restart and commit**

```bash
sudo /usr/local/bin/tj-restart
```

```bash
git add vernon_project/api/attendance.py vernon_project/attendance/approval.py
git commit -m "feat(cuti): HR is the final approver; leader votes are advisory

Leader votes no longer move doc.status — hr_decision does, and status is
its mirror. Deletes derive_status (unanimity + zero-leader auto-approve)
and the System Manager force-every-row override, which existed only to
break leader deadlock. HR is notified on every new request."
```

---

### Task 5: Shared frontend layer — types, api, hooks, notification routing

**Files:**
- Modify: `frontend/src/lib/types.ts:1016-1031`
- Modify: `frontend/src/lib/api.ts:522-536`
- Modify: `frontend/src/lib/notifications.ts:36-41, 77-80`
- Modify: `frontend/src/hooks/useData.ts:116-117, 802-805, 807-814, 1599-1653`
- Modify: `frontend/src/pages/NotificationsScreen.tsx:17-20`
- Modify: `frontend-web/src/components/NotificationSheet.tsx:17-22`

**Interfaces:**
- Consumes: Task 4's endpoints.
- Produces, for Tasks 6-8:
  - `useMyLeaders()` → `UseQueryResult<string[]>`
  - `useHrPendingExceptions()` → `UseQueryResult<AttendanceExceptionRow[]>`
  - `useApproveException()` → mutation taking `{ name: string; as_hr?: boolean }`
  - `useRejectException()` → mutation taking `{ name: string; reason: string; as_hr?: boolean }`
  - `canHrApprove(boot: Boot | undefined) => boolean`
  - `AttendanceExceptionRow.hr_decision`, `.hr_by?`, `.hr_reason?`; `ExceptionApprover.reason?`

`useApproveException`'s parameter changes from `string` to an object. All four call sites (`frontend/src/pages/ExceptionApprovals.tsx`, `frontend/src/pages/AttendanceExceptionsScreen.tsx`, `frontend-web/src/pages/ExceptionApprovals.tsx`, `frontend-web/src/pages/Exceptions.tsx`) are updated in Tasks 7 and 8. **`tsc` will fail between this task and Task 8** — that is expected; Task 8 closes it.

- [ ] **Step 1: Extend the types**

In `frontend/src/lib/types.ts`, replace lines 1016-1031:

```ts
export type ExceptionApprover = {
  approver: string
  decision: ExceptionDecision
}

export type AttendanceExceptionRow = {
  name: string
  employee: string
  exception_type: 'WFH' | 'Leave'
  from_date: string
  to_date: string
  status: ExceptionDecision
  reason?: string
  approvers: ExceptionApprover[]
  approved_count: number
  total: number
```

with:

```ts
export type ExceptionApprover = {
  approver: string
  decision: ExceptionDecision
  /** Set only when the leader objected. */
  reason?: string
}

export type AttendanceExceptionRow = {
  name: string
  employee: string
  exception_type: 'WFH' | 'Leave'
  from_date: string
  to_date: string
  /** Mirrors hr_decision. HR is the final approver; leader votes are advisory. */
  status: ExceptionDecision
  reason?: string
  approvers: ExceptionApprover[]
  approved_count: number
  total: number
  hr_decision: ExceptionDecision
  hr_by?: string
  hr_reason?: string
```

(The closing `}` on line 1032 stays as-is.)

- [ ] **Step 2: Extend the api layer**

In `frontend/src/lib/api.ts`, replace lines 529-536:

```ts
  approveException: (exception_id: string) =>
    api.post<{ status: string; message?: string; approval_status?: string }>(A + 'approve_exception', { exception_id }),
  rejectException: (exception_id: string, reason: string) =>
    api.post<{ status: string; message?: string; approval_status?: string }>(A + 'reject_exception', { exception_id, reason }),
  pendingExceptionApprovals: () =>
    api.get<{ status: string; rows: import('./types').AttendanceExceptionRow[] }>(A + 'pending_exception_approvals'),
  myExceptions: (limit = 30) =>
    api.get<{ status: string; rows: import('./types').AttendanceExceptionRow[] }>(A + 'my_exceptions', { limit }),
```

with:

```ts
  approveException: (exception_id: string, as_hr = false) =>
    api.post<{ status: string; message?: string; approval_status?: string }>(A + 'approve_exception', {
      exception_id,
      as_hr: as_hr ? 1 : 0,
    }),
  rejectException: (exception_id: string, reason: string, as_hr = false) =>
    api.post<{ status: string; message?: string; approval_status?: string }>(A + 'reject_exception', {
      exception_id,
      reason,
      as_hr: as_hr ? 1 : 0,
    }),
  pendingExceptionApprovals: () =>
    api.get<{ status: string; rows: import('./types').AttendanceExceptionRow[] }>(A + 'pending_exception_approvals'),
  hrPendingExceptions: () =>
    api.get<{ status: string; rows: import('./types').AttendanceExceptionRow[] }>(A + 'hr_pending_exceptions'),
  myLeaders: () => api.get<{ status: string; leaders: string[] }>(A + 'my_leaders'),
  myExceptions: (limit = 30) =>
    api.get<{ status: string; rows: import('./types').AttendanceExceptionRow[] }>(A + 'my_exceptions', { limit }),
```

- [ ] **Step 3: Route the HR notification**

In `frontend/src/lib/notifications.ts`, replace the `DeepLinkRoutes` interface (lines 35-41):

```ts
/** The two destinations whose path differs between /m and /w. */
export interface DeepLinkRoutes {
  /** A leader's "cuti waiting on you" queue. */
  exceptionApprovals: string
  /** The requester's own cuti list. Web has no such screen yet — pass '/'. */
  myExceptions: string
}
```

with:

```ts
/** The destinations whose path differs between /m and /w. */
export interface DeepLinkRoutes {
  /** A leader's "cuti waiting on your input" queue. Advisory since HR became final. */
  exceptionApprovals: string
  /** The requester's own cuti list. Web has no such screen yet — pass '/'. */
  myExceptions: string
  /** HR's inbox — the only screen that can actually decide a cuti. */
  hrExceptions: string
}
```

and add a case above `case 'Attendance Exception Approval':` (line 77):

```ts
    case 'Attendance Exception HR':
      return routes.hrExceptions
```

- [ ] **Step 4: Point both ROUTES consts at their HR inbox**

In `frontend/src/pages/NotificationsScreen.tsx`, replace lines 17-20:

```ts
const ROUTES = {
  exceptionApprovals: '/attendance/approvals',
  myExceptions: '/attendance/my-requests',
}
```

with:

```ts
const ROUTES = {
  exceptionApprovals: '/attendance/approvals',
  myExceptions: '/attendance/my-requests',
  hrExceptions: '/attendance/manage/exceptions',
}
```

In `frontend-web/src/components/NotificationSheet.tsx`, replace lines 17-22:

```ts
const ROUTES = {
  exceptionApprovals: '/attendance/my-approvals',
  // /attendance/exceptions is the admin screen; web has no requester-side list,
  // so a cuti verdict has nowhere better to land than home.
  myExceptions: '/',
}
```

with:

```ts
const ROUTES = {
  exceptionApprovals: '/attendance/my-approvals',
  // web has no requester-side list, so a cuti verdict has nowhere better to
  // land than home.
  myExceptions: '/',
  hrExceptions: '/attendance/exceptions',
}
```

- [ ] **Step 5: Add the HR gate and make the role assignable**

In `frontend/src/hooks/useData.ts`, replace lines 802-814:

```ts
// ponytail: System Manager only for v1. Add an 'Attendance Manager' role + check here if delegation is needed.
export function canManageAttendance(boot: Boot | undefined): boolean {
  return !!boot && boot.roles.includes('System Manager')
}

// The Vernon roles assignable from the mobile user-management screen.
export const VERNON_ROLE_OPTIONS = [
  { value: 'Project Owner', label: 'Owner' },
  { value: 'Project Leader', label: 'Leader' },
  { value: 'Project Admin', label: 'Admin' },
  { value: 'Project Team', label: 'Team' },
  { value: 'Points Granter', label: 'Points Granter' },
]
```

with:

```ts
// Stations, schedules, holidays, profiles and the daily report. Deliberately
// NOT widened to HR Manager: the report's backend gate is System Manager only
// (api/attendance.py _require_attendance_admin), so HR would get a screen that
// 403s. HR gets canHrApprove instead.
export function canManageAttendance(boot: Boot | undefined): boolean {
  return !!boot && boot.roles.includes('System Manager')
}

/** Who may cast the final verdict on a cuti / WFH request. Mirrors _is_hr(). */
export function canHrApprove(boot: Boot | undefined): boolean {
  return !!boot && (boot.roles.includes('System Manager') || boot.roles.includes('HR Manager'))
}

// The Vernon roles assignable from the mobile user-management screen.
// Must stay a subset of VERNON_ROLES in api/mobile.py — update_user silently
// drops anything outside that tuple.
export const VERNON_ROLE_OPTIONS = [
  { value: 'Project Owner', label: 'Owner' },
  { value: 'Project Leader', label: 'Leader' },
  { value: 'Project Admin', label: 'Admin' },
  { value: 'Project Team', label: 'Team' },
  { value: 'Points Granter', label: 'Points Granter' },
  { value: 'HR Manager', label: 'HR' },
]
```

- [ ] **Step 6: Add the query keys**

In `frontend/src/hooks/useData.ts`, replace lines 116-117:

```ts
  pendingExceptionApprovals: ['pendingExceptionApprovals'] as const,
  myExceptions: ['myExceptions'] as const,
```

with:

```ts
  pendingExceptionApprovals: ['pendingExceptionApprovals'] as const,
  hrPendingExceptions: ['hrPendingExceptions'] as const,
  myLeaders: ['myLeaders'] as const,
  myExceptions: ['myExceptions'] as const,
```

- [ ] **Step 7: Rewrite the exception hooks**

In `frontend/src/hooks/useData.ts`, replace the whole block at lines 1599-1653 (from `export function useRequestException() {` through the end of `useRejectException`) with:

```ts
export function useRequestException() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { from_date: string; to_date: string; exception_type: 'WFH' | 'Leave'; reason?: string }) => {
      const res = await mobileApi.requestException(vars.from_date, vars.to_date, vars.exception_type, vars.reason)
      if (res.status !== 'ok') throw new Error(res.message || 'Request failed')
      return res
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.myAttendance })
      qc.invalidateQueries({ queryKey: keys.myExceptions })
    },
  })
}

export function useMyLeaders() {
  return useQuery({
    queryKey: keys.myLeaders,
    queryFn: async () => (await mobileApi.myLeaders()).leaders,
  })
}

export function usePendingExceptionApprovals() {
  return useQuery({
    queryKey: keys.pendingExceptionApprovals,
    queryFn: async () => (await mobileApi.pendingExceptionApprovals()).rows,
  })
}

export function useHrPendingExceptions() {
  return useQuery({
    queryKey: keys.hrPendingExceptions,
    queryFn: async () => (await mobileApi.hrPendingExceptions()).rows,
  })
}

export function useMyExceptions() {
  return useQuery({
    queryKey: keys.myExceptions,
    queryFn: async () => (await mobileApi.myExceptions()).rows,
  })
}

function invalidateExceptions(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: keys.pendingExceptionApprovals })
  qc.invalidateQueries({ queryKey: keys.hrPendingExceptions })
  qc.invalidateQueries({ queryKey: keys.myExceptions })
}

export function useApproveException() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { name: string; as_hr?: boolean }) => {
      const res = await mobileApi.approveException(vars.name, vars.as_hr)
      if (res.status !== 'ok') throw new Error(res.message || 'Failed')
      return res
    },
    onSettled: () => invalidateExceptions(qc),
  })
}

export function useRejectException() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { name: string; reason: string; as_hr?: boolean }) => {
      const res = await mobileApi.rejectException(vars.name, vars.reason, vars.as_hr)
      if (res.status !== 'ok') throw new Error(res.message || 'Failed')
      return res
    },
    onSettled: () => invalidateExceptions(qc),
  })
}
```

`useRequestException` now also invalidates `myExceptions` — today it invalidates only `myAttendance`, so a freshly filed request does not appear on my-requests without a manual refresh.

- [ ] **Step 8: Confirm the expected type errors, and only those**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit 2>&1 | head -20
```
Expected: errors **only** in `src/pages/ExceptionApprovals.tsx` and `src/pages/AttendanceExceptionsScreen.tsx`, all of the form "Argument of type 'string' is not assignable to parameter of type '{ name: string; ...}'". Tasks 7 and 8 clear them. Any error in another file means a mistake in this task — fix it before moving on.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/lib/notifications.ts frontend/src/hooks/useData.ts frontend/src/pages/NotificationsScreen.tsx frontend-web/src/components/NotificationSheet.tsx
git commit -m "feat(cuti): shared hooks/types for HR decision + leader preview"
```

---

### Task 6: Mobile — leader preview on apply, per-leader decisions on my-requests

**Files:**
- Modify: `frontend/src/pages/RequestException.tsx`
- Modify: `frontend/src/pages/MyExceptions.tsx`

**Interfaces:**
- Consumes: `useMyLeaders`, `useMyExceptions`, `AttendanceExceptionRow.hr_decision`/`hr_reason`, `ExceptionApprover.reason` (Task 5).
- Produces: nothing consumed downstream.

This is where `approvers[]` finally renders. It has been fetched and typed since 2026-07-05 and displayed by zero components.

- [ ] **Step 1: Add the leader preview to the apply form**

In `frontend/src/pages/RequestException.tsx`, change the import on line 7:

```tsx
import { useRequestException } from '@/hooks/useData'
```

to:

```tsx
import { useRequestException, useMyLeaders } from '@/hooks/useData'
```

Add below `const req = useRequestException()` (line 15):

```tsx
  const { data: leaders, isLoading: leadersLoading } = useMyLeaders()
```

Insert this block between the Reason field's closing `</div>` and the submit `<button>`:

```tsx
        <div className="rounded-2xl border border-paper-edge bg-paper-card p-3 dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs font-semibold text-stone-500">Who reviews this</p>
          {leadersLoading ? (
            <div className="py-2"><Spinner className="h-4 w-4" /></div>
          ) : leaders && leaders.length > 0 ? (
            <>
              <ul className="mt-1.5 flex flex-col gap-1">
                {leaders.map((l) => (
                  <li key={l} className="flex items-center gap-1.5 text-sm text-stone-700 dark:text-slate-200">
                    <Users className="h-3.5 w-3.5 shrink-0 text-stone-400" /> {l}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-stone-400">
                Your project leaders give input. HR gives the final approval.
              </p>
            </>
          ) : (
            <p className="mt-1 text-xs text-stone-400">
              No project leaders — this goes straight to HR.
            </p>
          )}
        </div>
```

Add `Users` to the lucide import on line 3:

```tsx
import { Check, Users } from 'lucide-react'
```

- [ ] **Step 2: Show per-leader decisions on my-requests**

Replace `frontend/src/pages/MyExceptions.tsx` in full:

```tsx
import { FileText } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useMyExceptions } from '@/hooks/useData'

const badge: Record<string, string> = {
  Approved: 'bg-emerald-100 text-emerald-700',
  Rejected: 'bg-rose-100 text-rose-700',
  Pending: 'bg-amber-100 text-amber-700',
}

const dot: Record<string, string> = {
  Approved: 'bg-emerald-500',
  Rejected: 'bg-rose-500',
  Pending: 'bg-amber-400',
}

export default function MyExceptions() {
  const { data: rows, isLoading } = useMyExceptions()

  return (
    <DetailScreen title="My leave / WFH">
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : !rows || rows.length === 0 ? (
        <EmptyState icon={FileText} title="No requests yet" subtitle="Your leave / WFH requests show here." />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((e) => (
            <div
              key={e.name}
              className="rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold text-stone-800 dark:text-slate-100">
                  {e.exception_type === 'Leave' ? 'Cuti' : 'WFH'}
                </p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge[e.status] || badge.Pending}`}>
                  {e.status}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-stone-400">
                {e.from_date} → {e.to_date}
                {e.reason ? ` · ${e.reason}` : ''}
              </p>

              <div className="mt-3 flex flex-col gap-1.5 border-t border-paper-edge pt-2.5 dark:border-slate-700">
                {e.approvers.length > 0 ? (
                  e.approvers.map((a) => (
                    <div key={a.approver} className="flex items-start gap-2 text-xs">
                      <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dot[a.decision] || dot.Pending}`} />
                      <span className="text-stone-600 dark:text-slate-300">{a.approver}</span>
                      <span className="ml-auto shrink-0 text-stone-400">
                        {a.decision === 'Rejected' ? 'Objected' : a.decision === 'Approved' ? 'Supports' : 'No input yet'}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-stone-400">No project leaders — straight to HR.</p>
                )}
                <div className="flex items-start gap-2 text-xs">
                  <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dot[e.hr_decision] || dot.Pending}`} />
                  <span className="font-semibold text-stone-700 dark:text-slate-200">HR (final)</span>
                  <span className="ml-auto shrink-0 text-stone-400">{e.hr_decision}</span>
                </div>
                {e.hr_reason && <p className="pl-3.5 text-xs text-rose-600">{e.hr_reason}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </DetailScreen>
  )
}
```

- [ ] **Step 3: Typecheck**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit 2>&1 | grep -E "RequestException|MyExceptions"
```
Expected: no output (the two files are clean; the Task-5 errors in the other two pages remain until Task 7).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/RequestException.tsx frontend/src/pages/MyExceptions.tsx
git commit -m "feat(cuti,/m): show reviewing leaders on apply + per-leader decisions on my-requests"
```

---

### Task 7: Mobile — advisory leader inbox + HR inbox

**Files:**
- Modify: `frontend/src/pages/ExceptionApprovals.tsx`
- Modify: `frontend/src/pages/AttendanceExceptionsScreen.tsx`
- Modify: `frontend/src/App.tsx:254-268`

**Interfaces:**
- Consumes: `useHrPendingExceptions`, `canHrApprove`, the object-shaped `useApproveException`/`useRejectException` (Task 5).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Reword the leader inbox and fix its mutation calls**

In `frontend/src/pages/ExceptionApprovals.tsx`:

Change line 21 from `await approve.mutateAsync(name)` to:

```tsx
      await approve.mutateAsync({ name })
```

Change line 22 from `toast('success', 'Approved')` to:

```tsx
      toast('success', 'Input sent')
```

Change line 36 from `toast('success', 'Rejected')` to:

```tsx
      toast('success', 'Objection sent')
```

Change the title on line 45:

```tsx
    <DetailScreen title="Approvals · Leave / WFH">
```

to:

```tsx
    <DetailScreen title="Input · Leave / WFH">
```

Change the empty state on line 49:

```tsx
        <EmptyState icon={Check} title="All clear" subtitle="Nothing awaiting your approval." />
```

to:

```tsx
        <EmptyState icon={Check} title="All clear" subtitle="Nothing awaiting your input." />
```

Replace the count line (lines 64-66):

```tsx
              <p className="mt-1 text-xs font-medium text-stone-500">
                {e.approved_count}/{e.total} approved
              </p>
```

with:

```tsx
              <p className="mt-1 text-xs font-medium text-stone-500">
                {e.approved_count}/{e.total} leaders support · HR decides
              </p>
```

Replace the two button labels (lines 73 and 79):

```tsx
                  <Check className="h-4 w-4" /> Approve
```
becomes
```tsx
                  <Check className="h-4 w-4" /> Support
```

```tsx
                  <X className="h-4 w-4" /> Reject
```
becomes
```tsx
                  <X className="h-4 w-4" /> Object
```

And the reject dialog heading (line 93):

```tsx
            <p className="mb-2 font-semibold text-stone-800 dark:text-slate-100">Reason for rejection</p>
```

becomes:

```tsx
            <p className="mb-2 font-semibold text-stone-800 dark:text-slate-100">Reason for objecting</p>
```

and its confirm button (line 112):

```tsx
                Confirm reject
```

becomes:

```tsx
                Send objection
```

- [ ] **Step 2: Turn the admin screen into the HR inbox**

Replace `frontend/src/pages/AttendanceExceptionsScreen.tsx` in full:

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canHrApprove, useHrPendingExceptions, useApproveException, useRejectException } from '@/hooks/useData'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100'

const dot: Record<string, string> = {
  Approved: 'bg-emerald-500',
  Rejected: 'bg-rose-500',
  Pending: 'bg-amber-400',
}

export default function AttendanceExceptionsScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canHrApprove(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const { data: rows, isLoading } = useHrPendingExceptions()
  const approve = useApproveException()
  const reject = useRejectException()
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const doApprove = async (name: string) => {
    try {
      await approve.mutateAsync({ name, as_hr: true })
      toast('success', 'Approved')
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  const submitReject = async () => {
    if (!rejecting) return
    if (!reason.trim()) {
      toast('error', 'Reason required')
      return
    }
    try {
      await reject.mutateAsync({ name: rejecting, reason: reason.trim(), as_hr: true })
      toast('success', 'Rejected')
      setRejecting(null)
      setReason('')
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  if (blocked) return null

  return (
    <DetailScreen title="HR · Leave / WFH">
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : !rows || rows.length === 0 ? (
        <EmptyState icon={Check} title="All clear" subtitle="No requests awaiting HR." />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((e) => (
            <div
              key={e.name}
              className="rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card dark:border-slate-700 dark:bg-slate-800"
            >
              <p className="font-semibold text-stone-800 dark:text-slate-100">
                {e.employee} · {e.exception_type === 'Leave' ? 'Cuti' : 'WFH'}
              </p>
              <p className="mt-0.5 text-xs text-stone-400">
                {e.from_date} → {e.to_date}
                {e.reason ? ` · ${e.reason}` : ''}
              </p>

              <div className="mt-3 flex flex-col gap-1.5 border-t border-paper-edge pt-2.5 dark:border-slate-700">
                <p className="text-xs font-semibold text-stone-500">Leader input</p>
                {e.approvers.length > 0 ? (
                  e.approvers.map((a) => (
                    <div key={a.approver} className="flex items-start gap-2 text-xs">
                      <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dot[a.decision] || dot.Pending}`} />
                      <span className="text-stone-600 dark:text-slate-300">{a.approver}</span>
                      <span className="ml-auto shrink-0 text-stone-400">
                        {a.decision === 'Rejected' ? 'Objected' : a.decision === 'Approved' ? 'Supports' : 'No input yet'}
                      </span>
                      {a.reason && <span className="basis-full pl-3.5 text-rose-600">{a.reason}</span>}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-stone-400">No project leaders.</p>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => doApprove(e.name)}
                  disabled={approve.isPending}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" /> Approve
                </button>
                <button
                  onClick={() => { setRejecting(e.name); setReason('') }}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white active:scale-95"
                >
                  <X className="h-4 w-4" /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4" onClick={() => setRejecting(null)}>
          <div
            className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl dark:bg-slate-800"
            onClick={(ev) => ev.stopPropagation()}
          >
            <p className="mb-2 font-semibold text-stone-800 dark:text-slate-100">Reason for rejection</p>
            <textarea
              className={field + ' min-h-[90px] resize-y'}
              value={reason}
              onChange={(ev) => setReason(ev.target.value)}
              autoFocus
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => setRejecting(null)}
                className="rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-stone-500 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={submitReject}
                disabled={reject.isPending}
                className="rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Confirm reject
              </button>
            </div>
          </div>
        </div>
      )}
    </DetailScreen>
  )
}
```

This drops the raw `resource.list` + manual `load()` (so React Query's `onSettled` invalidations now drive the screen), drops the hardcoded `'Rejected by admin'` in favour of a real prompt, and renders the leader input HR is supposed to weigh.

- [ ] **Step 3: Move the HR inbox route under its own gate**

In `frontend/src/App.tsx`, the exceptions route currently sits inside the `canManageAttendance(boot)` block (line 254-268). Remove this line from that block:

```tsx
        <Route path="/attendance/manage/exceptions" element={<AttendanceExceptionsScreen />} />
```

and add it beside the other ungated attendance routes, immediately after `<Route path="/attendance/my-requests" element={<MyExceptions />} />`:

```tsx
        {canHrApprove(boot) && (
          <Route path="/attendance/manage/exceptions" element={<AttendanceExceptionsScreen />} />
        )}
```

Add `canHrApprove` to the existing `@/hooks/useData` import in this file.

The `/attendance/manage` hub (`frontend/src/pages/AttendanceAdminScreen.tsx:11`) still links to it and stays behind `canManageAttendance` — an HR-only user reaches the inbox from their notification, not from the admin hub. Leave the hub alone.

- [ ] **Step 4: Typecheck — must be fully clean for mobile now**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```
Expected: no output at all. Every Task-5 error is now resolved on the mobile side.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ExceptionApprovals.tsx frontend/src/pages/AttendanceExceptionsScreen.tsx frontend/src/App.tsx
git commit -m "feat(cuti,/m): advisory leader inbox + HR inbox with leader input"
```

---

### Task 8: Web — advisory leader inbox + HR inbox + nav

**Files:**
- Modify: `frontend-web/src/pages/ExceptionApprovals.tsx`
- Modify: `frontend-web/src/pages/Exceptions.tsx`
- Modify: `frontend-web/src/App.tsx:276, 288`
- Modify: `frontend-web/src/lib/nav.ts:39, 91-99`

**Interfaces:**
- Consumes: the same Task-5 exports as Task 7.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Reword the web leader inbox and fix its mutation call**

In `frontend-web/src/pages/ExceptionApprovals.tsx`:

Change the heading on line 32:

```tsx
      <h1 className="text-2xl font-semibold tracking-tight text-ink">My approvals · Leave / WFH</h1>
```

to:

```tsx
      <h1 className="text-2xl font-semibold tracking-tight text-ink">My input · Leave / WFH</h1>
```

Change line 22 `toast('success', 'Rejected')` to:

```tsx
      toast('success', 'Objection sent')
```

Change the empty state on line 37:

```tsx
            <EmptyState icon={Check} title="All clear" subtitle="Nothing awaiting your approval." />
```

to:

```tsx
            <EmptyState icon={Check} title="All clear" subtitle="Nothing awaiting your input." />
```

In the `Card` block (lines 42-66), change the `meta` line so it names HR as the decider, change the approve `mutate` call to the object form, and relabel the buttons:

```tsx
                  meta={<span>{e.from_date} → {e.to_date}{e.reason ? ` · ${e.reason}` : ''} · {e.approved_count}/{e.total} approved</span>}
```

becomes:

```tsx
                  meta={<span>{e.from_date} → {e.to_date}{e.reason ? ` · ${e.reason}` : ''} · {e.approved_count}/{e.total} leaders support · HR decides</span>}
```

The approve button's `onClick` currently calls `approve.mutate(e.name, {...})`. Change the first argument to `{ name: e.name }`:

```tsx
                        onClick={() => approve.mutate({ name: e.name }, {
                          onSuccess: () => toast('success', 'Input sent'),
                          onError: (err) => toast('error', (err as Error).message),
                        })}
```

Relabel both buttons: `Approve` → `Support`, `Reject` → `Object`.

In the reject `Sheet`, change the confirm button label `Confirm reject` → `Send objection`.

- [ ] **Step 2: Turn the web admin screen into the HR inbox**

Replace `frontend-web/src/pages/Exceptions.tsx` in full:

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canHrApprove, useHrPendingExceptions, useApproveException, useRejectException } from '@/hooks/useData'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { Card, CardList } from '@web/components/Card'
import { Sheet } from '@web/components/Sheet'

const dot: Record<string, string> = {
  Approved: 'bg-emerald-500',
  Rejected: 'bg-rose-500',
  Pending: 'bg-amber-400',
}

export default function Exceptions() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canHrApprove(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const { data: rows, isLoading } = useHrPendingExceptions()
  const approve = useApproveException()
  const reject = useRejectException()
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const doApprove = async (name: string) => {
    try {
      await approve.mutateAsync({ name, as_hr: true })
      toast('success', 'Approved')
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  const submitReject = async () => {
    if (!rejecting || !reason.trim()) return
    try {
      await reject.mutateAsync({ name: rejecting, reason: reason.trim(), as_hr: true })
      toast('success', 'Rejected')
      setRejecting(null)
      setReason('')
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  if (blocked) return null

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">HR · Leave / WFH requests</h1>
      <BentoGrid>
        <BentoTile span="full" tone="plain">
          {isLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : !rows || rows.length === 0 ? (
            <EmptyState icon={Check} title="All clear" subtitle="No requests awaiting HR." />
          ) : (
            <CardList>
              {rows.map((e) => (
                <Card
                  key={e.name}
                  title={`${e.employee} · ${e.exception_type === 'Leave' ? 'Cuti' : 'WFH'}`}
                  meta={
                    <div className="flex flex-col gap-1">
                      <span>{e.from_date} → {e.to_date}{e.reason ? ` · ${e.reason}` : ''}</span>
                      {e.approvers.length > 0 ? (
                        e.approvers.map((a) => (
                          <span key={a.approver} className="flex items-center gap-1.5 text-xs">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot[a.decision] || dot.Pending}`} />
                            {a.approver} ·{' '}
                            {a.decision === 'Rejected' ? 'Objected' : a.decision === 'Approved' ? 'Supports' : 'No input yet'}
                            {a.reason ? ` — ${a.reason}` : ''}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs">No project leaders.</span>
                      )}
                    </div>
                  }
                  footer={
                    <>
                      <button onClick={() => doApprove(e.name)} disabled={approve.isPending} className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 active:scale-[0.99] transition disabled:opacity-50"><Check className="h-4 w-4" /> Approve</button>
                      <button onClick={() => { setRejecting(e.name); setReason('') }} className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-rose-600 py-2 text-sm font-semibold text-white hover:bg-rose-700 active:scale-[0.99] transition"><X className="h-4 w-4" /> Reject</button>
                    </>
                  }
                />
              ))}
            </CardList>
          )}
        </BentoTile>
      </BentoGrid>

      <Sheet open={!!rejecting} onClose={() => setRejecting(null)} title="Reason for rejection" size="sm">
        <textarea
          className="w-full min-h-[90px] resize-y rounded-xl border border-line px-3 py-2 text-sm text-ink"
          value={reason}
          onChange={(ev) => setReason(ev.target.value)}
          autoFocus
        />
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={() => setRejecting(null)} className="rounded-xl border border-line px-3 py-1.5 text-sm text-muted active:scale-[0.99] transition">Cancel</button>
          <button
            onClick={submitReject}
            disabled={reject.isPending || !reason.trim()}
            className="rounded-xl bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white active:scale-[0.99] transition disabled:opacity-50"
          >
            Confirm reject
          </button>
        </div>
      </Sheet>
    </div>
  )
}
```

The `Sheet` signature is `{ open, title, onClose, onBack?, size?, children }` (`frontend-web/src/components/Sheet.tsx:9-17`); this snippet mirrors the existing reject sheet at `frontend-web/src/pages/ExceptionApprovals.tsx:73` exactly, including the web colour tokens (`border-line`, `text-ink`, `text-muted`) — do **not** paste mobile's `border-slate-200` / `text-stone-500` classes into web.

- [ ] **Step 3: Move the web HR route under its own gate**

In `frontend-web/src/App.tsx`, remove line 276 from the `canManageAttendance(b)` block:

```tsx
        <Route path="/attendance/exceptions" element={<Exceptions />} />
```

and add it next to the ungated `/attendance/my-approvals` route (line 288):

```tsx
        {canHrApprove(b) && <Route path="/attendance/exceptions" element={<Exceptions />} />}
```

Add `canHrApprove` to the existing `@/hooks/useData` import in this file.

- [ ] **Step 4: Split the nav leaf out of the attendance-admin group**

In `frontend-web/src/lib/nav.ts`, remove this leaf from the `canManageAttendance(b)` array (line 95):

```ts
  { to: '/attendance/exceptions', label: 'Leave/WFH', sub: 'Exceptions', icon: Inbox },
```

Change the WORK leaf on line 39:

```ts
  { to: '/attendance/my-approvals', label: 'Approvals', sub: 'Leave/WFH to approve', icon: Inbox },
```

to:

```ts
  { to: '/attendance/my-approvals', label: 'Leave/WFH input', sub: 'Give input as a leader', icon: Inbox },
```

Then add the HR leaf to the attendance group, gated separately. Replace the `att` block (lines 91-99) with:

```ts
const att: NavLeaf[] = canManageAttendance(b) ? [
  { to: '/attendance-report', label: 'Attendance', sub: 'Daily report', icon: QrCode },
  { to: '/attendance/schedules', label: 'Schedules', sub: 'Shift schedules', icon: CalendarDays },
  { to: '/attendance/stations', label: 'Stations', sub: 'Scan kiosks', icon: Monitor },
  { to: '/attendance/holidays', label: 'Holidays', sub: 'Holiday lists', icon: CalendarDays },
  { to: '/attendance/profiles', label: 'Enrolled', sub: 'Enrolled members', icon: UserCheck },
] : []
// HR gets the cuti inbox without the rest of attendance admin.
if (canHrApprove(b)) {
  att.unshift({ to: '/attendance/exceptions', label: 'Leave/WFH', sub: 'HR final approval', icon: Inbox })
}
if (att.length) groups.push({ id: 'attendance', label: 'Attendance', leaves: att })
```

Add `canHrApprove` to this file's `@/hooks/useData` import.

- [ ] **Step 5: Typecheck both frontends — fully clean**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit && cd ../frontend-web && npx tsc --noEmit && echo "BOTH CLEAN"
```
Expected: `BOTH CLEAN`

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/pages/ExceptionApprovals.tsx frontend-web/src/pages/Exceptions.tsx frontend-web/src/App.tsx frontend-web/src/lib/nav.ts
git commit -m "feat(cuti,/w): advisory leader inbox + HR inbox with leader input"
```

---

### Task 9: Build, deploy, verify live

**Files:**
- No source changes. Build outputs only.

**Interfaces:**
- Consumes: Tasks 1-8.
- Produces: the running feature.

- [ ] **Step 1: Build both frontends**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build && cd ../frontend-web && npm run build
```
Expected: both complete with no error. Check that the emitted JS bundle is **non-zero bytes** — a 0-byte bundle ships a blank app with no JS error (`vernon-cloudflare-asset-cache`).

- [ ] **Step 2: Migrate and restart**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate && sudo /usr/local/bin/tj-restart
```
Expected: migrate completes, restart returns without error.

- [ ] **Step 3: Purge the Cloudflare asset cache**

`/assets` is cached for a year behind Cloudflare and a stale/poisoned bundle shows a blank app. Purge per `vernon-cloudflare-asset-cache` (token at `~/.cf_token`, zone `bd13d791fab46ac955b9b068edefc049`), and bump the service-worker `ASSET_CACHE` version if the SW file is part of this build.

- [ ] **Step 4: Grant the role**

The `_hr_users()` fallback notifies System Managers until somebody actually holds `HR Manager`. Grant it to the real HR staff from the user-admin screen (`/users` on either frontend — the new "HR" checkbox from Task 5's `VERNON_ROLE_OPTIONS`).

Verify:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
from vernon_project.api.attendance import _hr_users
print("HR notified:", _hr_users())
EOF
```
Expected: the granted HR users, not the System Manager fallback list.

- [ ] **Step 5: Live E2E**

There is no test DB (`vernon-live-site-codefirst`), so this is the real verification. On project.vernon.id, walk it:

1. As a normal employee on `/m`, open `/attendance/request`. **Expect:** the "Who reviews this" card lists exactly the `project_leader` of each Ongoing project you are a `Project Team` member of, minus yourself. Cross-check against the DB if unsure.
2. Submit a Leave request. **Expect:** each listed leader gets a notification titled "Cuti request needs your input"; every HR user gets "Cuti request needs HR approval"; the requester gets nothing.
3. As HR, open the notification. **Expect:** it lands on the HR inbox (`/attendance/manage/exceptions` on `/m`, `/attendance/exceptions` on `/w`), not home — that is the `"Attendance Exception HR"` pseudo-doctype routing.
4. As a leader, Support the request. **Expect:** the request stays `Pending`, the employee is **not** notified, and the row still shows in the HR inbox with that leader marked "Supports".
5. As HR, Approve. **Expect:** status flips to `Approved`, the employee gets "Cuti approved", and the attendance day for that date becomes `Excused-Leave` in the daily report.
6. As the leader again, try to vote on the now-approved request. **Expect:** error "HR has already decided this request." (It should have already dropped out of the leader inbox — reach it from the stale notification.)
7. File a request as an employee with **no** Ongoing-project leaders. **Expect:** the form says "No project leaders — this goes straight to HR", the request lands `Pending` (not auto-approved, which is the deliberate behaviour change), and HR is notified.
8. As HR, Reject one with a reason. **Expect:** the employee's notification body ends with `— <reason>`, and `/attendance/my-requests` shows the HR row red with the reason under it.

- [ ] **Step 6: Commit the build output**

```bash
git add -A vernon_project/public
git commit -m "build(cuti): HR final approval bundles"
```

Only `git add` your own paths — the user works in parallel and switches branches mid-session (`vernon-user-parallel-remote-control`). Re-check `git status` before staging.

---

## Notes for the implementer

- **Do not touch the attendance engine.** `hooks.py:181` → `attendance/triggers.py:19` → `recompute_range` still keys off parent `status`, which still mirrors the final verdict. If you find yourself editing `engine.py`, stop — something upstream is wrong.
- **Do not touch `_check_leave_quota`** (`attendance_exception.py:17-40`). It fires on `validate` when `status == "Approved"`, which now happens at the HR step instead of the last leader's. That is the correct new behaviour for free.
- `bench execute` cannot import app modules — use the `bench console` heredoc form shown in the verify steps, and keep the snippets loop-free (`vernon-bench-console-stdin-gotcha`).
