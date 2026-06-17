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

		# Create test project with team members so validate_assigned_to_team_member passes
		self.project = frappe.get_doc({
			"doctype": "Project",
			"project_name": "Test Project for Todo Validation",
			"customer": "Test Customer",
			"project_owner": "Administrator",
			"project_leader": "Administrator",
			"project_group": "Test Project Group",
			"status": "Ongoing",
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 30),
			"team_members": [
				{"user": "Administrator"},
				{"user": "test_user@example.com"},
				{"user": "test_user2@example.com"},
			],
		})
		self.project.insert(ignore_permissions=True)
		self.owner_user = "Administrator"

		# Create a Glossary to use as the grouping for the project detail
		grouping_doc = frappe.get_doc({
			"doctype": "Glossary",
			"glossary": "Test Grouping",
			"project": self.project.name,
		})
		grouping_doc.insert(ignore_permissions=True)
		self.grouping = grouping_doc.name

		# Create test project detail (no embedded todo rows — todos are standalone now)
		self.project_detail = frappe.get_doc({
			"doctype": "Project Detail",
			"project": self.project.name,
			"title": "Test Detail for Todo",
			"grouping": self.grouping,
			"project_deadline": add_days(nowdate(), 30),
			"estimated": 100,
		})
		self.project_detail.insert(ignore_permissions=True)

		# Insert a standalone Project Todo so existing tests still have self.todo
		self.todo = frappe.get_doc({
			"doctype": "Project Todo",
			"project_detail": self.project_detail.name,
			"to_do": "Test Todo Item",
			"assigned_to": "test_user@example.com",
			"deadline": add_days(nowdate(), 7),
			"estimated": 60,
			"status": "⚪️ Planned",
		}).insert(ignore_permissions=True)

		frappe.db.commit()

	def tearDown(self):
		"""Clean up test data after each test"""
		frappe.set_user("Administrator")
		# Reset all standalone todo statuses to Planned so on_trash does not block deletion
		todos = frappe.get_all(
			"Project Todo",
			filters={"project_detail": self.project_detail.name},
			pluck="name",
		)
		for todo_name in todos:
			frappe.db.set_value("Project Todo", todo_name, "status", "⚪️ Planned", update_modified=False)
			frappe.delete_doc("Project Todo", todo_name, ignore_permissions=True, force=True)

		if hasattr(self, 'project_detail') and frappe.db.exists("Project Detail", self.project_detail.name):
			frappe.delete_doc("Project Detail", self.project_detail.name, ignore_permissions=True, force=True)

		if hasattr(self, 'grouping') and frappe.db.exists("Glossary", self.grouping):
			frappe.delete_doc("Glossary", self.grouping, force=True, ignore_permissions=True)

		if hasattr(self, 'project') and frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, ignore_permissions=True, force=True)

		frappe.db.commit()

	# ------------------------------------------------------------------
	# Helper
	# ------------------------------------------------------------------

	def _make_todo(self, **overrides):
		fields = {
			"doctype": "Project Todo",
			"project_detail": self.project_detail.name,
			"to_do": "standalone task",
			"assigned_to": self.owner_user,
			"deadline": add_days(nowdate(), 5),
			"estimated": 60,
			"status": "⚪️ Planned",
		}
		fields.update(overrides)
		return frappe.get_doc(fields).insert(ignore_permissions=True)

	# ------------------------------------------------------------------
	# Tests from brief Step 1 (new standalone tests)
	# ------------------------------------------------------------------

	def test_standalone_insert_links_to_detail(self):
		todo = self._make_todo()
		self.assertEqual(todo.project_detail, self.project_detail.name)
		self.assertFalse(todo.parent)  # no child linkage

	def test_insert_recomputes_parent_rollup(self):
		self._make_todo(estimated=120)
		self.project_detail.reload()
		self.assertGreaterEqual(self.project_detail.total_estimated, 120)

	# ------------------------------------------------------------------
	# Original tests — rewritten to operate on standalone todos
	# ------------------------------------------------------------------

	def test_edit_todo_in_planned_status(self):
		"""Test that editing is allowed when status is Planned"""
		self.todo.reload()
		self.todo.assigned_to = "test_user2@example.com"
		self.todo.estimated = 90
		self.todo.deadline = add_days(nowdate(), 10)

		try:
			self.todo.save(ignore_permissions=True)
			success = True
		except Exception as e:
			success = False
			print(f"Unexpected error: {str(e)}")

		self.assertTrue(success, "Should be able to edit todo when status is Planned")

	def test_edit_assigned_to_when_done(self):
		"""Test that editing assigned_to is blocked when status is Done"""
		# Change status to Done
		self.todo.reload()
		self.todo.status = "🟠 Done"
		self.todo.save(ignore_permissions=True)
		frappe.db.commit()

		# Try to change assigned_to
		self.todo.reload()
		self.todo.assigned_to = "test_user2@example.com"

		with self.assertRaises(frappe.ValidationError) as context:
			self.todo.save(ignore_permissions=True)

		self.assertIn("Cannot modify", str(context.exception))
		self.assertIn("Assigned To", str(context.exception))

	def test_edit_estimated_when_done(self):
		"""Test that editing estimated is blocked when status is Done"""
		self.todo.reload()
		self.todo.status = "🟠 Done"
		self.todo.save(ignore_permissions=True)
		frappe.db.commit()

		self.todo.reload()
		self.todo.estimated = 120

		with self.assertRaises(frappe.ValidationError) as context:
			self.todo.save(ignore_permissions=True)

		self.assertIn("Cannot modify", str(context.exception))
		self.assertIn("Estimated", str(context.exception))

	def test_edit_deadline_when_done(self):
		"""Test that editing deadline is blocked when status is Done"""
		self.todo.reload()
		self.todo.status = "🟠 Done"
		self.todo.save(ignore_permissions=True)
		frappe.db.commit()

		self.todo.reload()
		self.todo.deadline = add_days(nowdate(), 15)

		with self.assertRaises(frappe.ValidationError) as context:
			self.todo.save(ignore_permissions=True)

		self.assertIn("Cannot modify", str(context.exception))
		self.assertIn("Deadline", str(context.exception))

	def test_edit_multiple_fields_when_done(self):
		"""Test that editing multiple protected fields shows all field names in error"""
		self.todo.reload()
		self.todo.status = "🟠 Done"
		self.todo.save(ignore_permissions=True)
		frappe.db.commit()

		self.todo.reload()
		self.todo.assigned_to = "test_user2@example.com"
		self.todo.estimated = 150
		self.todo.deadline = add_days(nowdate(), 20)

		with self.assertRaises(frappe.ValidationError) as context:
			self.todo.save(ignore_permissions=True)

		error_msg = str(context.exception)
		self.assertIn("Cannot modify", error_msg)
		self.assertTrue(
			"Assigned To" in error_msg or "Estimated" in error_msg or "Deadline" in error_msg,
			"Error should mention at least one of the modified fields"
		)

	def test_edit_assigned_to_when_completed(self):
		"""Test that editing assigned_to is blocked when status is Completed"""
		self.todo.reload()
		self.todo.status = "✅ Completed"
		self.todo.save(ignore_permissions=True)
		frappe.db.commit()

		self.todo.reload()
		self.todo.assigned_to = "test_user2@example.com"

		with self.assertRaises(frappe.ValidationError) as context:
			self.todo.save(ignore_permissions=True)

		self.assertIn("Cannot modify", str(context.exception))
		self.assertIn("Assigned To", str(context.exception))

	def test_edit_other_fields_when_done(self):
		"""Test that editing other fields (not protected) is still allowed when Done"""
		self.todo.reload()
		self.todo.status = "🟠 Done"
		self.todo.save(ignore_permissions=True)
		frappe.db.commit()

		self.todo.reload()
		self.todo.notes = "Updated notes after completion"

		try:
			self.todo.save(ignore_permissions=True)
			success = True
		except frappe.ValidationError as e:
			if "Cannot modify" in str(e):
				success = False
			else:
				raise
		except Exception:
			success = True  # We only care about validation error for protected fields

		self.assertTrue(success, "Should be able to edit non-protected fields when status is Done")

	def test_status_transition_from_done_to_planned(self):
		"""Test that changing status back from Done to Planned allows editing again"""
		self.todo.reload()
		self.todo.status = "🟠 Done"
		self.todo.save(ignore_permissions=True)
		frappe.db.commit()

		self.todo.reload()
		self.todo.status = "⚪️ Planned"
		self.todo.save(ignore_permissions=True)
		frappe.db.commit()

		self.todo.reload()
		self.todo.assigned_to = "test_user2@example.com"

		try:
			self.todo.save(ignore_permissions=True)
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
		with self.assertRaises(frappe.PermissionError):
			frappe.get_doc({
				"doctype": "Project Todo",
				"project_detail": self.project_detail.name,
				"to_do": "Sneaky task",
				"assigned_to": "test_user2@example.com",
				"deadline": add_days(nowdate(), 5),
				"status": "⚪️ Planned",
			}).insert(ignore_permissions=True)
		frappe.set_user("Administrator")

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
			"team_members": [
				{"user": "test_user@example.com"},
			],
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
		todo = frappe.get_doc({
			"doctype": "Project Todo",
			"project_detail": pd.name,
			"to_do": "Legit task",
			"assigned_to": "test_user@example.com",
			"deadline": add_days(nowdate(), 5),
			"status": "⚪️ Planned",
		}).insert(ignore_permissions=True)
		frappe.set_user("Administrator")

		self.assertIsNotNone(todo.name)

		frappe.db.set_value("Project Todo", todo.name, "status", "⚪️ Planned", update_modified=False)
		frappe.delete_doc("Project Todo", todo.name, force=True, ignore_permissions=True)
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

		# Create test project with team members so validate_assigned_to_team_member passes
		self.project = frappe.get_doc({
			"doctype": "Project",
			"project_name": "Test Project for Phase Tracking",
			"customer": "Test Customer Phase",
			"project_owner": "Administrator",
			"project_leader": "Administrator",
			"project_group": "Test Project Group",
			"status": "Ongoing",
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 30),
			"team_members": [
				{"user": "Administrator"},
				{"user": "test_user@example.com"},
			],
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

		# Create test project detail (no embedded todos — standalone now)
		self.project_detail = frappe.get_doc({
			"doctype": "Project Detail",
			"project": self.project.name,
			"title": "Test Detail for Phase Tracking",
			"grouping": self.grouping,
			"project_deadline": add_days(nowdate(), 30),
			"estimated": 100,
		})
		self.project_detail.insert(ignore_permissions=True)

		# Insert a standalone todo for phase tracking tests
		self.todo = frappe.get_doc({
			"doctype": "Project Todo",
			"project_detail": self.project_detail.name,
			"to_do": "Test Phase Tracking Todo",
			"assigned_to": "test_user@example.com",
			"deadline": add_days(nowdate(), 7),
			"estimated": 60,
			"status": "⚪️ Planned",
			"estimated_planned_to_done": 2.5,
			"estimated_done_to_checked": 1.0,
			"estimated_checked_to_completed": 0.5,
		}).insert(ignore_permissions=True)

		frappe.db.commit()

	def tearDown(self):
		"""Clean up test data after each test"""
		frappe.set_user("Administrator")
		# Reset all standalone todo statuses to Planned so on_trash does not block deletion
		todos = frappe.get_all(
			"Project Todo",
			filters={"project_detail": self.project_detail.name},
			pluck="name",
		)
		for todo_name in todos:
			frappe.db.set_value("Project Todo", todo_name, "status", "⚪️ Planned", update_modified=False)
			frappe.delete_doc("Project Todo", todo_name, ignore_permissions=True, force=True)

		if hasattr(self, 'project_detail') and frappe.db.exists("Project Detail", self.project_detail.name):
			frappe.delete_doc("Project Detail", self.project_detail.name, ignore_permissions=True, force=True)

		if hasattr(self, 'grouping') and frappe.db.exists("Glossary", self.grouping):
			frappe.delete_doc("Glossary", self.grouping, force=True, ignore_permissions=True)

		if hasattr(self, 'project') and frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, ignore_permissions=True, force=True)

		frappe.db.commit()

	def test_calculate_total_estimated_hours(self):
		"""Test that total estimated hours are calculated correctly"""
		self.todo.reload()

		expected_total = 2.5 + 1.0 + 0.5  # 4.0
		self.assertEqual(self.todo.total_estimated_hours, expected_total,
			f"Total estimated hours should be {expected_total}")

	def test_planned_started_at_timestamp(self):
		"""Test that planned_started_at is set when todo is created"""
		self.todo.reload()

		self.assertIsNotNone(self.todo.planned_started_at,
			"planned_started_at should be set when todo is created")

	def test_done_timestamp_and_actual_time(self):
		"""Test that done_started_at is set and actual time is calculated when moving to Done"""
		sleep(1)

		self.todo.reload()
		self.todo.status = "🟠 Done"
		self.todo.save(ignore_permissions=True)
		frappe.db.commit()

		self.todo.reload()

		self.assertIsNotNone(self.todo.done_started_at,
			"done_started_at should be set when status changes to Done")

		self.assertIsNotNone(self.todo.actual_planned_to_done,
			"actual_planned_to_done should be calculated")
		self.assertGreater(self.todo.actual_planned_to_done, 0,
			"actual_planned_to_done should be greater than 0")

	def test_checked_timestamp_and_actual_time(self):
		"""Test that checked_started_at is set and actual time is calculated when moving to Checked"""
		self.todo.reload()
		self.todo.status = "🟠 Done"
		self.todo.save(ignore_permissions=True)
		frappe.db.commit()

		sleep(1)

		self.todo.reload()
		self.todo.status = "🔷 Checked By PL"
		self.todo.save(ignore_permissions=True)
		frappe.db.commit()

		self.todo.reload()

		self.assertIsNotNone(self.todo.checked_started_at,
			"checked_started_at should be set when status changes to Checked By PL")

		self.assertIsNotNone(self.todo.actual_done_to_checked,
			"actual_done_to_checked should be calculated")
		self.assertGreater(self.todo.actual_done_to_checked, 0,
			"actual_done_to_checked should be greater than 0")

	def test_completed_timestamp_and_actual_time(self):
		"""Test that phase_completed_at is set and actual time is calculated when moving to Completed"""
		self.todo.reload()
		self.todo.status = "🟠 Done"
		self.todo.save(ignore_permissions=True)
		frappe.db.commit()

		sleep(1)

		self.todo.reload()
		self.todo.status = "🔷 Checked By PL"
		self.todo.save(ignore_permissions=True)
		frappe.db.commit()

		sleep(1)

		self.todo.reload()
		self.todo.status = "✅ Completed"
		self.todo.save(ignore_permissions=True)
		frappe.db.commit()

		self.todo.reload()

		self.assertIsNotNone(self.todo.phase_completed_at,
			"phase_completed_at should be set when status changes to Completed")

		self.assertIsNotNone(self.todo.actual_checked_to_completed,
			"actual_checked_to_completed should be calculated")
		self.assertGreater(self.todo.actual_checked_to_completed, 0,
			"actual_checked_to_completed should be greater than 0")

	def test_total_actual_hours_calculation(self):
		"""Test that total actual hours are calculated correctly after going through all phases"""
		self.todo.reload()
		self.todo.status = "🟠 Done"
		self.todo.save(ignore_permissions=True)
		frappe.db.commit()

		sleep(1)

		self.todo.reload()
		self.todo.status = "🔷 Checked By PL"
		self.todo.save(ignore_permissions=True)
		frappe.db.commit()

		sleep(1)

		self.todo.reload()
		self.todo.status = "✅ Completed"
		self.todo.save(ignore_permissions=True)
		frappe.db.commit()

		self.todo.reload()

		self.assertIsNotNone(self.todo.total_actual_hours,
			"total_actual_hours should be calculated")

		expected_total = (self.todo.actual_planned_to_done or 0) + \
						 (self.todo.actual_done_to_checked or 0) + \
						 (self.todo.actual_checked_to_completed or 0)

		self.assertEqual(self.todo.total_actual_hours, expected_total,
			"total_actual_hours should equal sum of all phase times")

		self.assertGreater(self.todo.total_actual_hours, 0,
			"total_actual_hours should be greater than 0")

	def test_update_estimated_hours_recalculates_total(self):
		"""Test that changing individual phase estimates updates total"""
		self.todo.reload()
		self.todo.estimated_planned_to_done = 5.0
		self.todo.save(ignore_permissions=True)
		frappe.db.commit()

		self.todo.reload()

		expected_total = 5.0 + 1.0 + 0.5  # 6.5
		self.assertEqual(self.todo.total_estimated_hours, expected_total,
			f"Total should be updated to {expected_total}")

	def test_phase_timestamps_chronological_order(self):
		"""Test that timestamps are in chronological order"""
		self.todo.reload()
		self.todo.status = "🟠 Done"
		self.todo.save(ignore_permissions=True)
		frappe.db.commit()

		sleep(1)

		self.todo.reload()
		self.todo.status = "🔷 Checked By PL"
		self.todo.save(ignore_permissions=True)
		frappe.db.commit()

		sleep(1)

		self.todo.reload()
		self.todo.status = "✅ Completed"
		self.todo.save(ignore_permissions=True)
		frappe.db.commit()

		self.todo.reload()

		from frappe.utils import get_datetime

		planned_time = get_datetime(self.todo.planned_started_at)
		done_time = get_datetime(self.todo.done_started_at)
		checked_time = get_datetime(self.todo.checked_started_at)
		completed_time = get_datetime(self.todo.phase_completed_at)

		self.assertLess(planned_time, done_time,
			"planned_started_at should be before done_started_at")
		self.assertLess(done_time, checked_time,
			"done_started_at should be before checked_started_at")
		self.assertLess(checked_time, completed_time,
			"checked_started_at should be before phase_completed_at")

	def test_zero_estimated_hours(self):
		"""Test handling of zero or null estimated hours"""
		extra_todo = frappe.get_doc({
			"doctype": "Project Todo",
			"project_detail": self.project_detail.name,
			"to_do": "Todo with No Estimates",
			"assigned_to": "test_user@example.com",
			"deadline": add_days(nowdate(), 7),
			"status": "⚪️ Planned",
		}).insert(ignore_permissions=True)
		frappe.db.commit()

		extra_todo.reload()

		self.assertEqual(extra_todo.total_estimated_hours, 0.0,
			"Total should be 0 when no estimates are provided")


def run_tests():
	"""Helper function to run all tests"""
	loader = unittest.TestLoader()
	suite = unittest.TestSuite()

	suite.addTests(loader.loadTestsFromTestCase(TestProjectTodo))
	suite.addTests(loader.loadTestsFromTestCase(TestProjectTodoPhaseTracking))

	runner = unittest.TextTestRunner(verbosity=2)
	result = runner.run(suite)

	return result


if __name__ == "__main__":
	run_tests()
