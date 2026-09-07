"""Regression guard for the jll4vd36n6 performance/security audit
(SECURITY_PERF_AUDIT.md in the repo root has the full findings)."""

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from vernon_project.api.mobile import _fetch_todos, get_project_item
from vernon_project.vernon_project.doctype.project_todo.test_project_todo import _ensure_test_group

HOT_FILTER_FIELDS = ("assigned_to", "status", "deadline", "work_mode")


class TestHotFilterIndexes(FrappeTestCase):
	def test_hot_filter_indexes_exist(self):
		"""assigned_to/status/deadline/work_mode were missing search_index
		while project/project_detail already had it — exactly the hot filters
		get_dashboard/get_calendar/get_project/get_project_item scope by.
		A DB index, not just the DocField flag, is what actually matters."""
		indexed = {
			row.Column_name
			for row in frappe.db.sql("SHOW INDEX FROM `tabProject Todo`", as_dict=True)
		}
		missing = [f for f in HOT_FILTER_FIELDS if f not in indexed]
		self.assertEqual(missing, [], f"Project Todo is missing a DB index on: {missing}")


class TestGetProjectItemNoSiblingDump(FrappeTestCase):
	"""get_project_item used to call _fetch_todos([project]) — fetch + shape
	EVERY sibling todo in the project, then filter to one row in Python. Rows
	returned (and the work behind them) scaled with sibling count. Fixed by
	pushing the target name into the SQL's WHERE clause (_fetch_todos'
	new `names` param) so the database does the filtering."""

	def setUp(self):
		frappe.set_user("Administrator")
		group, level_id = _ensure_test_group()
		if not frappe.db.exists("Brand", "Test Sibling Dump Brand"):
			frappe.get_doc({
				"doctype": "Brand", "brand_name": "Test Sibling Dump Brand",
				"company": frappe.db.get_value("Company", {}, "name"),
			}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Test Sibling Dump Project",
			"brand": "Test Sibling Dump Brand",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": "Administrator"}],
		}).insert(ignore_permissions=True)
		grouping = frappe.get_doc({
			"doctype": "Glossary", "glossary": "Test Sibling Dump Grouping", "project": self.project.name,
		}).insert(ignore_permissions=True)
		self.project_detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "Test Sibling Dump Detail",
			"grouping": grouping.name, "project_deadline": add_days(nowdate(), 30), "estimated": 100,
		}).insert(ignore_permissions=True)
		self.group, self.level_id = group, level_id

	def _make_todos(self, n):
		names = []
		for i in range(n):
			doc = frappe.get_doc({
				"doctype": "Project Todo", "project_detail": self.project_detail.name,
				"to_do": f"Sibling {i}", "assigned_to": "Administrator", "start_date": nowdate(),
				"deadline": add_days(nowdate(), 7), "estimated": 10, "status": "⚪️ Planned",
				"group": self.group, "level_id": self.level_id,
			}).insert(ignore_permissions=True)
			names.append(doc.name)
		return names

	def test_row_count_independent_of_sibling_count(self):
		few = self._make_todos(3)
		target_few = few[0]
		rows_few = _fetch_todos([self.project.name], include_cancelled=True, names=[target_few])
		self.assertEqual(len(rows_few), 1)

		many = self._make_todos(50)
		target_many = many[0]
		rows_many = _fetch_todos([self.project.name], include_cancelled=True, names=[target_many])
		self.assertEqual(len(rows_many), 1)
		self.assertEqual(rows_many[0]["name"], target_many)

	def test_get_project_item_still_returns_the_right_todo(self):
		"""The fix must not change what a caller gets back — same shape, same
		content, just not every sibling behind the scenes."""
		names = self._make_todos(5)
		target = names[2]
		result = get_project_item(target)
		self.assertEqual(result["name"], target)
		self.assertEqual(result["to_do"], "Sibling 2")
