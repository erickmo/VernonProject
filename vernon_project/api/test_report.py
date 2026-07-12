import datetime
import unittest

import frappe
from frappe.utils import nowdate
from vernon_project.api.report import (
	_date_list, _build_daily_matrix, _assigned_minutes,
	_build_under_occupied, daily_estimated_time, daily_estimated_time_access, under_occupied,
	_build_over_occupied, over_occupied,
	_previous_shift_shortfall,
	_template_minutes, _resolve_expected,
	_build_todos_due, todos_due,
	_runs_project, buzz_todo,
	logbook, STATUS_PLANNED, STATUS_COMPLETED,
)


class TestBuildDailyMatrix(unittest.TestCase):
	def test_date_list_inclusive(self):
		self.assertEqual(
			_date_list("2026-06-22", "2026-06-24"),
			["2026-06-22", "2026-06-23", "2026-06-24"],
		)

	def test_single_day(self):
		self.assertEqual(_date_list("2026-06-22", "2026-06-22"), ["2026-06-22"])

	def test_pivot_sums_and_zero_fills(self):
		users = [{"name": "a@x.id", "full_name": "Alice"}]
		assigned = [
			{"user": "a@x.id", "day": "2026-06-22", "minutes": 120},
			{"user": "a@x.id", "day": "2026-06-22", "minutes": 60},
			{"user": "a@x.id", "day": "2026-06-23", "minutes": 500},
		]
		out = _build_daily_matrix(users, assigned, [], "2026-06-22", "2026-06-24", 480)
		row = out["rows"][0]
		self.assertEqual(row["per_day_assigned"], {"2026-06-22": 180, "2026-06-23": 500, "2026-06-24": 0})
		self.assertEqual(row["assigned_total"], 680)

	def test_flags_days_below_threshold(self):
		users = [{"name": "a@x.id", "full_name": "Alice"}]
		assigned = [{"user": "a@x.id", "day": "2026-06-23", "minutes": 480}]  # exactly X -> NOT flagged
		out = _build_daily_matrix(users, assigned, [], "2026-06-22", "2026-06-23", 480)
		self.assertEqual(out["rows"][0]["flagged_dates"], ["2026-06-22"])

	def test_zero_allocation_user_present_and_fully_flagged(self):
		users = [{"name": "b@x.id", "full_name": "Bob"}]
		out = _build_daily_matrix(users, [], [], "2026-06-22", "2026-06-23", 480)
		row = out["rows"][0]
		self.assertEqual(row["per_day_assigned"], {"2026-06-22": 0, "2026-06-23": 0})
		self.assertEqual(row["flagged_dates"], ["2026-06-22", "2026-06-23"])
		self.assertEqual(row["assigned_total"], 0)

	def test_full_name_falls_back_to_name(self):
		out = _build_daily_matrix([{"name": "c@x.id", "full_name": None}], [], [], "2026-06-22", "2026-06-22", 480)
		self.assertEqual(out["rows"][0]["full_name"], "c@x.id")

	def test_threshold_zero_flags_nothing(self):
		out = _build_daily_matrix([{"name": "a@x.id", "full_name": "A"}], [], [], "2026-06-22", "2026-06-22", 0)
		self.assertEqual(out["rows"][0]["flagged_dates"], [])

	def test_envelope_fields(self):
		out = _build_daily_matrix([], [], [], "2026-06-22", "2026-06-23", 480)
		self.assertEqual(out["threshold"], 480)
		self.assertEqual(out["from_date"], "2026-06-22")
		self.assertEqual(out["to_date"], "2026-06-23")
		self.assertEqual(out["dates"], ["2026-06-22", "2026-06-23"])
		self.assertEqual(out["rows"], [])


class TestDailyEstimatedTimeEndpoint(unittest.TestCase):
	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("User", "report_guest@example.com"):
			frappe.delete_doc("User", "report_guest@example.com", force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_requires_system_manager(self):
		if not frappe.db.exists("User", "report_guest@example.com"):
			frappe.get_doc({
				"doctype": "User", "email": "report_guest@example.com",
				"first_name": "Report", "send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		frappe.set_user("report_guest@example.com")
		with self.assertRaises(frappe.PermissionError):
			daily_estimated_time("2026-06-22", "2026-06-28")

	def test_rejects_oversize_span(self):
		frappe.set_user("Administrator")
		with self.assertRaises(frappe.ValidationError):
			daily_estimated_time("2026-01-01", "2026-12-31")

	def test_admin_gets_contract_shape(self):
		frappe.set_user("Administrator")
		out = daily_estimated_time("2026-06-22", "2026-06-23")
		self.assertIn("threshold", out)
		self.assertEqual(out["dates"], ["2026-06-22", "2026-06-23"])
		self.assertIsInstance(out["rows"], list)


class TestDailyEstimatedTimeAccess(unittest.TestCase):
	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("User", "report_access_guest@example.com"):
			frappe.delete_doc("User", "report_access_guest@example.com", force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_system_manager_can_view(self):
		frappe.set_user("Administrator")
		self.assertEqual(daily_estimated_time_access(), {"can_view": True})

	def test_non_system_manager_cannot_view(self):
		if not frappe.db.exists("User", "report_access_guest@example.com"):
			frappe.get_doc({
				"doctype": "User", "email": "report_access_guest@example.com",
				"first_name": "Access", "send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		frappe.set_user("report_access_guest@example.com")
		self.assertEqual(daily_estimated_time_access(), {"can_view": False})


class TestTemplateMinutes(unittest.TestCase):
	def test_string_times(self):
		self.assertEqual(_template_minutes("09:00:00", "17:00:00"), 480)

	def test_half_hour(self):
		self.assertEqual(_template_minutes("09:00:00", "17:30:00"), 510)

	def test_timedelta_inputs(self):
		self.assertEqual(
			_template_minutes(datetime.timedelta(hours=9), datetime.timedelta(hours=17)), 480
		)

	def test_time_objects(self):
		self.assertEqual(_template_minutes(datetime.time(9, 0), datetime.time(17, 30)), 510)

	def test_none_returns_zero(self):
		self.assertEqual(_template_minutes(None, "17:00:00"), 0)
		self.assertEqual(_template_minutes("09:00:00", None), 0)

	def test_non_positive_returns_zero(self):
		self.assertEqual(_template_minutes("17:00:00", "09:00:00"), 0)


class TestResolveExpected(unittest.TestCase):
	"""Pure per-user-per-day shift target resolution. Days: 2026-06-29 Mon, 30 Tue, 07-01 Wed."""

	def _assign(self, user, template, eff_from, eff_to=None, **days):
		row = {"employee": user, "shift_template": template,
			   "effective_from": eff_from, "effective_to": eff_to}
		for d in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"):
			row[d] = days.get(d, 0)
		return row

	def test_emits_only_scheduled_weekdays(self):
		out = _resolve_expected(
			["u@x.id"], ["2026-06-29", "2026-06-30", "2026-07-01"],
			[self._assign("u@x.id", "T1", "2026-06-01", monday=1, tuesday=1)],  # wednesday=0
			{"T1": 480}, {},
		)
		got = {(r["user"], r["day"]): r["minutes"] for r in out}
		self.assertEqual(got, {("u@x.id", "2026-06-29"): 480, ("u@x.id", "2026-06-30"): 480})

	def test_effective_from_excludes_before(self):
		out = _resolve_expected(
			["u@x.id"], ["2026-06-29", "2026-06-30"],
			[self._assign("u@x.id", "T1", "2026-06-30", monday=1, tuesday=1)],
			{"T1": 480}, {},
		)
		self.assertEqual([r["day"] for r in out], ["2026-06-30"])

	def test_effective_to_excludes_after(self):
		out = _resolve_expected(
			["u@x.id"], ["2026-06-29", "2026-06-30"],
			[self._assign("u@x.id", "T1", "2026-06-01", "2026-06-29", monday=1, tuesday=1)],
			{"T1": 480}, {},
		)
		self.assertEqual([r["day"] for r in out], ["2026-06-29"])

	def test_latest_effective_from_wins(self):
		out = _resolve_expected(
			["u@x.id"], ["2026-06-29"],
			[self._assign("u@x.id", "T1", "2026-06-01", monday=1),
			 self._assign("u@x.id", "T2", "2026-06-15", monday=1)],
			{"T1": 480, "T2": 300}, {},
		)
		self.assertEqual(out[0]["minutes"], 300)

	def test_holiday_excluded(self):
		out = _resolve_expected(
			["u@x.id"], ["2026-06-29", "2026-06-30"],
			[self._assign("u@x.id", "T1", "2026-06-01", monday=1, tuesday=1)],
			{"T1": 480}, {"u@x.id": {"2026-06-29"}},
		)
		self.assertEqual([r["day"] for r in out], ["2026-06-30"])

	def test_no_assignment_no_emit(self):
		self.assertEqual(_resolve_expected(["u@x.id"], ["2026-06-29"], [], {}, {}), [])

	def test_zero_minute_template_no_emit(self):
		out = _resolve_expected(
			["u@x.id"], ["2026-06-29"],
			[self._assign("u@x.id", "T0", "2026-06-01", monday=1)],
			{"T0": 0}, {},
		)
		self.assertEqual(out, [])


class TestBuildUnderOccupied(unittest.TestCase):
	"""Pure _build_under_occupied — per-user shift target; only shift days are evaluated."""

	def test_includes_user_below_target(self):
		users = [{"name": "u@x.id", "full_name": "U"}]
		expected = [{"user": "u@x.id", "day": "2026-06-29", "minutes": 480},
					{"user": "u@x.id", "day": "2026-06-30", "minutes": 480}]
		assigned = [{"user": "u@x.id", "day": "2026-06-29", "minutes": 300},
					{"user": "u@x.id", "day": "2026-06-30", "minutes": 480}]
		# tol=30 → d29: 300 < 450 under, deficit 180 ; d30: 480 not under, deficit 0
		out = _build_under_occupied(users, assigned, expected, "2026-06-29", "2026-06-30", 30)
		row = out["rows"][0]
		self.assertEqual(row["under_days"], 1)
		self.assertEqual(row["deficit"], 180)
		self.assertEqual(row["assigned_total"], 780)
		self.assertEqual(row["expected_total"], 960)

	def test_no_shift_days_are_not_evaluated(self):
		users = [{"name": "u@x.id", "full_name": "U"}]
		assigned = [{"user": "u@x.id", "day": "2026-06-29", "minutes": 0}]
		out = _build_under_occupied(users, assigned, [], "2026-06-29", "2026-06-30", 30)
		self.assertEqual(out["rows"], [])

	def test_tolerance_boundary_strict(self):
		# a == t - tol → NOT under (strict <)
		users = [{"name": "u@x.id", "full_name": "U"}]
		expected = [{"user": "u@x.id", "day": "2026-06-29", "minutes": 480}]
		assigned = [{"user": "u@x.id", "day": "2026-06-29", "minutes": 450}]
		out = _build_under_occupied(users, assigned, expected, "2026-06-29", "2026-06-29", 30)
		self.assertEqual(out["rows"], [])

	def test_only_shift_days_counted(self):
		# assigned on a non-shift day (no expected row) is ignored
		users = [{"name": "u@x.id", "full_name": "U"}]
		expected = [{"user": "u@x.id", "day": "2026-06-29", "minutes": 480}]
		assigned = [{"user": "u@x.id", "day": "2026-06-29", "minutes": 100},
					{"user": "u@x.id", "day": "2026-06-30", "minutes": 999}]
		out = _build_under_occupied(users, assigned, expected, "2026-06-29", "2026-06-30", 0)
		row = out["rows"][0]
		self.assertEqual(row["assigned_total"], 100)
		self.assertEqual(row["expected_total"], 480)
		self.assertEqual(row["under_days"], 1)
		self.assertEqual(row["deficit"], 380)

	def test_sort_by_deficit_desc_and_envelope(self):
		users = [{"name": "a@x.id", "full_name": "Alice"}, {"name": "b@x.id", "full_name": "Bob"}]
		expected = [{"user": "a@x.id", "day": "2026-06-29", "minutes": 480},
					{"user": "b@x.id", "day": "2026-06-29", "minutes": 480}]
		assigned = [{"user": "a@x.id", "day": "2026-06-29", "minutes": 0},
					{"user": "b@x.id", "day": "2026-06-29", "minutes": 200}]
		out = _build_under_occupied(users, assigned, expected, "2026-06-29", "2026-06-29", 0)
		self.assertEqual([r["user"] for r in out["rows"]], ["a@x.id", "b@x.id"])
		self.assertEqual(out["tolerance"], 0)
		self.assertEqual(out["day_count"], 1)
		self.assertEqual(out["from_date"], "2026-06-29")
		self.assertEqual(out["to_date"], "2026-06-29")
		self.assertNotIn("threshold", out)
		self.assertNotIn("effective", out)

	def test_empty_roster(self):
		out = _build_under_occupied([], [], [], "2026-06-29", "2026-06-30", 30)
		self.assertEqual(out["rows"], [])
		self.assertEqual(out["day_count"], 2)
		self.assertEqual(out["tolerance"], 30)


class TestUnderOccupiedEndpoint(unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.set_user("Administrator")
		for email in ("uo_guest@example.com",):
			if frappe.db.exists("User", email):
				frappe.delete_doc("User", email, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_requires_system_manager(self):
		if not frappe.db.exists("User", "uo_guest@example.com"):
			frappe.get_doc({
				"doctype": "User", "email": "uo_guest@example.com",
				"first_name": "UO", "send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		frappe.set_user("uo_guest@example.com")
		with self.assertRaises(frappe.PermissionError):
			under_occupied("2026-06-22", "2026-06-28")

	def test_rejects_oversize_span(self):
		frappe.set_user("Administrator")
		with self.assertRaises(frappe.ValidationError):
			under_occupied("2026-01-01", "2026-12-31")

	def test_contract_shape(self):
		frappe.set_user("Administrator")
		out = under_occupied("2026-06-22", "2026-06-26")
		for key in ("tolerance", "day_count", "rows"):
			self.assertIn(key, out)
		self.assertIsInstance(out["rows"], list)
		self.assertEqual(out["day_count"], 5)


class TestBuildOverOccupied(unittest.TestCase):
	"""Pure _build_over_occupied — per-user shift target; only shift days are evaluated."""

	def test_includes_user_above_target(self):
		users = [{"name": "u@x.id", "full_name": "U"}]
		expected = [{"user": "u@x.id", "day": "2026-06-29", "minutes": 480},
					{"user": "u@x.id", "day": "2026-06-30", "minutes": 480}]
		assigned = [{"user": "u@x.id", "day": "2026-06-29", "minutes": 600},
					{"user": "u@x.id", "day": "2026-06-30", "minutes": 480}]
		# tol=30 → d29: 600 > 510 over, surplus 120 ; d30: 480 not over, surplus 0
		out = _build_over_occupied(users, assigned, expected, "2026-06-29", "2026-06-30", 30)
		row = out["rows"][0]
		self.assertEqual(row["over_days"], 1)
		self.assertEqual(row["surplus"], 120)
		self.assertEqual(row["assigned_total"], 1080)
		self.assertEqual(row["expected_total"], 960)

	def test_no_shift_days_are_not_evaluated(self):
		users = [{"name": "u@x.id", "full_name": "U"}]
		assigned = [{"user": "u@x.id", "day": "2026-06-29", "minutes": 9999}]
		out = _build_over_occupied(users, assigned, [], "2026-06-29", "2026-06-30", 30)
		self.assertEqual(out["rows"], [])

	def test_tolerance_boundary_strict(self):
		# a == t + tol → NOT over (strict >)
		users = [{"name": "u@x.id", "full_name": "U"}]
		expected = [{"user": "u@x.id", "day": "2026-06-29", "minutes": 480}]
		assigned = [{"user": "u@x.id", "day": "2026-06-29", "minutes": 510}]
		out = _build_over_occupied(users, assigned, expected, "2026-06-29", "2026-06-29", 30)
		self.assertEqual(out["rows"], [])

	def test_sort_by_surplus_desc_and_full_name_fallback(self):
		users = [{"name": "a@x.id", "full_name": "Alice"}, {"name": "b@x.id", "full_name": None}]
		expected = [{"user": "a@x.id", "day": "2026-06-29", "minutes": 480},
					{"user": "b@x.id", "day": "2026-06-29", "minutes": 480}]
		assigned = [{"user": "a@x.id", "day": "2026-06-29", "minutes": 600},   # surplus 120
					{"user": "b@x.id", "day": "2026-06-29", "minutes": 900}]   # surplus 420
		out = _build_over_occupied(users, assigned, expected, "2026-06-29", "2026-06-29", 0)
		self.assertEqual([r["user"] for r in out["rows"]], ["b@x.id", "a@x.id"])
		self.assertEqual(out["rows"][0]["full_name"], "b@x.id")

	def test_envelope_no_threshold(self):
		out = _build_over_occupied([], [], [], "2026-06-29", "2026-06-30", 30)
		self.assertEqual(out["rows"], [])
		self.assertEqual(out["day_count"], 2)
		self.assertEqual(out["tolerance"], 30)
		self.assertNotIn("threshold", out)


class TestOverOccupiedEndpoint(unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.set_user("Administrator")
		for email in ("oo_guest@example.com",):
			if frappe.db.exists("User", email):
				frappe.delete_doc("User", email, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_requires_system_manager(self):
		if not frappe.db.exists("User", "oo_guest@example.com"):
			frappe.get_doc({
				"doctype": "User", "email": "oo_guest@example.com",
				"first_name": "OO", "send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		frappe.set_user("oo_guest@example.com")
		with self.assertRaises(frappe.PermissionError):
			over_occupied("2026-06-22", "2026-06-28")

	def test_rejects_oversize_span(self):
		frappe.set_user("Administrator")
		with self.assertRaises(frappe.ValidationError):
			over_occupied("2026-01-01", "2026-12-31")

	def test_contract_shape(self):
		frappe.set_user("Administrator")
		out = over_occupied("2026-06-22", "2026-06-26")
		for key in ("tolerance", "day_count", "rows"):
			self.assertIn(key, out)
		self.assertIsInstance(out["rows"], list)
		self.assertEqual(out["day_count"], 5)


class TestBuildTodosDue(unittest.TestCase):
	"""Pure _build_todos_due — buzz list shaping: deadline-asc order, overdue flag, contact."""

	TODAY = datetime.date(2026, 7, 6)
	ROLES = {
		"PRJ-A": {"my_role": "Owner", "project_name": "Alpha"},
		"PRJ-B": {"my_role": "Owner, Leader", "project_name": "Beta"},
	}
	USERS = {"u@x.id": {"name": "u@x.id", "full_name": "Ursula", "email": "u@x.id", "mobile_no": "+62811"}}

	def _todo(self, name, project, deadline, assigned_to="u@x.id", to_do="T", status="⚪️ Planned"):
		return {"name": name, "to_do": to_do, "project": project,
				"assigned_to": assigned_to, "deadline": deadline, "status": status}

	def test_sorted_by_deadline_ascending(self):
		todos = [self._todo("T2", "PRJ-A", "2026-07-10"),
				 self._todo("T1", "PRJ-A", "2026-07-05"),
				 self._todo("T3", "PRJ-B", "2026-07-07")]
		out = _build_todos_due(self.ROLES, todos, self.USERS, "2026-07-10", self.TODAY)
		self.assertEqual([r["todo"] for r in out["rows"]], ["T1", "T3", "T2"])
		self.assertEqual(out["due_by"], "2026-07-10")

	def test_overdue_is_strictly_before_today(self):
		todos = [self._todo("PAST", "PRJ-A", "2026-07-05"),
				 self._todo("TODAY", "PRJ-A", "2026-07-06"),
				 self._todo("FUT", "PRJ-A", "2026-07-08")]
		flag = {r["todo"]: r["overdue"] for r in
				_build_todos_due(self.ROLES, todos, self.USERS, "2026-07-08", self.TODAY)["rows"]}
		self.assertEqual(flag, {"PAST": True, "TODAY": False, "FUT": False})

	def test_carries_role_project_and_contact(self):
		out = _build_todos_due(self.ROLES, [self._todo("T1", "PRJ-B", "2026-07-06")],
							   self.USERS, "2026-07-06", self.TODAY)
		row = out["rows"][0]
		self.assertEqual(row["my_role"], "Owner, Leader")
		self.assertEqual(row["project_name"], "Beta")
		self.assertEqual(row["assignee_name"], "Ursula")
		self.assertEqual(row["assignee_email"], "u@x.id")
		self.assertEqual(row["assignee_mobile"], "+62811")

	def test_unknown_assignee_falls_back_to_id(self):
		out = _build_todos_due(self.ROLES, [self._todo("T1", "PRJ-A", "2026-07-06", assigned_to="ghost@x.id")],
							   {}, "2026-07-06", self.TODAY)
		row = out["rows"][0]
		self.assertEqual(row["assignee_name"], "ghost@x.id")
		self.assertEqual(row["assignee_email"], "ghost@x.id")
		self.assertIsNone(row["assignee_mobile"])

	def test_empty(self):
		out = _build_todos_due(self.ROLES, [], self.USERS, "2026-07-06", self.TODAY)
		self.assertEqual(out, {"due_by": "2026-07-06", "rows": []})


class TestTodosDueEndpoint(unittest.TestCase):
	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("User", "td_guest@example.com"):
			frappe.delete_doc("User", "td_guest@example.com", force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_user_with_no_projects_gets_empty_list(self):
		if not frappe.db.exists("User", "td_guest@example.com"):
			frappe.get_doc({
				"doctype": "User", "email": "td_guest@example.com",
				"first_name": "TD", "send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		frappe.set_user("td_guest@example.com")
		out = todos_due("2026-07-31")
		self.assertEqual(out, {"due_by": "2026-07-31", "rows": []})

	def test_contract_shape(self):
		frappe.set_user("Administrator")
		out = todos_due("2026-07-31")
		self.assertIn("due_by", out)
		self.assertIsInstance(out["rows"], list)
		self.assertEqual(out["due_by"], "2026-07-31")


class TestRunsProject(unittest.TestCase):
	"""Pure permission predicate for buzz_todo — owns/leads/admins the project."""

	def test_owner_leader_admin_pass(self):
		for field in ("project_owner", "project_leader", "project_admin"):
			self.assertTrue(_runs_project("me@x.id", {field: "me@x.id"}))

	def test_non_member_denied(self):
		row = {"project_owner": "a@x.id", "project_leader": "b@x.id", "project_admin": "c@x.id"}
		self.assertFalse(_runs_project("me@x.id", row))

	def test_missing_project_denied(self):
		self.assertFalse(_runs_project("me@x.id", None))

	def test_none_fields_denied(self):
		# A project with no roles set must never match a real user.
		self.assertFalse(_runs_project("me@x.id", {"project_owner": None, "project_leader": None, "project_admin": None}))


class TestBuzzTodoEndpoint(unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")

	def test_unknown_todo_raises(self):
		with self.assertRaises(frappe.DoesNotExistError):
			buzz_todo("PT-does-not-exist-xyz")

	def test_dict_todo_is_coerced_not_used_as_filter(self):
		# A JSON body could pass `todo` as a dict; it must be coerced to a docname
		# string (never resolved as a get_value filter), so this is a plain not-found.
		with self.assertRaises(frappe.DoesNotExistError):
			buzz_todo({"assigned_to": "someone@example.com"})


class TestLogbookEndpoint(unittest.TestCase):
	"""Integration: seed a target user's plan/done todos over 2026-07-01..05 and assert
	the logbook buckets, lateness/result classification, summary, and the auth gate."""

	FROM = "2026-07-01"
	TO = "2026-07-05"
	TARGET = "logbook_target@example.com"
	OTHER = "logbook_other@example.com"
	GUEST = "logbook_guest@example.com"
	DONE = "\U0001f7e0 Done"  # 🟠 Done

	def setUp(self):
		frappe.set_user("Administrator")
		from vernon_project.vernon_project.doctype.project_todo.test_project_todo import _ensure_test_group
		for email, fn in ((self.TARGET, "Target"), (self.OTHER, "Other"), (self.GUEST, "Guest")):
			if not frappe.db.exists("User", email):
				frappe.get_doc({"doctype": "User", "email": email, "first_name": fn,
					"send_welcome_email": 0}).insert(ignore_permissions=True)
		if not frappe.db.exists("Brand", "Logbook Brand"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Logbook Brand"}).insert(ignore_permissions=True)
		self.group, self.level_id = _ensure_test_group()
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Logbook Project", "brand": "Logbook Brand",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": "2026-12-31",
			# Reward fields: unsynced parallel work on the Project controller reads these
			# in before_validate; pass them so the fixture doesn't trip on a missing attr.
			"reward_type": "Point", "bonus_amount": 0, "discount": 0,
			"team_members": [{"user": "Administrator"}, {"user": self.TARGET}, {"user": self.OTHER}],
		}).insert(ignore_permissions=True)
		self.grouping = frappe.get_doc({"doctype": "Glossary", "glossary": "Logbook Grouping",
			"project": self.project.name}).insert(ignore_permissions=True).name
		self.detail = frappe.get_doc({"doctype": "Project Detail", "project": self.project.name,
			"title": "Logbook Detail", "grouping": self.grouping,
			"project_deadline": "2026-12-31", "estimated": 500}).insert(ignore_permissions=True).name

		# planned on day A (07-01), done early on 07-02 (< deadline 07-03), Completed → approved
		self.t1 = self._todo("T1 early", self.TARGET, "2026-07-03", 120,
			allocations=[{"allocation_date": "2026-07-01", "estimated_minutes": 120}])
		self._stamp(self.t1, done="2026-07-02 09:00:00", status=STATUS_COMPLETED, earned=50)
		# done late on 07-04 (> deadline 07-02), Done → pending
		self.t2 = self._todo("T2 late", self.TARGET, "2026-07-02", 90)
		self._stamp(self.t2, done="2026-07-04 09:00:00", status=self.DONE)
		# rejected: bounced back to Planned with rejected_at, done_on 07-03 == deadline → on_time
		self.t3 = self._todo("T3 rejected", self.TARGET, "2026-07-03", 30)
		self._stamp(self.t3, done="2026-07-03 09:00:00", rejected="2026-07-03 12:00:00")
		# planned on 07-05, never done → plan only
		self.t4 = self._todo("T4 planned", self.TARGET, "2026-07-05", 60,
			allocations=[{"allocation_date": "2026-07-05", "estimated_minutes": 60}])
		# a DIFFERENT user's todo — must be absent from target's logbook
		self.t5 = self._todo("T5 other", self.OTHER, "2026-07-02", 45,
			allocations=[{"allocation_date": "2026-07-02", "estimated_minutes": 45}])
		self._stamp(self.t5, done="2026-07-02 09:00:00", status=STATUS_COMPLETED, earned=99)
		frappe.db.commit()

	def _todo(self, to_do, assigned_to, deadline, estimated, allocations=None):
		doc = {"doctype": "Project Todo", "project_detail": self.detail, "to_do": to_do,
			"assigned_to": assigned_to, "start_date": self.FROM, "deadline": deadline,
			"estimated": estimated, "group": self.group, "level_id": self.level_id}
		if allocations:
			doc["allocations"] = allocations
		return frappe.get_doc(doc).insert(ignore_permissions=True).name

	def _stamp(self, name, done=None, status=None, rejected=None, earned=None):
		"""Write done/status/reject/points straight to the DB, bypassing the controller
		so phase-timestamp auto-stamping and ledger side effects don't fight the fixture."""
		vals = {}
		if done:
			vals["done_started_at"] = done
		if status:
			vals["status"] = status
		if rejected:
			vals["rejected_at"] = rejected
		if earned is not None:
			vals["assignee_earned"] = earned
		frappe.db.set_value("Project Todo", name, vals, update_modified=False)

	def tearDown(self):
		frappe.set_user("Administrator")
		for name in frappe.get_all("Project Todo", filters={"project_detail": self.detail}, pluck="name"):
			frappe.db.set_value("Project Todo", name, "status", STATUS_PLANNED, update_modified=False)
			frappe.delete_doc("Project Todo", name, ignore_permissions=True, force=True)
		frappe.delete_doc("Project Detail", self.detail, ignore_permissions=True, force=True)
		frappe.delete_doc("Glossary", self.grouping, ignore_permissions=True, force=True)
		frappe.delete_doc("Project", self.project.name, ignore_permissions=True, force=True)
		if frappe.db.exists("User", self.GUEST):
			frappe.delete_doc("User", self.GUEST, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_logbook_full_scenario(self):
		frappe.set_user("Administrator")  # System Manager viewing someone else's logbook
		out = logbook(self.FROM, self.TO, user=self.TARGET)

		self.assertEqual(out["user"], self.TARGET)
		self.assertEqual(out["from_date"], self.FROM)
		self.assertEqual(out["to_date"], self.TO)
		self.assertEqual(out["dates"],
			["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05"])

		days = {d["date"]: d for d in out["days"]}
		# PLAN buckets by allocation_date
		self.assertEqual([p["todo"] for p in days["2026-07-01"]["plan"]], [self.t1])
		self.assertEqual(days["2026-07-01"]["plan"][0]["planned_minutes"], 120)
		self.assertEqual([p["todo"] for p in days["2026-07-05"]["plan"]], [self.t4])
		self.assertEqual(days["2026-07-02"]["plan"], [])  # T5 (other user) absent
		# COMPLETED buckets by done-date
		self.assertEqual([c["todo"] for c in days["2026-07-02"]["completed"]], [self.t1])
		self.assertEqual([c["todo"] for c in days["2026-07-03"]["completed"]], [self.t3])
		self.assertEqual([c["todo"] for c in days["2026-07-04"]["completed"]], [self.t2])

		by_todo = {c["todo"]: c for d in out["days"] for c in d["completed"]}
		self.assertEqual(by_todo[self.t1]["early_days"], 1)
		self.assertEqual(by_todo[self.t1]["late_days"], 0)
		self.assertEqual(by_todo[self.t1]["result"], "approved")
		self.assertEqual(by_todo[self.t1]["points"], 50)
		self.assertEqual(by_todo[self.t2]["late_days"], 2)
		self.assertEqual(by_todo[self.t2]["early_days"], 0)
		self.assertEqual(by_todo[self.t2]["result"], "pending")
		self.assertEqual(by_todo[self.t3]["late_days"], 0)
		self.assertEqual(by_todo[self.t3]["early_days"], 0)
		self.assertEqual(by_todo[self.t3]["result"], "rejected")

		# other user's todo absent from both plan and completed
		seen = {x["todo"] for d in out["days"] for x in d["plan"] + d["completed"]}
		self.assertNotIn(self.t5, seen)

		s = out["summary"]
		self.assertEqual(s["planned_minutes"], 180)         # 120 + 60
		self.assertEqual(s["todos_planned"], 2)             # t1, t4
		self.assertEqual(s["todos_done"], 3)                # t1, t2, t3
		self.assertEqual(s["done_minutes_estimated"], 240)  # 120 + 90 + 30
		self.assertEqual(s["on_time"], 1)                   # t3
		self.assertEqual(s["late"], 1)                      # t2
		self.assertEqual(s["early"], 1)                     # t1
		self.assertEqual(s["approved"], 1)                  # t1
		self.assertEqual(s["rejected"], 1)                  # t3
		self.assertEqual(s["pending"], 1)                   # t2
		self.assertEqual(s["points_earned"], 50)
		self.assertAlmostEqual(s["on_time_rate"], 2 / 3)

	def test_self_scoped_needs_no_permission(self):
		frappe.set_user(self.TARGET)
		out = logbook(self.FROM, self.TO)  # own logbook, no user arg → no gate
		frappe.set_user("Administrator")
		self.assertEqual(out["user"], self.TARGET)
		self.assertEqual(out["summary"]["todos_done"], 3)

	def test_non_system_manager_cannot_view_other(self):
		frappe.set_user(self.GUEST)
		with self.assertRaises(frappe.PermissionError):
			logbook(self.FROM, self.TO, user=self.TARGET)
		frappe.set_user("Administrator")


class TestPreviousShiftShortfall(unittest.TestCase):
	"""Pure verdict for the home-page danger banner (_previous_shift_shortfall)."""

	def test_under_when_latest_shift_day_below_minimum(self):
		expected = {"2026-07-06": 480, "2026-07-08": 480}
		assigned = {"2026-07-06": 480, "2026-07-08": 300}
		out = _previous_shift_shortfall(expected, assigned, 480)
		self.assertTrue(out["under"])
		self.assertEqual(out["date"], "2026-07-08")  # most recent shift day wins
		self.assertEqual(out["assigned"], 300)
		self.assertEqual(out["minimum"], 480)
		self.assertEqual(out["expected"], 480)

	def test_ok_when_latest_shift_day_meets_minimum(self):
		out = _previous_shift_shortfall({"2026-07-08": 480}, {"2026-07-08": 480}, 480)
		self.assertFalse(out["under"])

	def test_picks_latest_shift_day_across_off_day_gap(self):
		# Sat/Sun are off -> simply absent from `expected`; the latest present day is judged.
		expected = {"2026-07-03": 480, "2026-07-06": 480}  # Fri, then Mon
		assigned = {"2026-07-03": 0, "2026-07-06": 200}
		out = _previous_shift_shortfall(expected, assigned, 480)
		self.assertEqual(out["date"], "2026-07-06")
		self.assertTrue(out["under"])

	def test_no_shift_days_returns_not_under(self):
		out = _previous_shift_shortfall({}, {"2026-07-08": 0}, 480)
		self.assertFalse(out["under"])
		self.assertIsNone(out["date"])

	def test_zero_threshold_never_under(self):
		out = _previous_shift_shortfall({"2026-07-08": 480}, {"2026-07-08": 0}, 0)
		self.assertFalse(out["under"])

	def test_missing_assigned_day_counts_as_zero(self):
		out = _previous_shift_shortfall({"2026-07-08": 480}, {}, 480)
		self.assertTrue(out["under"])
		self.assertEqual(out["assigned"], 0)
