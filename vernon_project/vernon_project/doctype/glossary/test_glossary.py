# Copyright (c) 2026, Vernon and Contributors
# See license.txt

import frappe
import unittest
from frappe.utils import nowdate, add_days
from vernon_project.vernon_project.doctype.glossary.glossary import has_permission


def _ensure(doctype, name, doc):
	if not frappe.db.exists(doctype, name):
		frappe.get_doc(doc).insert(ignore_permissions=True)


class TestGlossaryGuards(unittest.TestCase):
	def setUp(self):
		_ensure("Customer", "Test Customer", {"doctype": "Customer",
			"customer_name": "Test Customer", "customer_type": "Company"})
		_ensure("Project Group", "Test Project Group", {"doctype": "Project Group",
			"project_name": "Test Project Group"})
		for u in ("g_owner@example.com", "g_team@example.com"):
			if not frappe.db.exists("User", u):
				frappe.get_doc({"doctype": "User", "email": u, "first_name": u.split("@")[0],
					"send_welcome_email": 0}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({"doctype": "Project", "project_name": "Glossary Test Project",
			"customer": "Test Customer", "project_group": "Test Project Group",
			"project_owner": "g_owner@example.com", "project_leader": "g_owner@example.com",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": "g_team@example.com"}]})
		self.project.insert(ignore_permissions=True)
		self.gl = frappe.get_doc({"doctype": "Glossary", "glossary": "Guard Grouping",
			"project": self.project.name})
		self.gl.insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for pd in frappe.get_all("Project Detail", filters={"project": self.project.name}, pluck="name"):
			frappe.delete_doc("Project Detail", pd, force=True, ignore_permissions=True)
		for g in frappe.get_all("Glossary", filters={"project": self.project.name}, pluck="name"):
			frappe.delete_doc("Glossary", g, force=True, ignore_permissions=True)
		if frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_has_permission_lead_vs_team(self):
		doc = frappe.get_doc("Glossary", self.gl.name)
		self.assertTrue(has_permission(doc, "write", "g_owner@example.com"))
		self.assertTrue(has_permission(doc, "delete", "g_owner@example.com"))
		self.assertTrue(has_permission(doc, "read", "g_team@example.com"))
		self.assertFalse(has_permission(doc, "write", "g_team@example.com"))

	def test_on_trash_blocked_when_in_use(self):
		pd = frappe.get_doc({"doctype": "Project Detail", "project": self.project.name,
			"title": "Uses Grouping", "grouping": self.gl.name,
			"project_deadline": add_days(nowdate(), 10)})
		pd.insert(ignore_permissions=True)
		frappe.db.commit()
		with self.assertRaises(frappe.ValidationError):
			frappe.delete_doc("Glossary", self.gl.name, ignore_permissions=True)

	def test_on_trash_allowed_when_unused(self):
		g2 = frappe.get_doc({"doctype": "Glossary", "glossary": "Unused Grouping",
			"project": self.project.name})
		g2.insert(ignore_permissions=True)
		frappe.db.commit()
		frappe.delete_doc("Glossary", g2.name, ignore_permissions=True)
		self.assertFalse(frappe.db.exists("Glossary", g2.name))
