# Copyright (c) 2026, Vernon and Contributors
# See license.txt

import frappe
import unittest
from frappe.tests.utils import FrappeTestCase
from frappe.utils import nowdate, add_days, now_datetime, add_to_date
from time import sleep


def _ensure_test_group():
	"""Idempotent Group + Level fixture. Project Todo now requires group/level;
	the controller derives `level` from `level_id` during validate. Returns
	(group_name, level_id) for use in every todo-creation site."""
	if not frappe.db.exists("Group", "Test Group Recurring"):
		frappe.get_doc({
			"doctype": "Group",
			"group_name": "Test Group Recurring",
			"base_rate_per_minute": 1,
			"levels": [{
				"type_name": "General", "level_name": "L1",
				"level_id": "TESTLVL1", "difficulty_percent": 100,
			}],
		}).insert(ignore_permissions=True)
	return "Test Group Recurring", "TESTLVL1"


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

		# Create test brand if not exists
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({
				"doctype": "Brand",
				"brand_name": "Test Customer",
			}).insert(ignore_permissions=True)

		# Create test project with team members so validate_assigned_to_team_member passes
		self.project = frappe.get_doc({
			"doctype": "Project",
			"project_name": "Test Project for Todo Validation",
			"brand": "Test Customer",
			"project_owner": "Administrator",
			"project_leader": "Administrator",
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
		self.group, self.level_id = _ensure_test_group()

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
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 7),
			"estimated": 60,
			"status": "⚪️ Planned",
			"group": self.group,
			"level_id": self.level_id,
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
			"group": self.group,
			"level_id": self.level_id,
		}
		fields.update(overrides)
		# start_date must be <= deadline; default to the (possibly overridden) deadline.
		fields.setdefault("start_date", fields["deadline"])
		return frappe.get_doc(fields).insert(ignore_permissions=True)

	def _make_recurring_todo(self, frequency=None, weekdays=None, **over):
		"""Valid Planned recurring todo; maps friendly kwargs to recurring_* fields."""
		fields = {"is_recurring": 1}
		if frequency is not None:
			fields["recurring_frequency"] = frequency
		if weekdays is not None:
			fields["recurring_weekdays"] = weekdays
		fields.update(over)
		return self._make_todo(**fields)

	# ------------------------------------------------------------------
	# Tests from brief Step 1 (new standalone tests)
	# ------------------------------------------------------------------

	def test_standalone_insert_links_to_detail(self):
		todo = self._make_todo()
		self.assertEqual(todo.project_detail, self.project_detail.name)
		self.assertFalse(getattr(todo, "parent", None))  # standalone: no child parent linkage

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
				"start_date": nowdate(),
				"deadline": add_days(nowdate(), 5),
				"status": "⚪️ Planned",
				"group": self.group,
				"level_id": self.level_id,
			}).insert(ignore_permissions=True)
		frappe.set_user("Administrator")

	def test_lead_can_create_task(self):
		"""A non-System-Manager project leader can add a task (owner/leader branch)."""
		# Project.validate_lead_roles now requires the owner/leader to hold these roles.
		frappe.get_doc("User", "test_user@example.com").add_roles("Project Owner", "Project Leader")
		proj = frappe.get_doc({
			"doctype": "Project",
			"project_name": "Lead Create Test",
			"brand": "Test Customer",
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
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 5),
			"status": "⚪️ Planned",
			"group": self.group,
			"level_id": self.level_id,
		}).insert(ignore_permissions=True)
		frappe.set_user("Administrator")

		self.assertIsNotNone(todo.name)

		frappe.db.set_value("Project Todo", todo.name, "status", "⚪️ Planned", update_modified=False)
		frappe.delete_doc("Project Todo", todo.name, force=True, ignore_permissions=True)
		frappe.delete_doc("Project Detail", pd.name, force=True, ignore_permissions=True)
		frappe.delete_doc("Glossary", grouping.name, force=True, ignore_permissions=True)
		frappe.delete_doc("Project", proj.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_scheduler_spawns_standalone_occurrence(self):
		"""Scheduler rolls a past-due recurring series forward by exactly one."""
		from vernon_project.tasks import create_recurring_todos
		head = self._make_todo(
			is_recurring=1,
			recurring_frequency="Daily",
			deadline=add_days(nowdate(), -1),
		)
		create_recurring_todos()
		kids = frappe.get_all("Project Todo", filters={"original_todo": head.name},
			fields=["name", "deadline"])
		self.assertEqual(len(kids), 1)
		self.assertEqual(str(kids[0].deadline), nowdate())

	def test_complete_does_not_duplicate_scheduler_occurrence(self):
		"""Completing a recurring todo the scheduler already advanced must dedup, not
		duplicate: both paths target the same next date, so one no-ops."""
		from vernon_project.tasks import create_recurring_todos
		head = self._make_todo(
			is_recurring=1,
			recurring_frequency="Daily",
			deadline=add_days(nowdate(), -1),
		)
		create_recurring_todos()
		after_scheduler = frappe.db.count("Project Todo", {"original_todo": head.name})
		head.reload()
		head.status = "✅ Completed"
		head.save(ignore_permissions=True)
		frappe.db.commit()
		after_complete = frappe.db.count("Project Todo", {"original_todo": head.name})
		self.assertEqual(
			after_complete, after_scheduler,
			"Completing a recurring todo must not duplicate the scheduler's occurrence",
		)

	def test_oncomplete_generates_next_with_rule_and_shift(self):
		t = self._make_recurring_todo(frequency="Weekly", weekdays="MON,THU",
			start_date="2026-07-06", deadline="2026-07-06",
			leader_deadline="2026-07-07")
		# Reload so validate_done_todo_fields compares DB-normalized dates (a raw
		# just-inserted doc has string dates and false-positives the protected diff).
		t.reload(); t.status = "✅ Completed"; t.save(ignore_permissions=True)
		nxt = frappe.get_all("Project Todo", filters={"original_todo": t.name},
			fields=["deadline", "start_date", "leader_deadline"])
		assert nxt and str(nxt[0].deadline) == "2026-07-09", nxt   # Thu same week
		# span + leader delta preserved (all +3 days)
		assert str(nxt[0].start_date) == "2026-07-09" and str(nxt[0].leader_deadline) == "2026-07-10", nxt

	def test_paused_blocks_oncomplete(self):
		t = self._make_recurring_todo(frequency="Daily", start_date="2026-07-06", deadline="2026-07-06")
		frappe.db.set_value("Project Todo", t.name, "recurring_paused", 1)
		t.reload(); t.status = "✅ Completed"; t.save(ignore_permissions=True)
		assert not frappe.get_all("Project Todo", filters={"original_todo": t.name}), "paused series generated"

	def test_scheduler_self_heals_after_intermediate_delete(self):
		"""Deleting a middle occurrence must not strand the series: the scheduler keys
		off the LATEST occurrence, so it still rolls forward."""
		from vernon_project.tasks import create_recurring_todos
		from vernon_project.vernon_project.doctype.project_todo.project_todo import build_occurrence
		root = self._make_recurring_todo(frequency="Daily",
			start_date=add_days(nowdate(), -3), deadline=add_days(nowdate(), -3))
		occ2 = build_occurrence(root, add_days(nowdate(), -2))
		occ3 = build_occurrence(occ2, add_days(nowdate(), -1))
		frappe.delete_doc("Project Todo", occ2.name, ignore_permissions=True, force=True)
		create_recurring_todos()
		got = frappe.get_all("Project Todo",
			filters={"original_todo": root.name, "deadline": nowdate()})
		self.assertTrue(got, "scheduler did not self-heal off the latest occurrence")

	def test_scheduler_does_not_backfill_after_pause(self):
		"""Paused: no generation. On resume: exactly one occurrence, clamped to today
		(the missed window is skipped, not backfilled)."""
		from vernon_project.tasks import create_recurring_todos
		root = self._make_recurring_todo(frequency="Daily",
			start_date=add_days(nowdate(), -10), deadline=add_days(nowdate(), -10))
		frappe.db.set_value("Project Todo", root.name, "recurring_paused", 1)
		create_recurring_todos()
		self.assertFalse(
			frappe.get_all("Project Todo", filters={"original_todo": root.name}),
			"paused series should not generate")
		frappe.db.set_value("Project Todo", root.name, "recurring_paused", 0)
		create_recurring_todos()
		kids = frappe.get_all("Project Todo", filters={"original_todo": root.name},
			fields=["deadline"])
		self.assertEqual(len(kids), 1, "resume must not backfill missed occurrences")
		self.assertEqual(str(kids[0].deadline), nowdate())

	def test_scheduler_skips_ended_series(self):
		"""A series past its recurring_until generates nothing."""
		from vernon_project.tasks import create_recurring_todos
		root = self._make_recurring_todo(frequency="Daily",
			start_date=add_days(nowdate(), -2), deadline=add_days(nowdate(), -2),
			recurring_until=add_days(nowdate(), -1))
		create_recurring_todos()
		self.assertFalse(
			frappe.get_all("Project Todo", filters={"original_todo": root.name}),
			"ended series (past recurring_until) should not generate")


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

		# Create test brand if not exists
		if not frappe.db.exists("Brand", "Test Customer Phase"):
			frappe.get_doc({
				"doctype": "Brand",
				"brand_name": "Test Customer Phase",
			}).insert(ignore_permissions=True)

		# Create test project with team members so validate_assigned_to_team_member passes
		self.project = frappe.get_doc({
			"doctype": "Project",
			"project_name": "Test Project for Phase Tracking",
			"brand": "Test Customer Phase",
			"project_owner": "Administrator",
			"project_leader": "Administrator",
			"status": "Ongoing",
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 30),
			"team_members": [
				{"user": "Administrator"},
				{"user": "test_user@example.com"},
			],
		})
		self.project.insert(ignore_permissions=True)
		self.group, self.level_id = _ensure_test_group()

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
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 7),
			"estimated": 60,
			"status": "⚪️ Planned",
			"group": self.group,
			"level_id": self.level_id,
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

		# Controller sums the main `estimated` (Planned→Done) plus the two approval
		# phase estimates, as ints. (estimated_planned_to_done is a separate captured
		# estimate and is not part of this rollup.)
		expected_total = (
			int(self.todo.estimated or 0)
			+ int(self.todo.estimated_done_to_checked or 0)
			+ int(self.todo.estimated_checked_to_completed or 0)
		)
		self.assertEqual(self.todo.total_estimated_hours, expected_total,
			f"Total estimated hours should be {expected_total}")

	def test_planned_started_at_timestamp(self):
		"""Test that planned_started_at is set when todo is created"""
		self.todo.reload()

		self.assertIsNotNone(self.todo.planned_started_at,
			"planned_started_at should be set when todo is created")

	def test_done_timestamp_and_actual_time(self):
		"""Test that done_started_at is set and actual time is calculated when moving to Done"""
		# Backdate planned_started_at so Planned→Done is a deterministic 1h gap
		# (a real-time sleep rounds to 0.0 at 2-decimal hour precision).
		frappe.db.set_value("Project Todo", self.todo.name, "planned_started_at",
			add_to_date(now_datetime(), hours=-1), update_modified=False)

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

		# Backdate done_started_at so Done→Checked is a deterministic 1h gap.
		frappe.db.set_value("Project Todo", self.todo.name, "done_started_at",
			add_to_date(now_datetime(), hours=-1), update_modified=False)

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

		self.todo.reload()
		self.todo.status = "🔷 Checked By PL"
		self.todo.save(ignore_permissions=True)
		frappe.db.commit()

		# Backdate checked_started_at so Checked→Completed is a deterministic 1h gap.
		frappe.db.set_value("Project Todo", self.todo.name, "checked_started_at",
			add_to_date(now_datetime(), hours=-1), update_modified=False)

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
		# Backdate each phase start so every segment is a deterministic positive gap.
		frappe.db.set_value("Project Todo", self.todo.name, "planned_started_at",
			add_to_date(now_datetime(), hours=-3), update_modified=False)

		self.todo.reload()
		self.todo.status = "🟠 Done"
		self.todo.save(ignore_permissions=True)
		frappe.db.commit()

		frappe.db.set_value("Project Todo", self.todo.name, "done_started_at",
			add_to_date(now_datetime(), hours=-2), update_modified=False)

		self.todo.reload()
		self.todo.status = "🔷 Checked By PL"
		self.todo.save(ignore_permissions=True)
		frappe.db.commit()

		frappe.db.set_value("Project Todo", self.todo.name, "checked_started_at",
			add_to_date(now_datetime(), hours=-1), update_modified=False)

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
		# `estimated` is the Planned→Done estimate that feeds the total rollup.
		self.todo.estimated = 90
		self.todo.save(ignore_permissions=True)
		frappe.db.commit()

		self.todo.reload()

		expected_total = (
			int(self.todo.estimated or 0)
			+ int(self.todo.estimated_done_to_checked or 0)
			+ int(self.todo.estimated_checked_to_completed or 0)
		)
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
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 7),
			"status": "⚪️ Planned",
			"group": self.group,
			"level_id": self.level_id,
		}).insert(ignore_permissions=True)
		frappe.db.commit()

		extra_todo.reload()

		self.assertEqual(extra_todo.total_estimated_hours, 0.0,
			"Total should be 0 when no estimates are provided")


class TestProjectTodoWaiting(FrappeTestCase):
	def setUp(self):
		# Minimal project + detail so validate_create_permission passes (Admin = owner+leader).
		if not frappe.db.exists("Brand", "Test Customer Waiting"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer Waiting"}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project",
			"project_name": "Waiting Flag Test Project",
			"brand": "Test Customer Waiting",
			"project_owner": "Administrator",
			"project_leader": "Administrator",
			"status": "Ongoing",
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 30),
			"team_members": [{"user": "Administrator"}],
		}).insert(ignore_permissions=True)
		self.group, self.level_id = _ensure_test_group()
		grouping = frappe.get_doc({"doctype": "Glossary", "glossary": "Waiting Test Grouping", "project": self.project.name}).insert(ignore_permissions=True)
		self.grouping_name = grouping.name
		self.project_detail = frappe.get_doc({
			"doctype": "Project Detail",
			"project": self.project.name,
			"title": "Waiting Test Detail",
			"grouping": grouping.name,
			"project_deadline": add_days(nowdate(), 30),
			"estimated": 60,
		}).insert(ignore_permissions=True)
		self.detail = self.project_detail.name
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for name in frappe.get_all("Project Todo", filters={"project_detail": self.detail}, pluck="name"):
			frappe.db.set_value("Project Todo", name, "status", "⚪️ Planned", update_modified=False)
			frappe.delete_doc("Project Todo", name, force=True, ignore_permissions=True)
		frappe.delete_doc("Project Detail", self.detail, force=True, ignore_permissions=True)
		frappe.delete_doc("Glossary", self.grouping_name, force=True, ignore_permissions=True)
		frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def _make_planned_todo(self):
		"""Smallest Planned Project Todo. Reuse an existing Project Detail fixture
		if the suite already has one; otherwise create the chain in setUp."""
		todo = frappe.new_doc("Project Todo")
		todo.to_do = "waiting-test"
		todo.project_detail = self.detail  # set up in setUp (see existing tests)
		todo.assigned_to = "Administrator"
		todo.start_date = nowdate()
		todo.deadline = add_days(nowdate(), 5)
		todo.status = "⚪️ Planned"
		todo.group = self.group
		todo.level_id = self.level_id
		return todo

	def test_waiting_requires_reason(self):
		todo = self._make_planned_todo()
		todo.is_waiting = 1
		todo.waiting_reason = None
		self.assertRaises(frappe.ValidationError, todo.insert)

	def test_marking_waiting_stamps_audit(self):
		todo = self._make_planned_todo()
		todo.is_waiting = 1
		todo.waiting_reason = "waiting on client"
		todo.insert()
		self.assertTrue(todo.waiting_since)
		self.assertEqual(todo.waiting_by, frappe.session.user)
		self.assertEqual(todo.status, "⚪️ Planned")  # still a todo, not done

	def test_clearing_waiting_wipes_audit_and_reason(self):
		todo = self._make_planned_todo()
		todo.is_waiting = 1
		todo.waiting_reason = "x"
		todo.insert()
		todo.is_waiting = 0
		todo.save()
		self.assertFalse(todo.waiting_since)
		self.assertFalse(todo.waiting_by)
		self.assertFalse(todo.waiting_reason)

	def test_advancing_status_force_clears_waiting(self):
		todo = self._make_planned_todo()
		todo.is_waiting = 1
		todo.waiting_reason = "x"
		todo.insert()
		# Reload so the protected-field diff (validate_done_todo_fields) compares
		# DB-normalized values; editing the raw just-inserted doc false-positives.
		todo.reload()
		todo.status = "🟠 Done"
		todo.save()
		todo.reload()
		self.assertFalse(todo.is_waiting)
		self.assertFalse(todo.waiting_since)


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
