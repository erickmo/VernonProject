# Copyright (c) 2026, Vernon and Contributors
# See license.txt

import unittest

import frappe
from frappe.utils import add_days, nowdate

from vernon_project.api.focus import list_focus, reorder_focus, save_timer


class TestReorderFocus(unittest.TestCase):
	"""reorder_focus is the security boundary for drag-to-reorder: a payload must be
	exactly the caller's own active (running/paused) task ids, permuted — never an
	arbitrary list, never another user's row."""

	def setUp(self):
		if not frappe.db.exists("User", "focus_owner@example.com"):
			frappe.get_doc({"doctype": "User", "email": "focus_owner@example.com",
				"first_name": "Focus", "send_welcome_email": 0}).insert(ignore_permissions=True)
		if not frappe.db.exists("User", "focus_other@example.com"):
			frappe.get_doc({"doctype": "User", "email": "focus_other@example.com",
				"first_name": "Other", "send_welcome_email": 0}).insert(ignore_permissions=True)
		if not frappe.db.exists("Brand", "Focus Test Brand"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Focus Test Brand",
				"company": frappe.db.get_value("Company", {}, "name")}).insert(ignore_permissions=True)
		if not frappe.db.exists("Group", "Focus Test Group"):
			frappe.get_doc({
				"doctype": "Group", "group_name": "Focus Test Group", "base_rate_per_minute": 1,
				"levels": [{"type_name": "General", "level_name": "L1",
					"level_id": "FOCUSLVL1", "difficulty_percent": 100}],
			}).insert(ignore_permissions=True)
		project = frappe.get_doc({
			"doctype": "Project", "project_name": "Focus Test Project", "brand": "Focus Test Brand",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": "focus_owner@example.com"}, {"user": "focus_other@example.com"}],
		}).insert(ignore_permissions=True)
		grouping = frappe.get_doc({"doctype": "Glossary", "glossary": "Focus Test Grouping",
			"project": project.name}).insert(ignore_permissions=True)
		detail = frappe.get_doc({"doctype": "Project Detail", "project": project.name,
			"title": "Focus Test Detail", "grouping": grouping.name,
			"project_deadline": add_days(nowdate(), 30), "estimated": 100}).insert(ignore_permissions=True)
		self.project, self.grouping, self.detail = project, grouping, detail
		self.tasks = [self._todo(f"Focus Task {i}") for i in range(3)]
		frappe.db.commit()

	def _todo(self, title):
		return frappe.get_doc({
			"doctype": "Project Todo", "project_detail": self.detail.name, "to_do": title,
			"assigned_to": "focus_owner@example.com", "group": "Focus Test Group",
			"level_id": "FOCUSLVL1", "estimated": 30, "status": "⚪️ Planned",
			"start_date": nowdate(), "deadline": add_days(nowdate(), 30),
		}).insert(ignore_permissions=True).name

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.delete("Focus Timer", {"task": ["in", self.tasks]})
		for name in self.tasks:
			frappe.delete_doc("Project Todo", name, ignore_permissions=True, force=True)
		frappe.delete_doc("Project Detail", self.detail.name, ignore_permissions=True, force=True)
		frappe.delete_doc("Glossary", self.grouping.name, ignore_permissions=True, force=True)
		frappe.delete_doc("Project", self.project.name, ignore_permissions=True, force=True)
		frappe.db.commit()

	def _start(self, user, task):
		frappe.set_user(user)
		save_timer(task=task, task_title=task, estimated_ms=0, status="running", started_at_ms=1, elapsed_before_ms=0)

	def test_valid_permutation_persists_and_is_read_back_in_order(self):
		a, b, c = self.tasks
		for t in (a, b, c):
			self._start("focus_owner@example.com", t)
		reorder_focus([c, a, b])
		rows = list_focus()
		active = [r["taskId"] for r in rows if r["status"] in ("running", "paused")]
		self.assertEqual(active, [c, a, b])

	def test_rejects_payload_missing_one_of_the_callers_own_tasks(self):
		a, b = self.tasks[0], self.tasks[1]
		self._start("focus_owner@example.com", a)
		self._start("focus_owner@example.com", b)
		with self.assertRaises(frappe.PermissionError):
			reorder_focus([a])

	def test_rejects_payload_containing_an_id_the_caller_never_focused(self):
		a = self.tasks[0]
		unfocused = self.tasks[2]
		self._start("focus_owner@example.com", a)
		with self.assertRaises(frappe.PermissionError):
			reorder_focus([a, unfocused])

	def test_cannot_reorder_another_users_focus_row(self):
		"""Same task, focused by two different users → reordering one user's list
		must never touch the other user's row (ownership, not just membership)."""
		a, b = self.tasks[0], self.tasks[1]
		self._start("focus_owner@example.com", a)
		self._start("focus_owner@example.com", b)
		self._start("focus_other@example.com", a)
		frappe.set_user("focus_owner@example.com")
		reorder_focus([b, a])
		other_sort_order = frappe.db.get_value(
			"Focus Timer", {"user": "focus_other@example.com", "task": a}, "sort_order"
		)
		self.assertEqual(other_sort_order, 0, "other user's row untouched")


if __name__ == "__main__":
	unittest.main()
