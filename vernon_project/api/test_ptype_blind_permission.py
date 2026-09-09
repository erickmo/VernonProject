# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe
from frappe.utils import add_days, nowdate

from vernon_project.vernon_project.doctype.project_todo.project_todo import has_permission as todo_has_permission
from vernon_project.vernon_project.doctype.meeting.meeting import has_permission as meeting_has_permission


class TestPtypeBlindPermission(unittest.TestCase):
	"""2026-09-09 permission sweep: project_todo/meeting has_permission() took a
	`ptype` argument and never read it, so a plain Project Team member (whose
	JSON grant is create-only) got an unconditional True for write and delete
	too -- full write+delete on every Todo/Meeting in their project via generic
	REST, bypassing update_todo's approval ladder and meeting's manage-gate
	entirely."""

	LEADER = "ptb_leader@example.com"
	TEAMMATE = "ptb_teammate@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer"}).insert(ignore_permissions=True)
		for email in (self.LEADER, self.TEAMMATE):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": email.split("@")[0],
					"send_welcome_email": 0,
				}).insert(ignore_permissions=True)
		u = frappe.get_doc("User", self.LEADER)
		have = {r.role for r in u.roles}
		# project_owner AND project_leader both point at this user below, and
		# Project.validate_lead_roles() checks each field's role independently
		# -- it needs both roles, not just "Project Owner".
		for role in ("Project Owner", "Project Leader"):
			if role not in have:
				u.append("roles", {"role": role})
		u.save(ignore_permissions=True)
		u2 = frappe.get_doc("User", self.TEAMMATE)
		if not any(r.role == "Project Team" for r in u2.roles):
			u2.append("roles", {"role": "Project Team"})
			u2.save(ignore_permissions=True)

		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "PTB Project", "brand": "Test Customer",
			"project_owner": self.LEADER, "project_leader": self.LEADER,
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": self.TEAMMATE}],
		}).insert(ignore_permissions=True)
		self.gl = frappe.get_doc({
			"doctype": "Glossary", "glossary": "PTB Grouping", "project": self.project.name,
		}).insert(ignore_permissions=True)
		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "PTB Detail",
			"grouping": self.gl.name, "project_deadline": add_days(nowdate(), 20),
		}).insert(ignore_permissions=True)
		if not frappe.db.exists("Group", "Test Group"):
			frappe.get_doc({"doctype": "Group", "group_name": "Test Group"}).insert(ignore_permissions=True)
		self.todo = frappe.get_doc({
			"doctype": "Project Todo", "to_do": "PTB Todo", "project_detail": self.detail.name,
			"assigned_to": self.TEAMMATE, "start_date": nowdate(), "deadline": add_days(nowdate(), 5),
			"estimated": 30, "group": "Test Group", "level": "1",
		}).insert(ignore_permissions=True)
		self.meeting = frappe.get_doc({
			"doctype": "Meeting", "title": "PTB Meeting", "project": self.project.name,
			"organizer": self.LEADER, "scheduled_at": frappe.utils.now_datetime(), "estimated": 30,
			"participants": [{"user": self.TEAMMATE}],
		}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for dt, name in (("Meeting", self.meeting.name), ("Project Todo", self.todo.name),
						("Project Detail", self.detail.name), ("Glossary", self.gl.name),
						("Project", self.project.name)):
			if frappe.db.exists(dt, name):
				frappe.delete_doc(dt, name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_team_member_cannot_write_or_delete_todo_via_permission_hook(self):
		self.assertFalse(todo_has_permission(self.todo, "write", self.TEAMMATE))
		self.assertFalse(todo_has_permission(self.todo, "delete", self.TEAMMATE))

	def test_team_member_can_still_read_and_create_todo_via_permission_hook(self):
		self.assertTrue(todo_has_permission(self.todo, "read", self.TEAMMATE))
		self.assertTrue(todo_has_permission(self.todo, "create", self.TEAMMATE))

	def test_owner_still_has_full_write_delete_on_todo(self):
		self.assertTrue(todo_has_permission(self.todo, "write", self.LEADER))
		self.assertTrue(todo_has_permission(self.todo, "delete", self.LEADER))

	def test_team_member_cannot_write_or_delete_meeting_via_permission_hook(self):
		self.assertFalse(meeting_has_permission(self.meeting, "write", self.TEAMMATE))
		self.assertFalse(meeting_has_permission(self.meeting, "delete", self.TEAMMATE))

	def test_team_member_can_still_read_meeting_via_permission_hook(self):
		self.assertTrue(meeting_has_permission(self.meeting, "read", self.TEAMMATE))

	def test_owner_still_has_full_write_delete_on_meeting(self):
		self.assertTrue(meeting_has_permission(self.meeting, "write", self.LEADER))
		self.assertTrue(meeting_has_permission(self.meeting, "delete", self.LEADER))
