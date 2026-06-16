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
