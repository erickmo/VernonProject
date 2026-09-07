"""Regression guard for the jll4vd36n6 performance/security audit
(SECURITY_PERF_AUDIT.md in the repo root has the full findings)."""

import frappe
from frappe.tests.utils import FrappeTestCase

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
