# Split Allocation (Assignee Plan + Leader Allocation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single overloaded day-allocation into a free-form **assignee personal plan** and an authoritative **leader (assigned) allocation**, so assignee planning never touches contribution scoring or the assigned workload.

**Architecture:** Keep the existing `Project Todo Allocation` child table as the assignee plan (drop its sum==estimate rule). Add a new `Project Todo Assigned Allocation` child table for the leader's split (sum==estimate, default = whole estimate on the deadline, synthesized on read). Restrict `estimated` editing to leader/owner. The Daily Estimated Time report returns both series side by side.

**Tech Stack:** Frappe (Python doctypes + whitelisted API), React + TypeScript (vernon_project mobile PWA frontend), React + TypeScript + vitest (web `ui` report).

## Global Constraints

- Points formula is **untouched**: `points = base_rate × estimated × difficulty%`. Neither plan feeds points.
- `estimated` editable by **leader, owner, System Manager** only. Locked at Done/Completed (existing `validate_done_todo_fields`).
- Assigned allocation split editable by **leader, System Manager** only. Assignee plan editable by **assignee, System Manager** only.
- Assigned split **sum must equal `estimated`** when `estimated > 0`. Assignee plan is **free-form** (no sum rule).
- Assigned virtual default (no explicit rows) = single entry `{date: deadline, minutes: estimated}`, computed on read, never stored.
- Status strings are emoji-prefixed: `"⚪️ Planned"`, `"🟠 Done"`, `"🔷 Checked By PL"`, `"✅ Completed"`, `"🚫 Cancelled"`.
- Backend tests run with: `cd /home/frappe/frappe-bench && bench --site dev.vernon.id run-tests --module <module>` (substitute your dev site if different; the site must have `vernon_project` installed and tests enabled).
- vernon_project frontend has **no test runner** — verify with `npx tsc --noEmit` in `frontend/` plus the manual smoke noted per task.
- Web `ui` repo: `npm run test` (vitest) and `npm run typecheck` (tsc).
- Commit after every task. Branch off `main` first (vernon_project is on `main`): `git checkout -b feat/split-allocation`.

---

### Task 1: New child doctype `Project Todo Assigned Allocation` + field on Project Todo

**Files:**
- Create: `vernon_project/vernon_project/doctype/project_todo_assigned_allocation/project_todo_assigned_allocation.json`
- Create: `vernon_project/vernon_project/doctype/project_todo_assigned_allocation/project_todo_assigned_allocation.py`
- Create: `vernon_project/vernon_project/doctype/project_todo_assigned_allocation/__init__.py`
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.json` (add `assigned_allocation` Table field)

**Interfaces:**
- Produces: child doctype `Project Todo Assigned Allocation` with fields `allocation_date` (Date), `estimated_minutes` (Int), `note` (Small Text); parent field `assigned_allocation` on `Project Todo`.

- [ ] **Step 1: Create the child doctype JSON**

`project_todo_assigned_allocation.json` (mirror the existing `project_todo_allocation.json` exactly, with a new name/label):

```json
{
 "actions": [],
 "creation": "2026-06-28 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": ["allocation_date", "estimated_minutes", "note"],
 "fields": [
  { "fieldname": "allocation_date", "fieldtype": "Date", "in_list_view": 1, "label": "Date", "reqd": 1, "columns": 4 },
  { "fieldname": "estimated_minutes", "fieldtype": "Int", "in_list_view": 1, "label": "Estimated Minutes", "non_negative": 1, "columns": 2 },
  { "fieldname": "note", "fieldtype": "Small Text", "in_list_view": 1, "label": "Note", "columns": 4 }
 ],
 "istable": 1,
 "links": [],
 "modified": "2026-06-28 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Project Todo Assigned Allocation",
 "owner": "Administrator",
 "permissions": [],
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": []
}
```

- [ ] **Step 2: Create the controller + package files**

`project_todo_assigned_allocation.py`:

```python
# Copyright (c) 2026, Vernon and Contributors
# For license information, please see license.txt

from frappe.model.document import Document


class ProjectTodoAssignedAllocation(Document):
	pass
```

`__init__.py`: empty file.

- [ ] **Step 3: Add the `assigned_allocation` Table field to Project Todo**

In `project_todo/project_todo.json`, add this field object next to the existing `allocations` field (and add `"assigned_allocation"` to `field_order` right after `"allocations"`):

```json
{
 "fieldname": "assigned_allocation",
 "fieldtype": "Table",
 "label": "Assigned Allocation",
 "options": "Project Todo Assigned Allocation",
 "description": "Leader's authoritative split of the estimate across dates. Default: whole estimate on the deadline."
}
```

- [ ] **Step 4: Migrate and verify the doctype + field exist**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site dev.vernon.id migrate
```
Expected: migrate completes without error; table `tabProject Todo Assigned Allocation` created.

- [ ] **Step 5: Write a verification test for the meta**

Create `vernon_project/api/test_allocations.py`:

```python
# Copyright (c) 2026, Vernon and Contributors

import frappe
import unittest


class TestAssignedAllocationMeta(unittest.TestCase):
	def test_assigned_allocation_field_exists(self):
		meta = frappe.get_meta("Project Todo")
		field = meta.get_field("assigned_allocation")
		self.assertIsNotNone(field, "assigned_allocation field should exist on Project Todo")
		self.assertEqual(field.fieldtype, "Table")
		self.assertEqual(field.options, "Project Todo Assigned Allocation")

	def test_child_doctype_fields(self):
		meta = frappe.get_meta("Project Todo Assigned Allocation")
		self.assertIsNotNone(meta.get_field("allocation_date"))
		self.assertIsNotNone(meta.get_field("estimated_minutes"))
		self.assertIsNotNone(meta.get_field("note"))
```

- [ ] **Step 6: Run the verification test**

Run: `cd /home/frappe/frappe-bench && bench --site dev.vernon.id run-tests --module vernon_project.api.test_allocations`
Expected: 2 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add vernon_project/vernon_project/doctype/project_todo_assigned_allocation vernon_project/vernon_project/doctype/project_todo/project_todo.json vernon_project/api/test_allocations.py
git commit -m "feat(allocation): add Project Todo Assigned Allocation child doctype"
```

---

### Task 2: Pure helpers — sum check + virtual default

**Files:**
- Modify: `vernon_project/api/mobile.py` (add two pure helpers near the existing allocation code, ~line 1530)
- Test: `vernon_project/api/test_allocations.py`

**Interfaces:**
- Produces:
  - `_alloc_sum_error(rows, estimated) -> str | None` — returns a friendly message if `estimated > 0` and the row minutes don't sum to it, else `None`.
  - `_assigned_allocation_for(allocs, deadline, estimated) -> list[dict]` — explicit `allocs` mapped to `{date, minutes, note}`, or the virtual default `[{date: str(deadline), minutes: estimated, note: ""}]` when `allocs` is empty and `estimated > 0`, else `[]`.

- [ ] **Step 1: Write the failing tests**

Append to `vernon_project/api/test_allocations.py`:

```python
from vernon_project.api.mobile import _alloc_sum_error, _assigned_allocation_for


class TestAllocationHelpers(unittest.TestCase):
	def test_sum_error_none_when_matches(self):
		rows = [{"minutes": 30}, {"minutes": 30}]
		self.assertIsNone(_alloc_sum_error(rows, 60))

	def test_sum_error_none_when_estimate_zero(self):
		self.assertIsNone(_alloc_sum_error([{"minutes": 5}], 0))

	def test_sum_error_short(self):
		msg = _alloc_sum_error([{"minutes": 30}], 60)
		self.assertIn("30m short of", msg)

	def test_sum_error_over(self):
		msg = _alloc_sum_error([{"minutes": 90}], 60)
		self.assertIn("30m over", msg)

	def test_virtual_default_used_when_empty(self):
		out = _assigned_allocation_for([], "2026-07-01", 60)
		self.assertEqual(out, [{"date": "2026-07-01", "minutes": 60, "note": ""}])

	def test_virtual_default_empty_when_no_estimate(self):
		self.assertEqual(_assigned_allocation_for([], "2026-07-01", 0), [])

	def test_explicit_rows_pass_through(self):
		allocs = [{"date": "2026-07-01", "minutes": 20, "note": "a"}]
		self.assertEqual(_assigned_allocation_for(allocs, "2026-07-02", 60), allocs)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/frappe/frappe-bench && bench --site dev.vernon.id run-tests --module vernon_project.api.test_allocations`
Expected: FAIL — `ImportError: cannot import name '_alloc_sum_error'`.

- [ ] **Step 3: Implement the helpers**

Add to `vernon_project/api/mobile.py` (above `set_todo_allocations`):

```python
def _alloc_sum_error(rows, estimated):
	"""Return a friendly message if the rows' minutes don't sum to `estimated`
	(only enforced when estimated > 0), else None."""
	estimated = int(estimated or 0)
	if estimated <= 0:
		return None
	total = sum(int(r.get("minutes") or r.get("estimated_minutes") or 0) for r in (rows or []))
	if total == estimated:
		return None
	diff = estimated - total
	short = f"{diff}m short of" if diff > 0 else f"{-diff}m over"
	return f"Assigned split is {short} the {estimated}m estimate."


def _assigned_allocation_for(allocs, deadline, estimated):
	"""Explicit assigned rows, or the virtual default (whole estimate on the
	deadline) when none exist. Returns a list of {date, minutes, note}."""
	if allocs:
		return allocs
	estimated = int(estimated or 0)
	if estimated > 0 and deadline:
		return [{"date": str(deadline), "minutes": estimated, "note": ""}]
	return []
```

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/frappe/frappe-bench && bench --site dev.vernon.id run-tests --module vernon_project.api.test_allocations`
Expected: all helper tests PASS.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/mobile.py vernon_project/api/test_allocations.py
git commit -m "feat(allocation): add sum-check + virtual-default helpers"
```

---

### Task 3: Make the assignee plan free-form (drop sum==estimate)

**Files:**
- Modify: `vernon_project/api/mobile.py` (`set_todo_allocations`, ~lines 1566-1571 — remove the sum guard)
- Test: `vernon_project/api/test_allocations.py`

**Interfaces:**
- Consumes: the test fixtures `_make_alloc_fixture()` defined in this task (reused by Tasks 4-6).
- Produces: `set_todo_allocations` no longer rejects a mismatched sum.

- [ ] **Step 1: Add a shared fixture mixin + the failing test**

Append to `vernon_project/api/test_allocations.py`:

```python
from frappe.utils import nowdate, add_days


class _AllocFixture(unittest.TestCase):
	"""Project (owner+leader=Administrator) / Detail / Todo assigned to a
	non-leader user, mirroring test_project_todo.py's setup."""

	def setUp(self):
		for email, fn in (("alloc_assignee@example.com", "Assignee"),):
			if not frappe.db.exists("User", email):
				frappe.get_doc({"doctype": "User", "email": email, "first_name": fn,
					"send_welcome_email": 0}).insert(ignore_permissions=True)
		if not frappe.db.exists("Brand", "Alloc Brand"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Alloc Brand"}).insert(ignore_permissions=True)
		if not frappe.db.exists("Project Group", "Alloc Group"):
			frappe.get_doc({"doctype": "Project Group", "project_name": "Alloc Group"}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Alloc Project", "brand": "Alloc Brand",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"project_group": "Alloc Group", "status": "Ongoing", "start_date": nowdate(),
			"deadline": add_days(nowdate(), 30),
			"team_members": [{"user": "Administrator"}, {"user": "alloc_assignee@example.com"}],
		}).insert(ignore_permissions=True)
		self.grouping = frappe.get_doc({"doctype": "Glossary", "glossary": "Alloc Grouping",
			"project": self.project.name}).insert(ignore_permissions=True).name
		self.detail = frappe.get_doc({"doctype": "Project Detail", "project": self.project.name,
			"title": "Alloc Detail", "grouping": self.grouping,
			"project_deadline": add_days(nowdate(), 30), "estimated": 100}).insert(ignore_permissions=True)
		self.todo = frappe.get_doc({"doctype": "Project Todo", "project_detail": self.detail.name,
			"to_do": "Alloc Todo", "assigned_to": "alloc_assignee@example.com",
			"deadline": add_days(nowdate(), 5), "estimated": 60, "status": "⚪️ Planned"}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for name in frappe.get_all("Project Todo", filters={"project_detail": self.detail.name}, pluck="name"):
			frappe.db.set_value("Project Todo", name, "status", "⚪️ Planned", update_modified=False)
			frappe.delete_doc("Project Todo", name, ignore_permissions=True, force=True)
		frappe.delete_doc("Project Detail", self.detail.name, ignore_permissions=True, force=True)
		frappe.delete_doc("Glossary", self.grouping, ignore_permissions=True, force=True)
		frappe.delete_doc("Project", self.project.name, ignore_permissions=True, force=True)
		frappe.db.commit()


class TestAssigneePlanFreeForm(_AllocFixture):
	def test_assignee_plan_allows_mismatched_sum(self):
		from vernon_project.api.mobile import set_todo_allocations
		frappe.set_user("alloc_assignee@example.com")
		res = set_todo_allocations(self.todo.name, [{"date": str(add_days(nowdate(), 1)), "minutes": 15, "note": ""}])
		frappe.set_user("Administrator")
		self.assertEqual(res["status"], "ok")  # 15 != estimate 60, but assignee plan is free-form
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/frappe/frappe-bench && bench --site dev.vernon.id run-tests --module vernon_project.api.test_allocations`
Expected: FAIL — `set_todo_allocations` returns status `error` ("...short of the 60m estimate").

- [ ] **Step 3: Remove the sum guard from `set_todo_allocations`**

In `vernon_project/api/mobile.py`, delete these lines from `set_todo_allocations`:

```python
		# Daily split must add up to the task estimate (planning consistency).
		estimated = int(doc.estimated or 0)
		if estimated > 0 and alloc_sum != estimated:
			diff = estimated - alloc_sum
			short = f"{diff}m short of" if diff > 0 else f"{-diff}m over"
			return {"status": "error", "message": f"Daily split is {short} the {estimated}m estimate."}
```

Leave the `alloc_sum` accumulation in place only if it's used elsewhere; otherwise remove the now-unused `alloc_sum` variable too. Update the function docstring to: `"""Assignee-only: replace a todo's personal day-plan (free-form minutes, not scored)."""`

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/frappe/frappe-bench && bench --site dev.vernon.id run-tests --module vernon_project.api.test_allocations`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/mobile.py vernon_project/api/test_allocations.py
git commit -m "feat(allocation): make assignee day-plan free-form (drop sum==estimate)"
```

---

### Task 4: New `set_assigned_allocation` API (leader-gated, sum==estimate)

**Files:**
- Modify: `vernon_project/api/mobile.py` (add whitelisted `set_assigned_allocation` + `_assigned_allocations_map` helper)
- Test: `vernon_project/api/test_allocations.py`

**Interfaces:**
- Consumes: `_alloc_sum_error` (Task 2), `_AllocFixture` (Task 3).
- Produces:
  - `set_assigned_allocation(project_item, allocations) -> {status, message, allocations}` — leader/SM only, validates sum==estimate, refuses when status is Done/Completed.
  - `_assigned_allocations_map(names) -> {todo_name: [{date, minutes, note}]}`.

- [ ] **Step 1: Write the failing tests**

Append to `vernon_project/api/test_allocations.py`:

```python
class TestAssignedAllocation(_AllocFixture):
	def _rows(self, *pairs):
		return [{"date": str(add_days(nowdate(), d)), "minutes": m, "note": ""} for d, m in pairs]

	def test_leader_can_set_matching_sum(self):
		from vernon_project.api.mobile import set_assigned_allocation
		frappe.set_user("Administrator")  # leader + SM
		res = set_assigned_allocation(self.todo.name, self._rows((1, 60)))
		self.assertEqual(res["status"], "ok")
		self.assertEqual(len(res["allocations"]), 1)

	def test_sum_mismatch_rejected(self):
		from vernon_project.api.mobile import set_assigned_allocation
		frappe.set_user("Administrator")
		res = set_assigned_allocation(self.todo.name, self._rows((1, 10)))
		self.assertEqual(res["status"], "error")
		self.assertIn("short of", res["message"])

	def test_assignee_cannot_set_assigned(self):
		from vernon_project.api.mobile import set_assigned_allocation
		frappe.set_user("alloc_assignee@example.com")  # assignee, not leader, not SM
		res = set_assigned_allocation(self.todo.name, self._rows((1, 60)))
		frappe.set_user("Administrator")
		self.assertEqual(res["status"], "error")
		self.assertIn("leader", res["message"].lower())

	def test_locked_when_done(self):
		from vernon_project.api.mobile import set_assigned_allocation
		frappe.db.set_value("Project Todo", self.todo.name, "status", "🟠 Done", update_modified=False)
		frappe.set_user("Administrator")
		res = set_assigned_allocation(self.todo.name, self._rows((1, 60)))
		frappe.db.set_value("Project Todo", self.todo.name, "status", "⚪️ Planned", update_modified=False)
		self.assertEqual(res["status"], "error")
		self.assertIn("locked", res["message"].lower())
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/frappe/frappe-bench && bench --site dev.vernon.id run-tests --module vernon_project.api.test_allocations`
Expected: FAIL — `ImportError: cannot import name 'set_assigned_allocation'`.

- [ ] **Step 3: Implement the API + map helper**

Add to `vernon_project/api/mobile.py`:

```python
def _assigned_allocations_map(names):
	"""{todo_name: [{date, minutes, note}]} for the leader assigned allocation."""
	out = {n: [] for n in names}
	if not names:
		return out
	rows = frappe.get_all(
		"Project Todo Assigned Allocation",
		filters={"parent": ["in", names], "parenttype": "Project Todo"},
		fields=["parent", "allocation_date", "estimated_minutes", "note"],
		order_by="allocation_date asc",
		limit_page_length=0,
	)
	for r in rows:
		out.setdefault(r["parent"], []).append({
			"date": str(r["allocation_date"]) if r["allocation_date"] else None,
			"minutes": r["estimated_minutes"] or 0,
			"note": r.get("note") or "",
		})
	return out


@frappe.whitelist()
def set_assigned_allocation(project_item, allocations):
	"""Leader-only: replace a todo's authoritative assigned allocation. Must sum
	to the estimate. `allocations` is a JSON list of {date, minutes, note}."""
	try:
		user = frappe.session.user
		if not frappe.db.exists("Project Todo", project_item):
			return {"status": "error", "message": "Task not found."}
		todo = frappe.get_doc("Project Todo", project_item)
		project_detail = frappe.get_value("Project Todo", project_item, "project_detail")
		detail_project = frappe.get_value("Project Detail", project_detail, "project")
		leader = frappe.get_value("Project", detail_project, "project_leader")
		is_sm = "System Manager" in frappe.get_roles(user)
		if not (is_sm or user == leader):
			return {"status": "error", "message": "Only the project leader can set the assigned allocation."}
		if todo.status in ("🟠 Done", "✅ Completed"):
			return {"status": "error", "message": "Assigned allocation is locked once the task is Done or Completed."}

		if isinstance(allocations, str):
			allocations = json.loads(allocations or "[]")
		clean = [a for a in (allocations or []) if (a.get("date") or a.get("allocation_date"))]
		err = _alloc_sum_error(clean, todo.estimated)
		if err:
			return {"status": "error", "message": err}

		todo.set("assigned_allocation", [])
		for a in clean:
			todo.append("assigned_allocation", {
				"allocation_date": a.get("date") or a.get("allocation_date"),
				"estimated_minutes": int(a.get("minutes") or a.get("estimated_minutes") or 0),
				"note": (a.get("note") or "").strip(),
			})
		todo.save(ignore_permissions=True)
		frappe.db.commit()
		return {"status": "ok", "message": "Assigned allocation saved.",
			"allocations": _assigned_allocations_map([project_item]).get(project_item, [])}
	except Exception as e:
		msg = frappe.utils.strip_html(str(e)).strip() or "Could not save the assigned allocation."
		return {"status": "error", "message": msg}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/frappe/frappe-bench && bench --site dev.vernon.id run-tests --module vernon_project.api.test_allocations`
Expected: 4 TestAssignedAllocation tests PASS.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/mobile.py vernon_project/api/test_allocations.py
git commit -m "feat(allocation): add leader-gated set_assigned_allocation API"
```

---

### Task 5: Restrict `estimated` editing + clear assigned rows on estimate change

**Files:**
- Modify: `vernon_project/api/mobile.py` (`update_todo`, ~lines 1330-1456)
- Test: `vernon_project/api/test_allocations.py`

**Interfaces:**
- Consumes: `_AllocFixture` (Task 3), `set_assigned_allocation` (Task 4).
- Produces: `update_todo` rejects an `estimated` change from a non-leader/owner; on an applied `estimated` change it clears `assigned_allocation` rows.

- [ ] **Step 1: Write the failing tests**

Append to `vernon_project/api/test_allocations.py`:

```python
class TestEstimateGuard(_AllocFixture):
	def test_assignee_cannot_change_estimate(self):
		from vernon_project.api.mobile import update_todo
		frappe.set_user("alloc_assignee@example.com")
		res = update_todo(self.todo.name, estimated=999)
		frappe.set_user("Administrator")
		self.assertEqual(res["status"], "error")
		self.assertEqual(frappe.db.get_value("Project Todo", self.todo.name, "estimated"), 60)

	def test_estimate_change_clears_assigned_rows(self):
		from vernon_project.api.mobile import update_todo, set_assigned_allocation
		frappe.set_user("Administrator")
		set_assigned_allocation(self.todo.name, [{"date": str(add_days(nowdate(), 1)), "minutes": 60, "note": ""}])
		self.assertEqual(len(_assigned_allocations_map([self.todo.name])[self.todo.name]), 1)
		update_todo(self.todo.name, estimated=120)
		frappe.set_user("Administrator")
		self.assertEqual(len(_assigned_allocations_map([self.todo.name])[self.todo.name]), 0)
```

Add the import at the top of the test module: `from vernon_project.api.mobile import _assigned_allocations_map`.

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/frappe/frappe-bench && bench --site dev.vernon.id run-tests --module vernon_project.api.test_allocations`
Expected: FAIL — assignee change is currently allowed; assigned rows not cleared.

- [ ] **Step 3: Add the estimate guard + clear logic in `update_todo`**

In `update_todo`, after the existing permission block (the one that returns "You don't have permission to edit this task.") and before fields are applied, add:

```python
		# `estimated` drives scoring — only leader/owner/SM may change it.
		if estimated is not None and int(estimated) != int(row.estimated or 0):
			if not (is_sm or user in (project.project_owner, project.project_leader)):
				return {"status": "error", "message": "Only the project leader or owner can change the estimate."}
			# A new estimate invalidates any explicit assigned split — fall back to
			# the virtual default; the leader can re-split afterward.
			row.set("assigned_allocation", [])
```

(`is_sm`, `project`, and `row` already exist in `update_todo` per its current body.)

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/frappe/frappe-bench && bench --site dev.vernon.id run-tests --module vernon_project.api.test_allocations`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/mobile.py vernon_project/api/test_allocations.py
git commit -m "feat(allocation): restrict estimate edits to leader/owner; clear assigned split on change"
```

---

### Task 6: Detail payload — expose assigned allocation + permission flags

**Files:**
- Modify: `vernon_project/api/mobile.py` (the single-todo detail endpoint where `shaped["can_edit"]` / `shaped["fields_locked"]` are set, ~lines 1225-1234)
- Test: `vernon_project/api/test_allocations.py`

**Interfaces:**
- Consumes: `_assigned_allocations_map` (Task 4), `_assigned_allocation_for` (Task 2), `_AllocFixture` (Task 3).
- Produces: detail payload gains `assigned_allocation` (list of `{date, minutes, note}`, with virtual default), `assigned_total` (int), `can_edit_assigned` (bool), `can_edit_estimate` (bool).

- [ ] **Step 1: Write the failing test**

Append to `vernon_project/api/test_allocations.py`:

```python
class TestDetailPayload(_AllocFixture):
	def _detail(self):
		from vernon_project.api.mobile import get_project_item
		return get_project_item(self.todo.name)

	def test_virtual_default_in_detail(self):
		frappe.set_user("Administrator")
		d = self._detail()
		self.assertEqual(d["assigned_allocation"],
			[{"date": str(add_days(nowdate(), 5)), "minutes": 60, "note": ""}])
		self.assertEqual(d["assigned_total"], 60)

	def test_flags_for_leader(self):
		frappe.set_user("Administrator")  # leader + owner + SM
		d = self._detail()
		self.assertTrue(d["can_edit_assigned"])
		self.assertTrue(d["can_edit_estimate"])

	def test_flags_for_assignee(self):
		frappe.set_user("alloc_assignee@example.com")
		d = self._detail()
		frappe.set_user("Administrator")
		self.assertFalse(d["can_edit_assigned"])
		self.assertFalse(d["can_edit_estimate"])
```

> The detail endpoint is `get_project_item(project_item)` (confirmed, `mobile.py:1197`); it returns the dict that sets `shaped["can_edit"]` at line 1231.

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/frappe/frappe-bench && bench --site dev.vernon.id run-tests --module vernon_project.api.test_allocations`
Expected: FAIL — `KeyError: 'assigned_allocation'`.

- [ ] **Step 3: Add the fields in the detail endpoint**

Where `shaped["can_edit"]` / `shaped["fields_locked"]` are set (`r` is the todo row with `project_owner`, `project_leader`, `assigned_to`; `is_sm` already computed there), add:

```python
		is_leader = user == r["project_leader"]
		is_owner = user == r["project_owner"]
		shaped["can_edit_estimate"] = is_sm or is_leader or is_owner
		shaped["can_edit_assigned"] = is_sm or is_leader
		_assigned = _assigned_allocations_map([r["name"]]).get(r["name"], [])
		shaped["assigned_allocation"] = _assigned_allocation_for(
			_assigned, shaped.get("deadline"), shaped.get("estimated") or 0
		)
		shaped["assigned_total"] = sum((a["minutes"] or 0) for a in shaped["assigned_allocation"])
```

- [ ] **Step 4: Run to verify pass**

Run: `cd /home/frappe/frappe-bench && bench --site dev.vernon.id run-tests --module vernon_project.api.test_allocations`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/mobile.py vernon_project/api/test_allocations.py
git commit -m "feat(allocation): expose assigned_allocation + edit flags on todo detail"
```

---

### Task 7: Mobile data layer — api, hook, types

**Files:**
- Modify: `vernon_project/frontend/src/lib/api.ts` (add `setAssignedAllocation`)
- Modify: `vernon_project/frontend/src/hooks/useData.ts` (add `useSetAssignedAllocation`)
- Modify: `vernon_project/frontend/src/lib/types.ts` (extend `ProjectItem` / `ProjectItemDetail`)

**Interfaces:**
- Consumes: backend `set_assigned_allocation` (Task 4), detail fields (Task 6).
- Produces: `setAssignedAllocation(todoId, allocations)`, `useSetAssignedAllocation(todoId)`, and the type fields `assigned_allocation`, `assigned_total`, `can_edit_assigned`, `can_edit_estimate`.

- [ ] **Step 1: Add the API call**

In `lib/api.ts`, next to `setTodoAllocations`:

```typescript
  setAssignedAllocation: (todoId: string, allocations: { date: string; minutes: number; note?: string }[]) =>
    api.post<{ status: string; message: string; allocations: { date: string; minutes: number; note?: string }[] }>(
      M + 'set_assigned_allocation',
      { project_item: todoId, allocations: JSON.stringify(allocations) },
    ),
```

- [ ] **Step 2: Add the hook**

In `hooks/useData.ts`, next to `useSetTodoAllocations`:

```typescript
export function useSetAssignedAllocation(todoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (allocations: { date: string; minutes: number; note?: string }[]) => {
      const res = await mobileApi.setAssignedAllocation(todoId, allocations)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.projectItem(todoId) })
      qc.invalidateQueries({ queryKey: keys.dashboard })
    },
  })
}
```

- [ ] **Step 3: Extend the types**

In `lib/types.ts`, add to `ProjectItem`:

```typescript
  assigned_allocation: { date: string; minutes: number; note?: string }[]
  assigned_total: number
```

and to `ProjectItemDetail`:

```typescript
  can_edit_assigned: boolean
  can_edit_estimate: boolean
```

- [ ] **Step 4: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: No errors. (If `assigned_allocation` is referenced as required somewhere that constructs a `ProjectItem` literal in tests/mocks, none exist here, so this should be clean.)

- [ ] **Step 5: Commit**

```bash
git add vernon_project/frontend/src/lib/api.ts vernon_project/frontend/src/hooks/useData.ts vernon_project/frontend/src/lib/types.ts
git commit -m "feat(allocation): mobile data layer for assigned allocation"
```

---

### Task 8: Mobile todo screen — two cards + estimate gate

**Files:**
- Modify: `vernon_project/frontend/src/pages/ProjectItemScreen.tsx`

**Interfaces:**
- Consumes: `useSetAssignedAllocation` (Task 7), `can_edit_assigned`, `can_edit_estimate`, `assigned_allocation` (Tasks 6-7).
- Produces: the rendered "My day plan" (assignee) + "Assigned plan" (leader) cards; gated `estimated` input.

- [ ] **Step 1: Make the assignee card free-form**

In `AllocationCard`'s `onSave`, delete the sum==estimate block:

```typescript
    if (data.estimated > 0 && total !== data.estimated) {
      const diff = data.estimated - total
      toast('error', diff > 0 ? `${diff}m short of the ${data.estimated}m estimate` : `${-diff}m over the ${data.estimated}m estimate`)
      return
    }
```

Change the card title from "Split across days" to **"My day plan"** and the badge to show just `{total}m` (drop the `/ Nm est` comparison). The keep-a-date-on-every-row check stays.

- [ ] **Step 2: Add a read-only/editable Assigned card component**

Add a new component `AssignedAllocationCard` modeled on `AllocationCard` but:
- reads `data.assigned_allocation` for its initial rows,
- saves via `useSetAssignedAllocation(data.name)`,
- **keeps** the sum==estimate validation (badge shows `{total}m / {data.estimated}m est`),
- title **"Assigned plan"**, icon `CalendarRange`,
- when `!data.can_edit_assigned`, render the rows read-only (no date/number inputs, no Save/Add buttons) — reuse the existing non-`is_mine` read-only list markup that already exists below the AllocationCard.

```tsx
function AssignedAllocationCard({ data }: { data: ProjectItemDetail }) {
  const save = useSetAssignedAllocation(data.name)
  const toast = useToast()
  const [rows, setRows] = useState<AllocRow[]>(
    (data.assigned_allocation ?? []).map((a) => ({ date: a.date, minutes: a.minutes, note: a.note ?? '' })),
  )
  const total = rows.reduce((s, r) => s + (Number(r.minutes) || 0), 0)
  // ...same row editor JSX as AllocationCard, title "Assigned plan", keep the
  // sum==estimate validation in onSave (reuse the same guard text)...
}
```

Render both cards in the detail body. Replace the current `{data.is_mine ? <AllocationCard/> : <read-only list/>}` block so that:
- the assignee card (`AllocationCard`, now "My day plan") shows editable when `data.is_mine`, else read-only,
- the `AssignedAllocationCard` always renders (editable when `data.can_edit_assigned`, else read-only).

- [ ] **Step 3: Gate the estimate input**

In `EditForm`, wrap the `estimated` number input so it is disabled/hidden unless `data.can_edit_estimate`:

```tsx
{data.can_edit_estimate ? (
  <input /* existing estimated input */ />
) : (
  <p className="text-sm text-slate-500">Estimate: {data.estimated}m (leader-set)</p>
)}
```

Also guard the save payload: only include `fields.estimated` when `data.can_edit_estimate` (the backend rejects it otherwise, but don't send it needlessly).

- [ ] **Step 4: Import the new hook**

Add `useSetAssignedAllocation` to the existing `@/hooks/useData` import.

- [ ] **Step 5: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Manual smoke (build)**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build`
Expected: build succeeds. (No unit runner here; the build + tsc are the gate.)

- [ ] **Step 7: Commit**

```bash
git add vernon_project/frontend/src/pages/ProjectItemScreen.tsx
git commit -m "feat(allocation): two-card todo screen (my day plan + assigned plan) with estimate gate"
```

---

### Task 9: Report backend — return assigned + planned series

**Files:**
- Modify: `vernon_project/api/report.py` (`daily_estimated_time`, `_build_daily_matrix`; add `_assigned_rows`)
- Test: `vernon_project/api/test_report_matrix.py` (new)

**Interfaces:**
- Consumes: assigned allocation rows + the virtual default rule (estimate on deadline).
- Produces: `daily_estimated_time` response where each row has `per_day_assigned`, `per_day_planned`, `assigned_total`, `planned_total`, `flagged_dates` (days where **assigned** < threshold).

- [ ] **Step 1: Write the failing pivot test**

Create `vernon_project/api/test_report_matrix.py`:

```python
import unittest
from vernon_project.api.report import _build_daily_matrix


class TestDailyMatrix(unittest.TestCase):
	def test_two_series_and_flags(self):
		users = [{"name": "u@x.com", "full_name": "U"}]
		assigned = [{"user": "u@x.com", "day": "2026-06-22", "minutes": 120}]
		planned = [{"user": "u@x.com", "day": "2026-06-22", "minutes": 90}]
		out = _build_daily_matrix(users, assigned, planned, "2026-06-22", "2026-06-23", threshold=100)
		row = out["rows"][0]
		self.assertEqual(row["per_day_assigned"]["2026-06-22"], 120)
		self.assertEqual(row["per_day_planned"]["2026-06-22"], 90)
		self.assertEqual(row["assigned_total"], 120)
		self.assertEqual(row["planned_total"], 90)
		# 2026-06-22 assigned 120 >= 100 (ok); 2026-06-23 assigned 0 < 100 (flagged)
		self.assertEqual(row["flagged_dates"], ["2026-06-23"])
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /home/frappe/frappe-bench && bench --site dev.vernon.id run-tests --module vernon_project.api.test_report_matrix`
Expected: FAIL — `_build_daily_matrix()` takes the old single-`rows` signature.

- [ ] **Step 3: Rewrite `_build_daily_matrix` for two series**

Replace `_build_daily_matrix` in `report.py`:

```python
def _build_daily_matrix(active_users, assigned_rows, planned_rows, from_date, to_date, threshold):
	"""Pivot two row-sets into a user x day matrix. `assigned_rows`/`planned_rows`:
	[{user, day, minutes}]. Days whose ASSIGNED total < threshold are flagged."""
	dates = _date_list(from_date, to_date)
	threshold = int(threshold or 0)

	def pivot(rows):
		by_user = {}
		for r in rows:
			by_user.setdefault(r["user"], {})
			day = str(r["day"])
			by_user[r["user"]][day] = by_user[r["user"]].get(day, 0) + int(r["minutes"] or 0)
		return by_user

	a_by_user = pivot(assigned_rows)
	p_by_user = pivot(planned_rows)

	out_rows = []
	for u in active_users:
		a = a_by_user.get(u["name"], {})
		p = p_by_user.get(u["name"], {})
		per_a, per_p, flagged = {}, {}, []
		a_total = p_total = 0
		for d in dates:
			am, pm = int(a.get(d, 0)), int(p.get(d, 0))
			per_a[d], per_p[d] = am, pm
			a_total += am
			p_total += pm
			if am < threshold:
				flagged.append(d)
		out_rows.append({
			"user": u["name"], "full_name": u.get("full_name") or u["name"],
			"per_day_assigned": per_a, "per_day_planned": per_p,
			"assigned_total": a_total, "planned_total": p_total, "flagged_dates": flagged,
		})

	return {"threshold": threshold, "from_date": str(getdate(from_date)),
		"to_date": str(getdate(to_date)), "dates": dates, "rows": out_rows}
```

- [ ] **Step 4: Run to verify the pivot test passes**

Run: `cd /home/frappe/frappe-bench && bench --site dev.vernon.id run-tests --module vernon_project.api.test_report_matrix`
Expected: PASS.

- [ ] **Step 5: Build the assigned series + update `daily_estimated_time`**

In `daily_estimated_time`, the existing body builds `rows` from the `Project Todo Allocation` SQL and ends with `return _build_daily_matrix(users, rows, start, end, threshold)` (confirmed `report.py:115-135`; vars `start`, `end`, `threshold`, `users`, `names`, `rows` all exist). Keep that `rows` query as the **planned** series and **replace the final return** with the block below, which adds the **assigned** series (explicit `Project Todo Assigned Allocation` rows where present, else the virtual default = estimate on deadline):

```python
	planned_rows = rows  # existing Project Todo Allocation aggregation (lines 115-133)

	assigned_rows = []
	if names:
		# Explicit assigned allocation rows in range.
		explicit = frappe.db.sql(
			"""
			SELECT todo.assigned_to AS user, alloc.allocation_date AS day,
			       SUM(alloc.estimated_minutes) AS minutes, todo.name AS todo
			FROM `tabProject Todo Assigned Allocation` AS alloc
			JOIN `tabProject Todo` AS todo ON alloc.parent = todo.name
			WHERE todo.assigned_to IN %(users)s AND alloc.parenttype = 'Project Todo'
			  AND alloc.allocation_date BETWEEN %(from_date)s AND %(to_date)s
			GROUP BY todo.assigned_to, alloc.allocation_date, todo.name
			""",
			{"users": names, "from_date": str(start), "to_date": str(end)}, as_dict=True,
		)
		todos_with_explicit = {r["todo"] for r in explicit}
		assigned_rows = [{"user": r["user"], "day": r["day"], "minutes": r["minutes"]} for r in explicit]
		# Virtual default: todos with NO explicit assigned rows contribute their whole
		# estimate on their deadline (if the deadline falls in range).
		defaults = frappe.db.sql(
			"""
			SELECT name AS todo, assigned_to AS user, deadline AS day, estimated AS minutes
			FROM `tabProject Todo`
			WHERE assigned_to IN %(users)s AND IFNULL(estimated, 0) > 0
			  AND deadline BETWEEN %(from_date)s AND %(to_date)s
			""",
			{"users": names, "from_date": str(start), "to_date": str(end)}, as_dict=True,
		)
		for r in defaults:
			if r["todo"] not in todos_with_explicit:
				assigned_rows.append({"user": r["user"], "day": r["day"], "minutes": r["minutes"]})

	return _build_daily_matrix(users, assigned_rows, planned_rows, start, end, threshold)
```

(Confirm the existing variable names `names`, `rows`, `start`, `end`, `users`, `threshold` against the current `daily_estimated_time` body and adapt if they differ.)

- [ ] **Step 6: Run the full backend test module**

Run: `cd /home/frappe/frappe-bench && bench --site dev.vernon.id run-tests --module vernon_project.api.test_report_matrix`
Expected: PASS. Also re-run `vernon_project.api.test_allocations` to confirm no regressions.

- [ ] **Step 7: Commit**

```bash
git add vernon_project/api/report.py vernon_project/api/test_report_matrix.py
git commit -m "feat(report): daily estimated time returns assigned + planned series"
```

---

### Task 10: Web report — show assigned vs planned

**Files:**
- Modify: `/home/frappe/ui/src/features/reports/types.ts`
- Modify: `/home/frappe/ui/src/features/reports/DailyEstimatedTimePage.tsx`
- Modify: `/home/frappe/ui/src/features/reports/DailyEstimatedTimePage.test.tsx`
- (no change needed: `useDailyEstimatedTime.ts` / `.test.ts` — it just unwraps the envelope)

**Interfaces:**
- Consumes: the new backend response shape (Task 9).
- Produces: a per-cell "assigned / planned" display, flagged when assigned < threshold; metrics derived from `assigned_total`.

- [ ] **Step 1: Update the response types**

Replace `DailyEstimatedTimeRow` in `types.ts`:

```typescript
export interface DailyEstimatedTimeRow {
  user: string;
  full_name: string;
  per_day_assigned: Record<string, number>;
  per_day_planned: Record<string, number>;
  assigned_total: number;
  planned_total: number;
  flagged_dates: string[];
}
```

(`DailyEstimatedTimeResponse` is unchanged: `threshold`, `from_date`, `to_date`, `dates`, `rows`.)

- [ ] **Step 2: Update the page test to the new shape**

In `DailyEstimatedTimePage.test.tsx`, update the mock row(s) to the new fields and assert both numbers render. Representative test body:

```tsx
const row = {
  user: 'u@x.com', full_name: 'U',
  per_day_assigned: { '2026-06-22': 120 },
  per_day_planned: { '2026-06-22': 90 },
  assigned_total: 120, planned_total: 90, flagged_dates: [],
};
// ...render the page with a mocked useDailyEstimatedTime returning
// { threshold: 100, from_date, to_date, dates: ['2026-06-22'], rows: [row] }...
// expect the cell to contain both '120' (assigned) and '90' (planned).
```

(Match the existing mock/render style already in this file.)

- [ ] **Step 3: Run the test to verify failure**

Run: `cd /home/frappe/ui && npm run test -- DailyEstimatedTimePage`
Expected: FAIL — page still reads `row.per_day` / `row.total`.

- [ ] **Step 4: Update the page cell + metrics**

In `DailyEstimatedTimePage.tsx`:
- Day column `render`: show assigned primary + planned secondary; flag on assigned.

```tsx
      render: (row) => {
        const a = row.per_day_assigned[d] ?? 0;
        const p = row.per_day_planned[d] ?? 0;
        const flagged = row.flagged_dates.includes(d);
        return (
          <span className={flagged ? 'text-red-600 font-semibold' : undefined}>
            {a === 0 ? '—' : formatDuration(a)}
            <span className="text-muted-foreground"> / {p === 0 ? '—' : formatDuration(p)}</span>
          </span>
        );
      },
```

- Total column: `render: (row) => formatDuration(row.assigned_total)`.
- `avgDaily`: use `r.assigned_total` instead of `r.total`.
- Add a header hint (e.g. a `PageHeader` subtitle or a small legend line) noting "assigned / planned".

- [ ] **Step 5: Run the test + typecheck**

Run: `cd /home/frappe/ui && npm run test -- DailyEstimatedTimePage && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
cd /home/frappe/ui
git add src/features/reports/types.ts src/features/reports/DailyEstimatedTimePage.tsx src/features/reports/DailyEstimatedTimePage.test.tsx
git commit -m "feat(report): show assigned vs planned per day in Daily Estimated Time"
```

---

## Notes for the implementer

- Two repos: Tasks 1-9 in `/home/frappe/frappe-bench/apps/vernon_project`; Task 10 in `/home/frappe/ui`. Commit in each repo separately.
- The "Split to today" button added earlier writes the **assignee plan** (`set_todo_allocations`) and stays correct once the sum rule is dropped (Task 3) — no change needed.
- After Task 9, the report payload shape changes (`per_day` → `per_day_assigned`/`per_day_planned`). Task 10 must ship together with a deployed Task 9 backend, or the web report breaks. If the backend deploys before the web build, the page shows dashes until the new build lands.
- The detail endpoint is `get_project_item` (`mobile.py:1197`) and `daily_estimated_time` lives at `report.py:97` — both confirmed against source while writing this plan.
