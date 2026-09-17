# Copyright (c) 2026, Vernon and Contributors
# See license.txt
#
# Cross-project task move (ar7b2vuon6). move_todos already reparented a todo
# into another Project Detail of the SAME project; this covers the widening to
# a detail in ANOTHER project, which additionally has to carry the todo's
# denormalized `project` and its Point Ledger history, and is gated harder
# (owner of BOTH projects, same rule move_project_detail uses).
#
# Run: bench --site <site> run-tests --module vernon_project.api.test_move_todos_cross_project

import frappe
import unittest
from frappe.utils import nowdate, add_days
from vernon_project.api.mobile import move_todos, _fetch_todos

BOTH = "mtx_both@example.com"        # owns the source AND the destination project
SRC_ONLY = "mtx_srconly@example.com"  # owns the source project only
MEMBER = "mtx_member@example.com"      # assignee, on both teams
STRANGER = "mtx_stranger@example.com"
USERS = (
	(BOTH, "Mtx Both"),
	(SRC_ONLY, "Mtx SrcOnly"),
	(MEMBER, "Mtx Member"),
	(STRANGER, "Mtx Stranger"),
)


class TestMoveTodosCrossProject(unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		for email, name in USERS:
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": name,
					"send_welcome_email": 0, "enabled": 1,
				}).insert(ignore_permissions=True)
		frappe.get_doc("User", BOTH).add_roles("Project Owner", "Project Leader")
		frappe.get_doc("User", SRC_ONLY).add_roles("Project Owner", "Project Leader")
		self.brand = frappe.get_all("Brand", pluck="name", limit=1)[0]
		self.tag = frappe.generate_hash(length=6)

		self.src = self._project("MTX Src " + self.tag, BOTH, team=[MEMBER])
		self.dst = self._project("MTX Dst " + self.tag, BOTH, team=[MEMBER])
		self.foreign = self._project("MTX Foreign " + self.tag, SRC_ONLY, team=[MEMBER])
		self.closed = self._project("MTX Closed " + self.tag, BOTH, team=[MEMBER], status="Closed")
		self.no_team = self._project("MTX NoTeam " + self.tag, BOTH)

		self.src_a = self._detail(self.src, "SrcA " + self.tag)
		self.src_b = self._detail(self.src, "SrcB " + self.tag)
		self.dst_a = self._detail(self.dst, "DstA " + self.tag)
		self.foreign_a = self._detail(self.foreign, "ForeignA " + self.tag)
		self.closed_a = self._detail(self.closed, "ClosedA " + self.tag)
		self.no_team_a = self._detail(self.no_team, "NoTeamA " + self.tag)

		self.todo = self._todo(self.src_a, MEMBER)
		self.sibling = self._todo(self.src_a, MEMBER)
		self.ledger = frappe.get_doc({
			"doctype": "Point Ledger", "user": MEMBER, "role": "Assignee",
			"todo": self.todo, "project": self.src.name, "source": "Todo", "point": 7.0,
		}).insert(ignore_permissions=True).name
		frappe.db.commit()

	def _project(self, pname, owner, team=(), status="Ongoing"):
		return frappe.get_doc({
			"doctype": "Project", "project_name": pname, "brand": self.brand,
			"project_owner": owner, "project_leader": owner, "status": status,
			"team_members": [{"user": u} for u in team],
			"start_date": nowdate(), "deadline": add_days(nowdate(), 30),
		}).insert(ignore_permissions=True)

	def _detail(self, project, title):
		return frappe.get_doc({
			"doctype": "Project Detail", "project": project.name, "title": title,
		}).insert(ignore_permissions=True)

	def _todo(self, detail, assignee):
		todo = frappe.get_doc({
			"doctype": "Project Todo", "project": detail.project,
			"project_detail": detail.name, "to_do": "task " + self.tag,
			"assigned_to": assignee, "status": "⚪️ Planned",
			"notes": "keep me", "deadline": add_days(nowdate(), 3),
			"work_mode": "AI", "ai_prompt": '[{"name": "p", "prompt": "q"}]',
			"ai_prompt_confirmed": 1, "estimated": 30,
		})
		todo.flags.ignore_validate = True
		todo.insert(ignore_permissions=True, ignore_mandatory=True)
		return todo.name

	def tearDown(self):
		frappe.set_user("Administrator")
		for p in (self.src, self.dst, self.foreign, self.closed, self.no_team):
			frappe.db.delete("Point Ledger", {"project": p.name})
			frappe.db.delete("Project Todo", {"project": p.name})
			frappe.db.delete("Project Detail", {"project": p.name})
			frappe.delete_doc("Project", p.name, ignore_permissions=True, force=1)
		frappe.db.delete("Point Ledger", {"todo": self.todo})
		for email, _ in USERS:
			if frappe.db.exists("User", email):
				frappe.delete_doc("User", email, ignore_permissions=True, force=1)
		frappe.db.commit()

	def _row(self, *fields):
		return frappe.db.get_value("Project Todo", self.todo, list(fields), as_dict=True)

	@staticmethod
	def _count_queries(fn):
		"""How many queries `fn` issues. Same counter test_focus uses: frappe.get_all
		and the query builder both run through frappe.db.sql, so counting there sees
		everything."""
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

	# 1
	def test_moves_an_authorized_task_to_an_eligible_destination_project(self):
		frappe.set_user(BOTH)
		res = move_todos(self.dst_a.name, frappe.as_json([self.todo]))
		self.assertEqual(res["moved"], 1)
		self.assertEqual(self._row("project_detail").project_detail, self.dst_a.name)

	# 2
	def test_persists_the_new_project_after_a_fresh_database_read(self):
		frappe.set_user(BOTH)
		move_todos(self.dst_a.name, frappe.as_json([self.todo]))
		frappe.db.commit()
		fresh = frappe.get_doc("Project Todo", self.todo)
		self.assertEqual(fresh.project, self.dst.name)
		self.assertEqual(fresh.project_detail, self.dst_a.name)
		# Point history is per-project scoring data and has to follow the task.
		self.assertEqual(frappe.db.get_value("Point Ledger", self.ledger, "project"), self.dst.name)

	# 3
	def test_preserves_notes_assignee_deadline_work_mode_and_ai_prompt_state(self):
		before = self._row(
			"to_do", "notes", "assigned_to", "deadline", "work_mode",
			"ai_prompt", "ai_prompt_confirmed", "status", "estimated", "owner", "creation",
		)
		frappe.set_user(BOTH)
		move_todos(self.dst_a.name, frappe.as_json([self.todo]))
		after = self._row(
			"to_do", "notes", "assigned_to", "deadline", "work_mode",
			"ai_prompt", "ai_prompt_confirmed", "status", "estimated", "owner", "creation",
		)
		self.assertEqual(before, after)

	# 4 + 5 + 14
	def test_leaves_the_source_scoped_query_and_appears_in_the_destination(self):
		frappe.set_user(BOTH)
		move_todos(self.dst_a.name, frappe.as_json([self.todo]))
		src_names = [t["name"] for t in _fetch_todos([self.src.name])]
		dst_names = [t["name"] for t in _fetch_todos([self.dst.name])]
		self.assertNotIn(self.todo, src_names)
		self.assertIn(self.todo, dst_names)
		# Counts move with it: the sibling stays behind, exactly one arrives.
		self.assertEqual(src_names, [self.sibling])
		self.assertEqual(len(dst_names), 1)
		self.assertEqual(frappe.db.count("Project Todo", {"project": self.src.name}), 1)
		self.assertEqual(frappe.db.count("Project Todo", {"project": self.dst.name}), 1)

	# 6
	def test_a_destination_equal_to_the_current_detail_is_a_no_op(self):
		frappe.set_user(BOTH)
		res = move_todos(self.src_a.name, frappe.as_json([self.todo]))
		self.assertEqual(res["moved"], 0)
		self.assertEqual(self._row("project", "project_detail"),
			{"project": self.src.name, "project_detail": self.src_a.name})

	# 7
	def test_rejects_a_missing_or_malformed_destination_identifier(self):
		frappe.set_user(BOTH)
		for bad in ("", "no-such-detail", "../../etc/passwd"):
			with self.assertRaises(frappe.ValidationError):
				move_todos(bad, frappe.as_json([self.todo]))
		self.assertEqual(self._row("project_detail").project_detail, self.src_a.name)

	# 8
	def test_rejects_an_archived_or_otherwise_ineligible_destination_project(self):
		frappe.set_user(BOTH)
		with self.assertRaises(frappe.ValidationError):
			move_todos(self.closed_a.name, frappe.as_json([self.todo]))
		self.assertEqual(self._row("project").project, self.src.name)

	# 9
	def test_rejects_a_destination_project_the_actor_cannot_access(self):
		frappe.set_user(SRC_ONLY)  # owns `foreign`, not `dst`
		with self.assertRaises(frappe.PermissionError):
			move_todos(self.dst_a.name, frappe.as_json([self.todo]))
		self.assertEqual(self._row("project").project, self.src.name)

	# 10
	def test_rejects_an_actor_without_task_move_permission(self):
		frappe.set_user(STRANGER)
		with self.assertRaises(frappe.PermissionError):
			move_todos(self.dst_a.name, frappe.as_json([self.todo]))
		self.assertEqual(self._row("project").project, self.src.name)

	# 11 — the assignee may move its own task *within* the project, but that is not
	# authority to push it into a different project.
	def test_scopes_the_source_lookup_so_a_direct_request_cannot_move_it(self):
		frappe.set_user(MEMBER)
		with self.assertRaises(frappe.PermissionError):
			move_todos(self.dst_a.name, frappe.as_json([self.todo]))
		self.assertEqual(self._row("project").project, self.src.name)
		# ...while the same user's same-project move still works.
		self.assertEqual(move_todos(self.src_b.name, frappe.as_json([self.todo]))["moved"], 1)

	# 12
	def test_a_repeated_identical_move_is_idempotent(self):
		frappe.set_user(BOTH)
		before_todos = sum(
			frappe.db.count("Project Todo", {"project": p.name}) for p in (self.src, self.dst)
		)
		before_ledger = frappe.db.count("Point Ledger", {"todo": self.todo})
		self.assertEqual(move_todos(self.dst_a.name, frappe.as_json([self.todo]))["moved"], 1)
		self.assertEqual(move_todos(self.dst_a.name, frappe.as_json([self.todo]))["moved"], 0)
		self.assertEqual(
			sum(frappe.db.count("Project Todo", {"project": p.name}) for p in (self.src, self.dst)),
			before_todos,
		)
		self.assertEqual(frappe.db.count("Point Ledger", {"todo": self.todo}), before_ledger)
		self.assertEqual(self._row("project").project, self.dst.name)

	# 13 — one bad member aborts the batch with nothing written.
	def test_rolls_back_cleanly_when_one_task_in_the_batch_fails(self):
		frappe.set_user(BOTH)
		with self.assertRaises(frappe.ValidationError):
			move_todos(self.dst_a.name, frappe.as_json([self.todo, "nope-does-not-exist"]))
		self.assertEqual(self._row("project", "project_detail"),
			{"project": self.src.name, "project_detail": self.src_a.name})

	# An assignee who is not on the destination team would land on a project whose
	# own validate() rejects them; refuse the whole move instead.
	def test_rejects_a_destination_whose_team_does_not_include_the_assignee(self):
		frappe.set_user(BOTH)
		with self.assertRaises(frappe.ValidationError):
			move_todos(self.no_team_a.name, frappe.as_json([self.todo]))
		self.assertEqual(self._row("project").project, self.src.name)

	# 15 — destination eligibility + team are project-wide facts, so a batch must not
	# re-read them per task. Two tasks may cost at most a couple of queries more than
	# one; an N+1 blows straight past this bound.
	def test_stays_within_the_query_count_bound_for_a_batch(self):
		extra = [self._todo(self.src_a, MEMBER) for _ in range(2)]
		frappe.set_user(BOTH)
		one = self._count_queries(
			lambda: move_todos(self.dst_a.name, frappe.as_json([self.todo]))
		)
		two = self._count_queries(
			lambda: move_todos(self.dst_a.name, frappe.as_json(extra))
		)
		self.assertLessEqual(two - one, 8, f"per-task query cost too high: 1 task={one}, 2 tasks={two}")
