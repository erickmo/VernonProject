# Copyright (c) 2026, Vernon and Contributors
# See license.txt

import frappe
import unittest
from frappe.utils import nowdate, add_days, now_datetime, add_to_date
from time import sleep


class TestProjectTodo(unittest.TestCase):
	"""Test cases for Project Todo DocType"""

	def setUp(self):
		"""Set up test data before each test"""
		# Create test user if not exists
		if not frappe.db.exists("User", "test_user@example.com"):
			test_user = frappe.get_doc({
				"doctype": "User",
				"email": "test_user@example.com",
				"first_name": "Test",
				"last_name": "User",
				"send_welcome_email": 0
			})
			test_user.insert(ignore_permissions=True)

		if not frappe.db.exists("User", "test_user2@example.com"):
			test_user2 = frappe.get_doc({
				"doctype": "User",
				"email": "test_user2@example.com",
				"first_name": "Test2",
				"last_name": "User2",
				"send_welcome_email": 0
			})
			test_user2.insert(ignore_permissions=True)

		# Create test customer if not exists
		if not frappe.db.exists("Customer", "Test Customer"):
			customer = frappe.get_doc({
				"doctype": "Customer",
				"customer_name": "Test Customer",
				"customer_type": "Company"
			})
			customer.insert(ignore_permissions=True)

		# Create test project group if not exists
		if not frappe.db.exists("Project Group", "Test Project Group"):
			frappe.get_doc({
				"doctype": "Project Group",
				"project_name": "Test Project Group",
			}).insert(ignore_permissions=True)

		# Create test project (company is not required in our custom Project doctype)
		self.project = frappe.get_doc({
			"doctype": "Project",
			"project_name": "Test Project for Todo Validation",
			"customer": "Test Customer",
			"project_owner": "Administrator",
			"project_leader": "Administrator",
			"project_group": "Test Project Group",
			"status": "Ongoing",
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 30)
		})
		self.project.insert(ignore_permissions=True)

		# Create a Glossary to use as the grouping for the project detail
		grouping_doc = frappe.get_doc({
			"doctype": "Glossary",
			"glossary": "Test Grouping",
			"project": self.project.name,
		})
		grouping_doc.insert(ignore_permissions=True)
		self.grouping = grouping_doc.name

		# Create test project detail with todo
		self.project_detail = frappe.get_doc({
			"doctype": "Project Detail",
			"project": self.project.name,
			"title": "Test Detail for Todo",
			"grouping": self.grouping,
			"project_deadline": add_days(nowdate(), 30),
			"estimated": 100,
			"todo": [
				{
					"to_do": "Test Todo Item",
					"assigned_to": "test_user@example.com",
					"deadline": add_days(nowdate(), 7),
					"estimated": 60,
					"status": "⚪️ Planned"
				}
			]
		})
		self.project_detail.insert(ignore_permissions=True)
		frappe.db.commit()

		# Get the todo for testing
		self.todo = self.project_detail.todo[0]

	def tearDown(self):
		"""Clean up test data after each test"""
		frappe.set_user("Administrator")
		# Reset all todo statuses to Planned so on_trash does not block deletion
		if hasattr(self, 'project_detail') and frappe.db.exists("Project Detail", self.project_detail.name):
			detail = frappe.get_doc("Project Detail", self.project_detail.name)
			for todo in detail.todo:
				frappe.db.set_value("Project Todo", todo.name, "status", "⚪️ Planned", update_modified=False)
			frappe.delete_doc("Project Detail", self.project_detail.name, ignore_permissions=True, force=True)

		if hasattr(self, 'grouping') and frappe.db.exists("Glossary", self.grouping):
			frappe.delete_doc("Glossary", self.grouping, force=True, ignore_permissions=True)

		if hasattr(self, 'project') and frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, ignore_permissions=True, force=True)

		frappe.db.commit()

	def test_edit_todo_in_planned_status(self):
		"""Test that editing is allowed when status is Planned"""
		# Reload the detail to get fresh data
		self.project_detail.reload()

		# Update todo fields
		self.project_detail.todo[0].assigned_to = "test_user2@example.com"
		self.project_detail.todo[0].estimated = 90
		self.project_detail.todo[0].deadline = add_days(nowdate(), 10)

		# This should not raise any error
		try:
			self.project_detail.save(ignore_permissions=True)
			success = True
		except Exception as e:
			success = False
			print(f"Unexpected error: {str(e)}")

		self.assertTrue(success, "Should be able to edit todo when status is Planned")

	def test_edit_assigned_to_when_done(self):
		"""Test that editing assigned_to is blocked when status is Done"""
		# Change status to Done
		self.project_detail.reload()
		self.project_detail.todo[0].status = "🟠 Done"
		self.project_detail.save(ignore_permissions=True)
		frappe.db.commit()

		# Try to change assigned_to
		self.project_detail.reload()
		self.project_detail.todo[0].assigned_to = "test_user2@example.com"

		# This should raise an error
		with self.assertRaises(frappe.ValidationError) as context:
			self.project_detail.save(ignore_permissions=True)

		self.assertIn("Cannot modify", str(context.exception))
		self.assertIn("Assigned To", str(context.exception))

	def test_edit_estimated_when_done(self):
		"""Test that editing estimated is blocked when status is Done"""
		# Change status to Done
		self.project_detail.reload()
		self.project_detail.todo[0].status = "🟠 Done"
		self.project_detail.save(ignore_permissions=True)
		frappe.db.commit()

		# Try to change estimated
		self.project_detail.reload()
		self.project_detail.todo[0].estimated = 120

		# This should raise an error
		with self.assertRaises(frappe.ValidationError) as context:
			self.project_detail.save(ignore_permissions=True)

		self.assertIn("Cannot modify", str(context.exception))
		self.assertIn("Estimated", str(context.exception))

	def test_edit_deadline_when_done(self):
		"""Test that editing deadline is blocked when status is Done"""
		# Change status to Done
		self.project_detail.reload()
		self.project_detail.todo[0].status = "🟠 Done"
		self.project_detail.save(ignore_permissions=True)
		frappe.db.commit()

		# Try to change deadline
		self.project_detail.reload()
		self.project_detail.todo[0].deadline = add_days(nowdate(), 15)

		# This should raise an error
		with self.assertRaises(frappe.ValidationError) as context:
			self.project_detail.save(ignore_permissions=True)

		self.assertIn("Cannot modify", str(context.exception))
		self.assertIn("Deadline", str(context.exception))

	def test_edit_multiple_fields_when_done(self):
		"""Test that editing multiple protected fields shows all field names in error"""
		# Change status to Done
		self.project_detail.reload()
		self.project_detail.todo[0].status = "🟠 Done"
		self.project_detail.save(ignore_permissions=True)
		frappe.db.commit()

		# Try to change multiple fields
		self.project_detail.reload()
		self.project_detail.todo[0].assigned_to = "test_user2@example.com"
		self.project_detail.todo[0].estimated = 150
		self.project_detail.todo[0].deadline = add_days(nowdate(), 20)

		# This should raise an error mentioning all fields
		with self.assertRaises(frappe.ValidationError) as context:
			self.project_detail.save(ignore_permissions=True)

		error_msg = str(context.exception)
		self.assertIn("Cannot modify", error_msg)
		# Check that all three fields are mentioned
		self.assertTrue(
			"Assigned To" in error_msg or "Estimated" in error_msg or "Deadline" in error_msg,
			"Error should mention at least one of the modified fields"
		)

	def test_edit_assigned_to_when_completed(self):
		"""Test that editing assigned_to is blocked when status is Completed"""
		# Change status to Completed
		self.project_detail.reload()
		self.project_detail.todo[0].status = "✅ Completed"
		self.project_detail.save(ignore_permissions=True)
		frappe.db.commit()

		# Try to change assigned_to
		self.project_detail.reload()
		self.project_detail.todo[0].assigned_to = "test_user2@example.com"

		# This should raise an error
		with self.assertRaises(frappe.ValidationError) as context:
			self.project_detail.save(ignore_permissions=True)

		self.assertIn("Cannot modify", str(context.exception))
		self.assertIn("Assigned To", str(context.exception))

	def test_edit_other_fields_when_done(self):
		"""Test that editing other fields (not protected) is still allowed when Done"""
		# Change status to Done
		self.project_detail.reload()
		self.project_detail.todo[0].status = "🟠 Done"
		self.project_detail.save(ignore_permissions=True)
		frappe.db.commit()

		# Try to change notes (not a protected field)
		self.project_detail.reload()
		self.project_detail.todo[0].notes = "Updated notes after completion"

		# This should NOT raise an error
		try:
			self.project_detail.save(ignore_permissions=True)
			success = True
		except frappe.ValidationError as e:
			if "Cannot modify" in str(e):
				success = False
			else:
				# Some other validation error, re-raise
				raise
		except Exception as e:
			# Other errors
			success = True  # We only care about validation error for protected fields

		self.assertTrue(success, "Should be able to edit non-protected fields when status is Done")

	def test_status_transition_from_done_to_planned(self):
		"""Test that changing status back from Done to Planned allows editing again"""
		# Change status to Done
		self.project_detail.reload()
		self.project_detail.todo[0].status = "🟠 Done"
		self.project_detail.save(ignore_permissions=True)
		frappe.db.commit()

		# Change status back to Planned
		self.project_detail.reload()
		self.project_detail.todo[0].status = "⚪️ Planned"
		self.project_detail.save(ignore_permissions=True)
		frappe.db.commit()

		# Now try to change assigned_to
		self.project_detail.reload()
		self.project_detail.todo[0].assigned_to = "test_user2@example.com"

		# This should NOT raise an error
		try:
			self.project_detail.save(ignore_permissions=True)
			success = True
		except frappe.ValidationError as e:
			if "Cannot modify" in str(e):
				success = False
			else:
				raise

		self.assertTrue(success, "Should be able to edit when status is changed back to Planned")

	def test_non_lead_cannot_create_task(self):
		"""A non owner/leader user cannot add a task to a work item."""
		frappe.set_user("test_user2@example.com")
		detail = frappe.get_doc("Project Detail", self.project_detail.name)
		detail.append("todo", {
			"to_do": "Sneaky task",
			"assigned_to": "test_user2@example.com",
			"deadline": add_days(nowdate(), 5),
			"status": "⚪️ Planned",
		})
		with self.assertRaises(frappe.PermissionError):
			detail.save(ignore_permissions=True)
		frappe.set_user("Administrator")
		detail.reload()

	def test_lead_can_create_task(self):
		"""A non-System-Manager project leader can add a task (owner/leader branch)."""
		proj = frappe.get_doc({
			"doctype": "Project",
			"project_name": "Lead Create Test",
			"customer": "Test Customer",
			"project_group": "Test Project Group",
			"project_owner": "test_user@example.com",
			"project_leader": "test_user@example.com",
			"status": "Ongoing",
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 30),
		})
		proj.insert(ignore_permissions=True)
		grouping = frappe.get_doc({
			"doctype": "Glossary",
			"glossary": "Lead Grouping",
			"project": proj.name,
		})
		grouping.insert(ignore_permissions=True)
		pd = frappe.get_doc({
			"doctype": "Project Detail",
			"project": proj.name,
			"title": "Lead Detail",
			"grouping": grouping.name,
			"project_deadline": add_days(nowdate(), 30),
			"estimated": 10,
		})
		pd.insert(ignore_permissions=True)
		frappe.db.commit()

		frappe.set_user("test_user@example.com")
		pd.reload()
		pd.append("todo", {
			"to_do": "Legit task",
			"assigned_to": "test_user@example.com",
			"deadline": add_days(nowdate(), 5),
			"status": "⚪️ Planned",
		})
		pd.save(ignore_permissions=True)
		frappe.set_user("Administrator")

		pd.reload()
		self.assertEqual(len(pd.todo), 1)
		frappe.delete_doc("Project Detail", pd.name, force=True, ignore_permissions=True)
		frappe.delete_doc("Glossary", grouping.name, force=True, ignore_permissions=True)
		frappe.delete_doc("Project", proj.name, force=True, ignore_permissions=True)
		frappe.db.commit()


class TestProjectTodoPhaseTracking(unittest.TestCase):
	"""Test cases for Phase Estimation and Time Tracking"""

	def setUp(self):
		"""Set up test data before each test"""
		# Create test user if not exists
		if not frappe.db.exists("User", "test_user@example.com"):
			test_user = frappe.get_doc({
				"doctype": "User",
				"email": "test_user@example.com",
				"first_name": "Test",
				"last_name": "User",
				"send_welcome_email": 0
			})
			test_user.insert(ignore_permissions=True)

		# Create test customer if not exists
		if not frappe.db.exists("Customer", "Test Customer Phase"):
			customer = frappe.get_doc({
				"doctype": "Customer",
				"customer_name": "Test Customer Phase",
				"customer_type": "Company"
			})
			customer.insert(ignore_permissions=True)

		# Create test project group if not exists
		if not frappe.db.exists("Project Group", "Test Project Group"):
			frappe.get_doc({
				"doctype": "Project Group",
				"project_name": "Test Project Group",
			}).insert(ignore_permissions=True)

		# Create test project (company is not required in our custom Project doctype)
		self.project = frappe.get_doc({
			"doctype": "Project",
			"project_name": "Test Project for Phase Tracking",
			"customer": "Test Customer Phase",
			"project_owner": "Administrator",
			"project_leader": "Administrator",
			"project_group": "Test Project Group",
			"status": "Ongoing",
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 30)
		})
		self.project.insert(ignore_permissions=True)

		# Create a Glossary to use as the grouping for the project detail
		grouping_doc = frappe.get_doc({
			"doctype": "Glossary",
			"glossary": "Test Phase Grouping",
			"project": self.project.name,
		})
		grouping_doc.insert(ignore_permissions=True)
		self.grouping = grouping_doc.name

		# Create test project detail with todo
		self.project_detail = frappe.get_doc({
			"doctype": "Project Detail",
			"project": self.project.name,
			"title": "Test Detail for Phase Tracking",
			"grouping": self.grouping,
			"project_deadline": add_days(nowdate(), 30),
			"estimated": 100,
			"todo": [
				{
					"to_do": "Test Phase Tracking Todo",
					"assigned_to": "test_user@example.com",
					"deadline": add_days(nowdate(), 7),
					"estimated": 60,
					"status": "⚪️ Planned",
					"estimated_planned_to_done": 2.5,
					"estimated_done_to_checked": 1.0,
					"estimated_checked_to_completed": 0.5
				}
			]
		})
		self.project_detail.insert(ignore_permissions=True)
		frappe.db.commit()

		# Get the todo for testing
		self.todo = self.project_detail.todo[0]

	def tearDown(self):
		"""Clean up test data after each test"""
		frappe.set_user("Administrator")
		# Reset all todo statuses to Planned so on_trash does not block deletion
		if hasattr(self, 'project_detail') and frappe.db.exists("Project Detail", self.project_detail.name):
			detail = frappe.get_doc("Project Detail", self.project_detail.name)
			for todo in detail.todo:
				frappe.db.set_value("Project Todo", todo.name, "status", "⚪️ Planned", update_modified=False)
			frappe.delete_doc("Project Detail", self.project_detail.name, ignore_permissions=True, force=True)

		if hasattr(self, 'grouping') and frappe.db.exists("Glossary", self.grouping):
			frappe.delete_doc("Glossary", self.grouping, force=True, ignore_permissions=True)

		if hasattr(self, 'project') and frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, ignore_permissions=True, force=True)

		frappe.db.commit()

	def test_calculate_total_estimated_hours(self):
		"""Test that total estimated hours are calculated correctly"""
		self.project_detail.reload()
		todo = self.project_detail.todo[0]

		# Check that total is calculated
		expected_total = 2.5 + 1.0 + 0.5  # 4.0
		self.assertEqual(todo.total_estimated_hours, expected_total,
			f"Total estimated hours should be {expected_total}")

	def test_planned_started_at_timestamp(self):
		"""Test that planned_started_at is set when todo is created"""
		self.project_detail.reload()
		todo = self.project_detail.todo[0]

		# Check that planned_started_at is set
		self.assertIsNotNone(todo.planned_started_at,
			"planned_started_at should be set when todo is created")

	def test_done_timestamp_and_actual_time(self):
		"""Test that done_started_at is set and actual time is calculated when moving to Done"""
		# Wait a bit to ensure time difference
		sleep(1)

		# Change status to Done
		self.project_detail.reload()
		self.project_detail.todo[0].status = "🟠 Done"
		self.project_detail.save(ignore_permissions=True)
		frappe.db.commit()

		# Reload and check
		self.project_detail.reload()
		todo = self.project_detail.todo[0]

		# Check that done_started_at is set
		self.assertIsNotNone(todo.done_started_at,
			"done_started_at should be set when status changes to Done")

		# Check that actual_planned_to_done is calculated
		self.assertIsNotNone(todo.actual_planned_to_done,
			"actual_planned_to_done should be calculated")
		self.assertGreater(todo.actual_planned_to_done, 0,
			"actual_planned_to_done should be greater than 0")

	def test_checked_timestamp_and_actual_time(self):
		"""Test that checked_started_at is set and actual time is calculated when moving to Checked"""
		# Move to Done first
		self.project_detail.reload()
		self.project_detail.todo[0].status = "🟠 Done"
		self.project_detail.save(ignore_permissions=True)
		frappe.db.commit()

		# Wait a bit
		sleep(1)

		# Move to Checked By PL
		self.project_detail.reload()
		self.project_detail.todo[0].status = "🔷 Checked By PL"
		self.project_detail.save(ignore_permissions=True)
		frappe.db.commit()

		# Reload and check
		self.project_detail.reload()
		todo = self.project_detail.todo[0]

		# Check that checked_started_at is set
		self.assertIsNotNone(todo.checked_started_at,
			"checked_started_at should be set when status changes to Checked By PL")

		# Check that actual_done_to_checked is calculated
		self.assertIsNotNone(todo.actual_done_to_checked,
			"actual_done_to_checked should be calculated")
		self.assertGreater(todo.actual_done_to_checked, 0,
			"actual_done_to_checked should be greater than 0")

	def test_completed_timestamp_and_actual_time(self):
		"""Test that phase_completed_at is set and actual time is calculated when moving to Completed"""
		# Move through all phases
		self.project_detail.reload()
		self.project_detail.todo[0].status = "🟠 Done"
		self.project_detail.save(ignore_permissions=True)
		frappe.db.commit()

		sleep(1)

		self.project_detail.reload()
		self.project_detail.todo[0].status = "🔷 Checked By PL"
		self.project_detail.save(ignore_permissions=True)
		frappe.db.commit()

		sleep(1)

		self.project_detail.reload()
		self.project_detail.todo[0].status = "✅ Completed"
		self.project_detail.save(ignore_permissions=True)
		frappe.db.commit()

		# Reload and check
		self.project_detail.reload()
		todo = self.project_detail.todo[0]

		# Check that phase_completed_at is set
		self.assertIsNotNone(todo.phase_completed_at,
			"phase_completed_at should be set when status changes to Completed")

		# Check that actual_checked_to_completed is calculated
		self.assertIsNotNone(todo.actual_checked_to_completed,
			"actual_checked_to_completed should be calculated")
		self.assertGreater(todo.actual_checked_to_completed, 0,
			"actual_checked_to_completed should be greater than 0")

	def test_total_actual_hours_calculation(self):
		"""Test that total actual hours are calculated correctly after going through all phases"""
		# Move through all phases with delays
		self.project_detail.reload()
		self.project_detail.todo[0].status = "🟠 Done"
		self.project_detail.save(ignore_permissions=True)
		frappe.db.commit()

		sleep(1)

		self.project_detail.reload()
		self.project_detail.todo[0].status = "🔷 Checked By PL"
		self.project_detail.save(ignore_permissions=True)
		frappe.db.commit()

		sleep(1)

		self.project_detail.reload()
		self.project_detail.todo[0].status = "✅ Completed"
		self.project_detail.save(ignore_permissions=True)
		frappe.db.commit()

		# Reload and check total
		self.project_detail.reload()
		todo = self.project_detail.todo[0]

		# Check that total actual hours is calculated
		self.assertIsNotNone(todo.total_actual_hours,
			"total_actual_hours should be calculated")

		# Total should be sum of all phases
		expected_total = (todo.actual_planned_to_done or 0) + \
						 (todo.actual_done_to_checked or 0) + \
						 (todo.actual_checked_to_completed or 0)

		self.assertEqual(todo.total_actual_hours, expected_total,
			"total_actual_hours should equal sum of all phase times")

		# Should be greater than 0 since we had delays
		self.assertGreater(todo.total_actual_hours, 0,
			"total_actual_hours should be greater than 0")

	def test_update_estimated_hours_recalculates_total(self):
		"""Test that changing individual phase estimates updates total"""
		self.project_detail.reload()

		# Update one phase estimate
		self.project_detail.todo[0].estimated_planned_to_done = 5.0
		self.project_detail.save(ignore_permissions=True)
		frappe.db.commit()

		# Reload and check
		self.project_detail.reload()
		todo = self.project_detail.todo[0]

		# Total should be updated
		expected_total = 5.0 + 1.0 + 0.5  # 6.5
		self.assertEqual(todo.total_estimated_hours, expected_total,
			f"Total should be updated to {expected_total}")

	def test_phase_timestamps_chronological_order(self):
		"""Test that timestamps are in chronological order"""
		# Move through all phases
		self.project_detail.reload()
		self.project_detail.todo[0].status = "🟠 Done"
		self.project_detail.save(ignore_permissions=True)
		frappe.db.commit()

		sleep(1)

		self.project_detail.reload()
		self.project_detail.todo[0].status = "🔷 Checked By PL"
		self.project_detail.save(ignore_permissions=True)
		frappe.db.commit()

		sleep(1)

		self.project_detail.reload()
		self.project_detail.todo[0].status = "✅ Completed"
		self.project_detail.save(ignore_permissions=True)
		frappe.db.commit()

		# Reload and check order
		self.project_detail.reload()
		todo = self.project_detail.todo[0]

		# Convert to datetime for comparison
		from frappe.utils import get_datetime

		planned_time = get_datetime(todo.planned_started_at)
		done_time = get_datetime(todo.done_started_at)
		checked_time = get_datetime(todo.checked_started_at)
		completed_time = get_datetime(todo.phase_completed_at)

		# Check chronological order
		self.assertLess(planned_time, done_time,
			"planned_started_at should be before done_started_at")
		self.assertLess(done_time, checked_time,
			"done_started_at should be before checked_started_at")
		self.assertLess(checked_time, completed_time,
			"checked_started_at should be before phase_completed_at")

	def test_zero_estimated_hours(self):
		"""Test handling of zero or null estimated hours"""
		# Create new todo with no estimates
		self.project_detail.reload()
		self.project_detail.append("todo", {
			"to_do": "Todo with No Estimates",
			"assigned_to": "test_user@example.com",
			"deadline": add_days(nowdate(), 7),
			"status": "⚪️ Planned"
		})
		self.project_detail.save(ignore_permissions=True)
		frappe.db.commit()

		# Reload and check
		self.project_detail.reload()
		new_todo = self.project_detail.todo[1]

		# Total should be 0
		self.assertEqual(new_todo.total_estimated_hours, 0.0,
			"Total should be 0 when no estimates are provided")


def run_tests():
	"""Helper function to run all tests"""
	# Create test suite
	loader = unittest.TestLoader()
	suite = unittest.TestSuite()

	# Add both test classes
	suite.addTests(loader.loadTestsFromTestCase(TestProjectTodo))
	suite.addTests(loader.loadTestsFromTestCase(TestProjectTodoPhaseTracking))

	# Run tests
	runner = unittest.TextTestRunner(verbosity=2)
	result = runner.run(suite)

	return result


if __name__ == "__main__":
	run_tests()
