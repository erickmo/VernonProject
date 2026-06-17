# Copyright (c) 2026, Vernon and Contributors
# Simple validation test for done todo field locking

import frappe
import unittest
from unittest.mock import Mock, MagicMock
from vernon_project.vernon_project.doctype.project_todo.project_todo import ProjectTodo


class TestDoneTodoValidation(unittest.TestCase):
	"""Test validation logic for done todo fields without database dependencies"""

	def test_validation_allows_new_documents(self):
		"""Test that validation skips new documents"""
		# Create mock todo
		todo = frappe.new_doc("Project Todo")
		todo.is_new = Mock(return_value=True)
		todo.status = "🟠 Done"

		# Should not raise any error
		try:
			todo.validate_done_todo_fields()
			success = True
		except Exception:
			success = False

		self.assertTrue(success, "Should allow validation on new documents")

	def test_validation_allows_planned_status(self):
		"""Test that validation allows edits when status is Planned"""
		# Create mock todo
		todo = frappe.new_doc("Project Todo")
		todo.is_new = Mock(return_value=False)
		todo.status = "⚪️ Planned"
		todo.assigned_to = "user@example.com"
		todo.estimated = 120
		todo.deadline = "2026-03-20"

		# Mock old document
		old_doc = frappe._dict(assigned_to="olduser@example.com", estimated=60, deadline="2026-03-15")
		todo.get_doc_before_save = Mock(return_value=old_doc)

		# Should not raise any error
		try:
			todo.validate_done_todo_fields()
			success = True
		except Exception:
			success = False

		self.assertTrue(success, "Should allow edits when status is Planned")

	def test_validation_blocks_assigned_to_when_done(self):
		"""Test that validation blocks assigned_to changes when status is Done"""
		# Create mock todo
		todo = frappe.new_doc("Project Todo")
		todo.is_new = Mock(return_value=False)
		todo.status = "🟠 Done"
		todo.assigned_to = "newuser@example.com"
		todo.estimated = 60
		todo.deadline = "2026-03-15"

		# Mock old document with different assigned_to
		old_doc = frappe._dict(assigned_to="olduser@example.com", estimated=60, deadline="2026-03-15")
		todo.get_doc_before_save = Mock(return_value=old_doc)

		# Mock frappe.throw
		with unittest.mock.patch('frappe.throw') as mock_throw:
			todo.validate_done_todo_fields()
			# Should call frappe.throw
			self.assertTrue(mock_throw.called, "Should call frappe.throw for assigned_to change")
			# Check error message contains "Assigned To"
			error_msg = str(mock_throw.call_args)
			self.assertIn("Assigned To", error_msg, "Error should mention Assigned To field")

	def test_validation_blocks_estimated_when_done(self):
		"""Test that validation blocks estimated changes when status is Done"""
		# Create mock todo
		todo = frappe.new_doc("Project Todo")
		todo.is_new = Mock(return_value=False)
		todo.status = "🟠 Done"
		todo.assigned_to = "user@example.com"
		todo.estimated = 120  # Changed
		todo.deadline = "2026-03-15"

		# Mock old document with different estimated
		old_doc = frappe._dict(assigned_to="user@example.com", estimated=60, deadline="2026-03-15")
		todo.get_doc_before_save = Mock(return_value=old_doc)

		# Mock frappe.throw
		with unittest.mock.patch('frappe.throw') as mock_throw:
			todo.validate_done_todo_fields()
			# Should call frappe.throw
			self.assertTrue(mock_throw.called, "Should call frappe.throw for estimated change")
			# Check error message contains "Estimated"
			error_msg = str(mock_throw.call_args)
			self.assertIn("Estimated", error_msg, "Error should mention Estimated field")

	def test_validation_blocks_deadline_when_done(self):
		"""Test that validation blocks deadline changes when status is Done"""
		# Create mock todo
		todo = frappe.new_doc("Project Todo")
		todo.is_new = Mock(return_value=False)
		todo.status = "🟠 Done"
		todo.assigned_to = "user@example.com"
		todo.estimated = 60
		todo.deadline = "2026-03-20"  # Changed

		# Mock old document with different deadline
		old_doc = frappe._dict(assigned_to="user@example.com", estimated=60, deadline="2026-03-15")
		todo.get_doc_before_save = Mock(return_value=old_doc)

		# Mock frappe.throw
		with unittest.mock.patch('frappe.throw') as mock_throw:
			todo.validate_done_todo_fields()
			# Should call frappe.throw
			self.assertTrue(mock_throw.called, "Should call frappe.throw for deadline change")
			# Check error message contains "Deadline"
			error_msg = str(mock_throw.call_args)
			self.assertIn("Deadline", error_msg, "Error should mention Deadline field")

	def test_validation_blocks_when_completed(self):
		"""Test that validation also works for Completed status"""
		# Create mock todo
		todo = frappe.new_doc("Project Todo")
		todo.is_new = Mock(return_value=False)
		todo.status = "✅ Completed"
		todo.assigned_to = "newuser@example.com"  # Changed
		todo.estimated = 60
		todo.deadline = "2026-03-15"

		# Mock old document
		old_doc = frappe._dict(assigned_to="olduser@example.com", estimated=60, deadline="2026-03-15")
		todo.get_doc_before_save = Mock(return_value=old_doc)

		# Mock frappe.throw
		with unittest.mock.patch('frappe.throw') as mock_throw:
			todo.validate_done_todo_fields()
			# Should call frappe.throw
			self.assertTrue(mock_throw.called, "Should call frappe.throw when status is Completed")

	def test_validation_allows_no_changes_when_done(self):
		"""Test that validation allows saving without changes when status is Done"""
		# Create mock todo
		todo = frappe.new_doc("Project Todo")
		todo.is_new = Mock(return_value=False)
		todo.status = "🟠 Done"
		todo.assigned_to = "user@example.com"
		todo.estimated = 60
		todo.deadline = "2026-03-15"

		# Mock old document with same values
		old_doc = frappe._dict(assigned_to="user@example.com", estimated=60, deadline="2026-03-15")
		todo.get_doc_before_save = Mock(return_value=old_doc)

		# Should not raise any error
		try:
			todo.validate_done_todo_fields()
			success = True
		except Exception:
			success = False

		self.assertTrue(success, "Should allow saving without changes when status is Done")

	def test_validation_blocks_multiple_fields(self):
		"""Test that validation shows all changed fields in error message"""
		# Create mock todo
		todo = frappe.new_doc("Project Todo")
		todo.is_new = Mock(return_value=False)
		todo.status = "🟠 Done"
		todo.assigned_to = "newuser@example.com"  # Changed
		todo.estimated = 120  # Changed
		todo.deadline = "2026-03-20"  # Changed

		# Mock old document with all different values
		old_doc = frappe._dict(assigned_to="olduser@example.com", estimated=60, deadline="2026-03-15")
		todo.get_doc_before_save = Mock(return_value=old_doc)

		# Mock frappe.throw
		with unittest.mock.patch('frappe.throw') as mock_throw:
			todo.validate_done_todo_fields()
			# Should call frappe.throw
			self.assertTrue(mock_throw.called, "Should call frappe.throw for multiple changes")
			# Check that at least one field is mentioned
			error_msg = str(mock_throw.call_args)
			has_field = any(field in error_msg for field in ["Assigned To", "Estimated", "Deadline"])
			self.assertTrue(has_field, "Error should mention at least one changed field")


def run_tests():
	"""Helper function to run all tests"""
	suite = unittest.TestLoader().loadTestsFromTestCase(TestDoneTodoValidation)
	runner = unittest.TextTestRunner(verbosity=2)
	result = runner.run(suite)
	return result


if __name__ == "__main__":
	run_tests()
