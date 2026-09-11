# Copyright (c) 2026, Vernon and Contributors
# See license.txt

import frappe
import pymysql

from vernon_project.fixtures_for_tests import ensure_user
import unittest
from frappe.tests.utils import FrappeTestCase
from frappe.utils import nowdate, add_days, getdate, now_datetime, add_to_date
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


class TestEnsureTodayMinutes(unittest.TestCase):
	"""Pure decision test for the today-deadline auto-plan rule. No DB."""

	def setUp(self):
		self.today = "2026-07-16"
		self.base = dict(
			status="⚪️ Planned",
			is_waiting=0,
			assigned_to="test_user@example.com",
			deadline="2026-07-16",
			today=self.today,
			estimated=60,
			current_today_minutes=0,
		)

	def _run(self, **over):
		from vernon_project.vernon_project.doctype.project_todo.project_todo import (
			_ensure_today_minutes,
		)

		return _ensure_today_minutes(**{**self.base, **over})

	def test_due_today_unplanned_gets_the_estimate(self):
		self.assertEqual(self._run(), 60)

	def test_zero_estimate_falls_back_to_30(self):
		self.assertEqual(self._run(estimated=0), 30)

	def test_existing_positive_row_is_left_alone(self):
		self.assertIsNone(self._run(current_today_minutes=90))

	def test_zeroed_row_is_refilled(self):
		self.assertEqual(self._run(current_today_minutes=0), 60)

	def test_other_deadline_is_ignored(self):
		self.assertIsNone(self._run(deadline="2026-07-17"))
		self.assertIsNone(self._run(deadline="2026-07-15"))
		self.assertIsNone(self._run(deadline=None))

	def test_waiting_is_ignored(self):
		self.assertIsNone(self._run(is_waiting=1))

	def test_non_planned_status_is_ignored(self):
		self.assertIsNone(self._run(status="✅ Completed"))
		self.assertIsNone(self._run(status="🟠 Done"))

	def test_unassigned_is_ignored(self):
		self.assertIsNone(self._run(assigned_to=None))


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

		# Create test brand if not exists. company is mandatory on Brand (schema
		# added it after this fixture was written); any existing Company will do.
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({
				"doctype": "Brand",
				"brand_name": "Test Customer",
				"company": frappe.db.get_value("Company", {}, "name"),
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
		# Safety-net registry for tests that build their own extra Project/Glossary/
		# Project Detail chain beyond self.project -- tearDown sweeps these even if
		# the test dies before reaching its own inline cleanup.
		self.extra_projects, self.extra_details, self.extra_groupings = [], [], []

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

		# Safety net for tests that build their own extra chain (see setUp) --
		# usually already gone via the test's own inline cleanup; only fires when
		# that cleanup was never reached.
		for name in getattr(self, 'extra_details', []):
			if frappe.db.exists("Project Detail", name):
				frappe.delete_doc("Project Detail", name, ignore_permissions=True, force=True)
		for name in getattr(self, 'extra_groupings', []):
			if frappe.db.exists("Glossary", name):
				frappe.delete_doc("Glossary", name, ignore_permissions=True, force=True)
		for name in getattr(self, 'extra_projects', []):
			if frappe.db.exists("Project", name):
				frappe.delete_doc("Project", name, ignore_permissions=True, force=True)

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
		"""52r6l30cs4 changed this rule: the owner wants ALL of a done todo's
		information frozen except comments, so notes can no longer be edited once Done
		(this test used to assert the opposite)."""
		self.todo.reload()
		self.todo.status = "🟠 Done"
		self.todo.save(ignore_permissions=True)
		frappe.db.commit()

		self.todo.reload()
		self.todo.notes = "Updated notes after completion"
		with self.assertRaises(frappe.ValidationError) as caught:
			self.todo.save(ignore_permissions=True)
		self.assertIn("already marked done", str(caught.exception))

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
		self.extra_projects.append(proj.name)
		grouping = frappe.get_doc({
			"doctype": "Glossary",
			"glossary": "Lead Grouping",
			"project": proj.name,
		})
		grouping.insert(ignore_permissions=True)
		self.extra_groupings.append(grouping.name)
		pd = frappe.get_doc({
			"doctype": "Project Detail",
			"project": proj.name,
			"title": "Lead Detail",
			"grouping": grouping.name,
			"project_deadline": add_days(nowdate(), 30),
			"estimated": 10,
		})
		pd.insert(ignore_permissions=True)
		self.extra_details.append(pd.name)
		frappe.db.commit()

		frappe.set_user("test_user@example.com")
		todo = frappe.get_doc({
			"doctype": "Project Todo",
			"project_detail": pd.name,
			"to_do": "Legit task",
			"assigned_to": "test_user@example.com",
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 5),
			"estimated": 30,
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
		create_recurring_todos(roots=[head.name])
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
		create_recurring_todos(roots=[head.name])
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

	# -- 52r6l30cs4: a done todo is read-only, except comments --------------------------

	def _done(self, **fields):
		t = self._make_todo(deadline=add_days(nowdate(), 3), **fields)
		frappe.db.set_value("Project Todo", t.name, "status", "🟠 Done", update_modified=False)
		return frappe.get_doc("Project Todo", t.name)

	def _as_leader(self):
		"""test_user as this project's leader (not owner, not System Manager)."""
		leader = "test_user@example.com"
		frappe.get_doc("User", leader).add_roles("Project Leader")
		self.addCleanup(lambda: frappe.get_doc("User", leader).remove_roles("Project Leader"))
		frappe.db.set_value("Project", self.project.name, "project_leader", leader)
		return leader

	def test_leader_cannot_skip_the_owner_approval_through_generic_saves(self):
		"""The approval ladder lives in update_status: only the project owner takes a
		todo to Completed, and only an owner with the Partner role sets auto-approve.
		A leader holds write on the todo, so a generic save (PUT /api/resource, i.e.
		frappe.client.set_value) could set status straight to Completed, or switch the
		todo's auto-approve on, and skip the owner. Creating a task through the same
		generic insert the frontend uses could start it Completed."""
		leader = self._as_leader()
		t = self._make_todo(assigned_to="test_user2@example.com")
		frappe.db.set_value("Project Todo", t.name, "status", "🔷 Checked By PL", update_modified=False)
		frappe.set_user(leader)
		try:
			for field, value in (("status", "✅ Completed"), ("auto_approve", 1)):
				with self.assertRaises(frappe.PermissionError, msg=field):
					frappe.client.set_value("Project Todo", t.name, field, value)
			with self.assertRaises(frappe.PermissionError):
				frappe.client.insert({
					"doctype": "Project Todo", "project_detail": self.project_detail.name,
					"to_do": "born completed", "assigned_to": "test_user2@example.com",
					"start_date": nowdate(), "deadline": add_days(nowdate(), 3), "estimated": 30,
					"group": self.group, "level_id": self.level_id, "status": "✅ Completed",
				})
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(frappe.db.get_value("Project Todo", t.name, ["status", "auto_approve"]), ("🔷 Checked By PL", 0))
		self.assertFalse(frappe.db.exists("Point Ledger", {"todo": t.name}))
		self.assertFalse(frappe.db.exists("Project Todo", {"to_do": "born completed"}))

	def test_leader_cannot_turn_on_project_auto_approve(self):
		"""Project auto-approve skips the owner gate for every todo in the project, and
		set_project_auto_approve reserves it for the owner with the Partner role; the
		owner/leader update_project endpoint must not hand it to the leader."""
		from vernon_project.api.project import update_project
		leader = self._as_leader()
		frappe.set_user(leader)
		try:
			with self.assertRaises(frappe.PermissionError):
				update_project(self.project.name, {"auto_approve": 1})
			update_project(self.project.name, {"goal": "leaders still edit the rest"})
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(frappe.db.get_value("Project", self.project.name, ["auto_approve", "goal"]),
			(0, "leaders still edit the rest"))

	def test_deleting_a_todo_takes_its_earnings_with_it(self):
		"""Only a Planned or Cancelled todo can be deleted, and leaving Completed already
		removes its earnings, so it never holds any, unless its status was set around
		the controller. Test teardowns do exactly that (fake Planned, then delete), and
		the orphaned earnings put "Test User" on the live leaderboard. Priority-miss
		penalties are history and stay (with the link released)."""
		t = self._make_todo()
		frappe.db.set_value("Project Todo", t.name, "status", "✅ Completed", update_modified=False)
		frappe.get_doc("Project Todo", t.name).sync_point_ledger()
		frappe.get_doc({"doctype": "Point Ledger", "user": self.owner_user, "todo": t.name,
			"source": "Priority", "points_earned": -5, "credited_on": now_datetime()}).insert(ignore_permissions=True)
		self.assertTrue(frappe.db.exists("Point Ledger", {"todo": t.name, "source": "Todo"}))
		frappe.db.set_value("Project Todo", t.name, "status", "⚪️ Planned", update_modified=False)
		frappe.delete_doc("Project Todo", t.name, ignore_permissions=True, force=True)
		self.assertFalse(frappe.db.exists("Point Ledger", {"todo": t.name}))
		penalty = frappe.get_all("Point Ledger", filters={"source": "Priority", "points_earned": -5,
			"user": self.owner_user, "todo": ["is", "not set"]}, pluck="name", order_by="creation desc", limit=1)
		self.assertTrue(penalty)
		frappe.delete_doc("Point Ledger", penalty[0], ignore_permissions=True, force=True)

	def test_done_todo_rejects_edits_to_its_information(self):
		t = self._done(notes="asli", checklist="- [ ] a")
		blocker = self._make_todo(to_do="blocker")
		for field, value in (("to_do", "diganti"), ("notes", "diganti"), ("checklist", "- [x] a"),
				("is_priority", 1), ("leader_deadline", add_days(nowdate(), 9))):
			doc = frappe.get_doc("Project Todo", t.name)
			doc.set(field, value)
			with self.assertRaises(frappe.ValidationError, msg=field):
				doc.save(ignore_permissions=True)
		doc = frappe.get_doc("Project Todo", t.name)
		doc.append("blocked_by", {"todo": blocker.name})
		with self.assertRaises(frappe.ValidationError):
			doc.save(ignore_permissions=True)
		doc = frappe.get_doc("Project Todo", t.name)
		doc.append("allocations", {"allocation_date": nowdate(), "estimated_minutes": 30})
		with self.assertRaises(frappe.ValidationError):
			doc.save(ignore_permissions=True)

	def test_done_todo_still_moves_through_review_and_takes_comments(self):
		from vernon_project.api.mobile import add_comment
		t = self._done(notes="asli")
		t.status = "🔷 Checked By PL"  # workflow field: allowed
		t.tested_by = "Administrator"
		t.save(ignore_permissions=True)  # unchanged tables/fields must not read as edits
		self.assertTrue(add_comment("Project Todo", t.name, "komentar tetap boleh")["name"])
		root = frappe.get_doc("Project Todo", t.name)
		root.recurring_paused = 1  # series control stays usable on a done occurrence
		root.save(ignore_permissions=True)

	def test_unchanged_child_rows_do_not_count_as_edits(self):
		blocker = self._make_todo(to_do="blocker")
		t = self._make_todo(deadline=add_days(nowdate(), 3), blocked_by=[{"todo": blocker.name}],
			allocations=[{"allocation_date": nowdate(), "estimated_minutes": 30}])
		frappe.db.set_value("Project Todo", t.name, "status", "🟠 Done", update_modified=False)
		doc = frappe.get_doc("Project Todo", t.name)  # freshly loaded rows vs DB rows
		doc.status = "🔷 Checked By PL"
		doc.save(ignore_permissions=True)

	def test_the_save_that_marks_done_may_carry_last_edits_and_reopen_unlocks(self):
		t = self._make_todo(deadline=add_days(nowdate(), 3), notes="draft")
		t.reload()
		t.notes, t.status = "final", "🟠 Done"
		t.save(ignore_permissions=True)  # old status Planned: allowed
		t.reload()
		t.status = "⚪️ Planned"  # rejected / reopened
		t.save(ignore_permissions=True)
		t.reload()
		t.notes = "revised after reopen"
		t.save(ignore_permissions=True)

	def test_dependency_mirror_from_another_todo_still_reaches_a_done_todo(self):
		other = self._make_todo(to_do="other")
		t = self._done()
		t.append("blocked_by", {"todo": other.name})
		t.flags.skip_block_sync = True  # what _add_block_link / _remove_block_link set
		t.save(ignore_permissions=True)

	def test_postpone_shifts_planned_and_skips_checked_todos(self):
		from vernon_project.api.postpone import postpone
		planned = self._make_todo(to_do="pp planned", deadline=add_days(nowdate(), 5))
		checked = self._make_todo(to_do="pp checked", deadline=add_days(nowdate(), 5))
		frappe.db.set_value("Project Todo", checked.name, "status", "🔷 Checked By PL", update_modified=False)
		before = frappe.db.get_value("Project Todo", checked.name, "deadline")
		anchor = frappe.db.get_value("Project Todo", {"project_detail": self.project_detail.name, "status": "⚪️ Planned"}, "max(deadline)")
		frappe.db.set_value("Project Detail", self.project_detail.name, "latest_deadline", anchor)
		res = postpone("Project Detail", self.project_detail.name, add_days(anchor, 2))
		self.assertGreaterEqual(res["shifted_count"], 1)
		self.assertEqual(str(frappe.db.get_value("Project Todo", planned.name, "deadline")), add_days(nowdate(), 7))
		self.assertEqual(frappe.db.get_value("Project Todo", checked.name, "deadline"), before)

	def test_done_tab_lists_everything_done_in_the_last_3_days_uncapped(self):
		"""8ek4eg7j87: the Home Done tab = all todos I finished today and the 2 days
		before (on Done time, not approval time) — no longer the newest 30."""
		from vernon_project.api.project_todo import get_recently_done
		today = getdate(nowdate())
		first_day, day_before = f"{add_days(today, -2)} 00:00:01", f"{add_days(today, -3)} 23:59:59"
		inside = [self._make_todo(to_do=f"done-in {i}").name for i in range(32)]  # more than the old cap
		outside = self._make_todo(to_do="done-out").name
		approved_today_done_long_ago = self._make_todo(to_do="done-long-ago").name
		for name in inside:
			frappe.db.set_value("Project Todo", name, {"status": "✅ Completed", "developed_at": first_day}, update_modified=False)
		frappe.db.set_value("Project Todo", outside, {"status": "✅ Completed", "developed_at": day_before}, update_modified=False)
		frappe.db.set_value("Project Todo", approved_today_done_long_ago,
			{"status": "✅ Completed", "developed_at": day_before, "completed_at": frappe.utils.now_datetime()}, update_modified=False)
		got = {r["name"] for r in get_recently_done()}
		self.assertTrue(set(inside) <= got, f"missing {len(set(inside) - got)} in-window todos")
		self.assertNotIn(outside, got)
		self.assertNotIn(approved_today_done_long_ago, got)  # window is on Done time, not approval

	def test_generation_does_not_wait_for_leader_approval(self):
		"""rrbnu45v6b: the scheduler mints today's occurrence while yesterday's still waits
		for the leader (Done), and the later approval adds no second one. (The Sep 2026
		"routine only appears after approval" report was the site scheduler being off —
		the approval hook was the only path still running.)"""
		from vernon_project.tasks import create_recurring_todos
		head = self._make_todo(is_recurring=1, recurring_frequency="Daily",
			deadline=add_days(nowdate(), -1))
		frappe.db.set_value("Project Todo", head.name, "status", "🟠 Done")
		create_recurring_todos(roots=[head.name])
		kids = frappe.get_all("Project Todo", filters={"original_todo": head.name}, fields=["deadline"])
		self.assertEqual([str(k.deadline) for k in kids], [nowdate()])
		head.reload()
		head.status = "✅ Completed"
		head.save(ignore_permissions=True)
		self.assertEqual(frappe.db.count("Project Todo", {"original_todo": head.name}), 1)

	def test_scheduler_does_not_pregenerate_future(self):
		"""An up-to-date daily series (next occurrence is day-after-tomorrow) must NOT
		get a new child from the scheduler (force=False gate)."""
		from vernon_project.tasks import create_recurring_todos
		t = self._make_todo(is_recurring=1, recurring_frequency="Daily",
			start_date=nowdate(), deadline=add_days(nowdate(), 1))
		before = frappe.db.count("Project Todo", {"original_todo": t.name})
		create_recurring_todos(roots=[t.name])
		# next_date = deadline+1 = day-after-tomorrow > today → gated by force=False
		self.assertEqual(frappe.db.count("Project Todo", {"original_todo": t.name}), before)

	def test_scheduler_cancelled_latest_continues_series(self):
		"""A cancelled latest occurrence rolls the series forward exactly once."""
		from vernon_project.tasks import create_recurring_todos
		t = self._make_todo(is_recurring=1, recurring_frequency="Daily",
			start_date=add_days(nowdate(), -2), deadline=add_days(nowdate(), -1))
		frappe.db.set_value("Project Todo", t.name, "status", "🚫 Cancelled")
		create_recurring_todos(roots=[t.name])
		kids = frappe.get_all("Project Todo", filters={"original_todo": t.name}, fields=["deadline"])
		self.assertEqual(len(kids), 1, kids)
		self.assertEqual(str(kids[0].deadline), nowdate())           # rolled (yesterday+1) → today
		self.assertEqual(
			frappe.db.get_value("Project Todo", t.name, "status"), "🚫 Cancelled"
		)  # original untouched

	def test_scheduler_paused_read_from_root_not_anchor(self):
		"""Pause on the ROOT blocks generation even when the scheduler's anchor is a child."""
		from vernon_project.tasks import create_recurring_todos
		root = self._make_todo(is_recurring=1, recurring_frequency="Daily",
			start_date=add_days(nowdate(), -3), deadline=add_days(nowdate(), -2))
		child = self._make_todo(is_recurring=1, recurring_frequency="Daily",
			start_date=add_days(nowdate(), -2), deadline=add_days(nowdate(), -1))
		frappe.db.set_value("Project Todo", child.name, "original_todo", root.name)
		frappe.db.set_value("Project Todo", root.name, "recurring_paused", 1)
		before = frappe.db.count("Project Todo", {"original_todo": root.name})
		create_recurring_todos(roots=[root.name])
		# Paused root blocks generation even though anchor (child) is not paused
		self.assertEqual(frappe.db.count("Project Todo", {"original_todo": root.name}), before)

	def test_oncomplete_generates_next_with_rule_and_shift(self):
		# Compute an upcoming Monday so the resume-clamp never triggers and the
		# +3-day shift to Thursday is deterministic regardless of run date.
		base = getdate(nowdate())
		monday = add_days(base, (7 - base.weekday()) % 7 or 7)  # always a future Monday
		thu = add_days(monday, 3)
		t = self._make_recurring_todo(frequency="Weekly", weekdays="MON,THU",
			start_date=str(monday), deadline=str(monday),
			leader_deadline=str(add_days(monday, 1)))
		# Reload so validate_done_todo_fields compares DB-normalized dates (a raw
		# just-inserted doc has string dates and false-positives the protected diff).
		t.reload(); t.status = "✅ Completed"; t.save(ignore_permissions=True)
		kids = frappe.get_all("Project Todo", filters={"original_todo": t.name},
			fields=["deadline", "start_date", "leader_deadline"])
		assert kids and str(kids[0].deadline) == str(thu), kids            # next selected weekday, same week
		assert str(kids[0].start_date) == str(thu)                         # span preserved (+3)
		assert str(kids[0].leader_deadline) == str(add_days(monday, 4))    # leader shifted +3

	def test_paused_blocks_oncomplete(self):
		t = self._make_recurring_todo(frequency="Daily", start_date="2026-07-06", deadline="2026-07-06")
		frappe.db.set_value("Project Todo", t.name, "recurring_paused", 1)
		t.reload(); t.status = "✅ Completed"; t.save(ignore_permissions=True)
		assert not frappe.get_all("Project Todo", filters={"original_todo": t.name}), "paused series generated"

	def test_scheduler_self_heals_after_intermediate_delete(self):
		"""Deleting the LATEST occurrence must not strand the series: the scheduler
		falls back to the next-latest and still rolls forward."""
		from vernon_project.tasks import create_recurring_todos
		from vernon_project.vernon_project.doctype.project_todo.project_todo import build_occurrence
		occ1 = self._make_recurring_todo(frequency="Daily",
			start_date=add_days(nowdate(), -2), deadline=add_days(nowdate(), -2))
		occ2 = build_occurrence(occ1, add_days(nowdate(), -1))  # latest; original_todo=occ1.name
		# Reset status before delete so on_trash doesn't block
		frappe.db.set_value("Project Todo", occ2.name, "status", "⚪️ Planned", update_modified=False)
		frappe.delete_doc("Project Todo", occ2.name, ignore_permissions=True, force=True)
		create_recurring_todos(roots=[occ1.name])
		# Scheduler should roll from occ1 (remaining latest) → next=yesterday → clamped to today
		got = frappe.get_all("Project Todo",
			filters={"original_todo": occ1.name, "deadline": nowdate()})
		self.assertTrue(got, "scheduler did not self-heal off the remaining latest after deletion")

	def test_scheduler_does_not_backfill_after_pause(self):
		"""Paused: no generation. On resume: exactly one occurrence, clamped to today
		(the missed window is skipped, not backfilled)."""
		from vernon_project.tasks import create_recurring_todos
		root = self._make_recurring_todo(frequency="Daily",
			start_date=add_days(nowdate(), -10), deadline=add_days(nowdate(), -10))
		frappe.db.set_value("Project Todo", root.name, "recurring_paused", 1)
		create_recurring_todos(roots=[root.name])
		self.assertFalse(
			frappe.get_all("Project Todo", filters={"original_todo": root.name}),
			"paused series should not generate")
		frappe.db.set_value("Project Todo", root.name, "recurring_paused", 0)
		create_recurring_todos(roots=[root.name])
		kids = frappe.get_all("Project Todo", filters={"original_todo": root.name},
			fields=["deadline"])
		self.assertEqual(len(kids), 1, "resume must not backfill missed occurrences")
		self.assertEqual(str(kids[0].deadline), nowdate())

	# ------------------------------------------------------------------
	# Point Ledger ownership + the double-mint race.
	# ------------------------------------------------------------------

	def _react_to(self, todo_name, reactor="test_user2@example.com"):
		"""A teammate's Recognition credit, exactly as _recognition_credit writes it:
		no `role` passed. Point Ledger.role is a Select whose first option is
		"Assignee", so frappe stamps that on the row -- which is what made the old
		(todo, role) probe collide with it."""
		row = frappe.get_doc({
			"doctype": "Point Ledger", "user": "test_user@example.com",
			"todo": todo_name, "granted_by": reactor, "source": "Recognition",
			"points_earned": 2, "credited_on": now_datetime(),
		}).insert(ignore_permissions=True)
		self.addCleanup(self._drop_ledger, todo_name)
		self.assertEqual(
			frappe.db.get_value("Point Ledger", row.name, "role"), "Assignee",
			"precondition: frappe defaults role to the Select's first option",
		)
		return row

	def _drop_ledger(self, todo_name):
		for n in frappe.get_all("Point Ledger", filters={"todo": todo_name}, pluck="name"):
			frappe.delete_doc("Point Ledger", n, ignore_permissions=True, force=True)
		frappe.db.commit()

	def test_completion_does_not_overwrite_an_earlier_recognition_credit(self):
		"""React-then-complete must leave the teammate's credit alone.

		_upsert_ledger_row probed {todo, role, source != "Priority"}, which matched the
		Recognition row above and doc.save()'d the assignee award straight over it --
		silent, order-dependent data loss.
		"""
		todo = self._make_todo(assigned_to="test_user@example.com")
		rec = self._react_to(todo.name)

		todo.reload()
		todo.status = "✅ Completed"
		todo.save(ignore_permissions=True)

		self.assertTrue(
			frappe.db.exists("Point Ledger", rec.name),
			"completion deleted or overwrote the recognition credit",
		)
		self.assertEqual(
			frappe.db.get_value("Point Ledger", rec.name, "source"), "Recognition",
			"the recognition row was rewritten into the assignee award",
		)
		self.assertTrue(
			frappe.db.exists("Point Ledger", {"todo": todo.name, "role": "Assignee", "source": "Todo"}),
			"the assignee award was not minted as its own row",
		)

	def test_uncompleting_keeps_other_peoples_recognition_credits(self):
		"""_remove_ledger deleted every non-Priority row for the todo, so reverting out
		of Completed wiped teammates' recognition credits too. It owns Todo/Mentoring."""
		todo = self._make_todo(assigned_to="test_user@example.com")
		rec = self._react_to(todo.name)
		todo.reload(); todo.status = "✅ Completed"; todo.save(ignore_permissions=True)
		self.assertTrue(frappe.db.exists("Point Ledger", {"todo": todo.name, "source": "Todo"}))

		todo.reload(); todo.status = "⚪️ Planned"; todo.save(ignore_permissions=True)

		self.assertTrue(
			frappe.db.exists("Point Ledger", rec.name),
			"un-completing deleted a teammate's recognition credit",
		)
		self.assertFalse(
			frappe.db.exists("Point Ledger", {"todo": todo.name, "source": "Todo"}),
			"un-completing should still remove the todo's own award rows",
		)

	def test_ledger_read_blocks_while_another_completion_holds_the_rows(self):
		"""The double-mint guard: a second completion must block on the first one's
		row locks until it commits, instead of finding no row and inserting again."""
		todo = self._make_todo(assigned_to="test_user@example.com")
		# A real row, not an empty range: two transactions may both hold the same GAP
		# lock, so with no rows nothing would block and this would prove nothing.
		frappe.get_doc({
			"doctype": "Point Ledger", "user": "test_user@example.com", "todo": todo.name,
			"role": "Assignee", "source": "Todo", "points_earned": 5,
			"credited_on": now_datetime(),
		}).insert(ignore_permissions=True)
		frappe.db.commit()
		self.addCleanup(self._drop_ledger, todo.name)

		# keep the session timeout tweak from leaking into later tests
		orig = frappe.db.sql("select @@session.innodb_lock_wait_timeout")[0][0]
		other = pymysql.connect(
			host=frappe.conf.db_host or "127.0.0.1",
			port=int(frappe.conf.db_port or 3306),
			user=frappe.conf.db_name,
			password=frappe.conf.db_password,
			database=frappe.conf.db_name,
		)
		try:
			cur = other.cursor()
			cur.execute("start transaction")
			cur.execute("select name from `tabPoint Ledger` where todo=%s for update", (todo.name,))
			self.assertEqual(len(cur.fetchall()), 1, "probe did not lock the todo's ledger rows")

			frappe.db.sql("set session innodb_lock_wait_timeout=3")
			with self.assertRaises(Exception) as caught:
				todo._ledger_rows_for_update()
			# Specific, not a bare Exception: asserting any Exception is what let the
			# first version of test_cuti_grant_lock pass with its lock removed.
			self.assertIn("lock wait timeout", str(caught.exception).lower())
		finally:
			try:
				other.rollback(); other.close()
			except Exception:
				pass
			frappe.db.rollback()
			frappe.db.sql(f"set session innodb_lock_wait_timeout={int(orig)}")

	def test_scheduler_survives_a_series_that_fails_with_a_long_error(self):
		"""One bad series must be logged and skipped, not abort the whole nightly run.

		frappe.log_error takes (title, message) and only auto-swaps them when the title
		contains a newline. Passing the long error text as the TITLE therefore overflows
		Error Log.method (140 chars), and the CharacterLengthExceededError escapes the
		except block that was meant to contain the failure -- so a single real series
		whose assignee had left the Project Team stopped every remaining series from
		generating that night. Reproduces exactly that shape.
		"""
		from vernon_project.tasks import create_recurring_todos
		root = self._make_recurring_todo(
			frequency="Daily",
			to_do="Buang Sampah Semua " + "x" * 130,  # long enough to overflow a title
			start_date=add_days(nowdate(), -2),
			deadline=add_days(nowdate(), -2),
		)
		# Drop the assignee out of the Project Team behind validate()'s back, so the
		# NEXT occurrence fails to insert the way the live series did.
		frappe.db.set_value("Project Todo", root.name, "assigned_to", "Guest", update_modified=False)
		frappe.db.commit()

		# Must return normally (0 created), not raise.
		created = create_recurring_todos(roots=[root.name])
		self.assertEqual(created, 0, "a failing series should generate nothing")
		self.assertFalse(
			frappe.get_all("Project Todo", filters={"original_todo": root.name}),
			"the failing series must not have generated an occurrence",
		)

	def test_scheduler_skips_ended_series(self):
		"""A series past its recurring_until generates nothing."""
		from vernon_project.tasks import create_recurring_todos
		root = self._make_recurring_todo(frequency="Daily",
			start_date=add_days(nowdate(), -2), deadline=add_days(nowdate(), -2),
			recurring_until=add_days(nowdate(), -1))
		create_recurring_todos(roots=[root.name])
		self.assertFalse(
			frappe.get_all("Project Todo", filters={"original_todo": root.name}),
			"ended series (past recurring_until) should not generate")

	# ------------------------------------------------------------------
	# Approval-field removal (d1datig79t): leader_deadline / owner_deadline /
	# estimated_done_to_checked / estimated_checked_to_completed dropped from the
	# Todo forms, but stay valid, optional DocType columns — a client (new or
	# stale) may omit or still send them.
	# ------------------------------------------------------------------

	def test_create_without_approval_fields_succeeds(self):
		todo = self._make_todo()
		self.assertIsNone(todo.leader_deadline)
		self.assertIsNone(todo.owner_deadline)
		self.assertFalse(todo.estimated_done_to_checked)
		self.assertFalse(todo.estimated_checked_to_completed)

	def test_update_omitting_approval_fields_preserves_existing_values(self):
		"""The regrouped forms stop sending these fields entirely. update_todo's
		`if val is not None` guard must leave whatever is already stored untouched
		— this is the guarantee the removed inputs relied on."""
		from vernon_project.api.mobile import update_todo
		todo = self._make_todo(
			leader_deadline=add_days(nowdate(), 2),
			owner_deadline=add_days(nowdate(), 3),
			estimated_done_to_checked=15,
			estimated_checked_to_completed=20,
		)
		result = update_todo(todo.name, to_do="renamed")
		self.assertEqual(result["status"], "ok")
		todo.reload()
		self.assertEqual(todo.to_do, "renamed")
		self.assertEqual(str(todo.leader_deadline), str(add_days(nowdate(), 2)))
		self.assertEqual(str(todo.owner_deadline), str(add_days(nowdate(), 3)))
		self.assertEqual(todo.estimated_done_to_checked, 15)
		self.assertEqual(todo.estimated_checked_to_completed, 20)

	def test_update_still_accepts_a_stale_client_sending_approval_fields(self):
		"""Backward compatible: a client still on the old build (sends the removed
		fields) must not error, and the values still apply normally."""
		from vernon_project.api.mobile import update_todo
		todo = self._make_todo()
		result = update_todo(
			todo.name,
			leader_deadline=add_days(nowdate(), 1),
			owner_deadline=add_days(nowdate(), 2),
			estimated_done_to_checked=5,
			estimated_checked_to_completed=10,
		)
		self.assertEqual(result["status"], "ok")
		todo.reload()
		self.assertEqual(str(todo.leader_deadline), str(add_days(nowdate(), 1)))
		self.assertEqual(str(todo.owner_deadline), str(add_days(nowdate(), 2)))
		self.assertEqual(todo.estimated_done_to_checked, 5)
		self.assertEqual(todo.estimated_checked_to_completed, 10)

	def test_group_is_still_mandatory(self):
		"""Removing the approval inputs must not loosen unrelated required fields."""
		with self.assertRaises(frappe.MandatoryError):
			self._make_todo(group=None)


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
				"company": frappe.db.get_value("Company", {}, "name"),
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
			"to_do": "Todo with No Phase Estimates",
			"assigned_to": "test_user@example.com",
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 7),
			"estimated": 15,
			"status": "⚪️ Planned",
			"group": self.group,
			"level_id": self.level_id,
		}).insert(ignore_permissions=True)
		frappe.db.commit()

		extra_todo.reload()

		self.assertEqual(extra_todo.total_estimated_hours, 15,
			"Total should equal the main estimate when no phase estimates are set")


class TestProjectTodoWaiting(FrappeTestCase):
	def setUp(self):
		# Minimal project + detail so validate_create_permission passes (Admin = owner+leader).
		if not frappe.db.exists("Brand", "Test Customer Waiting"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer Waiting",
				"company": frappe.db.get_value("Company", {}, "name")}).insert(ignore_permissions=True)
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
		todo.estimated = 30  # mandatory + >= MIN_ESTIMATED_MINUTES
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


class TestProjectTodoFiles(FrappeTestCase):
	"""Multiple file attachments on a Project Todo via native Frappe File
	attachments. Edit gate mirrors save_notes: assignee / owner / leader / SM."""

	def setUp(self):
		if not frappe.db.exists("Brand", "Test Customer Files"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer Files",
				"company": frappe.db.get_value("Company", {}, "name")}).insert(ignore_permissions=True)
		self.assignee = "todofiles_user@example.com"
		self.other = "todofiles_other@example.com"
		for email, fn in ((self.assignee, "TodoFiles"), (self.other, "OtherFiles")):
			# Downloading a todo file goes through has_permission("read") — the reader
			# needs one of the project roles, not just team membership.
			ensure_user(email, fn, roles=("Project Team",))
		self.project = frappe.get_doc({
			"doctype": "Project",
			"project_name": "Todo Files Test Project",
			"brand": "Test Customer Files",
			"project_owner": "Administrator",
			"project_leader": "Administrator",
			"status": "Ongoing",
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 30),
			"team_members": [{"user": "Administrator"}, {"user": self.assignee}, {"user": self.other}],
		}).insert(ignore_permissions=True)
		self.group, self.level_id = _ensure_test_group()
		grouping = frappe.get_doc({"doctype": "Glossary", "glossary": "Todo Files Grouping", "project": self.project.name}).insert(ignore_permissions=True)
		self.grouping_name = grouping.name
		self.project_detail = frappe.get_doc({
			"doctype": "Project Detail",
			"project": self.project.name,
			"title": "Todo Files Detail",
			"grouping": grouping.name,
			"project_deadline": add_days(nowdate(), 30),
			"estimated": 60,
		}).insert(ignore_permissions=True)
		self.todo = frappe.get_doc({
			"doctype": "Project Todo",
			"project_detail": self.project_detail.name,
			"to_do": "Todo with files",
			"assigned_to": self.assignee,
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 5),
			"estimated": 30,
			"status": "⚪️ Planned",
			"group": self.group,
			"level_id": self.level_id,
		}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for fn in frappe.get_all("File", filters={"attached_to_doctype": "Project Todo", "attached_to_name": self.todo.name}, pluck="name"):
			frappe.delete_doc("File", fn, force=True, ignore_permissions=True)
		for name in frappe.get_all("Project Todo", filters={"project_detail": self.project_detail.name}, pluck="name"):
			frappe.db.set_value("Project Todo", name, "status", "⚪️ Planned", update_modified=False)
			frappe.delete_doc("Project Todo", name, force=True, ignore_permissions=True)
		frappe.delete_doc("Project Detail", self.project_detail.name, force=True, ignore_permissions=True)
		frappe.delete_doc("Glossary", self.grouping_name, force=True, ignore_permissions=True)
		frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_attach_lists_multiple_private_files(self):
		"""A todo can hold several files; all stored private and listed oldest-first."""
		from vernon_project.api.project_todo import _attach_file_to_todo, list_todo_files
		_attach_file_to_todo(self.todo.name, "alpha.txt", b"alpha-bytes")
		_attach_file_to_todo(self.todo.name, "beta.txt", b"beta-bytes")
		rows = list_todo_files(self.todo.name)
		self.assertEqual(len(rows), 2, "both files should be attached to the todo")
		self.assertTrue(all(r["is_private"] for r in rows), "todo files must be private")
		self.assertTrue(all(r["file_url"].startswith("/private/files/") for r in rows))

	def test_assignee_can_attach(self):
		"""Assignee (read-only Team role) may attach — matches save_notes gate."""
		from vernon_project.api.project_todo import _attach_file_to_todo, list_todo_files
		frappe.set_user(self.assignee)
		try:
			_attach_file_to_todo(self.todo.name, "mine.txt", b"x")
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(len(list_todo_files(self.todo.name)), 1)

	def test_delete_removes_file(self):
		from vernon_project.api.project_todo import _attach_file_to_todo, list_todo_files, delete_todo_file
		row = _attach_file_to_todo(self.todo.name, "gone.txt", b"bye")
		delete_todo_file(self.todo.name, row["name"])
		self.assertEqual(list_todo_files(self.todo.name), [])

	def test_non_editor_cannot_attach_or_delete(self):
		"""A plain team member (not assignee/owner/leader/SM) is rejected."""
		from vernon_project.api.project_todo import _attach_file_to_todo, delete_todo_file
		row = _attach_file_to_todo(self.todo.name, "admin.txt", b"a")  # as Administrator
		frappe.set_user(self.other)
		try:
			with self.assertRaises(frappe.PermissionError):
				_attach_file_to_todo(self.todo.name, "sneaky.txt", b"s")
			with self.assertRaises(frappe.PermissionError):
				delete_todo_file(self.todo.name, row["name"])
		finally:
			frappe.set_user("Administrator")

	def test_delete_rejects_file_not_attached_to_this_todo(self):
		"""Cross-doc guard: deleting a File attached elsewhere must fail, file survives."""
		from frappe.utils.file_manager import save_file
		from vernon_project.api.project_todo import delete_todo_file
		foreign = save_file("foreign.txt", b"f", "Project Detail", self.project_detail.name, is_private=1)
		with self.assertRaises(frappe.ValidationError):
			delete_todo_file(self.todo.name, foreign.name)
		self.assertTrue(frappe.db.exists("File", foreign.name), "foreign file must not be deleted")
		frappe.delete_doc("File", foreign.name, force=True, ignore_permissions=True)

	def test_done_todo_files_are_frozen(self):
		"""52r6l30cs4: files are part of a done todo's frozen information — no upload,
		no delete (comments stay open). Reopened to Planned, both work again."""
		from vernon_project.api.project_todo import _attach_file_to_todo, delete_todo_file, list_todo_files
		row = _attach_file_to_todo(self.todo.name, "before.txt", b"b")
		frappe.db.set_value("Project Todo", self.todo.name, "status", "🟠 Done", update_modified=False)
		with self.assertRaisesRegex(frappe.ValidationError, "already marked done"):
			_attach_file_to_todo(self.todo.name, "after.txt", b"a")
		with self.assertRaisesRegex(frappe.ValidationError, "already marked done"):
			delete_todo_file(self.todo.name, row["name"])
		self.assertEqual([r["name"] for r in list_todo_files(self.todo.name)], [row["name"]])
		frappe.db.set_value("Project Todo", self.todo.name, "status", "⚪️ Planned", update_modified=False)
		delete_todo_file(self.todo.name, row["name"])
		self.assertEqual(list_todo_files(self.todo.name), [])

	def test_download_streams_content_for_reader(self):
		"""A user who can read the todo gets the file bytes back as a download —
		the Cloudflare-safe path for .html attachments."""
		from vernon_project.api.project_todo import _attach_file_to_todo, download_todo_file
		row = _attach_file_to_todo(self.todo.name, "report.html", b"<h1>hi</h1>")
		frappe.set_user(self.assignee)
		try:
			frappe.local.response = frappe._dict()
			download_todo_file(self.todo.name, row["name"])
			self.assertEqual(frappe.local.response.type, "download")
			# File.get_content() decodes text files to str; bytes for binary. Normalise
			# so the assertion is about the content, not its transport type.
			content = frappe.local.response.filecontent
			if isinstance(content, bytes):
				content = content.decode()
			self.assertEqual(content, "<h1>hi</h1>")
			# Frappe may de-duplicate the stored name (report.html -> reportXXXX.html);
			# what matters for the Cloudflare-safe path is that the .html extension
			# survives onto the download filename.
			self.assertTrue(frappe.local.response.filename.endswith(".html"))
		finally:
			frappe.set_user("Administrator")

	def test_download_rejects_file_not_attached_to_this_todo(self):
		"""Cross-doc guard: a caller can't pull a File attached elsewhere by name."""
		from frappe.utils.file_manager import save_file
		from vernon_project.api.project_todo import download_todo_file
		foreign = save_file("foreign.html", b"secret", "Project Detail", self.project_detail.name, is_private=1)
		with self.assertRaises(frappe.ValidationError):
			download_todo_file(self.todo.name, foreign.name)
		self.assertTrue(frappe.db.exists("File", foreign.name), "foreign file must survive")
		frappe.delete_doc("File", foreign.name, force=True, ignore_permissions=True)


class TestUndoApproval(unittest.TestCase):
	"""undo_approval: self-service one-step-back on the approval gates, plus the
	Completed branch's point/recurrence reversal.

	Own fixture (not TestProjectTodo's) because owner MUST differ from leader
	here: TestProjectTodo's shared project has leader==owner==Administrator,
	which makes _auto_advance collapse Done straight through to Completed in
	one hop (leader-is-owner auto-clears the Owner gate too) — that's correct
	product behavior, but it leaves no "Checked" state to undo independently.
	"""

	OWNER = "Administrator"
	LEADER = "undo_leader@example.com"
	ASSIGNEE = "undo_assignee@example.com"

	def setUp(self):
		for email, first in ((self.LEADER, "UndoLeader"), (self.ASSIGNEE, "UndoAssignee")):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": first, "send_welcome_email": 0,
				}).insert(ignore_permissions=True)
		frappe.get_doc("User", self.LEADER).add_roles("Project Leader")

		if not frappe.db.exists("Brand", "Undo Test Brand"):
			frappe.get_doc({
				"doctype": "Brand",
				"brand_name": "Undo Test Brand",
				"company": frappe.db.get_value("Company", {}, "name"),
			}).insert(ignore_permissions=True)

		self.project = frappe.get_doc({
			"doctype": "Project",
			"project_name": "Undo Approval Test Project",
			"brand": "Undo Test Brand",
			"project_owner": self.OWNER,
			"project_leader": self.LEADER,
			"status": "Ongoing",
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 30),
			"team_members": [{"user": self.OWNER}, {"user": self.LEADER}, {"user": self.ASSIGNEE}],
		}).insert(ignore_permissions=True)

		self.group, self.level_id = _ensure_test_group()
		self.grouping = frappe.get_doc({
			"doctype": "Glossary", "glossary": "Undo Test Grouping", "project": self.project.name,
		}).insert(ignore_permissions=True).name
		self.project_detail = frappe.get_doc({
			"doctype": "Project Detail",
			"project": self.project.name,
			"title": "Undo Test Detail",
			"grouping": self.grouping,
			"project_deadline": add_days(nowdate(), 30),
			"estimated": 100,
		}).insert(ignore_permissions=True)

		self.todo = self._make_todo()

	def tearDown(self):
		frappe.set_user("Administrator")
		for name in frappe.get_all(
			"Project Todo", filters={"project_detail": self.project_detail.name}, pluck="name"
		):
			frappe.db.set_value("Project Todo", name, "status", "⚪️ Planned", update_modified=False)
			frappe.delete_doc("Project Todo", name, ignore_permissions=True, force=True)
		frappe.delete_doc("Project Detail", self.project_detail.name, ignore_permissions=True, force=True)
		frappe.delete_doc("Glossary", self.grouping, ignore_permissions=True, force=True)
		frappe.delete_doc("Project", self.project.name, ignore_permissions=True, force=True)
		frappe.db.commit()

	def _make_todo(self, **overrides):
		fields = {
			"doctype": "Project Todo",
			"project_detail": self.project_detail.name,
			"to_do": "undo test task",
			"assigned_to": self.ASSIGNEE,
			"deadline": add_days(nowdate(), 5),
			"estimated": 60,
			"status": "⚪️ Planned",
			"group": self.group,
			"level_id": self.level_id,
		}
		fields.update(overrides)
		fields.setdefault("start_date", fields["deadline"])
		return frappe.get_doc(fields).insert(ignore_permissions=True)

	def _make_recurring_todo(self, frequency=None, **over):
		fields = {"is_recurring": 1}
		if frequency is not None:
			fields["recurring_frequency"] = frequency
		fields.update(over)
		return self._make_todo(**fields)

	def _advance(self, as_user, todo_name=None):
		from vernon_project.api.project_todo import update_status
		frappe.set_user(as_user)
		res = update_status(todo_name or self.todo.name)
		frappe.set_user("Administrator")
		self.assertNotEqual(res.get("status"), "error", res.get("message"))
		return res

	def test_undo_reverts_leader_gate_to_done(self):
		from vernon_project.api.project_todo import undo_approval
		self._advance(self.ASSIGNEE)  # Planned -> Done
		self._advance(self.LEADER)  # Done -> Checked (Leader gate only, owner differs)
		self.todo.reload()
		self.assertEqual(self.todo.status, "🔷 Checked By PL")
		self.assertEqual(self.todo.tested_by, self.LEADER)

		res = undo_approval(self.todo.name)  # as Administrator, but only tested_by may undo
		self.assertEqual(res.get("status"), "error", "Administrator never cleared this gate, so undo must refuse")

		frappe.set_user(self.LEADER)
		res = undo_approval(self.todo.name)
		frappe.set_user("Administrator")
		self.assertEqual(res.get("status"), "info", res.get("message"))
		self.todo.reload()
		self.assertEqual(self.todo.status, "🟠 Done")
		self.assertIsNone(self.todo.tested_by)
		self.assertIsNone(self.todo.tested_at)

	def test_undo_reverts_owner_gate_and_unmints_points(self):
		from vernon_project.api.project_todo import undo_approval
		self._advance(self.ASSIGNEE)  # Planned -> Done
		self._advance(self.LEADER)  # Done -> Checked
		self._advance(self.OWNER)  # Checked -> Completed (mints points)
		self.todo.reload()
		self.assertEqual(self.todo.status, "✅ Completed")
		self.assertTrue(
			frappe.db.exists("Point Ledger", {"todo": self.todo.name, "role": "Assignee"}),
			"Completing should mint an Assignee Point Ledger row",
		)

		frappe.set_user(self.OWNER)
		res = undo_approval(self.todo.name)
		self.assertEqual(res.get("status"), "info", res.get("message"))
		self.todo.reload()
		self.assertEqual(self.todo.status, "🔷 Checked By PL")
		self.assertIsNone(self.todo.completed_by)
		self.assertIsNone(self.todo.completed_at)
		self.assertFalse(
			frappe.db.exists("Point Ledger", {"todo": self.todo.name, "role": "Assignee"}),
			"Undoing the Completion should un-mint the ledger row (on_change's prev_state handling)",
		)

	def test_undo_deletes_pristine_auto_generated_recurrence(self):
		from vernon_project.api.project_todo import undo_approval
		orig_name = self._make_recurring_todo(frequency="Daily").name

		self._advance(self.ASSIGNEE, orig_name)  # Planned -> Done
		self._advance(self.LEADER, orig_name)  # Done -> Checked
		self._advance(self.OWNER, orig_name)  # Checked -> Completed

		next_occurrence = frappe.get_all(
			"Project Todo", filters={"original_todo": orig_name, "status": "⚪️ Planned"}, pluck="name"
		)
		self.assertEqual(len(next_occurrence), 1, "Completing a recurring todo should queue exactly one successor")

		frappe.set_user(self.OWNER)
		res = undo_approval(orig_name)
		frappe.set_user("Administrator")
		self.assertEqual(res.get("status"), "info", res.get("message"))
		self.assertFalse(
			frappe.db.exists("Project Todo", next_occurrence[0]),
			"Undo should delete the still-pristine auto-generated successor",
		)

	def test_undo_refuses_when_not_your_approval(self):
		"""Someone other than the approver can't undo it, even the Owner."""
		from vernon_project.api.project_todo import undo_approval
		self._advance(self.ASSIGNEE)  # Planned -> Done
		self._advance(self.LEADER)  # Done -> Checked, tested_by=LEADER

		frappe.set_user(self.OWNER)
		res = undo_approval(self.todo.name)
		self.assertEqual(res.get("status"), "error")

		self.todo.reload()
		self.assertEqual(self.todo.status, "🔷 Checked By PL", "status must be untouched by the refused undo")

	def test_undo_refuses_on_planned_todo(self):
		from vernon_project.api.project_todo import undo_approval
		self.todo.reload()
		self.assertEqual(self.todo.status, "⚪️ Planned")
		res = undo_approval(self.todo.name)
		self.assertEqual(res.get("status"), "error")


def run_tests():
	"""Helper function to run all tests"""
	loader = unittest.TestLoader()
	suite = unittest.TestSuite()

	suite.addTests(loader.loadTestsFromTestCase(TestProjectTodo))
	suite.addTests(loader.loadTestsFromTestCase(TestUndoApproval))
	suite.addTests(loader.loadTestsFromTestCase(TestProjectTodoPhaseTracking))
	suite.addTests(loader.loadTestsFromTestCase(TestProjectTodoFiles))

	runner = unittest.TextTestRunner(verbosity=2)
	result = runner.run(suite)

	return result


if __name__ == "__main__":
	run_tests()


class TestLatenessCountsFromCreation(unittest.TestCase):
	"""A todo can't be late for days before it existed: a backfilled routine occurrence
	(created 2026-09-11 for a 2026-09-07 date the dead scheduler skipped) must not be
	charged 30%/day for the outage. Normal todos (created before their deadline) unchanged."""

	def earned(self, deadline, created, done):
		from unittest.mock import patch
		t = frappe.new_doc("Project Todo")
		t.update({"group": "G", "point": 100, "deadline": deadline, "done_started_at": done})
		t.creation = created
		grp = frappe._dict(late_penalty=30, early_bonus=10, leader_weight=10,
			leader_late_weight=50, mentor_weight=0)
		with patch.object(frappe, "get_doc", lambda *a, **k: grp):
			assignee, leader, _m, late, early = t._compute_earned()
		return assignee, late, early

	def test_backfilled_todo_is_late_only_from_its_creation_day(self):
		self.assertEqual(self.earned("2026-09-07", "2026-09-11 20:00:00", "2026-09-12 09:00:00"), (70, 1, 0))

	def test_backfilled_todo_done_on_creation_day_is_on_time(self):
		self.assertEqual(self.earned("2026-09-07", "2026-09-11 20:00:00", "2026-09-11 21:00:00"), (100, 0, 0))

	def test_normal_todo_lateness_unchanged(self):
		self.assertEqual(self.earned("2026-09-07", "2026-09-01 08:00:00", "2026-09-09 10:00:00"), (40, 2, 0))
		self.assertEqual(self.earned("2026-09-07", "2026-09-01 08:00:00", "2026-09-05 10:00:00"), (120, 0, 2))
