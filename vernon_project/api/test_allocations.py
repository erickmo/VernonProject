# Copyright (c) 2026, Vernon and Contributors

import frappe
import unittest


class TestAssignedAllocationMeta(unittest.TestCase):
	def test_assigned_allocation_field_exists(self):
		meta = frappe.get_meta("Project Todo")
		field = meta.get_field("assigned_allocation")
		self.assertIsNotNone(field, "assigned_allocation field should exist on Project Todo")
		self.assertEqual(field.fieldtype, "Table")
		self.assertEqual(field.options, "Project Todo Assigned Allocation")

	def test_child_doctype_fields(self):
		meta = frappe.get_meta("Project Todo Assigned Allocation")
		self.assertIsNotNone(meta.get_field("allocation_date"))
		self.assertIsNotNone(meta.get_field("estimated_minutes"))
		self.assertIsNotNone(meta.get_field("note"))


from vernon_project.api.mobile import _alloc_sum_error, _assigned_allocation_for


class TestAllocationHelpers(unittest.TestCase):
	def test_sum_error_none_when_matches(self):
		rows = [{"minutes": 30}, {"minutes": 30}]
		self.assertIsNone(_alloc_sum_error(rows, 60))

	def test_sum_error_none_when_estimate_zero(self):
		self.assertIsNone(_alloc_sum_error([{"minutes": 5}], 0))

	def test_sum_error_short(self):
		msg = _alloc_sum_error([{"minutes": 30}], 60)
		self.assertIn("30m short of", msg)

	def test_sum_error_over(self):
		msg = _alloc_sum_error([{"minutes": 90}], 60)
		self.assertIn("30m over", msg)

	def test_virtual_default_used_when_empty(self):
		out = _assigned_allocation_for([], "2026-07-01", 60)
		self.assertEqual(out, [{"date": "2026-07-01", "minutes": 60, "note": ""}])

	def test_virtual_default_empty_when_no_estimate(self):
		self.assertEqual(_assigned_allocation_for([], "2026-07-01", 0), [])

	def test_explicit_rows_pass_through(self):
		allocs = [{"date": "2026-07-01", "minutes": 20, "note": "a"}]
		self.assertEqual(_assigned_allocation_for(allocs, "2026-07-02", 60), allocs)
