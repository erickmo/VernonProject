# Copyright (c) 2026, Vernon and contributors
# See license.txt

import unittest

import frappe
from frappe.utils import add_days, nowdate

from vernon_project.api.mobile import _can_see_user_work


class TestCanSeeUserWork(unittest.TestCase):
	"""Core predicate shared by get_priority_occupancy and the five reports
	fixed in the 2026-09-08 permission sweep (run_report + the Desk report
	endpoint both land in each report's execute(), which is why the guard
	lives there and calls this, not a role list). Proves the three cases hub
	asked for: a plain member sees only themself, a leader sees their team,
	naming someone they don't lead is refused."""

	LEADER = "csuw_leader@example.com"
	TEAMMATE = "csuw_teammate@example.com"
	STRANGER = "csuw_stranger@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer"}).insert(ignore_permissions=True)
		for email in (self.LEADER, self.TEAMMATE, self.STRANGER):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": email.split("@")[0],
					"send_welcome_email": 0,
				}).insert(ignore_permissions=True)
		u = frappe.get_doc("User", self.LEADER)
		have = {r.role for r in u.roles}
		for role in ("Project Owner", "Project Leader"):
			if role not in have:
				u.append("roles", {"role": role})
		u.save(ignore_permissions=True)

		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "CSUW Project", "brand": "Test Customer",
			"project_owner": self.LEADER, "project_leader": self.LEADER,
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": self.TEAMMATE}],
		}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_self_always_allowed(self):
		self.assertTrue(_can_see_user_work(self.TEAMMATE, self.TEAMMATE))
		self.assertTrue(_can_see_user_work(self.STRANGER, self.STRANGER))

	def test_leader_sees_their_team_members_work(self):
		self.assertTrue(_can_see_user_work(self.LEADER, self.TEAMMATE))

	def test_leader_refused_on_a_stranger_not_on_any_of_their_projects(self):
		self.assertFalse(_can_see_user_work(self.LEADER, self.STRANGER))

	def test_teammate_cannot_see_leader_or_a_stranger(self):
		# Being on a project as a plain member doesn't grant visibility into the
		# leader's or another stranger's work — only the leader/owner/admin
		# direction is "someone whose work I can already see".
		self.assertFalse(_can_see_user_work(self.TEAMMATE, self.LEADER))
		self.assertFalse(_can_see_user_work(self.TEAMMATE, self.STRANGER))

	def test_system_manager_sees_everyone(self):
		self.assertTrue(_can_see_user_work("Administrator", self.STRANGER))


class TestReportScopeIntegration(unittest.TestCase):
	"""One assignee-scoped report (daily_performance_report) and one
	project-scoped report (todo_report) exercised end to end through their
	real execute(), proving the guard is actually wired in, not just that the
	shared predicate is correct in isolation."""

	LEADER = "rsi_leader@example.com"
	TEAMMATE = "rsi_teammate@example.com"
	STRANGER = "rsi_stranger@example.com"

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer"}).insert(ignore_permissions=True)
		for email in (self.LEADER, self.TEAMMATE, self.STRANGER):
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": email.split("@")[0],
					"send_welcome_email": 0,
				}).insert(ignore_permissions=True)
		u = frappe.get_doc("User", self.LEADER)
		have = {r.role for r in u.roles}
		for role in ("Project Owner", "Project Leader"):
			if role not in have:
				u.append("roles", {"role": role})
		u.save(ignore_permissions=True)
		# "Project Team" is a doctype-level role (~174 real users hold it, distinct
		# from actual project team_members membership) required for frappe.get_list
		# read permission on Project itself — _visible_projects() uses get_list,
		# not get_all, so it enforces this the same way Project Todo's
		# has_permission hook does. Same fixture gap as test_project_todo_api.py.
		for email in (self.TEAMMATE, self.STRANGER):
			u2 = frappe.get_doc("User", email)
			if not any(r.role == "Project Team" for r in u2.roles):
				u2.append("roles", {"role": "Project Team"})
				u2.save(ignore_permissions=True)

		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "RSI Project", "brand": "Test Customer",
			"project_owner": self.LEADER, "project_leader": self.LEADER,
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": self.TEAMMATE}],
		}).insert(ignore_permissions=True)
		self.gl = frappe.get_doc({
			"doctype": "Glossary", "glossary": "RSI Grouping", "project": self.project.name,
		}).insert(ignore_permissions=True)
		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "RSI Detail",
			"grouping": self.gl.name, "project_deadline": add_days(nowdate(), 20),
		}).insert(ignore_permissions=True)
		if not frappe.db.exists("Group", "Test Group"):
			frappe.get_doc({"doctype": "Group", "group_name": "Test Group"}).insert(ignore_permissions=True)
		self.todo = frappe.get_doc({
			"doctype": "Project Todo", "project_detail": self.detail.name,
			"to_do": "RSI task", "assigned_to": self.TEAMMATE, "notes": "RSI secret notes",
			"status": "⚪️ Planned", "start_date": nowdate(), "deadline": add_days(nowdate(), 5),
			"estimated": 30, "group": "Test Group", "level": "1",
		}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("Project Detail", self.detail.name):
			frappe.db.delete("Project Todo", {"project_detail": self.detail.name})
			frappe.delete_doc("Project Detail", self.detail.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Glossary", self.gl.name):
			frappe.delete_doc("Glossary", self.gl.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	# ---- assignee-scoped: daily_performance_report ----

	def test_daily_performance_report_self(self):
		from vernon_project.vernon_project.report.daily_performance_report.daily_performance_report import execute
		frappe.set_user(self.TEAMMATE)
		try:
			columns, data = execute({
				"assigned_to": self.TEAMMATE,
				"date_range": [add_days(nowdate(), -5), add_days(nowdate(), 5)],
			})
		finally:
			frappe.set_user("Administrator")
		self.assertIsInstance(data, list)  # did not raise

	def test_daily_performance_report_leader_sees_teammate(self):
		from vernon_project.vernon_project.report.daily_performance_report.daily_performance_report import execute
		frappe.set_user(self.LEADER)
		try:
			columns, data = execute({
				"assigned_to": self.TEAMMATE,
				"date_range": [add_days(nowdate(), -5), add_days(nowdate(), 5)],
			})
		finally:
			frappe.set_user("Administrator")
		self.assertIsInstance(data, list)  # did not raise

	def test_daily_performance_report_rejects_an_unknown_status(self):
		"""Fail closed. An unrecognised status used to fall through
		STATUS_DATE_FIELD_MAP.get(status, "deadline") and silently produce a
		plausible-looking report built on the WRONG date column."""
		from vernon_project.vernon_project.report.daily_performance_report.daily_performance_report import execute
		frappe.set_user(self.TEAMMATE)
		try:
			with self.assertRaises(frappe.ValidationError):
				execute({
					"assigned_to": self.TEAMMATE,
					"date_range": [add_days(nowdate(), -5), add_days(nowdate(), 5)],
					"status": "🚀 Not A Real Status",
				})
		finally:
			frappe.set_user("Administrator")

	def test_daily_performance_report_stranger_refused(self):
		from vernon_project.vernon_project.report.daily_performance_report.daily_performance_report import execute
		frappe.set_user(self.STRANGER)
		try:
			with self.assertRaises(frappe.PermissionError):
				execute({
					"assigned_to": self.TEAMMATE,
					"date_range": [add_days(nowdate(), -5), add_days(nowdate(), 5)],
				})
		finally:
			frappe.set_user("Administrator")

	# ---- project-scoped: todo_report — the "omitted filter" half ----

	def test_todo_report_omitted_project_defaults_to_visible_not_everything(self):
		from vernon_project.vernon_project.report.todo_report.todo_report import execute
		frappe.set_user(self.STRANGER)  # not on this project at all
		try:
			columns, data = execute({})
		finally:
			frappe.set_user("Administrator")
		# Must not raise, and must not include our fixture todo — the stranger's
		# visible-project set doesn't include it, so it's filtered out, not
		# returned as part of "everything".
		self.assertNotIn(self.todo.name, {row.get("todo_id") for row in data})

	def test_todo_report_teammate_sees_own_project_by_default(self):
		from vernon_project.vernon_project.report.todo_report.todo_report import execute
		frappe.set_user(self.TEAMMATE)
		try:
			columns, data = execute({})
		finally:
			frappe.set_user("Administrator")
		self.assertIn(self.todo.name, {row.get("todo_id") for row in data})

	def test_todo_report_named_project_stranger_refused(self):
		from vernon_project.vernon_project.report.todo_report.todo_report import execute
		frappe.set_user(self.STRANGER)
		try:
			with self.assertRaises(frappe.PermissionError):
				execute({"project": self.project.name})
		finally:
			frappe.set_user("Administrator")

	# ---- project_todo_deadline_report: fails CLOSED (not open) when project is
	# omitted -- a parameterized `project.name = %(project)s` binds to SQL NULL,
	# and `column = NULL` is never true, unlike progress_report/todo_report's
	# string-built WHERE clause which simply dropped the condition. Pinning this
	# so a later "fix" to the non-halting msgprint doesn't quietly flip it. ----

	def test_project_todo_deadline_report_omitted_project_returns_nothing(self):
		from vernon_project.vernon_project.report.project_todo_deadline_report.project_todo_deadline_report import execute
		frappe.set_user(self.LEADER)
		try:
			columns, data = execute({})
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(data, [])

	# ---- progress_report: same project-scoped shape as todo_report ----

	def test_progress_report_stranger_named_project_refused(self):
		from vernon_project.vernon_project.report.progress_report.progress_report import execute
		frappe.set_user(self.STRANGER)
		try:
			with self.assertRaises(frappe.PermissionError):
				execute({"project": self.project.name})
		finally:
			frappe.set_user("Administrator")

	def test_progress_report_teammate_sees_own_project_by_default(self):
		from vernon_project.vernon_project.report.progress_report.progress_report import execute
		frappe.set_user(self.TEAMMATE)
		try:
			columns, data = execute({})
		finally:
			frappe.set_user("Administrator")
		self.assertIn(self.todo.name, {row.get("todo_id") for row in data})

	# ---- daily_assignment_report: same assignee-scoped shape as
	# daily_performance_report ----

	def test_daily_assignment_report_leader_sees_teammate(self):
		from vernon_project.vernon_project.report.daily_assignment_report.daily_assignment_report import execute
		frappe.set_user(self.LEADER)
		try:
			columns, data = execute({"assigned_to": self.TEAMMATE})
		finally:
			frappe.set_user("Administrator")
		self.assertIsInstance(data, list)  # did not raise

	def test_daily_assignment_report_stranger_refused(self):
		from vernon_project.vernon_project.report.daily_assignment_report.daily_assignment_report import execute
		frappe.set_user(self.STRANGER)
		try:
			with self.assertRaises(frappe.PermissionError):
				execute({"assigned_to": self.TEAMMATE})
		finally:
			frappe.set_user("Administrator")
