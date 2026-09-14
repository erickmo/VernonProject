# Copyright (c) 2026, Vernon and Contributors
# See license.txt

import unittest

import frappe
from frappe.utils import add_days, getdate, nowdate

from vernon_project.api.postpone import postpone
from vernon_project.fixtures_for_tests import ensure_brand, ensure_user


class TestPostponeScope(unittest.TestCase):
	"""Project/Project Detail has_permission says yes to ANY team member, so a user
	holding the global Project Leader role passed postpone's write check on a project
	where they are only a member — then everything saved with ignore_permissions."""

	LEADER = "pp_leader@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		ensure_user(self.LEADER, "PPL", roles=("Project Leader",))
		ensure_brand("Test Customer")
		self.foreign = self._project("PP Foreign", leader="Administrator", members=[self.LEADER])
		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.foreign.name, "title": "PP Detail",
			"project_deadline": add_days(nowdate(), 30), "estimated": 10,
		}).insert(ignore_permissions=True)
		frappe.db.set_value("Project Detail", self.detail.name, "latest_deadline", add_days(nowdate(), 20))
		self.own = self._project("PP Own", leader=self.LEADER)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.delete_doc("Project Detail", self.detail.name, force=True, ignore_permissions=True)
		for p in (self.foreign, self.own):
			frappe.delete_doc("Project", p.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def _project(self, name, leader, members=()):
		return frappe.get_doc({
			"doctype": "Project", "project_name": name, "brand": "Test Customer",
			"project_owner": "Administrator", "project_leader": leader, "status": "Ongoing",
			"start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": u} for u in ("Administrator", leader, *members)],
		}).insert(ignore_permissions=True)

	def _as_leader(self, *args):
		frappe.set_user(self.LEADER)
		try:
			return postpone(*args)
		finally:
			frappe.set_user("Administrator")

	def test_member_leader_cannot_postpone_foreign_project(self):
		with self.assertRaises(frappe.PermissionError):
			self._as_leader("Project", self.foreign.name, add_days(nowdate(), 60))
		self.assertEqual(getdate(frappe.db.get_value("Project", self.foreign.name, "deadline")),
			getdate(add_days(nowdate(), 30)))

	def test_member_leader_cannot_postpone_foreign_detail(self):
		with self.assertRaises(frappe.PermissionError):
			self._as_leader("Project Detail", self.detail.name, add_days(nowdate(), 60))
		self.assertEqual(getdate(frappe.db.get_value("Project Detail", self.detail.name, "latest_deadline")),
			getdate(add_days(nowdate(), 20)))

	def test_leader_can_postpone_own_project(self):
		res = self._as_leader("Project", self.own.name, add_days(nowdate(), 32))
		self.assertEqual(res["delta_days"], 2)
		self.assertEqual(getdate(frappe.db.get_value("Project", self.own.name, "deadline")),
			getdate(add_days(nowdate(), 32)))
