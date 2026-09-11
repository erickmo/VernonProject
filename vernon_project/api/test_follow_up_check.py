import unittest

import frappe
from frappe.utils import add_days, nowdate

import threading

from vernon_project.api.project_todo import FOLLOW_UP_MARKER, follow_up_check

DONE = "🟠 Done"
PLANNED = "⚪️ Planned"
CHECKER = "followup-checker@test.local"


class FollowUpCheckTest(unittest.TestCase):
	"""follow_up_check: spawns a linked "(Follow Up)" todo for another team member,
	marks the source Done, and notifies the checker (whom the controller never
	notifies on its own since it only fires on status transitions)."""

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer"}).insert(
				ignore_permissions=True
			)
		if not frappe.db.exists("Group", "Test Group FU"):
			frappe.get_doc({
				"doctype": "Group", "group_name": "Test Group FU", "base_rate_per_minute": 1,
				"levels": [{"type_name": "General", "level_name": "L1",
							"level_id": "FULVL1", "difficulty_percent": 100}],
			}).insert(ignore_permissions=True)
		if not frappe.db.exists("User", CHECKER):
			frappe.get_doc({
				"doctype": "User", "email": CHECKER, "first_name": "FU Checker",
				"send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		# Project validates owner/leader carry these roles (idempotent add).
		frappe.get_doc("User", CHECKER).add_roles("Project Owner", "Project Leader")
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Follow Up Project", "brand": "Test Customer",
			# Leader/owner ≠ assignee so marking Done stops at Done (the real multi-person
			# handoff). If they were all Administrator, auto_advance self-clears both gates
			# to Completed in one save — correct, but not what this test pins.
			"project_owner": CHECKER, "project_leader": CHECKER,
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 90),
			"team_members": [{"user": "Administrator"}, {"user": CHECKER}],
		}).insert(ignore_permissions=True)
		self.gl = frappe.get_doc({
			"doctype": "Glossary", "glossary": "FU Grouping", "project": self.project.name,
		}).insert(ignore_permissions=True)
		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name,
			"title": "FU Detail", "grouping": self.gl.name,
			"project_deadline": add_days(nowdate(), 60),
		}).insert(ignore_permissions=True)
		self.todo = frappe.get_doc({
			"doctype": "Project Todo", "project_detail": self.detail.name,
			"to_do": "Build widget", "assigned_to": "Administrator", "start_date": nowdate(),
			"deadline": add_days(nowdate(), 7), "group": "Test Group FU", "level_id": "FULVL1",
			"estimated": 30, "status": PLANNED,
		}).insert(ignore_permissions=True)
		self.spawned = []
		frappe.db.commit()

	def test_handoff_spawns_check_todo_marks_done_and_notifies(self):
		res = follow_up_check(self.todo.name, CHECKER, note="cek grafiknya")
		self.spawned.append(res["name"])
		follow = frappe.get_doc("Project Todo", res["name"])

		# New check-todo for person 2, linked back, still Planned, FOLLOW_UP_MARKER title
		# — the marker leads, so it survives even when the source title is truncated.
		self.assertEqual(follow.assigned_to, CHECKER)
		self.assertEqual(follow.status, PLANNED)
		self.assertTrue(follow.to_do.startswith(FOLLOW_UP_MARKER))
		self.assertEqual(follow.notes, "cek grafiknya")
		self.assertIn(self.todo.name, [r.todo for r in follow.blocked_by])

		# Defaults: tomorrow deadline + 10 min + Engineering ▸ Backend Dev ▸ Testing (100%).
		self.assertEqual(str(follow.deadline), add_days(nowdate(), 1))
		self.assertEqual(follow.estimated, 10)
		self.assertEqual(follow.group, "Engineering")
		self.assertEqual(follow.level_id, "eng_be_testing")
		self.assertEqual(follow.level, "Testing")
		self.assertEqual(follow.level_type, "Backend Development")

		# Source marked Done for person 1.
		self.assertEqual(frappe.db.get_value("Project Todo", self.todo.name, "status"), DONE)
		self.assertEqual(res["source_status"], DONE)

		# Checker was notified about the new todo — the whole point.
		self.assertTrue(frappe.db.exists("Vernon Notification", {
			"recipient": CHECKER, "reference_name": res["name"], "type": "Assignment",
		}))

	def test_estimate_and_group_are_overridable(self):
		res = follow_up_check(self.todo.name, CHECKER, estimated=25, group="Engineering",
							  level_id="41bb5abde7", deadline=add_days(nowdate(), 3))  # Backend ▸ Feature (120%)
		self.spawned.append(res["name"])
		follow = frappe.get_doc("Project Todo", res["name"])
		self.assertEqual(follow.estimated, 25)
		self.assertEqual(follow.level_id, "41bb5abde7")
		self.assertEqual(follow.level, "Feature")
		self.assertEqual(str(follow.deadline), add_days(nowdate(), 3))

	def test_low_estimate_is_floored_to_5(self):
		res = follow_up_check(self.todo.name, CHECKER, estimated=2)
		self.spawned.append(res["name"])
		self.assertEqual(frappe.db.get_value("Project Todo", res["name"], "estimated"), 5)

	def test_non_team_assignee_is_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			follow_up_check(self.todo.name, "Guest")

	def test_long_source_title_does_not_overflow_the_140_char_column(self):
		# The bug this fixes: a source title within ~12 chars of 140 used to
		# overflow once " (Follow Up)" was appended, throwing a raw DB error.
		self.todo.to_do = "A" * 135
		self.todo.save(ignore_permissions=True)
		res = follow_up_check(self.todo.name, CHECKER)
		self.spawned.append(res["name"])
		follow = frappe.get_doc("Project Todo", res["name"])
		self.assertLessEqual(len(follow.to_do), 140)
		self.assertTrue(follow.to_do.startswith(FOLLOW_UP_MARKER))

	def test_doctype_level_guard_truncates_an_overlong_to_do(self):
		# Defense in depth: any path that skips follow_up_check's own truncation
		# (a bulk import, a future generator) still can't insert past 140 —
		# validate_to_do_length on the doctype itself is the floor.
		doc = frappe.get_doc({
			"doctype": "Project Todo", "project_detail": self.detail.name,
			"to_do": "B" * 200, "assigned_to": "Administrator", "start_date": nowdate(),
			"deadline": add_days(nowdate(), 7), "group": "Test Group FU", "level_id": "FULVL1",
			"estimated": 30,
		}).insert(ignore_permissions=True)
		self.spawned.append(doc.name)
		self.assertEqual(len(doc.to_do), 140)

	# -- al31hs5kej: one open check per (source, checker) ------------------------------

	def _follow_ups(self):
		return frappe.get_all("Project Todo", filters={"project_detail": self.detail.name, "is_follow_up": 1},
			fields=["name", "assigned_to", "status"])

	def _notices(self):
		return frappe.db.count("Vernon Notification", {"recipient": CHECKER, "type": "Assignment"})

	def test_same_request_twice_returns_the_open_follow_up(self):
		# Two agents closing one todo, or a retry after a lost response: the repeat
		# must hand back the check already open — no twin row, no second ping.
		first = follow_up_check(self.todo.name, CHECKER)
		again = follow_up_check(self.todo.name, CHECKER)
		self.assertEqual(again["name"], first["name"])
		self.assertTrue(again.get("existing"))
		self.assertEqual(again["source_status"], DONE)
		self.assertEqual(len(self._follow_ups()), 1)
		self.assertEqual(self._notices(), 1)

	def test_a_different_checker_gets_their_own_follow_up(self):
		# Same source, another person asked to check: a real, separate todo.
		a = follow_up_check(self.todo.name, CHECKER)
		b = follow_up_check(self.todo.name, "Administrator")
		self.assertNotEqual(a["name"], b["name"])
		self.assertEqual(sorted(f.assigned_to for f in self._follow_ups()), ["Administrator", CHECKER])

	def test_recheck_after_the_previous_check_closed_is_a_new_todo(self):
		# Check failed/cancelled, work redone, checked again: a new cycle, not a twin.
		first = follow_up_check(self.todo.name, CHECKER)
		frappe.db.set_value("Project Todo", first["name"], "status", "🚫 Cancelled")
		frappe.db.commit()
		again = follow_up_check(self.todo.name, CHECKER)
		self.assertNotEqual(again["name"], first["name"])
		self.assertFalse(again.get("existing"))
		self.assertEqual(len(self._follow_ups()), 2)

	def test_stale_snapshot_repeat_still_finds_the_winner(self):
		# REPEATABLE READ: this transaction reads first, then another session hands off
		# and commits. A plain existence check here would still see the old snapshot
		# (no follow-up yet) and insert a twin; the locking read must see the winner.
		site = frappe.local.site
		frappe.db.sql("select name from `tabProject Todo` where name=%s", self.todo.name)  # pin snapshot
		won = {}

		def winner():
			frappe.init(site=site)
			frappe.connect()
			try:
				frappe.set_user("Administrator")
				won.update(follow_up_check(self.todo.name, CHECKER))
			finally:
				frappe.destroy()

		t = threading.Thread(target=winner)
		t.start()
		t.join(30)
		self.assertTrue(won.get("name"), "winner session did not hand off")
		loser = follow_up_check(self.todo.name, CHECKER)
		self.assertEqual(loser["name"], won["name"])
		frappe.db.rollback()  # fresh snapshot, or this count would miss the winner's row too
		self.assertEqual(len(self._follow_ups()), 1)

	def test_unauthorized_caller_gets_permission_error_and_no_row(self):
		outsider = "followup-outsider@test.local"
		if not frappe.db.exists("User", outsider):
			frappe.get_doc({"doctype": "User", "email": outsider, "first_name": "FU Outsider",
				"send_welcome_email": 0}).insert(ignore_permissions=True)
			frappe.db.commit()
		frappe.set_user(outsider)
		with self.assertRaises(frappe.PermissionError):
			follow_up_check(self.todo.name, CHECKER)
		frappe.set_user("Administrator")
		self.assertEqual(self._follow_ups(), [])

	def tearDown(self):
		# Drop this transaction's read snapshot first: a test that pinned an old one would
		# not see another session's committed rows below, and leak them into the next test.
		frappe.db.rollback()
		frappe.set_user("Administrator")
		# Delete EVERY todo in the detail (source + any spawned follow-up). Status is
		# forced Planned first so a Completed/Done row (auto-advance mints a ledger) can
		# be removed, and dependency child rows go with their parent.
		todos = frappe.get_all("Project Todo", filters={"project_detail": self.detail.name}, pluck="name")
		for name in todos:
			frappe.db.set_value("Project Todo", name, "status", PLANNED, update_modified=False)
		for name in todos:
			frappe.delete_doc("Project Todo", name, force=True, ignore_permissions=True)
		frappe.db.delete("Vernon Notification", {"recipient": CHECKER})
		for dt, name in (
			("Project Detail", self.detail.name),
			("Glossary", self.gl.name),
			("Project", self.project.name),
		):
			if frappe.db.exists(dt, name):
				frappe.delete_doc(dt, name, force=True, ignore_permissions=True)
		frappe.db.commit()
