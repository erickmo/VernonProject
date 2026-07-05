# Cuti / Leave Multi-Leader Approval — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace single-admin approval of Attendance Exceptions (Leave + WFH) with a unanimous multi-leader gate: every distinct project-leader of the requester's Ongoing projects must approve.

**Architecture:** Do NOT touch the attendance engine. It excuses a day when `Attendance Exception.status == "Approved"`. We add a child table of per-leader votes, derive the parent `status` from those votes, and set votes through two new whitelisted endpoints. `hooks.py` already recomputes attendance on every exception `on_update`, so approval → excused day is automatic.

**Tech Stack:** Frappe (Python doctypes + whitelisted API), React + TypeScript + React Query (two SPAs: `frontend/` = mobile `/m`, `frontend-web/` = web `/w`; web shares mobile's `lib/`+`hooks/` via `@` alias).

## Global Constraints

- Live site `project.vernon.id`, single `main` branch. Never `git checkout` another branch. `git add` only files this plan creates/modifies.
- Schema change → `bench --site project.vernon.id migrate`. Python change → `bench --site project.vernon.id restart` (or `bench restart`). Frontend change → `npm run build` in the relevant frontend dir.
- No native `alert`/`confirm`/`prompt` in frontend — use an in-component modal for the reject reason.
- Reuse `_notify` — it lives in `vernon_project/api/mobile.py`; import lazily: `from vernon_project.api.mobile import _notify`.
- Emoji/label strings are not load-bearing here (unlike Project Todo statuses); Attendance Exception `status` values are plain `Pending`/`Approved`/`Rejected`.
- Approver set is **snapshotted** at request time (child rows fixed); later team/leader changes don't rewrite an open request.
- Decision values (child row `decision`): `Pending` / `Approved` / `Rejected`.

---

### Task 1: Child doctype `Attendance Exception Approver` + `approvers` table field

**Files:**
- Create: `vernon_project/vernon_project/doctype/attendance_exception_approver/__init__.py`
- Create: `vernon_project/vernon_project/doctype/attendance_exception_approver/attendance_exception_approver.json`
- Create: `vernon_project/vernon_project/doctype/attendance_exception_approver/attendance_exception_approver.py`
- Modify: `vernon_project/vernon_project/doctype/attendance_exception/attendance_exception.json` (add `approvers` to `field_order` + `fields`)

**Interfaces:**
- Produces: child doctype `Attendance Exception Approver` with fields `approver` (Link User), `decision` (Select), `decided_at` (Datetime), `reason` (Small Text); parent field `Attendance Exception.approvers` (Table).

- [ ] **Step 1: Create `__init__.py`** (empty file, matching `project_team/__init__.py`)

Create `vernon_project/vernon_project/doctype/attendance_exception_approver/__init__.py` with a single empty line (0-byte-style, one newline).

- [ ] **Step 2: Create the child doctype JSON**

Create `vernon_project/vernon_project/doctype/attendance_exception_approver/attendance_exception_approver.json`:

```json
{
 "actions": [],
 "allow_rename": 1,
 "creation": "2026-07-05 00:00:00.000000",
 "doctype": "DocType",
 "editable_grid": 1,
 "engine": "InnoDB",
 "field_order": ["approver", "decision", "decided_at", "reason"],
 "fields": [
  {"fieldname": "approver", "fieldtype": "Link", "label": "Approver", "options": "User", "reqd": 1, "in_list_view": 1, "search_index": 1},
  {"fieldname": "decision", "fieldtype": "Select", "label": "Decision", "options": "Pending\nApproved\nRejected", "default": "Pending", "in_list_view": 1},
  {"fieldname": "decided_at", "fieldtype": "Datetime", "label": "Decided At", "read_only": 1},
  {"fieldname": "reason", "fieldtype": "Small Text", "label": "Reason"}
 ],
 "grid_page_length": 50,
 "index_web_pages_for_search": 1,
 "istable": 1,
 "links": [],
 "modified": "2026-07-05 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Attendance Exception Approver",
 "owner": "Administrator",
 "permissions": [],
 "row_format": "Dynamic",
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": []
}
```

- [ ] **Step 3: Create the controller** `attendance_exception_approver.py`:

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class AttendanceExceptionApprover(Document):
	pass
```

- [ ] **Step 4: Add the `approvers` table field to `Attendance Exception`**

In `vernon_project/vernon_project/doctype/attendance_exception/attendance_exception.json`:

Change `field_order` from:
```json
 "field_order": ["employee", "exception_type", "from_date", "to_date", "status", "approver", "reason"],
```
to:
```json
 "field_order": ["employee", "exception_type", "from_date", "to_date", "status", "approver", "reason", "approvers"],
```

Add this object to the end of the `fields` array (after the `reason` field object):
```json
  ,{"fieldname": "approvers", "fieldtype": "Table", "label": "Approvers", "options": "Attendance Exception Approver"}
```
(Ensure valid JSON — the `reason` field object gets a trailing comma and the new object is appended.)

- [ ] **Step 5: Migrate to sync schema**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate`
Expected: completes without error; `Attendance Exception Approver` created, `Attendance Exception` gains `approvers`.

- [ ] **Step 6: Verify schema in console**

Run: `bench --site project.vernon.id console` then:
```python
import frappe
frappe.get_meta("Attendance Exception").get_field("approvers").options  # -> 'Attendance Exception Approver'
frappe.get_meta("Attendance Exception Approver").get_field("decision").options  # -> 'Pending\nApproved\nRejected'
```
Expected: both print the values above.

- [ ] **Step 7: Commit**

```bash
git add vernon_project/vernon_project/doctype/attendance_exception_approver vernon_project/vernon_project/doctype/attendance_exception/attendance_exception.json
git commit -m "feat(cuti): Attendance Exception Approver child table + approvers field"
```

---

### Task 2: Pure approval logic module (`derive_status`, `distinct_leaders`)

**Files:**
- Create: `vernon_project/attendance/approval.py`

**Interfaces:**
- Produces:
  - `derive_status(decisions: list[str]) -> str` — `"Approved"` if empty or all `"Approved"`; `"Rejected"` if all `"Rejected"`; else `"Pending"`.
  - `distinct_leaders(leaders: list[str], employee: str) -> list[str]` — order-preserving dedup, dropping falsy and `employee`.

- [ ] **Step 1: Write the module with an assert-based self-check**

Create `vernon_project/attendance/approval.py`:

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# Pure approval logic for Attendance Exception multi-leader gate. No frappe /
# DB imports here on purpose — keeps it unit-testable via `python approval.py`.


def derive_status(decisions):
	"""Overall exception status from a list of per-leader decision strings.

	Unanimity both ways (matches spec): all approve -> Approved, all reject ->
	Rejected, empty set -> Approved (auto-approve, no leaders), anything mixed
	or still pending -> Pending.
	"""
	if not decisions:
		return "Approved"
	if all(d == "Approved" for d in decisions):
		return "Approved"
	if all(d == "Rejected" for d in decisions):
		return "Rejected"
	return "Pending"


def distinct_leaders(leaders, employee):
	"""Order-preserving distinct leaders, excluding the requester and falsy."""
	seen = []
	for leader in leaders:
		if leader and leader != employee and leader not in seen:
			seen.append(leader)
	return seen


if __name__ == "__main__":
	assert derive_status([]) == "Approved"
	assert derive_status(["Approved", "Approved"]) == "Approved"
	assert derive_status(["Rejected", "Rejected"]) == "Rejected"
	assert derive_status(["Approved", "Rejected"]) == "Pending"
	assert derive_status(["Approved", "Pending"]) == "Pending"
	assert derive_status(["Rejected", "Pending"]) == "Pending"
	assert distinct_leaders(["a", "a", "b", None, ""], "z") == ["a", "b"]
	assert distinct_leaders(["a", "z", "b"], "z") == ["a", "b"]  # self excluded
	assert distinct_leaders([], "z") == []
	print("approval.py self-check OK")
```

- [ ] **Step 2: Run the self-check**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python vernon_project/attendance/approval.py`
Expected: prints `approval.py self-check OK`, exit 0.

- [ ] **Step 3: Commit**

```bash
git add vernon_project/attendance/approval.py
git commit -m "feat(cuti): pure derive_status + distinct_leaders with self-check"
```

---

### Task 3: Backend API — request/approve/reject/list endpoints

**Files:**
- Modify: `vernon_project/api/attendance.py` (add imports; rewrite `request_exception`; add `_leaders_for_employee`, `approve_exception`, `reject_exception`, `_vote_exception`, `pending_exception_approvals`, `my_exceptions`, `_notify_leaders_new_request`, `_notify_employee_decision`, `_can_approve_exception`)

**Interfaces:**
- Consumes: `derive_status`, `distinct_leaders` from `vernon_project.attendance.approval`; `_notify` from `vernon_project.api.mobile`.
- Produces (whitelisted, dotted paths under `vernon_project.api.attendance.`):
  - `request_exception(from_date, to_date, exception_type, reason=None)` → `{status, name, approval_status}`
  - `approve_exception(exception_id)` → `{status, approval_status}`
  - `reject_exception(exception_id, reason)` → `{status, approval_status}` (reason required)
  - `pending_exception_approvals()` → `{status, rows: [{name, employee, exception_type, from_date, to_date, status, reason, approved_count, total, approvers:[{approver,decision}]}]}`
  - `my_exceptions(limit=30)` → `{status, rows: [ ...same shape... ]}`

- [ ] **Step 1: Add import for the pure logic module**

In `vernon_project/api/attendance.py`, after the existing line `from vernon_project.attendance.engine import recompute_daily` (line ~11), add:

```python
from vernon_project.attendance.approval import derive_status, distinct_leaders
```
Also add `now_datetime` is already imported (`from frappe.utils import cint, getdate, now_datetime, nowdate`) — confirm it's present (it is).

- [ ] **Step 2: Add the leader-lookup helper**

Add near the other private helpers in `attendance.py`:

```python
def _leaders_for_employee(employee):
	"""Distinct project_leaders of every Ongoing project the employee is a
	team member of, excluding the employee themselves. Snapshot for a request."""
	team_rows = frappe.get_all("Project Team", filters={"user": employee}, fields=["parent"])
	project_names = list({r.parent for r in team_rows})
	if not project_names:
		return []
	projects = frappe.get_all(
		"Project",
		filters={"name": ["in", project_names], "status": "Ongoing"},
		fields=["project_leader"],
	)
	return distinct_leaders([p.project_leader for p in projects], employee)
```

- [ ] **Step 3: Add notification helpers**

```python
def _exc_label(doc):
	return "Cuti" if doc.exception_type == "Leave" else "WFH"


def _notify_leaders_new_request(doc, leaders):
	from vernon_project.api.mobile import _notify
	label = _exc_label(doc)
	for leader in leaders:
		_notify(
			leader,
			"attendance_exception",
			_("{0} request needs your approval").format(label),
			_("{0} requested {1}: {2} → {3}").format(doc.employee, label, doc.from_date, doc.to_date),
			"Attendance Exception",
			doc.name,
			doc.employee,
		)


def _notify_employee_decision(doc, status, reason=None, actor=None):
	from vernon_project.api.mobile import _notify
	label = _exc_label(doc)
	if status == "Approved":
		title = _("{0} approved").format(label)
		body = _("Your {0} request ({1} → {2}) was approved.").format(label, doc.from_date, doc.to_date)
	else:
		title = _("{0} rejected").format(label)
		body = _("Your {0} request ({1} → {2}) was rejected.").format(label, doc.from_date, doc.to_date)
		if reason:
			body += " — " + reason
	_notify(doc.employee, "attendance_exception", title, body, "Attendance Exception", doc.name, actor)
```

- [ ] **Step 4: Rewrite `request_exception`**

Replace the existing `request_exception` (lines ~143-161) with:

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
	approval_status = "Approved" if not approvers else "Pending"
	doc = frappe.get_doc({
		"doctype": "Attendance Exception",
		"employee": user,
		"from_date": from_date,
		"to_date": to_date,
		"exception_type": exception_type,
		"reason": reason,
		"status": approval_status,
		"approvers": approvers,
	}).insert(ignore_permissions=True)
	if leaders:
		_notify_leaders_new_request(doc, leaders)
	return {"status": "ok", "name": doc.name, "approval_status": approval_status}
```

- [ ] **Step 5: Add the vote engine + approve/reject endpoints**

```python
def _vote_exception(exception_id, decision, reason):
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please log in"), frappe.PermissionError)
	doc = frappe.get_doc("Attendance Exception", exception_id)
	is_admin = "System Manager" in frappe.get_roles(user)
	row = next((r for r in doc.approvers if r.approver == user), None)
	if row is None and not is_admin:
		return {"status": "error", "message": _("You are not an approver for this request.")}

	if row is None:
		# Admin override: force every row + parent status, so a later recompute
		# stays consistent (deadlock / no-leader escape hatch).
		for r in doc.approvers:
			r.decision = decision
			r.decided_at = now_datetime()
			if decision == "Rejected":
				r.reason = reason
		doc.status = decision
	else:
		row.decision = decision
		row.decided_at = now_datetime()
		row.reason = reason if decision == "Rejected" else None
		doc.status = derive_status([r.decision for r in doc.approvers])

	doc.approver = user
	doc.save(ignore_permissions=True)  # on_update -> exception_changed recomputes the day
	if doc.status in ("Approved", "Rejected"):
		_notify_employee_decision(doc, doc.status, reason, actor=user)
	return {"status": "ok", "approval_status": doc.status}


@frappe.whitelist()
def approve_exception(exception_id):
	return _vote_exception(exception_id, "Approved", None)


@frappe.whitelist()
def reject_exception(exception_id, reason=None):
	reason = (reason or "").strip()
	if not reason:
		return {"status": "error", "message": _("Alasan penolakan wajib diisi.")}
	return _vote_exception(exception_id, "Rejected", reason)
```

- [ ] **Step 6: Add list endpoints (leader inbox + employee's own) with a shared shaper**

```python
def _shape_exception_rows(names):
	if not names:
		return []
	excs = frappe.get_all(
		"Attendance Exception",
		filters={"name": ["in", names]},
		fields=["name", "employee", "exception_type", "from_date", "to_date", "status", "reason"],
		order_by="from_date desc",
	)
	appr = frappe.get_all(
		"Attendance Exception Approver",
		filters={"parent": ["in", names]},
		fields=["parent", "approver", "decision"],
	)
	by_parent = {}
	for a in appr:
		by_parent.setdefault(a.parent, []).append({"approver": a.approver, "decision": a.decision})
	for e in excs:
		rows = by_parent.get(e["name"], [])
		e["approvers"] = rows
		e["approved_count"] = sum(1 for r in rows if r["decision"] == "Approved")
		e["total"] = len(rows)
	return excs


@frappe.whitelist()
def pending_exception_approvals():
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please log in"), frappe.PermissionError)
	mine = frappe.get_all(
		"Attendance Exception Approver",
		filters={"approver": user, "decision": "Pending"},
		fields=["parent"],
	)
	names = list({r.parent for r in mine})
	# only surface parents still Pending overall
	rows = [e for e in _shape_exception_rows(names) if e["status"] == "Pending"]
	return {"status": "ok", "rows": rows}


@frappe.whitelist()
def my_exceptions(limit=30):
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please log in"), frappe.PermissionError)
	names = [
		r.name for r in frappe.get_all(
			"Attendance Exception",
			filters={"employee": user},
			fields=["name"],
			order_by="from_date desc",
			limit=min(cint(limit), 200),
		)
	]
	return {"status": "ok", "rows": _shape_exception_rows(names)}
```

- [ ] **Step 7: Restart and smoke-test in console**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id restart` (or `bench restart`).
Then `bench --site project.vernon.id console`:
```python
import frappe
frappe.set_user("Administrator")
from vernon_project.api.attendance import _leaders_for_employee
# pick a real employee on an Ongoing project:
_leaders_for_employee("<some-user>@...")   # -> list of leader user ids, self excluded
```
Expected: returns a list (possibly empty). No exceptions raised.

- [ ] **Step 8: Commit**

```bash
git add vernon_project/api/attendance.py
git commit -m "feat(cuti): multi-leader request/approve/reject/list endpoints"
```

---

### Task 4: Shared frontend types + api + hooks (serves both `/m` and `/w`)

**Files:**
- Modify: `frontend/src/lib/types.ts` (add `ExceptionApprover`, `AttendanceExceptionRow`)
- Modify: `frontend/src/lib/api.ts` (add 4 functions to `mobileApi`)
- Modify: `frontend/src/hooks/useData.ts` (add query keys + hooks)

**Interfaces:**
- Consumes: `api` (`api.get`/`api.post`), `A` prefix (`vernon_project.api.attendance.`), `mobileApi`, `keys`, `useQuery`/`useMutation`/`useQueryClient` — all already in these files.
- Produces (TS): types `ExceptionApprover`, `AttendanceExceptionRow`; api `mobileApi.approveException/rejectException/pendingExceptionApprovals/myExceptions`; hooks `usePendingExceptionApprovals`, `useMyExceptions`, `useApproveException`, `useRejectException`.

- [ ] **Step 1: Add shared types**

Append to `frontend/src/lib/types.ts`:

```typescript
export type ExceptionDecision = 'Pending' | 'Approved' | 'Rejected'

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
}
```

- [ ] **Step 2: Add api functions**

In `frontend/src/lib/api.ts`, inside the `mobileApi` object next to `requestException` (~line 448), add:

```typescript
  approveException: (exception_id: string) =>
    api.post<{ status: string; message?: string; approval_status?: string }>(A + 'approve_exception', { exception_id }),
  rejectException: (exception_id: string, reason: string) =>
    api.post<{ status: string; message?: string; approval_status?: string }>(A + 'reject_exception', { exception_id, reason }),
  pendingExceptionApprovals: () =>
    api.get<{ status: string; rows: import('./types').AttendanceExceptionRow[] }>(A + 'pending_exception_approvals'),
  myExceptions: (limit = 30) =>
    api.get<{ status: string; rows: import('./types').AttendanceExceptionRow[] }>(A + 'my_exceptions', { limit }),
```

- [ ] **Step 3: Add query keys + hooks**

In `frontend/src/hooks/useData.ts`: find the `keys` object and add two keys (match existing style, e.g. alongside `myAttendance`):

```typescript
  pendingExceptionApprovals: ['pendingExceptionApprovals'] as const,
  myExceptions: ['myExceptions'] as const,
```

Then add these hooks (place near `useRequestException`, ~line 1294):

```typescript
export function usePendingExceptionApprovals() {
  return useQuery({
    queryKey: keys.pendingExceptionApprovals,
    queryFn: async () => (await mobileApi.pendingExceptionApprovals()).rows,
  })
}

export function useMyExceptions() {
  return useQuery({
    queryKey: keys.myExceptions,
    queryFn: async () => (await mobileApi.myExceptions()).rows,
  })
}

export function useApproveException() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await mobileApi.approveException(name)
      if (res.status !== 'ok') throw new Error(res.message || 'Failed')
      return res
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.pendingExceptionApprovals })
      qc.invalidateQueries({ queryKey: keys.myExceptions })
    },
  })
}

export function useRejectException() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { name: string; reason: string }) => {
      const res = await mobileApi.rejectException(vars.name, vars.reason)
      if (res.status !== 'ok') throw new Error(res.message || 'Failed')
      return res
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.pendingExceptionApprovals })
      qc.invalidateQueries({ queryKey: keys.myExceptions })
    },
  })
}
```

> NOTE for implementer: confirm `useQuery` is imported in `useData.ts` (it is used widely). If the `keys` object uses a different shape (e.g. functions), match the existing convention exactly rather than the literal arrays above.

- [ ] **Step 4: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: no new type errors from the added code. (If the project has no `tsc` script, run the build in Task 5/7 which will surface type errors.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/hooks/useData.ts
git commit -m "feat(cuti): shared types + api + hooks for exception approvals"
```

---

### Task 5: Mobile leader inbox screen + admin screen rewire

**Files:**
- Create: `frontend/src/pages/ExceptionApprovals.tsx`
- Modify: `frontend/src/App.tsx` (import + unconditional route `/attendance/approvals`)
- Modify: `frontend/src/pages/AttendanceExceptionsScreen.tsx` (`decide()` → whitelisted endpoints)
- Modify: mobile attendance menu (the screen/component that links to `/attendance/request`) — add a link to `/attendance/approvals`

**Interfaces:**
- Consumes: `usePendingExceptionApprovals`, `useApproveException`, `useRejectException` (Task 4); `DetailScreen`, `Spinner`, `EmptyState`, `useToast`.

- [ ] **Step 1: Create the leader inbox screen**

Create `frontend/src/pages/ExceptionApprovals.tsx`:

```tsx
import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { usePendingExceptionApprovals, useApproveException, useRejectException } from '@/hooks/useData'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100'

export default function ExceptionApprovals() {
  const toast = useToast()
  const { data: rows, isLoading } = usePendingExceptionApprovals()
  const approve = useApproveException()
  const reject = useRejectException()
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const doApprove = async (name: string) => {
    try {
      await approve.mutateAsync(name)
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
      await reject.mutateAsync({ name: rejecting, reason: reason.trim() })
      toast('success', 'Rejected')
      setRejecting(null)
      setReason('')
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  return (
    <DetailScreen title="Approvals · Leave / WFH">
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : !rows || rows.length === 0 ? (
        <EmptyState icon={Check} title="All clear" subtitle="Nothing awaiting your approval." />
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
              <p className="mt-1 text-xs font-medium text-stone-500">
                {e.approved_count}/{e.total} approved
              </p>
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

- [ ] **Step 2: Add the route (unconditional — any user may be a leader)**

In `frontend/src/App.tsx`: add import near the other page imports:
```tsx
import ExceptionApprovals from './pages/ExceptionApprovals'
```
Add this route next to `/attendance/request` (OUTSIDE the `canManageAttendance` block):
```tsx
        <Route path="/attendance/approvals" element={<ExceptionApprovals />} />
```

- [ ] **Step 3: Rewire the admin screen's `decide()` to the whitelisted endpoints**

In `frontend/src/pages/AttendanceExceptionsScreen.tsx`, replace the `decide` function. Change the import line `import { resource } from '@/lib/api'` — keep `resource` for `load()` (listing), but add the mutation hooks. At the top add:
```tsx
import { useApproveException, useRejectException } from '@/hooks/useData'
```
Inside the component add:
```tsx
  const approve = useApproveException()
  const reject = useRejectException()
```
Replace the existing `decide` with (System Manager acts as override via the same endpoints):
```tsx
  const decide = async (name: string, status: 'Approved' | 'Rejected') => {
    try {
      if (status === 'Approved') {
        await approve.mutateAsync(name)
      } else {
        // admin override reject still needs a reason server-side
        const reason = window.prompt ? '' : ''
        await reject.mutateAsync({ name, reason: 'Rejected by admin' })
      }
      toast('success', status)
      load()
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }
```
> NOTE: do NOT use `window.prompt` (project rule). For the admin screen keep the reject reason as the fixed string `'Rejected by admin'` to satisfy the server's required-reason guard without a modal, OR (preferred if quick) reuse the same inline modal pattern from Task 5 Step 1. Minimal acceptable version is the fixed string.

- [ ] **Step 4: Add a menu link to `/attendance/approvals`**

Find the mobile screen/component that renders the link to `/attendance/request` (grep `'/attendance/request'` under `frontend/src`). In that same list/menu, add an entry linking to `/attendance/approvals` labelled `Approvals` (or `Approve Leave/WFH`), matching the surrounding link markup exactly. This makes the leader inbox reachable for all users.

- [ ] **Step 5: Build**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build`
Expected: build succeeds, emits new hashed assets under `vernon_project/public/frontend/assets/`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ExceptionApprovals.tsx frontend/src/App.tsx frontend/src/pages/AttendanceExceptionsScreen.tsx frontend/src/<the-menu-file>
git add vernon_project/public/frontend/
git commit -m "feat(cuti): mobile leader approvals screen + admin rewire"
```

---

### Task 6: Mobile employee status view (my requests + per-leader progress)

**Files:**
- Create: `frontend/src/pages/MyExceptions.tsx`
- Modify: `frontend/src/App.tsx` (route `/attendance/my-requests`)
- Modify: mobile attendance menu — add link to `/attendance/my-requests`

**Interfaces:**
- Consumes: `useMyExceptions` (Task 4); `DetailScreen`, `Spinner`, `EmptyState`.

- [ ] **Step 1: Create the screen**

Create `frontend/src/pages/MyExceptions.tsx`:

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
              {e.total > 0 && (
                <p className="mt-1 text-xs font-medium text-stone-500">{e.approved_count}/{e.total} leaders approved</p>
              )}
            </div>
          ))}
        </div>
      )}
    </DetailScreen>
  )
}
```

- [ ] **Step 2: Route + menu link**

In `App.tsx` add:
```tsx
import MyExceptions from './pages/MyExceptions'
```
```tsx
        <Route path="/attendance/my-requests" element={<MyExceptions />} />
```
Add a link to `/attendance/my-requests` in the same mobile attendance menu (next to the `/attendance/request` link), labelled `My requests`.

- [ ] **Step 3: Build + commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
```
```bash
git add frontend/src/pages/MyExceptions.tsx frontend/src/App.tsx frontend/src/<menu-file> vernon_project/public/frontend/
git commit -m "feat(cuti): mobile my-requests status screen"
```

---

### Task 7: Web leader inbox + admin screen rewire

**Files:**
- Create: `frontend-web/src/pages/ExceptionApprovals.tsx`
- Modify: `frontend-web/src/App.tsx` (import + route `/attendance/my-approvals`)
- Modify: `frontend-web/src/lib/nav.ts` (add a nav leaf visible to all — a `myApprovals` entry outside the `canManageAttendance` gate)
- Modify: `frontend-web/src/pages/Exceptions.tsx` (`decide()` → whitelisted endpoints)

**Interfaces:**
- Consumes: shared `usePendingExceptionApprovals`/`useApproveException`/`useRejectException` (via `@/hooks/useData`); web `BentoGrid`/`BentoTile` from `@web/components/bento`; `Spinner`/`EmptyState` from `@/components/ui`.

- [ ] **Step 1: Create the web leader inbox**

Create `frontend-web/src/pages/ExceptionApprovals.tsx`:

```tsx
import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { usePendingExceptionApprovals, useApproveException, useRejectException } from '@/hooks/useData'
import { BentoGrid, BentoTile } from '@web/components/bento'

export default function ExceptionApprovals() {
  const { data: rows, isLoading } = usePendingExceptionApprovals()
  const approve = useApproveException()
  const reject = useRejectException()
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const submitReject = async () => {
    if (!rejecting || !reason.trim()) return
    await reject.mutateAsync({ name: rejecting, reason: reason.trim() })
    setRejecting(null)
    setReason('')
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">My approvals · Leave / WFH</h1>
      <BentoGrid>
        <BentoTile span="full" tone="plain">
          {isLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : !rows || rows.length === 0 ? (
            <EmptyState icon={Check} title="All clear" subtitle="Nothing awaiting your approval." />
          ) : (
            <div className="flex flex-col gap-2">
              {rows.map((e) => (
                <div key={e.name} className="flex items-center gap-3 rounded-lg border border-line p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{e.employee} · {e.exception_type === 'Leave' ? 'Cuti' : 'WFH'}</p>
                    <p className="text-xs text-muted">
                      {e.from_date} → {e.to_date}{e.reason ? ` · ${e.reason}` : ''} · {e.approved_count}/{e.total} approved
                    </p>
                  </div>
                  <button
                    onClick={() => approve.mutate(e.name)}
                    disabled={approve.isPending}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" /> Approve
                  </button>
                  <button
                    onClick={() => { setRejecting(e.name); setReason('') }}
                    className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700"
                  >
                    <X className="h-4 w-4" /> Reject
                  </button>
                </div>
              ))}
            </div>
          )}
        </BentoTile>
      </BentoGrid>

      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setRejecting(null)}>
          <div className="w-full max-w-md rounded-xl bg-surface p-4 shadow-xl" onClick={(ev) => ev.stopPropagation()}>
            <p className="mb-2 font-medium text-ink">Reason for rejection</p>
            <textarea
              className="w-full min-h-[90px] resize-y rounded-lg border border-line px-3 py-2 text-sm text-ink"
              value={reason}
              onChange={(ev) => setReason(ev.target.value)}
              autoFocus
            />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setRejecting(null)} className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted">Cancel</button>
              <button
                onClick={submitReject}
                disabled={reject.isPending || !reason.trim()}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Confirm reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Route**

In `frontend-web/src/App.tsx` add import:
```tsx
import ExceptionApprovals from '@web/pages/ExceptionApprovals'
```
Add the route OUTSIDE the `canManageAttendance(b)` block (any user may lead a project):
```tsx
          <Route path="/attendance/my-approvals" element={<ExceptionApprovals />} />
```

- [ ] **Step 3: Nav entry (visible to all)**

In `frontend-web/src/lib/nav.ts`, add a leaf for `/attendance/my-approvals` that is NOT gated by `canManageAttendance`. Match the existing `NavLeaf` shape and grouping style. Example — add to a general/self-service group that always renders (find where non-admin leaves like the home/todo entries are pushed), e.g.:
```typescript
  { to: '/attendance/my-approvals', label: 'Approvals', sub: 'Leave/WFH to approve', icon: Inbox },
```
> NOTE: reuse an already-imported icon (e.g. `Inbox`, already used by the admin exceptions leaf). Place it in a group that renders for every authenticated user, not inside the `att` (admin-only) array.

- [ ] **Step 4: Rewire web admin `Exceptions.tsx` decide()**

In `frontend-web/src/pages/Exceptions.tsx`, add:
```tsx
import { useApproveException, useRejectException } from '@/hooks/useData'
```
Inside the component:
```tsx
  const approve = useApproveException()
  const reject = useRejectException()
```
Replace `decide` with:
```tsx
  const decide = async (name: string, status: 'Approved' | 'Rejected') => {
    if (status === 'Approved') await approve.mutateAsync(name)
    else await reject.mutateAsync({ name, reason: 'Rejected by admin' })
    load()
  }
```
(Admin override goes through the same server path; server force-sets all rows + parent status.)

- [ ] **Step 5: Build**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build`
Expected: build succeeds, emits new hashed assets under `vernon_project/public/frontend_web/assets/`.

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/pages/ExceptionApprovals.tsx frontend-web/src/App.tsx frontend-web/src/lib/nav.ts frontend-web/src/pages/Exceptions.tsx vernon_project/public/frontend_web/
git commit -m "feat(cuti): web leader approvals screen + admin rewire"
```

---

### Task 8: End-to-end verification on live (bench console)

**Files:** none (verification only).

- [ ] **Step 1: Integration test — multi-leader gate**

`bench --site project.vernon.id console`:
```python
import frappe
frappe.set_user("Administrator")
from vernon_project.api import attendance as A

# find an employee who is a team member of >=1 Ongoing project with a leader != themselves
emp = "<employee-user>"
frappe.set_user(emp)
r = A.request_exception(frappe.utils.add_days(frappe.utils.nowdate(), 3),
                        frappe.utils.add_days(frappe.utils.nowdate(), 3), "Leave", "test cuti")
name = r["name"]; print("status after request:", r["approval_status"])   # expect "Pending" if leaders exist

doc = frappe.get_doc("Attendance Exception", name)
leaders = [row.approver for row in doc.approvers]; print("leaders:", leaders)

# approve as each leader; status flips to Approved only after the last
for i, L in enumerate(leaders):
    frappe.set_user(L)
    res = A.approve_exception(name)
    print(i, L, "->", res["approval_status"])   # Pending until last, then Approved

frappe.set_user("Administrator")
print("final:", frappe.db.get_value("Attendance Exception", name, "status"))  # Approved
```
Expected: status stays `Pending` until the final leader approves, then `Approved`.

- [ ] **Step 2: Verify the day is excused (engine untouched, recompute fired)**

```python
# the requested date should now compute to Excused-Leave for the employee (if enrolled + scheduled)
from vernon_project.attendance.engine import recompute_daily
d = frappe.utils.add_days(frappe.utils.nowdate(), 3)
recompute_daily(emp, d)
print(frappe.db.get_value("Daily Attendance", {"employee": emp, "attendance_date": d}, "status"))
```
Expected: `Excused-Leave` (or `OffDay`/`Holiday` if not a scheduled workday — acceptable; the point is no penalty).

- [ ] **Step 3: Reject-unanimity + auto-approve checks**

```python
# reject requires reason
frappe.set_user(leaders[0]) if leaders else None
print(A.reject_exception(name, ""))          # -> {"status":"error", ... "Alasan penolakan wajib diisi."}

# auto-approve: an employee with no Ongoing-project leader
solo = "<user-with-no-ongoing-project-or-only-self-leads>"
frappe.set_user(solo)
r2 = A.request_exception(frappe.utils.nowdate(), frappe.utils.nowdate(), "WFH", "solo")
print("auto:", r2["approval_status"])        # -> "Approved"
```

- [ ] **Step 4: Clean up test docs**

```python
frappe.set_user("Administrator")
frappe.delete_doc("Attendance Exception", name, force=1)
frappe.delete_doc("Attendance Exception", r2["name"], force=1)
frappe.db.commit()
```

- [ ] **Step 5: Manual UI smoke (both frontends)**

- `/m` → attendance → `My requests` shows the request with `x/y leaders approved`; `Approvals` (as a leader) shows pending, Approve/Reject with reason modal works.
- `/w` → `Approvals` nav entry (all users) lists pending; admin `Leave/WFH` screen approve/reject still works.

---

## Self-Review

**Spec coverage:**
- Both Leave + WFH gated → Task 3 `request_exception` builds approvers for both types. ✅
- Active (Ongoing) projects only → `_leaders_for_employee` filters `status="Ongoing"`. ✅
- Self-exclude + zero→auto-approve → `distinct_leaders` drops self; `approval_status="Approved" if not approvers`. ✅
- Unanimity both ways, mixed→Pending → `derive_status`. ✅
- Reject reason required → `reject_exception` `.strip()` guard. ✅
- Mutable votes → `_vote_exception` overwrites the caller's row each call. ✅
- Admin override / deadlock escape → `_vote_exception` `is_admin` branch force-sets rows + status. ✅
- Engine untouched → no engine file modified; excusal via existing `on_update` recompute. ✅
- Both frontends: leader inbox + employee status + admin rewire → Tasks 5/6/7. ✅
- Notifications → `_notify_leaders_new_request`, `_notify_employee_decision`. ✅

**Placeholder scan:** Two deliberate "find the menu file / nav group" steps (5.4, 6.2, 7.3) require the implementer to read the current nav markup — flagged inline with the exact route/label to add. No `TODO`/`TBD` in code blocks.

**Type consistency:** `AttendanceExceptionRow` shape (backend `_shape_exception_rows`) matches the TS type in Task 4 (`name, employee, exception_type, from_date, to_date, status, reason, approvers, approved_count, total`). Endpoint names identical across api.ts / hooks / screens (`approve_exception`, `reject_exception`, `pending_exception_approvals`, `my_exceptions`).

## Out of scope (YAGNI)
Leave balance/quota, cuti categories beyond Leave/WFH, per-project (vs per-distinct-leader) rows, re-snapshot on team change, `projects` display column on approver rows.
