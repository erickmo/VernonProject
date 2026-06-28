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
