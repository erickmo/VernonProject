# Copyright (c) 2026, Vernon and contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from vernon_project.api.mobile import create_todo
from vernon_project.vernon_project.doctype.project_todo.test_project_todo import _ensure_test_group


class TestCreateTodo(FrappeTestCase):
	"""vedu_erp calendar-Session-to-Project-Todo sync (PRJ-2609-00002): vedu1
	needed a create counterpart to update_todo -- there was no whitelisted
	todo-creation endpoint, only the frontend's own raw `frappe.client.insert`.
	Same auth pattern as external_calendar.sync_events (the other vedu_erp
	cross-app caller): a role allowlist checked in code, no dedicated
	Integration Client role on this site yet."""

	def setUp(self):
		frappe.set_user("Administrator")
		self.group, self.level_id = _ensure_test_group()
		if not frappe.db.exists("Brand", "Test Create Todo Brand"):
			frappe.get_doc({
				"doctype": "Brand", "brand_name": "Test Create Todo Brand",
				"company": frappe.db.get_value("Company", {}, "name"),
			}).insert(ignore_permissions=True)
		# Unique per test method (not a fixed name): a Glossary's docname is
		# "<project>-<title>", and one turned up already-committed with a
		# stale project prefix mid-session (root cause not pinned -- possibly
		# an autocommit-timing artifact from killing a hung/reaped run
		# earlier tonight) -- a fixed title collided across separate runs.
		# Making it unique sidesteps the mechanism entirely rather than
		# chasing it further.
		suffix = frappe.generate_hash(length=8)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": f"Test Create Todo Project {suffix}",
			"brand": "Test Create Todo Brand",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": "Administrator"}],
		}).insert(ignore_permissions=True)
		grouping = frappe.get_doc({
			"doctype": "Glossary", "glossary": f"Test Create Todo Grouping {suffix}", "project": self.project.name,
		}).insert(ignore_permissions=True)
		self.grouping_name = grouping.name
		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "Test Create Todo Detail",
			"grouping": grouping.name, "project_deadline": add_days(nowdate(), 30), "estimated": 100,
		}).insert(ignore_permissions=True)
		self.created_names = []

	def tearDown(self):
		frappe.set_user("Administrator")
		for n in self.created_names:
			if frappe.db.exists("Project Todo", n):
				frappe.delete_doc("Project Todo", n, force=True, ignore_permissions=True)
		frappe.delete_doc("Project Detail", self.detail.name, force=True, ignore_permissions=True)
		frappe.delete_doc("Glossary", self.grouping_name, force=True, ignore_permissions=True)
		frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)

	def _create(self, **over):
		fields = dict(
			project_detail=self.detail.name, to_do="Synced Session", assigned_to="Administrator",
			start_date=nowdate(), deadline=add_days(nowdate(), 3),
			group=self.group, level_id=self.level_id, estimated=30,
		)
		fields.update(over)
		res = create_todo(**fields)
		if res.get("name"):
			self.created_names.append(res["name"])
		return res

	def test_creates_with_required_fields(self):
		res = self._create()
		self.assertEqual(res["status"], "ok")
		self.assertTrue(res["name"])
		doc = frappe.get_doc("Project Todo", res["name"])
		self.assertEqual(doc.to_do, "Synced Session")
		self.assertEqual(doc.assigned_to, "Administrator")
		self.assertEqual(doc.status, "⚪️ Planned")
		self.assertEqual(doc.estimated, 30)
		# level (the reqd field) derives from level_id, same as update_todo/the
		# real create flow -- never supplied directly by a caller.
		self.assertTrue(doc.level)

	def test_estimated_below_minimum_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._create(estimated=1)

	def test_blank_to_do_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self._create(to_do="   ")

	def test_unknown_project_detail_rejected(self):
		with self.assertRaises(frappe.DoesNotExistError):
			self._create(project_detail="not-a-real-detail")

	def test_optional_fields_set(self):
		res = self._create(notes="From synced session", is_priority=1, work_mode="Human")
		doc = frappe.get_doc("Project Todo", res["name"])
		self.assertEqual(doc.notes, "From synced session")
		self.assertTrue(doc.is_priority)
		self.assertEqual(doc.work_mode, "Human")

	def test_blocked_by_and_blocking_set(self):
		first = self._create(to_do="First")
		second = self._create(to_do="Second", blocked_by=[first["name"]])
		doc = frappe.get_doc("Project Todo", second["name"])
		self.assertEqual([r.todo for r in doc.blocked_by], [first["name"]])

	def test_role_gate_denies_non_allowed_caller(self):
		if not frappe.db.exists("User", "create_todo_outsider@example.com"):
			frappe.get_doc({
				"doctype": "User", "email": "create_todo_outsider@example.com", "first_name": "Outsider",
				"send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		frappe.set_user("create_todo_outsider@example.com")
		try:
			with self.assertRaises(frappe.PermissionError):
				self._create()
		finally:
			frappe.set_user("Administrator")
		# Nothing should have been created before the throw.
		self.assertFalse(frappe.db.exists("Project Todo", {"project_detail": self.detail.name, "to_do": "Synced Session"}))
