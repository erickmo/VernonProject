# Copyright (c) 2026, Vernon and Contributors
# See license.txt

import frappe
import unittest
from frappe.utils import nowdate, add_days
from vernon_project.vernon_project.doctype.project_detail.project_detail import recompute_detail_rollups


def _ensure(doctype, name, doc):
	if not frappe.db.exists(doctype, name):
		frappe.get_doc(doc).insert(ignore_permissions=True)


class TestProjectDetailOnTrash(unittest.TestCase):
	def setUp(self):
		_ensure("Customer", "Test Customer", {"doctype": "Customer",
			"customer_name": "Test Customer", "customer_type": "Company"})
		_ensure("Project Group", "Test Project Group", {"doctype": "Project Group",
			"project_name": "Test Project Group"})
		self.project = frappe.get_doc({"doctype": "Project", "project_name": "PD Trash Project",
			"customer": "Test Customer", "project_group": "Test Project Group",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30)})
		self.project.insert(ignore_permissions=True)
		self.gl = frappe.get_doc({"doctype": "Glossary", "glossary": "PDT Grouping",
			"project": self.project.name})
		self.gl.insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for pd in frappe.get_all("Project Detail", filters={"project": self.project.name}, pluck="name"):
			d = frappe.get_doc("Project Detail", pd)
			d.todo = []
			d.save(ignore_permissions=True)
			frappe.delete_doc("Project Detail", pd, force=True, ignore_permissions=True)
		if frappe.db.exists("Glossary", self.gl.name):
			frappe.delete_doc("Glossary", self.gl.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def _make_detail(self, with_task):
		todos = []
		if with_task:
			todos = [{"to_do": "T1", "assigned_to": "Administrator",
				"deadline": add_days(nowdate(), 3), "status": "⚪️ Planned"}]
		d = frappe.get_doc({"doctype": "Project Detail", "project": self.project.name,
			"title": "Trash WI", "grouping": self.gl.name,
			"project_deadline": add_days(nowdate(), 20), "todo": todos})
		d.insert(ignore_permissions=True)
		frappe.db.commit()
		return d

	def test_delete_blocked_with_tasks(self):
		d = self._make_detail(with_task=True)
		with self.assertRaises(frappe.ValidationError):
			frappe.delete_doc("Project Detail", d.name, ignore_permissions=True)

	def test_delete_allowed_without_tasks(self):
		d = self._make_detail(with_task=False)
		frappe.delete_doc("Project Detail", d.name, ignore_permissions=True)
		self.assertFalse(frappe.db.exists("Project Detail", d.name))

	def test_recompute_rollups_counts_standalone_todos(self):
		# _make_detail without embedded todo rows so we can insert standalone ones
		d = self._make_detail(with_task=False)
		team_user = "Administrator"
		for i in range(3):
			frappe.get_doc({
				"doctype": "Project Todo",
				"project_detail": d.name,
				"to_do": f"task {i}",
				"assigned_to": team_user,
				"deadline": "2026-12-31",
				"estimated": 60,
				"status": "⚪️ Planned",
			}).insert(ignore_permissions=True)

		recompute_detail_rollups(d.name)
		d.reload()
		self.assertEqual(d.todo_count, 3)
		self.assertEqual(d.total_estimated, 180)
		self.assertEqual(d.total_remaining_estimated, 180)
