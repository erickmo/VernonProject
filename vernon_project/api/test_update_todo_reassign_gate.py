# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe
from frappe.utils import add_days, nowdate

from vernon_project.api.mobile import update_todo
from vernon_project.tests.no_leak import NoLeakMixin


class TestUpdateTodoReassignGate(NoLeakMixin, unittest.TestCase):
	"""2026-09-09 permission sweep: update_todo's outer gate lets
	is_sm/owner/leader/THE CURRENT ASSIGNEE/admin in, but once inside,
	`assigned_to` was applied unconditionally -- unlike `estimated` and
	`mentor`, which are already leader/owner-only. A plain assignee could
	silently hand their own task to anyone with no approval. Gated
	`assigned_to` the same way `estimated`/`mentor` already are."""

	LEADER = "utrg_leader@example.com"
	ASSIGNEE = "utrg_assignee@example.com"
	OTHER = "utrg_other@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer"}).insert(ignore_permissions=True)
		for email in (self.LEADER, self.ASSIGNEE, self.OTHER):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": email.split("@")[0],
					"send_welcome_email": 0,
				}).insert(ignore_permissions=True)
		u = frappe.get_doc("User", self.LEADER)
		have = {r.role for r in u.roles}
		for role in ("Project Owner", "Project Leader"):
			if role not in have:
				u.append("roles", {"role": role})
		u.save(ignore_permissions=True)

		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "UTRG Project", "brand": "Test Customer",
			"project_owner": self.LEADER, "project_leader": self.LEADER,
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": self.ASSIGNEE}, {"user": self.OTHER}],
		}).insert(ignore_permissions=True)
		self.gl = frappe.get_doc({
			"doctype": "Glossary", "glossary": "UTRG Grouping", "project": self.project.name,
		}).insert(ignore_permissions=True)
		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "UTRG Detail",
			"grouping": self.gl.name, "project_deadline": add_days(nowdate(), 20),
		}).insert(ignore_permissions=True)
		if not frappe.db.exists("Group", "Test Group"):
			frappe.get_doc({"doctype": "Group", "group_name": "Test Group"}).insert(ignore_permissions=True)
		self.todo = frappe.get_doc({
			"doctype": "Project Todo", "to_do": "UTRG Todo", "project_detail": self.detail.name,
			"assigned_to": self.ASSIGNEE, "start_date": nowdate(), "deadline": add_days(nowdate(), 5),
			"estimated": 30, "group": "Test Group", "level": "1",
		}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for dt, name in (("Project Todo", self.todo.name), ("Project Detail", self.detail.name),
						("Glossary", self.gl.name), ("Project", self.project.name)):
			if frappe.db.exists(dt, name):
				frappe.delete_doc(dt, name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_assignee_cannot_reassign_to_someone_else(self):
		frappe.set_user(self.ASSIGNEE)
		try:
			result = update_todo(project_item=self.todo.name, assigned_to=self.OTHER)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(result["status"], "error")
		self.assertEqual(
			frappe.db.get_value("Project Todo", self.todo.name, "assigned_to"), self.ASSIGNEE)

	def test_leader_can_reassign(self):
		frappe.set_user(self.LEADER)
		try:
			result = update_todo(project_item=self.todo.name, assigned_to=self.OTHER)
		finally:
			frappe.set_user("Administrator")
		self.assertNotEqual(result.get("status"), "error")
		self.assertEqual(
			frappe.db.get_value("Project Todo", self.todo.name, "assigned_to"), self.OTHER)

	def test_assignee_editing_other_fields_still_works(self):
		frappe.set_user(self.ASSIGNEE)
		try:
			result = update_todo(project_item=self.todo.name, to_do="Renamed by assignee")
		finally:
			frappe.set_user("Administrator")
		self.assertNotEqual(result.get("status"), "error")
		self.assertEqual(
			frappe.db.get_value("Project Todo", self.todo.name, "to_do"), "Renamed by assignee")
