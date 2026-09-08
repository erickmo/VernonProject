# Copyright (c) 2026, Vernon and Contributors
# Simple validation test for the is_follow_up immutability guard (fnqrprd6v7)

import frappe
import unittest
from unittest.mock import Mock
from vernon_project.vernon_project.doctype.project_todo.project_todo import ProjectTodo


class TestFollowUpImmutable(unittest.TestCase):
	"""Test validate_follow_up_immutable without database dependencies (mirrors
	test_validate_done_todo.py's style for the sibling AI-tag lock)."""

	def test_allows_new_documents(self):
		todo = frappe.new_doc("Project Todo")
		todo.is_new = Mock(return_value=True)
		todo.is_follow_up = 1
		try:
			todo.validate_follow_up_immutable()
			success = True
		except Exception:
			success = False
		self.assertTrue(success, "Should allow validation on new documents")

	def test_allows_unchanged_value(self):
		todo = frappe.new_doc("Project Todo")
		todo.is_new = Mock(return_value=False)
		todo.is_follow_up = 1
		todo.get_doc_before_save = Mock(return_value=frappe._dict(is_follow_up=1))
		try:
			todo.validate_follow_up_immutable()
			success = True
		except Exception:
			success = False
		self.assertTrue(success, "Should allow a save that doesn't touch is_follow_up")

	def test_blocks_setting_it_true(self):
		todo = frappe.new_doc("Project Todo")
		todo.is_new = Mock(return_value=False)
		todo.is_follow_up = 1
		todo.get_doc_before_save = Mock(return_value=frappe._dict(is_follow_up=0))
		with self.assertRaises(frappe.ValidationError):
			todo.validate_follow_up_immutable()

	def test_blocks_clearing_it(self):
		"""A follow-up todo can't be un-tagged either — immutable both directions."""
		todo = frappe.new_doc("Project Todo")
		todo.is_new = Mock(return_value=False)
		todo.is_follow_up = 0
		todo.get_doc_before_save = Mock(return_value=frappe._dict(is_follow_up=1))
		with self.assertRaises(frappe.ValidationError):
			todo.validate_follow_up_immutable()

	def test_no_old_doc_is_a_noop(self):
		"""get_old_doc() returning None (can't resolve a prior version) must not throw."""
		todo = frappe.new_doc("Project Todo")
		todo.is_new = Mock(return_value=False)
		todo.is_follow_up = 1
		todo.get_doc_before_save = Mock(return_value=None)
		todo.name = "does-not-exist-in-db"
		try:
			todo.validate_follow_up_immutable()
			success = True
		except Exception:
			success = False
		self.assertTrue(success, "Should not throw when no prior version can be resolved")


def run_tests():
	suite = unittest.TestLoader().loadTestsFromTestCase(TestFollowUpImmutable)
	runner = unittest.TextTestRunner(verbosity=2)
	return runner.run(suite)


if __name__ == "__main__":
	run_tests()
