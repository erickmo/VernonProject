# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe
from frappe.utils import add_days, nowdate

from vernon_project.api.project_todo import get_notes, list_todo_files


class TestGetNotesAndListTodoFilesPermission(unittest.TestCase):
	"""Regression for the 2026-09-08 permission sweep: get_notes had NO check at
	all ("accessible by all logged-in users"), and list_todo_files's docstring
	claimed a check ("a user who can open the todo can list its files") that
	didn't exist in the code. Both now gate on frappe.has_permission("Project
	Todo", "read", ...) — the same registered hook download_todo_file already
	used correctly, so this matches an existing sibling rather than inventing
	a new rule."""

	OWNER = "gnf_owner@example.com"
	ASSIGNEE = "gnf_assignee@example.com"
	OUTSIDER = "gnf_outsider@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer"}).insert(ignore_permissions=True)
		for email in (self.OWNER, self.ASSIGNEE, self.OUTSIDER):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": email.split("@")[0],
					"send_welcome_email": 0,
				}).insert(ignore_permissions=True)
		u = frappe.get_doc("User", self.OWNER)
		have = {r.role for r in u.roles}
		for role in ("Project Owner", "Project Leader"):
			if role not in have:
				u.append("roles", {"role": role})
		u.save(ignore_permissions=True)
		# "Project Team" is a doctype-level role (granted broadly in real onboarding,
		# ~174 real users hold it) distinct from Project Team *membership* (the
		# per-project team_members child row) — Project Todo's has_permission hook
		# needs both: doctype-level read (this role) AND the record-level check
		# (actual membership, set on the Project below).
		# OUTSIDER also gets the role (realistic — most real users hold it) so the
		# refusal test proves the RECORD-level check (no relationship to this
		# specific project), not merely a missing doctype-level role.
		for email in (self.ASSIGNEE, self.OUTSIDER):
			u2 = frappe.get_doc("User", email)
			if not any(r.role == "Project Team" for r in u2.roles):
				u2.append("roles", {"role": "Project Team"})
				u2.save(ignore_permissions=True)

		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "GNF Test Project", "brand": "Test Customer",
			"project_owner": self.OWNER, "project_leader": self.OWNER,
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": self.ASSIGNEE}],
		}).insert(ignore_permissions=True)
		self.gl = frappe.get_doc({
			"doctype": "Glossary", "glossary": "GNF Grouping", "project": self.project.name,
		}).insert(ignore_permissions=True)
		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "GNF Detail",
			"grouping": self.gl.name, "project_deadline": add_days(nowdate(), 20),
		}).insert(ignore_permissions=True)
		if not frappe.db.exists("Group", "Test Group"):
			frappe.get_doc({"doctype": "Group", "group_name": "Test Group"}).insert(ignore_permissions=True)
		self.todo = frappe.get_doc({
			"doctype": "Project Todo", "project_detail": self.detail.name,
			"to_do": "GNF task", "assigned_to": self.ASSIGNEE, "notes": "Secret notes here",
			"status": "⚪️ Planned", "start_date": nowdate(), "deadline": add_days(nowdate(), 5),
			"estimated": 30, "group": "Test Group", "level": "1",
		}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("Project Detail", self.detail.name):
			frappe.db.delete("Project Todo", {"project_detail": self.detail.name})
			frappe.delete_doc("Project Detail", self.detail.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Glossary", self.gl.name):
			frappe.delete_doc("Glossary", self.gl.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_owner_can_read_notes_and_files(self):
		frappe.set_user(self.OWNER)
		try:
			self.assertEqual(get_notes(self.todo.name)["notes"], "Secret notes here")
			list_todo_files(self.todo.name)  # must not raise
		finally:
			frappe.set_user("Administrator")

	def test_team_member_assignee_can_read_notes_and_files(self):
		frappe.set_user(self.ASSIGNEE)
		try:
			self.assertEqual(get_notes(self.todo.name)["notes"], "Secret notes here")
			list_todo_files(self.todo.name)  # must not raise
		finally:
			frappe.set_user("Administrator")

	def test_outsider_refused_on_both(self):
		frappe.set_user(self.OUTSIDER)
		try:
			with self.assertRaises(frappe.PermissionError):
				get_notes(self.todo.name)
			with self.assertRaises(frappe.PermissionError):
				list_todo_files(self.todo.name)
		finally:
			frappe.set_user("Administrator")


class TestAppSettingsPrankFieldsGated(unittest.TestCase):
	"""Regression: get_app_settings() leaked prank_target_users (spoils the gag,
	names who's targeted) and all_users (a full active-user directory) to any
	signed-in user. Both are now settings-manager-only; everything else in the
	response (branding, thresholds, banners) stays public since regular users'
	app boot depends on it — this was never gated wholesale."""

	NON_MANAGER = "asf_non_manager@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", self.NON_MANAGER):
			frappe.get_doc({
				"doctype": "User", "email": self.NON_MANAGER, "first_name": "ASF Non Manager",
				"send_welcome_email": 0,
			}).insert(ignore_permissions=True)
			frappe.db.commit()

	def test_non_manager_gets_empty_prank_fields_but_public_fields_intact(self):
		from vernon_project.api.mobile import get_app_settings
		frappe.set_user(self.NON_MANAGER)
		try:
			r = get_app_settings()
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(r["prank_target_users"], [])
		self.assertEqual(r["all_users"], [])
		# Public boot fields must still be present — this must not become a
		# manager-only endpoint.
		self.assertIn("app_logo", r)
		self.assertIn("min_minutes_monday", r)
		self.assertIn("home_banners", r)

	def test_system_manager_gets_real_prank_fields(self):
		from vernon_project.api.mobile import get_app_settings
		r = get_app_settings()  # already Administrator/System Manager
		self.assertIsInstance(r["all_users"], list)
		self.assertGreater(len(r["all_users"]), 0)
