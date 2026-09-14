# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe
from frappe.utils import add_days, cint, nowdate

from vernon_project.api.mobile import STATUS_DONE, transfer_tasks
from vernon_project.api.project_todo import reassign_series
from vernon_project.tests.no_leak import NoLeakMixin
from vernon_project.user_offboarding import _transfer_open_todos
from vernon_project.vernon_project.doctype.project_todo.test_project_todo import _ensure_test_group

LEADER = "reassign-guard-leader@test.local"
FROM = "reassign-guard-from@test.local"
TO = "reassign-guard-to@test.local"


class TestReassignGuards(NoLeakMixin, unittest.TestCase):
	"""transfer_tasks, offboarding and reassign_series write assigned_to with
	frappe.db.set_value, so validate() never runs. They used to move Done / Checked By
	PL todos (assignee frozen, and the approval points then went to someone who did
	not do the work) and ignored the priority-slot cap the controller documents for
	"a reassignment"."""

	def setUp(self):
		frappe.set_user("Administrator")
		if not cint(frappe.db.get_single_value("Vernon Settings", "daily_priority_slots")):
			self.skipTest("priority slots are off on this site")
		brand = frappe.get_all("Brand", pluck="name", limit=1)
		if not brand:
			self.skipTest("site has no Brand")
		self.group, self.level_id = _ensure_test_group()
		for email in (LEADER, FROM, TO):
			if not frappe.db.exists("User", email):
				frappe.get_doc({"doctype": "User", "email": email, "first_name": email.split("@")[0],
					"send_welcome_email": 0}).insert(ignore_permissions=True)
		frappe.get_doc("User", LEADER).add_roles("Project Owner", "Project Leader")
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Reassign Guard Probe",
			"brand": brand[0], "project_owner": LEADER, "project_leader": LEADER,
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": FROM}, {"user": TO}],
		}).insert(ignore_permissions=True)
		grouping = frappe.get_doc({"doctype": "Glossary", "glossary": "Reassign Guard Grouping",
			"project": self.project.name}).insert(ignore_permissions=True)
		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "Reassign Guard Detail",
			"grouping": grouping.name, "project_deadline": add_days(nowdate(), 30), "estimated": 100,
		}).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")

	def _todo(self, assignee, status=None, **extra):
		doc = frappe.get_doc({
			"doctype": "Project Todo", "project_detail": self.detail.name, "to_do": "Reassign guard probe",
			"assigned_to": assignee, "start_date": nowdate(), "deadline": add_days(nowdate(), 1),
			"estimated": 30, "status": "⚪️ Planned", "group": self.group, "level_id": self.level_id, **extra,
		}).insert(ignore_permissions=True)
		if status:
			frappe.db.set_value("Project Todo", doc.name, "status", status)
		return doc.name

	def _assignee(self, name):
		return frappe.db.get_value("Project Todo", name, "assigned_to")

	def test_transfer_moves_planned_work_but_not_work_awaiting_approval(self):
		planned, done = self._todo(FROM), self._todo(FROM, STATUS_DONE)
		res = transfer_tasks(FROM, TO, project=self.project.name)
		self.assertEqual(self._assignee(planned), TO)
		self.assertEqual(self._assignee(done), FROM, "finished work stays with who did it")
		self.assertEqual(res["moved"], 1)

	def test_transfer_drops_a_priority_that_would_overfill_the_target(self):
		for _ in range(50):  # fill whichever cap binds first, through validate() itself
			try:
				self._todo(TO, is_priority=1)
			except frappe.ValidationError:
				break
		moved = self._todo(FROM, is_priority=1)
		res = transfer_tasks(FROM, TO, project=self.project.name)
		self.assertEqual(self._assignee(moved), TO)
		self.assertEqual(frappe.db.get_value("Project Todo", moved, "is_priority"), 0)
		self.assertEqual(res["deprioritized"], [moved])

	def test_offboarding_moves_planned_work_but_not_work_awaiting_approval(self):
		planned, done = self._todo(FROM), self._todo(FROM, STATUS_DONE)
		_transfer_open_todos(FROM)
		self.assertEqual(self._assignee(planned), LEADER)
		self.assertEqual(self._assignee(done), FROM)

	def test_reassign_series_refuses_an_occurrence_awaiting_approval(self):
		anchor = self._todo(FROM, STATUS_DONE, is_recurring=1, recurring_frequency="Daily")
		frappe.set_user(LEADER)
		with self.assertRaises(frappe.ValidationError):
			reassign_series(anchor, TO)
		frappe.set_user("Administrator")
		self.assertEqual(self._assignee(anchor), FROM)
