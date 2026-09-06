# Copyright (c) 2026, Vernon and Contributors
# See license.txt
#
# update_project / update_project_detail: generic field updates for Project and
# Project Detail (used by the MCP connector, which can only call whitelisted
# vernon_project.api.* methods, not the frontend's raw REST resource.update).
# Same owner/leader/SM gate as the AI breakdown endpoints in the same module.

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import nowdate, add_days

from vernon_project.api.project import update_project, update_project_detail

LEADER = "pu_leader@example.com"
STRANGER = "pu_stranger@example.com"


class TestProjectUpdate(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		for email, name in ((LEADER, "Pu Leader"), (STRANGER, "Pu Stranger")):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": name,
					"send_welcome_email": 0, "enabled": 1,
				}).insert(ignore_permissions=True)
		if not frappe.db.exists("Has Role", {"parent": LEADER, "role": "Project Leader"}):
			frappe.get_doc("User", LEADER).add_roles("Project Leader")
		self.brand = frappe.get_all("Brand", pluck="name", limit=1)[0]
		self.group = frappe.get_all("Group", pluck="name", limit=1)[0]

		self.project = frappe.get_doc({
			"doctype": "Project",
			"project_name": "PU " + frappe.generate_hash(length=6),
			"brand": self.brand,
			"project_owner": "Administrator",
			"project_leader": LEADER,
			"status": "Ongoing",
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 30),
		}).insert(ignore_permissions=True)
		self.grouping = frappe.get_doc({
			"doctype": "Glossary", "glossary": "PU Grouping " + frappe.generate_hash(length=6),
			"project": self.project.name,
		}).insert(ignore_permissions=True)
		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name,
			"title": "PU Detail", "grouping": self.grouping.name,
			"project_deadline": add_days(nowdate(), 30),
		}).insert(ignore_permissions=True)
		frappe.set_user(LEADER)

	def test_leader_can_update_project(self):
		update_project(self.project.name, {"project_name": "Renamed by leader"})
		self.assertEqual(frappe.db.get_value("Project", self.project.name, "project_name"), "Renamed by leader")

	def test_stranger_cannot_update_project(self):
		frappe.set_user(STRANGER)
		with self.assertRaises(frappe.PermissionError):
			update_project(self.project.name, {"project_name": "Hijacked"})

	def test_protected_fields_are_ignored(self):
		original_owner = frappe.db.get_value("Project", self.project.name, "owner")
		update_project(self.project.name, {"owner": "someone_else@example.com", "project_name": "Still renamed"})
		self.assertEqual(frappe.db.get_value("Project", self.project.name, "owner"), original_owner)
		self.assertEqual(frappe.db.get_value("Project", self.project.name, "project_name"), "Still renamed")

	def test_leader_can_update_project_detail(self):
		update_project_detail(self.detail.name, {"title": "Renamed detail"})
		self.assertEqual(frappe.db.get_value("Project Detail", self.detail.name, "title"), "Renamed detail")

	def test_stranger_cannot_update_project_detail(self):
		frappe.set_user(STRANGER)
		with self.assertRaises(frappe.PermissionError):
			update_project_detail(self.detail.name, {"title": "Hijacked"})
