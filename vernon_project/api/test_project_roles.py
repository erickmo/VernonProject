# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe
from frappe.utils import add_days, nowdate

from vernon_project.api.project_roles import bulk_assign_project_roles
from vernon_project.tests.no_leak import NoLeakMixin


class TestBulkAssignProjectRoles(NoLeakMixin, unittest.TestCase):
	"""Regression for the 2026-09-08 permission sweep finding: the entry gate
	only proved the caller held the (global) 'Project Owner' role, never that
	they may touch the SPECIFIC project passed in — any project owner could
	reassign leadership of any other project in the org. Fix adds a per-project
	frappe.has_permission check inside the loop, same hook Project.has_permission
	enforces everywhere else."""

	OWNER_A = "bar_owner_a@example.com"
	OWNER_B = "bar_owner_b@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer"}).insert(ignore_permissions=True)
		for email in (self.OWNER_A, self.OWNER_B):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": email.split("@")[0],
					"send_welcome_email": 0,
					"roles": [{"role": "Project Owner"}, {"role": "Project Leader"}],
				}).insert(ignore_permissions=True)
			else:
				u = frappe.get_doc("User", email)
				have = {r.role for r in u.roles}
				for role in ("Project Owner", "Project Leader"):
					if role not in have:
						u.append("roles", {"role": role})
				u.save(ignore_permissions=True)

		self.project_a = frappe.get_doc({
			"doctype": "Project", "project_name": "BAR Project A", "brand": "Test Customer",
			"project_owner": self.OWNER_A, "project_leader": self.OWNER_A,
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
		}).insert(ignore_permissions=True)
		self.project_b = frappe.get_doc({
			"doctype": "Project", "project_name": "BAR Project B", "brand": "Test Customer",
			"project_owner": self.OWNER_B, "project_leader": self.OWNER_B,
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
		}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for p in (self.project_a, self.project_b):
			if frappe.db.exists("Project", p.name):
				frappe.delete_doc("Project", p.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_owner_refused_on_a_project_they_do_not_run(self):
		frappe.set_user(self.OWNER_A)
		try:
			r = bulk_assign_project_roles(
				projects=[self.project_b.name], set_leader=1, leader=self.OWNER_A,
			)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(r["updated"], [])
		self.assertEqual(len(r["skipped"]), 1)
		self.assertEqual(r["skipped"][0]["name"], self.project_b.name)
		# The takeover must not have happened.
		self.assertEqual(
			frappe.db.get_value("Project", self.project_b.name, "project_leader"), self.OWNER_B,
		)

	def test_owner_succeeds_on_their_own_project(self):
		frappe.set_user(self.OWNER_A)
		try:
			r = bulk_assign_project_roles(
				projects=[self.project_a.name], set_leader=1, leader=self.OWNER_A,
			)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(r["updated"], [self.project_a.name])
		self.assertEqual(r["skipped"], [])
		self.assertEqual(
			frappe.db.get_value("Project", self.project_a.name, "project_leader"), self.OWNER_A,
		)

	def test_system_manager_still_succeeds_on_any_project(self):
		r = bulk_assign_project_roles(
			projects=[self.project_b.name], set_leader=1, leader=self.OWNER_B,
		)
		self.assertEqual(r["updated"], [self.project_b.name])
		self.assertEqual(r["skipped"], [])
