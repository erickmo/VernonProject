# Copyright (c) 2026, Vernon and contributors
# See license.txt

import time
import unittest

import frappe
from frappe.utils import add_days, nowdate

from vernon_project.api.mobile import get_user_points_log

LEADER = "pl-scope-leader@test.local"
OUTSIDER = "pl-scope-outsider@test.local"
TITLE = "ZZ points-log scope probe todo"
GENERIC = "Points earned"


def _insert_retrying(doc):
	"""Insert, retrying a deadlock. This bench is shared and live: every point
	spend takes a table-wide locking read on Avatar Unlock (no index on `user`)
	plus per-user ranges on Point Ledger, so a bare ledger insert can lose a
	deadlock to unrelated traffic. Reproduced against unfixed code too, so this
	is the bench's ambient contention, not anything these tests changed — but a
	security test that flakes gets muted, so it retries instead.
	"""
	for attempt in range(4):
		try:
			return frappe.get_doc(doc).insert(ignore_permissions=True)
		except frappe.QueryDeadlockError:
			if attempt == 3:
				raise
			frappe.db.rollback()
			time.sleep(0.3 * (attempt + 1))


class TestPointsLogTitleScope(unittest.TestCase):
	"""get_user_points_log is open to EVERY logged-in user (it is the leaderboard
	tap-through) and returns each credit's Project Todo title. Titles must be scoped
	to projects the CALLER may see — without that it hands out task titles from
	projects the caller has no access to, which is the leak data_health was fixed
	for on 2026-09-08. The POINTS stay visible either way; that is the leaderboard.

	Both callers read the SAME ledger row, so the only variable is who is asking.
	"""

	def setUp(self):
		frappe.set_user("Administrator")
		# Provisioned the way real users are on this site: every user carries
		# "Project Team" (189 of them do); a project owner/leader additionally
		# holds those roles, which Project.validate_lead_roles requires.
		for email, roles in ((LEADER, ("Project Team", "Project Owner", "Project Leader")),
							 (OUTSIDER, ("Project Team",))):
			if not frappe.db.exists("User", email):
				u = frappe.get_doc({
					"doctype": "User", "email": email, "first_name": email.split("@")[0],
					"send_welcome_email": 0,
				})
				for r in roles:
					u.append("roles", {"role": r})
				u.insert(ignore_permissions=True)

		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "ZZ points-log scope project",
			"start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"brand": frappe.db.get_value("Brand", {}, "name"),
			"project_owner": LEADER, "project_leader": LEADER, "status": "Ongoing",
		}).insert(ignore_permissions=True)

		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name,
			"title": "ZZ points-log scope detail",
			"project_deadline": add_days(nowdate(), 30), "status": "Ongoing",
		}).insert(ignore_permissions=True)

		self.todo = frappe.get_doc({
			"doctype": "Project Todo", "project_detail": self.detail.name, "to_do": TITLE,
			"assigned_to": LEADER, "start_date": nowdate(), "deadline": add_days(nowdate(), 7),
			"group": frappe.db.get_value("Group", {}, "name"), "level": "1", "estimated": 30,
			"status": "⚪️ Planned",
		}).insert(ignore_permissions=True)

		self.ledger = _insert_retrying({
			"doctype": "Point Ledger", "user": LEADER, "todo": self.todo.name,
			"points_earned": 7, "point": 7, "source": "Todo",
			"credited_on": frappe.utils.now(),
		})

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()

	def _row_for_our_todo(self, caller):
		frappe.set_user(caller)
		res = get_user_points_log(LEADER, limit=500)
		rows = [r for r in res["rows"] if float(r["amount"]) == 7 and r["date"]]
		self.assertTrue(rows, f"{caller} should still see the CREDIT itself")
		return rows[0]

	def test_a_caller_on_the_project_sees_the_title(self):
		# Positive control: without this the whole suite would pass if titles
		# were never rendered at all.
		self.assertEqual(self._row_for_our_todo(LEADER)["title"], TITLE)

	def test_a_caller_outside_the_project_gets_the_generic_label(self):
		row = self._row_for_our_todo(OUTSIDER)
		self.assertEqual(
			row["title"], GENERIC,
			"a caller who cannot see the project must not receive the task title",
		)
		self.assertEqual(float(row["amount"]), 7, "the points themselves stay public")

	def test_the_outsider_really_cannot_see_the_project(self):
		# Guards the test itself: if OUTSIDER ever became able to see the project,
		# the test above would pass for the wrong reason.
		from vernon_project.api.mobile import _visible_projects
		frappe.set_user(OUTSIDER)
		self.assertNotIn(self.project.name, set(_visible_projects()))
		frappe.set_user(LEADER)
		self.assertIn(self.project.name, set(_visible_projects()))
