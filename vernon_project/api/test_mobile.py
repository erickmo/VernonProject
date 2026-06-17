# Copyright (c) 2026, Vernon and Contributors
# See license.txt

import frappe
import unittest
from frappe.utils import nowdate, add_days
from vernon_project.api.mobile import get_work_item


class TestMobileGetWorkItem(unittest.TestCase):
	def setUp(self):
		if not frappe.db.exists("Customer", "Test Customer"):
			frappe.get_doc({
				"doctype": "Customer",
				"customer_name": "Test Customer",
				"customer_type": "Company",
			}).insert(ignore_permissions=True)

		if not frappe.db.exists("Project Group", "Test Project Group"):
			frappe.get_doc({
				"doctype": "Project Group",
				"project_name": "Test Project Group",
			}).insert(ignore_permissions=True)

		self.project = frappe.get_doc({
			"doctype": "Project",
			"project_name": "Mobile WorkItem Test",
			"customer": "Test Customer",
			"project_group": "Test Project Group",
			"project_owner": "Administrator",
			"project_leader": "Administrator",
			"status": "Ongoing",
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 30),
		})
		self.project.insert(ignore_permissions=True)

		grouping = frappe.get_doc({
			"doctype": "Glossary",
			"glossary": "Mobile Grouping",
			"project": self.project.name,
		})
		grouping.insert(ignore_permissions=True)
		self.grouping = grouping.name

		self.detail = frappe.get_doc({
			"doctype": "Project Detail",
			"project": self.project.name,
			"title": "Mobile Detail",
			"grouping": self.grouping,
			"project_deadline": add_days(nowdate(), 30),
			"estimated": 10,
		})
		self.detail.insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("Project Detail", self.detail.name):
			frappe.delete_doc("Project Detail", self.detail.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Glossary", self.grouping):
			frappe.delete_doc("Glossary", self.grouping, force=True, ignore_permissions=True)
		if frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_can_create_and_team_present(self):
		result = get_work_item(self.detail.name)
		self.assertIn("can_create", result)
		self.assertIn("team", result)
		self.assertIsInstance(result["team"], list)
		# Administrator is owner/leader + System Manager -> can create
		self.assertTrue(result["can_create"])


class TestMobileGetProjectExtras(unittest.TestCase):
	def setUp(self):
		if not frappe.db.exists("Customer", "Test Customer"):
			frappe.get_doc({"doctype": "Customer", "customer_name": "Test Customer",
				"customer_type": "Company"}).insert(ignore_permissions=True)
		if not frappe.db.exists("Project Group", "Test Project Group"):
			frappe.get_doc({"doctype": "Project Group",
				"project_name": "Test Project Group"}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Extras Test Project",
			"customer": "Test Customer", "project_group": "Test Project Group",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
		})
		self.project.insert(ignore_permissions=True)
		self.gl = frappe.get_doc({"doctype": "Glossary", "glossary": "Extras Grouping",
			"project": self.project.name})
		self.gl.insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("Glossary", self.gl.name):
			frappe.delete_doc("Glossary", self.gl.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_get_project_has_raw_leads_and_groupings(self):
		from vernon_project.api.mobile import get_project
		r = get_project(self.project.name)
		self.assertEqual(r["project_owner"], "Administrator")
		self.assertEqual(r["project_leader"], "Administrator")
		self.assertIn("project_group", r)
		self.assertIn("Extras Grouping", r["groupings"])


class TestMobileFormOptions(unittest.TestCase):
	def setUp(self):
		if not frappe.db.exists("Customer", "Test Customer"):
			frappe.get_doc({"doctype": "Customer", "customer_name": "Test Customer",
				"customer_type": "Company"}).insert(ignore_permissions=True)
		if not frappe.db.exists("Project Group", "Test Project Group"):
			frappe.get_doc({"doctype": "Project Group",
				"project_name": "Test Project Group"}).insert(ignore_permissions=True)
		if not frappe.db.exists("User", "fo_lead@example.com"):
			frappe.get_doc({"doctype": "User", "email": "fo_lead@example.com",
				"first_name": "FO", "send_welcome_email": 0}).insert(ignore_permissions=True)
		frappe.get_doc("User", "fo_lead@example.com").add_roles("Project Owner")
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_form_options_for_non_system_manager(self):
		from vernon_project.api.mobile import get_form_options
		# A Project Owner (NOT System Manager) must still get the user list,
		# even though /api/resource/User is System-Manager-only.
		frappe.set_user("fo_lead@example.com")
		try:
			r = get_form_options()
		finally:
			frappe.set_user("Administrator")
		self.assertIn("customers", r)
		self.assertIn("project_groups", r)
		self.assertTrue(len(r["users"]) > 0)
		self.assertTrue(any(o["value"] == "fo_lead@example.com" for o in r["users"]))
		self.assertTrue(all("value" in o and "label" in o for o in r["users"]))


class TestMobileGetWorkItemExtras(unittest.TestCase):
	def setUp(self):
		if not frappe.db.exists("Customer", "Test Customer"):
			frappe.get_doc({"doctype": "Customer", "customer_name": "Test Customer",
				"customer_type": "Company"}).insert(ignore_permissions=True)
		if not frappe.db.exists("Project Group", "Test Project Group"):
			frappe.get_doc({"doctype": "Project Group",
				"project_name": "Test Project Group"}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "WI Extras Project",
			"customer": "Test Customer", "project_group": "Test Project Group",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
		})
		self.project.insert(ignore_permissions=True)
		self.gl = frappe.get_doc({"doctype": "Glossary", "glossary": "WIX Grouping",
			"project": self.project.name})
		self.gl.insert(ignore_permissions=True)
		self.detail = frappe.get_doc({"doctype": "Project Detail", "project": self.project.name,
			"title": "WIX Detail", "grouping": self.gl.name,
			"project_deadline": add_days(nowdate(), 20)})
		self.detail.insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("Project Detail", self.detail.name):
			frappe.delete_doc("Project Detail", self.detail.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Glossary", self.gl.name):
			frappe.delete_doc("Glossary", self.gl.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_get_work_item_has_edit_fields(self):
		from vernon_project.api.mobile import get_work_item
		r = get_work_item(self.detail.name)
		self.assertTrue(r["can_edit"])
		self.assertEqual(r["grouping"], self.gl.name)
		self.assertIn("WIX Grouping", r["groupings"])


class TestMobileGetProjectTeam(unittest.TestCase):
	def setUp(self):
		if not frappe.db.exists("Customer", "Test Customer"):
			frappe.get_doc({"doctype": "Customer", "customer_name": "Test Customer",
				"customer_type": "Company"}).insert(ignore_permissions=True)
		if not frappe.db.exists("Project Group", "Test Project Group"):
			frappe.get_doc({"doctype": "Project Group",
				"project_name": "Test Project Group"}).insert(ignore_permissions=True)
		for email in ("tm_member@example.com", "tm_assignee@example.com"):
			if not frappe.db.exists("User", email):
				frappe.get_doc({"doctype": "User", "email": email,
					"first_name": email.split("@")[0], "send_welcome_email": 0}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Team Roster Project",
			"customer": "Test Customer", "project_group": "Test Project Group",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": "tm_member@example.com"}],
		})
		self.project.insert(ignore_permissions=True)
		self.gl = frappe.get_doc({"doctype": "Glossary", "glossary": "Roster Grouping",
			"project": self.project.name})
		self.gl.insert(ignore_permissions=True)
		self.detail = frappe.get_doc({"doctype": "Project Detail", "project": self.project.name,
			"title": "Roster Detail", "grouping": self.gl.name,
			"project_deadline": add_days(nowdate(), 20)})
		self.detail.insert(ignore_permissions=True)
		# One open todo assigned to a formal team member (assignee must be a team
		# member: Project Todo enforces validate_assigned_to_team_member).
		self.todo = frappe.get_doc({"doctype": "Project Todo", "project_detail": self.detail.name,
			"to_do": "Open task", "assigned_to": "tm_member@example.com",
			"status": "⚪️ Planned", "deadline": add_days(nowdate(), 5)}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		# Delete linked Project Todos first so Project Detail.on_trash doesn't block.
		if frappe.db.exists("Project Detail", self.detail.name):
			frappe.db.delete("Project Todo", {"project_detail": self.detail.name})
			frappe.delete_doc("Project Detail", self.detail.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Glossary", self.gl.name):
			frappe.delete_doc("Glossary", self.gl.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_team_includes_zero_load_members_and_flags(self):
		from vernon_project.api.mobile import get_project
		r = get_project(self.project.name)
		by_user = {m["user"]: m for m in r["team"]}
		# Owner/leader (Administrator) present, flagged, even though they have no load.
		self.assertIn("Administrator", by_user)
		self.assertTrue(by_user["Administrator"]["is_owner"])
		self.assertTrue(by_user["Administrator"]["is_leader"])
		self.assertTrue(by_user["Administrator"]["is_member"])
		self.assertEqual(by_user["Administrator"]["open_todos"], 0)
		# Formal Project Team member carrying the open todo appears with load.
		self.assertIn("tm_member@example.com", by_user)
		self.assertTrue(by_user["tm_member@example.com"]["is_member"])
		self.assertEqual(by_user["tm_member@example.com"]["open_todos"], 1)
		# Owner is first in order.
		self.assertEqual(r["team"][0]["user"], "Administrator")

	def test_member_workload_open_only_by_default(self):
		from vernon_project.api.mobile import get_member_workload
		rows = get_member_workload(self.project.name, "tm_member@example.com")
		self.assertEqual(len(rows), 1)
		self.assertEqual(rows[0]["to_do"], "Open task")
		self.assertEqual(rows[0]["work_item"], self.detail.name)
		self.assertEqual(rows[0]["status_key"], "planned")
		# A roster member with no todos returns an empty list.
		self.assertEqual(get_member_workload(self.project.name, "Administrator"), [])

	def test_member_workload_permission(self):
		from vernon_project.api.mobile import get_member_workload
		frappe.set_user("tm_assignee@example.com")  # not on any visible project here
		try:
			with self.assertRaises(frappe.PermissionError):
				get_member_workload(self.project.name, "tm_assignee@example.com")
		finally:
			frappe.set_user("Administrator")

	def test_team_order_owner_then_leader(self):
		from vernon_project.api.mobile import get_project
		# Create a project where owner and leader are distinct users.
		# Add Administrator to team_members so _visible_projects() includes it
		# (get_permission_query_conditions filters by ownership/membership).
		proj = frappe.get_doc({
			"doctype": "Project",
			"project_name": "Owner Leader Order Project",
			"customer": "Test Customer",
			"project_group": "Test Project Group",
			"project_owner": "tm_member@example.com",
			"project_leader": "tm_assignee@example.com",
			"status": "Ongoing",
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 30),
			"team_members": [{"user": "Administrator"}],
		})
		proj.insert(ignore_permissions=True)
		frappe.db.commit()
		try:
			r = get_project(proj.name)
			team = r["team"]
			self.assertTrue(team[0]["is_owner"])
			self.assertTrue(team[1]["is_leader"])
			self.assertNotEqual(team[0]["user"], team[1]["user"])
		finally:
			frappe.delete_doc("Project", proj.name, force=True, ignore_permissions=True)
			frappe.db.commit()
