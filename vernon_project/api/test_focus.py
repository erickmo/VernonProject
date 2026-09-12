# Copyright (c) 2026, Vernon and Contributors
# See license.txt

import json
import unittest

import frappe
from frappe.utils import add_days, nowdate

from vernon_project.api.focus import list_focus, reorder_focus, save_timer, set_note, stop_timer
from vernon_project.tests.no_leak import NoLeakMixin


class _FocusFixture(NoLeakMixin, unittest.TestCase):
	"""Two real users on one project, three todos assigned to focus_owner. Holds no
	tests itself — TestReorderFocus and TestFocusPersistence both build on it."""

	def setUp(self):
		if not frappe.db.exists("User", "focus_owner@example.com"):
			frappe.get_doc({"doctype": "User", "email": "focus_owner@example.com",
				"first_name": "Focus", "send_welcome_email": 0}).insert(ignore_permissions=True)
		if not frappe.db.exists("User", "focus_other@example.com"):
			frappe.get_doc({"doctype": "User", "email": "focus_other@example.com",
				"first_name": "Other", "send_welcome_email": 0}).insert(ignore_permissions=True)
		if not frappe.db.exists("Brand", "Focus Test Brand"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Focus Test Brand",
				"company": frappe.db.get_value("Company", {}, "name")}).insert(ignore_permissions=True)
		if not frappe.db.exists("Group", "Focus Test Group"):
			frappe.get_doc({
				"doctype": "Group", "group_name": "Focus Test Group", "base_rate_per_minute": 1,
				"levels": [{"type_name": "General", "level_name": "L1",
					"level_id": "FOCUSLVL1", "difficulty_percent": 100}],
			}).insert(ignore_permissions=True)
		project = frappe.get_doc({
			"doctype": "Project", "project_name": "Focus Test Project", "brand": "Focus Test Brand",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": "focus_owner@example.com"}, {"user": "focus_other@example.com"}],
		}).insert(ignore_permissions=True)
		grouping = frappe.get_doc({"doctype": "Glossary", "glossary": "Focus Test Grouping",
			"project": project.name}).insert(ignore_permissions=True)
		detail = frappe.get_doc({"doctype": "Project Detail", "project": project.name,
			"title": "Focus Test Detail", "grouping": grouping.name,
			"project_deadline": add_days(nowdate(), 30), "estimated": 100}).insert(ignore_permissions=True)
		self.project, self.grouping, self.detail = project, grouping, detail
		self.tasks = [self._todo(f"Focus Task {i}") for i in range(3)]
		frappe.db.commit()

	def _todo(self, title):
		return frappe.get_doc({
			"doctype": "Project Todo", "project_detail": self.detail.name, "to_do": title,
			"assigned_to": "focus_owner@example.com", "group": "Focus Test Group",
			"level_id": "FOCUSLVL1", "estimated": 30, "status": "⚪️ Planned",
			"start_date": nowdate(), "deadline": add_days(nowdate(), 30),
		}).insert(ignore_permissions=True).name

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.delete("Focus Timer", {"task": ["in", self.tasks]})
		for name in self.tasks:
			frappe.delete_doc("Project Todo", name, ignore_permissions=True, force=True)
		frappe.delete_doc("Project Detail", self.detail.name, ignore_permissions=True, force=True)
		frappe.delete_doc("Glossary", self.grouping.name, ignore_permissions=True, force=True)
		frappe.delete_doc("Project", self.project.name, ignore_permissions=True, force=True)
		frappe.db.commit()

	def _start(self, user, task):
		frappe.set_user(user)
		save_timer(task=task, task_title=task, estimated_ms=0, status="running", started_at_ms=1, elapsed_before_ms=0)


class TestReorderFocus(_FocusFixture):
	"""reorder_focus is the security boundary for drag-to-reorder: a payload must be
	exactly the caller's own active (running/paused) task ids, permuted — never an
	arbitrary list, never another user's row."""

	def test_valid_permutation_persists_and_is_read_back_in_order(self):
		a, b, c = self.tasks
		for t in (a, b, c):
			self._start("focus_owner@example.com", t)
		reorder_focus([c, a, b])
		rows = list_focus()
		active = [r["taskId"] for r in rows if r["status"] in ("running", "paused")]
		self.assertEqual(active, [c, a, b])

	def test_rejects_payload_missing_one_of_the_callers_own_tasks(self):
		a, b = self.tasks[0], self.tasks[1]
		self._start("focus_owner@example.com", a)
		self._start("focus_owner@example.com", b)
		with self.assertRaises(frappe.PermissionError):
			reorder_focus([a])

	def test_rejects_payload_containing_an_id_the_caller_never_focused(self):
		a = self.tasks[0]
		unfocused = self.tasks[2]
		self._start("focus_owner@example.com", a)
		with self.assertRaises(frappe.PermissionError):
			reorder_focus([a, unfocused])

	def test_cannot_reorder_another_users_focus_row(self):
		"""Same task, focused by two different users → reordering one user's list
		must never touch the other user's row (ownership, not just membership)."""
		a, b = self.tasks[0], self.tasks[1]
		self._start("focus_owner@example.com", a)
		self._start("focus_owner@example.com", b)
		self._start("focus_other@example.com", a)
		frappe.set_user("focus_owner@example.com")
		reorder_focus([b, a])
		other_sort_order = frappe.db.get_value(
			"Focus Timer", {"user": "focus_other@example.com", "task": a}, "sort_order"
		)
		self.assertEqual(other_sort_order, 0, "other user's row untouched")


class TestFocusPersistence(_FocusFixture):
	"""Focus state lives in the `Focus Timer` table, not in the browser. These cover
	the parts nothing else did: that a timer really reaches the database, that it
	reads back on a fresh request, that it never crosses between users, and that the
	owner lookup is indexed."""

	@staticmethod
	def _count_queries(fn):
		"""How many queries `fn` issues. frappe.get_all runs through frappe.db.sql
		(the query builder's run() calls it), so counting there sees it."""
		count = 0
		original = frappe.db.sql

		def counting(*args, **kwargs):
			nonlocal count
			count += 1
			return original(*args, **kwargs)

		frappe.db.sql = counting
		try:
			fn()
		finally:
			frappe.db.sql = original
		return count

	def _db(self, user, task, field):
		"""Read straight from the table — proves the value reached the database, not
		just a request-local Document."""
		return frappe.db.get_value("Focus Timer", {"user": user, "task": task}, field)

	def test_starting_a_timer_writes_every_field_to_the_database(self):
		task = self.tasks[0]
		frappe.set_user("focus_owner@example.com")
		save_timer(task=task, task_title="Written", estimated_ms=1800000, status="running",
			started_at_ms=1700000000000, elapsed_before_ms=5000, meta={"project": "P"})
		row = frappe.db.get_value(
			"Focus Timer", {"user": "focus_owner@example.com", "task": task},
			["task_title", "estimated_ms", "status", "started_at_ms", "elapsed_before_ms", "task_meta"],
			as_dict=True,
		)
		self.assertEqual(row.task_title, "Written")
		self.assertEqual(row.estimated_ms, 1800000)
		self.assertEqual(row.status, "running")
		self.assertEqual(row.started_at_ms, 1700000000000)
		self.assertEqual(row.elapsed_before_ms, 5000)
		self.assertEqual(json.loads(row.task_meta), {"project": "P"})

	def test_state_reads_back_on_a_fresh_request(self):
		"""What a reload on another device does: list_focus goes to the database, so a
		timer held only in page memory or localStorage would be absent here."""
		task = self.tasks[0]
		self._start("focus_owner@example.com", task)
		save_timer(task=task, task_title=task, estimated_ms=0, status="paused",
			started_at_ms=1, elapsed_before_ms=90000)
		frappe.db.commit()
		frappe.clear_document_cache("Focus Timer", self._db("focus_owner@example.com", task, "name"))
		frappe.set_user("focus_owner@example.com")
		rows = [r for r in list_focus() if r["taskId"] == task]
		self.assertEqual(len(rows), 1)
		self.assertEqual(rows[0]["status"], "paused")
		self.assertEqual(rows[0]["elapsedBeforeMs"], 90000)

	def test_repeated_save_updates_one_row_instead_of_duplicating(self):
		task = self.tasks[0]
		for ms in (1000, 2000, 3000):
			frappe.set_user("focus_owner@example.com")
			save_timer(task=task, task_title=task, estimated_ms=0, status="running",
				started_at_ms=1, elapsed_before_ms=ms)
		names = frappe.get_all("Focus Timer", filters={"user": "focus_owner@example.com", "task": task}, pluck="name")
		self.assertEqual(len(names), 1, "save_timer upserts — one row per (user, task)")
		self.assertEqual(self._db("focus_owner@example.com", task, "elapsed_before_ms"), 3000)

	def test_another_user_never_sees_the_owners_focus(self):
		task = self.tasks[0]
		self._start("focus_owner@example.com", task)
		frappe.set_user("focus_other@example.com")
		self.assertEqual([r for r in list_focus() if r["taskId"] == task], [],
			"list_focus is scoped to frappe.session.user, never to a client argument")

	def test_another_user_saving_the_same_task_gets_their_own_row(self):
		"""Two people focusing one task is two rows. The second writer must not land
		on the first one's row."""
		task = self.tasks[0]
		frappe.set_user("focus_owner@example.com")
		save_timer(task=task, task_title=task, estimated_ms=0, status="running",
			started_at_ms=1, elapsed_before_ms=111)
		frappe.set_user("focus_other@example.com")
		save_timer(task=task, task_title=task, estimated_ms=0, status="running",
			started_at_ms=1, elapsed_before_ms=999)
		self.assertEqual(self._db("focus_owner@example.com", task, "elapsed_before_ms"), 111)
		self.assertEqual(self._db("focus_other@example.com", task, "elapsed_before_ms"), 999)

	def test_another_user_cannot_stop_the_owners_timer(self):
		task = self.tasks[0]
		self._start("focus_owner@example.com", task)
		frappe.set_user("focus_other@example.com")
		stop_timer(task)
		self.assertTrue(
			frappe.db.exists("Focus Timer", {"user": "focus_owner@example.com", "task": task}),
			"stop_timer resolves the row by (session user, task) — it can only reach the caller's own",
		)

	def test_a_logged_out_caller_is_refused(self):
		frappe.set_user("Guest")
		with self.assertRaises(frappe.PermissionError):
			list_focus()
		with self.assertRaises(frappe.PermissionError):
			save_timer(task=self.tasks[0], task_title="x")

	def test_the_note_outlives_the_timer_but_a_note_less_row_is_deleted(self):
		"""focus.py's stated contract: stopping keeps the row only if it carries a
		note, so the note comes back when the task is focused again on any device."""
		noted, bare = self.tasks[0], self.tasks[1]
		self._start("focus_owner@example.com", noted)
		self._start("focus_owner@example.com", bare)
		frappe.set_user("focus_owner@example.com")
		set_note(noted, "carry me")
		stop_timer(noted)
		stop_timer(bare)
		self.assertEqual(self._db("focus_owner@example.com", noted, "note"), "carry me")
		self.assertEqual(self._db("focus_owner@example.com", noted, "status"), "idle")
		self.assertIsNone(self._db("focus_owner@example.com", bare, "name"),
			"a timer with no note leaves nothing behind")

	def test_the_owner_filter_is_indexed(self):
		"""The performance gate. Every focus read filters on `user`, and each open tab
		hydrates on load, on every realtime ping and every 60 seconds. Unindexed, that
		is a full table scan each time. EXPLAIN rather than a timing, so it cannot go
		green by accident just because the table is small today."""
		plan = frappe.db.sql(
			"EXPLAIN SELECT name FROM `tabFocus Timer` WHERE user=%s", ("focus_owner@example.com",), as_dict=True
		)[0]
		self.assertIsNotNone(plan["key"], f"no index used on the focus owner filter: {plan}")
		self.assertNotEqual(plan["type"], "ALL", f"full table scan on the focus owner filter: {plan}")

	def test_reading_the_focus_list_does_not_scale_queries_with_timers(self):
		"""No N+1: list_focus is a single get_all, so three timers must cost the same
		number of queries as one."""
		self._start("focus_owner@example.com", self.tasks[0])
		frappe.set_user("focus_owner@example.com")
		one = self._count_queries(list_focus)
		self.assertGreater(one, 0, "the query counter is not observing anything — the test would be vacuous")
		for task in self.tasks[1:]:
			self._start("focus_owner@example.com", task)
		frappe.set_user("focus_owner@example.com")
		three = self._count_queries(list_focus)
		self.assertEqual(one, three, "list_focus must cost the same whatever the number of timers")


def run_tests():
	"""Helper function to run all tests"""
	loader = unittest.TestLoader()
	suite = unittest.TestSuite()

	suite.addTests(loader.loadTestsFromTestCase(TestReorderFocus))
	suite.addTests(loader.loadTestsFromTestCase(TestFocusPersistence))

	runner = unittest.TextTestRunner(verbosity=2)
	return runner.run(suite)


if __name__ == "__main__":
	run_tests()
