# Copyright (c) 2026, Vernon and Contributors

import frappe
import unittest
from frappe.utils import add_days, nowdate


def _set(**kw):
	for k, v in kw.items():
		frappe.db.set_single_value("Vernon Settings", k, v)


class _PriorityFixture(unittest.TestCase):
	"""Project (owner+leader=Administrator) / Detail / two todos on one day for a
	non-leader assignee. Mirrors test_allocations.py's setup."""

	def setUp(self):
		if not frappe.db.exists("User", "prio_assignee@example.com"):
			frappe.get_doc({"doctype": "User", "email": "prio_assignee@example.com",
				"first_name": "Prio", "send_welcome_email": 0}).insert(ignore_permissions=True)
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
				"project_owner": "Administrator", "project_leader": "Administrator",
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
	def _charge(self):
		from vernon_project.tasks import charge_missed_priorities
		return charge_missed_priorities()

	def test_charges_once_and_is_idempotent(self):
		t = self._todo(0, day=str(add_days(nowdate(), -1)))
		self.assertEqual(self._charge(), 1)
		self.assertEqual(self._charge(), 0)
		rows = frappe.get_all("Point Ledger", filters={"todo": t.name, "source": "Priority"},
			fields=["points_earned", "user"])
		self.assertEqual(len(rows), 1)
		self.assertEqual(rows[0].points_earned, -250)
		self.assertEqual(rows[0].user, "prio_assignee@example.com")

	def test_done_priority_not_charged(self):
		self._todo(0, day=str(add_days(nowdate(), -1)), status="🟠 Done")
		self.assertEqual(self._charge(), 0)

	def test_future_priority_not_charged(self):
		self._todo(0)  # deadline is 3 days out
		self.assertEqual(self._charge(), 0)

	def test_penalty_zero_disables_charging(self):
		_set(priority_miss_penalty=0)
		self._todo(0, day=str(add_days(nowdate(), -1)))
		self.assertEqual(self._charge(), 0)

	@unittest.expectedFailure
	def test_uncompleting_a_todo_does_not_refund_the_penalty(self):
		"""Documents a live bug in already-merged code (not this test file).

		charge_missed_priorities() inserts the penalty row without a `role`, meaning
		to stay off _upsert_ledger_row's (todo, role) dedupe key per that function's
		own comment ("role is left blank on purpose"). But Point Ledger.role is a
		Select with no explicit default, and Frappe defaults an omitted Select field
		to its first option ("Assignee") on insert rather than leaving it blank — so
		the penalty row's role ends up "Assignee" anyway. The moment the todo is
		later completed, sync_point_ledger's _upsert_ledger_row("Assignee", ...)
		finds that same row via (todo, role="Assignee") and overwrites it in place,
		flipping source from "Priority" to "Todo" — which then defeats
		_remove_ledger's `source != "Priority"` guard, so un-completing erases the
		penalty entirely. Fix (out of scope here): exclude source="Priority" from
		_upsert_ledger_row's dedupe probe, e.g.
		frappe.db.exists("Point Ledger", {"todo": self.name, "role": role,
			"source": ["!=", "Priority"]}).
		"""
		t = self._todo(0, day=str(add_days(nowdate(), -1)))
		self.assertEqual(self._charge(), 1)
		t.reload()
		t.status = "✅ Completed"
		t.save(ignore_permissions=True)
		t.status = "⚪️ Planned"
		t.save(ignore_permissions=True)
		self.assertEqual(
			len(frappe.get_all("Point Ledger", filters={"todo": t.name, "source": "Priority"})), 1
		)
