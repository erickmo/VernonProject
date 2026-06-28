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


from vernon_project.api.mobile import _alloc_sum_error, _assigned_allocation_for, _assigned_allocations_map


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


from frappe.utils import nowdate, add_days


class _AllocFixture(unittest.TestCase):
	"""Project (owner+leader=Administrator) / Detail / Todo assigned to a
	non-leader user, mirroring test_project_todo.py's setup."""

	def setUp(self):
		for email, fn in (("alloc_assignee@example.com", "Assignee"),):
			if not frappe.db.exists("User", email):
				frappe.get_doc({"doctype": "User", "email": email, "first_name": fn,
					"send_welcome_email": 0}).insert(ignore_permissions=True)
			# Read on Project Todo is role-gated; production team users hold this role.
			frappe.get_doc("User", email).add_roles("Project Team")
		if not frappe.db.exists("Brand", "Alloc Brand"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Alloc Brand"}).insert(ignore_permissions=True)
		if not frappe.db.exists("Group", "Alloc Group"):
			frappe.get_doc({"doctype": "Group", "group_name": "Alloc Group"}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Alloc Project", "brand": "Alloc Brand",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(),
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
			"start_date": nowdate(), "group": "Alloc Group", "level": "L1",
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
