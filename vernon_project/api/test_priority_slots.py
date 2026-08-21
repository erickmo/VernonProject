# Copyright (c) 2026, Vernon and Contributors

import frappe
import unittest
from frappe.utils import add_days, getdate, nowdate
from datetime import timedelta


def _set(**kw):
	for k, v in kw.items():
		frappe.db.set_single_value("Vernon Settings", k, v)


class _PriorityFixture(unittest.TestCase):
	"""Two Projects / Details / two todos on one day for a non-leader assignee. Mirrors
	test_allocations.py's setup. Prio Project 1 is led by prio_leader@example.com — a
	genuinely non-System-Manager leader, so occupancy tests can walk the real leader
	permission branch instead of always short-circuiting on the SM bypass. (Project
	Leader, not Project Owner: the Project Owner DocPerm has if_owner=1, which would
	additionally restrict reads to docs Frappe's own `owner` meta-field says this user
	created — every fixture Project is inserted as Administrator, so that role alone
	would see nothing. Project Leader carries no such restriction.) Prio Project 2 stays
	owner+leader=Administrator, as before."""

	def setUp(self):
		if not frappe.db.exists("User", "prio_assignee@example.com"):
			frappe.get_doc({"doctype": "User", "email": "prio_assignee@example.com",
				"first_name": "Prio", "send_welcome_email": 0}).insert(ignore_permissions=True)
		if not frappe.db.exists("User", "prio_leader@example.com"):
			frappe.get_doc({"doctype": "User", "email": "prio_leader@example.com",
				"first_name": "Prio", "last_name": "Leader", "send_welcome_email": 0,
				"roles": [{"role": "Project Leader"}]}).insert(ignore_permissions=True)
		if not frappe.db.exists("Brand", "Prio Brand"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Prio Brand",
				"company": frappe.db.get_value("Company", {}, "name")}).insert(ignore_permissions=True)
		# Project Todo now requires group/level (per test_project_todo.py's
		# _ensure_test_group helper); "Project Group" doctype no longer exists and
		# Project has no project_group field — both dropped in the group-taxonomy
		# rework. "Group" + one "Group Level" row stands in for both.
		self.group_name = "Prio Group"
		self.level_id = "PRIOLVL1"
		if not frappe.db.exists("Group", self.group_name):
			frappe.get_doc({
				"doctype": "Group", "group_name": self.group_name, "base_rate_per_minute": 1,
				"levels": [{"type_name": "General", "level_name": "L1",
					"level_id": self.level_id, "difficulty_percent": 100}],
			}).insert(ignore_permissions=True)
		self._prev = {
			f: frappe.db.get_single_value("Vernon Settings", f)
			for f in ("daily_priority_slots", "max_project_priorities_per_day", "priority_miss_penalty")
		}
		_set(daily_priority_slots=3, max_project_priorities_per_day=2, priority_miss_penalty=250)
		self.day = str(add_days(nowdate(), 3))
		self.projects, self.details = [], []
		for i in (1, 2):
			p = frappe.get_doc({
				"doctype": "Project", "project_name": f"Prio Project {i}", "brand": "Prio Brand",
				"project_owner": "Administrator",
				"project_leader": "prio_leader@example.com" if i == 1 else "Administrator",
				"status": "Ongoing", "start_date": nowdate(),
				"deadline": add_days(nowdate(), 30),
				"team_members": [{"user": "Administrator"}, {"user": "prio_assignee@example.com"}],
			}).insert(ignore_permissions=True)
			g = frappe.get_doc({"doctype": "Glossary", "glossary": f"Prio Grouping {i}",
				"project": p.name}).insert(ignore_permissions=True)
			d = frappe.get_doc({"doctype": "Project Detail", "project": p.name,
				"title": f"Prio Detail {i}", "grouping": g.name,
				"project_deadline": add_days(nowdate(), 30), "estimated": 100}).insert(ignore_permissions=True)
			self.projects.append((p, g))
			self.details.append(d)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for d in self.details:
			for name in frappe.get_all("Project Todo", filters={"project_detail": d.name}, pluck="name"):
				for pl in frappe.get_all("Point Ledger", filters={"todo": name}, pluck="name"):
					frappe.delete_doc("Point Ledger", pl, ignore_permissions=True, force=True)
				frappe.db.set_value("Project Todo", name, "status", "⚪️ Planned", update_modified=False)
				frappe.delete_doc("Project Todo", name, ignore_permissions=True, force=True)
			frappe.delete_doc("Project Detail", d.name, ignore_permissions=True, force=True)
		for p, g in self.projects:
			frappe.delete_doc("Glossary", g.name, ignore_permissions=True, force=True)
			frappe.delete_doc("Project", p.name, ignore_permissions=True, force=True)
		_set(**self._prev)
		frappe.db.commit()

	def _todo(self, detail_idx=0, day=None, priority=1, status="⚪️ Planned"):
		deadline = day or self.day
		return frappe.get_doc({
			"doctype": "Project Todo", "project_detail": self.details[detail_idx].name,
			"to_do": "Prio Todo", "assigned_to": "prio_assignee@example.com",
			"start_date": deadline, "deadline": deadline, "estimated": 30,
			"status": status, "is_priority": priority,
			"group": self.group_name, "level_id": self.level_id,
		}).insert(ignore_permissions=True)


class TestSlotCap(_PriorityFixture):
	def test_within_cap_allowed(self):
		self._todo(0)
		self._todo(1)
		self.assertEqual(len(frappe.get_all("Project Todo", filters={
			"is_priority": 1, "assigned_to": "prio_assignee@example.com", "deadline": self.day})), 2)

	def test_fourth_priority_rejected(self):
		self._todo(0)
		self._todo(0)
		self._todo(1)
		with self.assertRaises(frappe.ValidationError):
			self._todo(1)

	def test_per_project_cap_rejected(self):
		self._todo(0)
		self._todo(0)
		with self.assertRaises(frappe.ValidationError):
			self._todo(0)  # third from the SAME project, day still has a free slot

	def test_cancelled_priority_frees_its_slot(self):
		a = self._todo(0)
		self._todo(0)
		self._todo(1)
		a.status = "🚫 Cancelled"
		a.save(ignore_permissions=True)
		self._todo(1)  # must not raise — the cancelled one no longer occupies a slot

	def test_feature_off_ignores_cap(self):
		_set(daily_priority_slots=0)
		for _ in range(5):
			self._todo(0)

	def test_non_priority_todos_do_not_consume_slots(self):
		for _ in range(5):
			self._todo(0, priority=0)
		self._todo(0)


class TestMissedPriorityCharge(_PriorityFixture):
	def _charge(self, *todo_names):
		from vernon_project.tasks import charge_missed_priorities
		return charge_missed_priorities(todo_names=todo_names or None)

	def test_charges_once_and_is_idempotent(self):
		t = self._todo(0, day=str(add_days(nowdate(), -1)))
		self.assertEqual(self._charge(t.name), 1)
		self.assertEqual(self._charge(t.name), 0)
		rows = frappe.get_all("Point Ledger", filters={"todo": t.name, "source": "Priority"},
			fields=["points_earned", "user"])
		self.assertEqual(len(rows), 1)
		self.assertEqual(rows[0].points_earned, -250)
		self.assertEqual(rows[0].user, "prio_assignee@example.com")

	def test_done_priority_not_charged(self):
		t = self._todo(0, day=str(add_days(nowdate(), -1)), status="🟠 Done")
		self.assertEqual(self._charge(t.name), 0)

	def test_future_priority_not_charged(self):
		t = self._todo(0)  # deadline is 3 days out
		self.assertEqual(self._charge(t.name), 0)

	def test_penalty_zero_disables_charging(self):
		_set(priority_miss_penalty=0)
		t = self._todo(0, day=str(add_days(nowdate(), -1)))
		self.assertEqual(self._charge(t.name), 0)

	def test_uncompleting_a_todo_does_not_refund_the_penalty(self):
		t = self._todo(0, day=str(add_days(nowdate(), -1)))
		self.assertEqual(self._charge(t.name), 1)
		t.reload()
		t.status = "✅ Completed"
		t.save(ignore_permissions=True)
		t.status = "⚪️ Planned"
		t.save(ignore_permissions=True)
		self.assertEqual(
			len(frappe.get_all("Point Ledger", filters={"todo": t.name, "source": "Priority"})), 1
		)


class TestPriorityOccupancy(_PriorityFixture):
	def _occ(self, users, date, as_user="Administrator"):
		from vernon_project.api.mobile import get_priority_occupancy
		frappe.set_user(as_user)
		try:
			return get_priority_occupancy(users, date)
		finally:
			frappe.set_user("Administrator")

	def test_self_request_always_allowed(self):
		self._todo(0)
		out = self._occ(["prio_assignee@example.com"], self.day, as_user="prio_assignee@example.com")
		self.assertIn("prio_assignee@example.com", out)
		self.assertEqual(out["prio_assignee@example.com"]["slots"], 3)
		self.assertEqual(len(out["prio_assignee@example.com"]["items"]), 1)

	def test_leader_can_view_team_member(self):
		# prio_leader leads Prio Project 1 (self.details[0]) and is NOT System Manager — this
		# exercises the real Project Team / Project Todo leader-permission branch in
		# _allowed(), not the is_sm short-circuit (Administrator would always bypass it).
		self.assertNotIn("System Manager", frappe.get_roles("prio_leader@example.com"))
		self._todo(0)
		out = self._occ(["prio_assignee@example.com"], self.day, as_user="prio_leader@example.com")
		self.assertIn("prio_assignee@example.com", out)
		self.assertEqual(len(out["prio_assignee@example.com"]["items"]), 1)

	def test_unrelated_user_omitted(self):
		if not frappe.db.exists("User", "prio_outsider@example.com"):
			frappe.get_doc({"doctype": "User", "email": "prio_outsider@example.com",
				"first_name": "Outsider", "send_welcome_email": 0}).insert(ignore_permissions=True)
		out = self._occ(["prio_outsider@example.com"], self.day, as_user="prio_assignee@example.com")
		self.assertEqual(out, {})

	def test_non_sm_leader_unrelated_user_omitted(self):
		# Same negative case as above, but the requester is a genuinely non-SM leader
		# (leads Prio Project 1) rather than a plain assignee — confirms the leader branch
		# in _allowed() rejects a user outside their project, not just the SM bypass.
		if not frappe.db.exists("User", "prio_outsider@example.com"):
			frappe.get_doc({"doctype": "User", "email": "prio_outsider@example.com",
				"first_name": "Outsider", "send_welcome_email": 0}).insert(ignore_permissions=True)
		out = self._occ(["prio_outsider@example.com"], self.day, as_user="prio_leader@example.com")
		self.assertEqual(out, {})

	def test_feature_off_returns_zero_slots_no_items(self):
		from vernon_project.api.mobile import get_priority_occupancy
		_set(daily_priority_slots=0)
		frappe.set_user("prio_assignee@example.com")
		try:
			out = get_priority_occupancy(["prio_assignee@example.com"], self.day)
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(out, {"prio_assignee@example.com": {"slots": 0, "items": []}})

	def test_unrelated_project_priority_not_leaked_to_other_leader(self):
		# Strengthens the two negative tests above: those target prio_outsider while they
		# have ZERO priority items, so `out == {}` only proves the KEY gets dropped — not
		# that a real, data-bearing user's priority todo never leaks to an unauthorized
		# requester. (prio_assignee won't do for this: the fixture puts them on BOTH
		# projects' teams, so prio_leader is legitimately allowed to see them regardless
		# of which project holds the todo — that's Finding 2's fix working as intended,
		# not a leak.) Give prio_outsider — who has no team/todo tie to Prio Project 1 —
		# a genuine priority todo in Prio Project 2 (owned/led by Administrator, NOT
		# prio_leader's project) and confirm prio_leader still gets {} back.
		if not frappe.db.exists("User", "prio_outsider@example.com"):
			frappe.get_doc({"doctype": "User", "email": "prio_outsider@example.com",
				"first_name": "Outsider", "send_welcome_email": 0}).insert(ignore_permissions=True)
		# A todo's assignee must be a Project Team member of that todo's project — add
		# prio_outsider to Prio Project 2's team only (never Project 1's), so they stay
		# unreachable from prio_leader while still a legitimate assignee here.
		p2, _g2 = self.projects[1]
		p2.append("team_members", {"user": "prio_outsider@example.com"})
		p2.save(ignore_permissions=True)
		frappe.get_doc({
			"doctype": "Project Todo", "project_detail": self.details[1].name,
			"to_do": "Prio Todo", "assigned_to": "prio_outsider@example.com",
			"start_date": self.day, "deadline": self.day, "estimated": 30,
			"status": "⚪️ Planned", "is_priority": 1,
			"group": self.group_name, "level_id": self.level_id,
		}).insert(ignore_permissions=True)
		out = self._occ(["prio_outsider@example.com"], self.day, as_user="prio_leader@example.com")
		self.assertEqual(out, {})

	def test_wrong_date_returns_empty_items(self):
		self._todo(0)
		out = self._occ(
			["prio_assignee@example.com"],
			str(add_days(nowdate(), 10)),
			as_user="prio_assignee@example.com",
		)
		self.assertEqual(out["prio_assignee@example.com"]["items"], [])


class TestTeamPriorityCoverage(_PriorityFixture):
	def _coverage(self, project, week_start, as_user="Administrator"):
		from vernon_project.api.mobile import get_team_priority_coverage
		frappe.set_user(as_user)
		try:
			return get_team_priority_coverage(project, week_start)
		finally:
			frappe.set_user("Administrator")

	def _week_start_for_day(self):
		# Monday on/before self.day, so self.day's priority always lands inside the window.
		d = getdate(self.day)
		return str(d - timedelta(days=d.weekday()))

	def test_non_sm_leader_can_view_their_own_project(self):
		self._todo(0)  # priority todo for prio_assignee in Prio Project 1, on self.day
		p1, _g1 = self.projects[0]
		out = self._coverage(p1.name, self._week_start_for_day(), as_user="prio_leader@example.com")
		member = next(m for m in out["members"] if m["user"] == "prio_assignee@example.com")
		day = next(d for d in member["days"] if d["date"] == self.day)
		self.assertEqual(day["used"], 1)
		self.assertEqual(day["slots"], 3)
		self.assertTrue(day["contributed"])

	def test_unrelated_user_cannot_view_project_coverage(self):
		p1, _g1 = self.projects[0]
		with self.assertRaises(frappe.PermissionError):
			self._coverage(p1.name, self._week_start_for_day(), as_user="prio_assignee@example.com")

	def test_contributed_is_false_when_slot_filled_by_a_different_project(self):
		# prio_assignee is on BOTH projects' teams. Flag their priority via Project 2 (owned/led
		# by Administrator) — Project 1's leader should see `used=1` (true site-wide count) but
		# `contributed=False` (Project 1 itself claimed nothing that day).
		self._todo(1)  # detail_idx=1 -> Prio Project 2
		p1, _g1 = self.projects[0]
		out = self._coverage(p1.name, self._week_start_for_day(), as_user="prio_leader@example.com")
		member = next(m for m in out["members"] if m["user"] == "prio_assignee@example.com")
		day = next(d for d in member["days"] if d["date"] == self.day)
		self.assertEqual(day["used"], 1)
		self.assertFalse(day["contributed"])

	def test_feature_off_returns_zero_days(self):
		_set(daily_priority_slots=0)
		p1, _g1 = self.projects[0]
		out = self._coverage(p1.name, self._week_start_for_day(), as_user="prio_leader@example.com")
		member = next(m for m in out["members"] if m["user"] == "prio_assignee@example.com")
		self.assertTrue(all(d["used"] == 0 and d["slots"] == 0 for d in member["days"]))

	def test_week_has_seven_days_in_order(self):
		p1, _g1 = self.projects[0]
		ws = self._week_start_for_day()
		out = self._coverage(p1.name, ws, as_user="prio_leader@example.com")
		member = out["members"][0]
		self.assertEqual(len(member["days"]), 7)
		expected = [str(add_days(ws, i)) for i in range(7)]
		self.assertEqual([d["date"] for d in member["days"]], expected)
