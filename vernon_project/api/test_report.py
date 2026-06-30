import unittest

import frappe
from vernon_project.api.report import (
	_date_list, _build_daily_matrix, _assigned_minutes,
	_build_under_occupied, daily_estimated_time, daily_estimated_time_access, under_occupied,
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
		rows = [
			{"user": "a@x.id", "day": "2026-06-22", "minutes": 120},
			{"user": "a@x.id", "day": "2026-06-22", "minutes": 60},  # same day -> already summed upstream; here distinct
			{"user": "a@x.id", "day": "2026-06-23", "minutes": 500},
		]
		out = _build_daily_matrix(users, rows, "2026-06-22", "2026-06-24", 480)
		row = out["rows"][0]
		# 2026-06-22 has two row entries -> they add; 24th missing -> 0
		self.assertEqual(row["per_day"], {"2026-06-22": 180, "2026-06-23": 500, "2026-06-24": 0})
		self.assertEqual(row["total"], 680)

	def test_flags_days_below_threshold(self):
		users = [{"name": "a@x.id", "full_name": "Alice"}]
		rows = [{"user": "a@x.id", "day": "2026-06-23", "minutes": 480}]  # exactly X -> NOT flagged
		out = _build_daily_matrix(users, rows, "2026-06-22", "2026-06-23", 480)
		# 22nd = 0 (< 480 -> flagged); 23rd = 480 (== X -> not flagged)
		self.assertEqual(out["rows"][0]["flagged_dates"], ["2026-06-22"])

	def test_zero_allocation_user_present_and_fully_flagged(self):
		users = [{"name": "b@x.id", "full_name": "Bob"}]
		out = _build_daily_matrix(users, [], "2026-06-22", "2026-06-23", 480)
		row = out["rows"][0]
		self.assertEqual(row["per_day"], {"2026-06-22": 0, "2026-06-23": 0})
		self.assertEqual(row["flagged_dates"], ["2026-06-22", "2026-06-23"])
		self.assertEqual(row["total"], 0)

	def test_full_name_falls_back_to_name(self):
		out = _build_daily_matrix([{"name": "c@x.id", "full_name": None}], [], "2026-06-22", "2026-06-22", 480)
		self.assertEqual(out["rows"][0]["full_name"], "c@x.id")

	def test_threshold_zero_flags_nothing(self):
		out = _build_daily_matrix([{"name": "a@x.id", "full_name": "A"}], [], "2026-06-22", "2026-06-22", 0)
		self.assertEqual(out["rows"][0]["flagged_dates"], [])

	def test_envelope_fields(self):
		out = _build_daily_matrix([], [], "2026-06-22", "2026-06-23", 480)
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
		# A user without System Manager must be rejected.
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
		# threshold echoes settings; dates inclusive; rows is a list
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
		frappe.set_user("Administrator")  # Administrator has System Manager
		self.assertEqual(daily_estimated_time_access(), {"can_view": True})

	def test_non_system_manager_cannot_view(self):
		if not frappe.db.exists("User", "report_access_guest@example.com"):
			frappe.get_doc({
				"doctype": "User", "email": "report_access_guest@example.com",
				"first_name": "Access", "send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		frappe.set_user("report_access_guest@example.com")
		self.assertEqual(daily_estimated_time_access(), {"can_view": False})


class TestBuildUnderOccupied(unittest.TestCase):
	"""Pure _build_under_occupied tests — no DB, no migration dependency."""

	def test_mixed_busy_idle(self):
		"""One busy day (600 min) + two idle days (60 min each) with threshold=480, tolerance=60."""
		users = [{"name": "mix@x.id", "full_name": "Mix"}]
		assigned = [
			{"user": "mix@x.id", "day": "2026-06-22", "minutes": 600},
			{"user": "mix@x.id", "day": "2026-06-23", "minutes": 60},
			{"user": "mix@x.id", "day": "2026-06-24", "minutes": 60},
		]
		out = _build_under_occupied(users, assigned, "2026-06-22", "2026-06-24", 480, 60)
		row = out["rows"][0]
		self.assertEqual(row["assigned_total"], 720)
		self.assertEqual(row["avg_daily"], 240)   # 720 / 3
		self.assertEqual(row["under_days"], 2)    # days 23, 24 < effective(420)
		self.assertEqual(row["deficit"], 840)     # max(0,480-600)+max(0,480-60)*2 = 0+420+420

	def test_tolerance_boundary_strict(self):
		"""avg_daily == effective must NOT be included (strict <)."""
		users = [{"name": "a@x.id", "full_name": "Alice"}]
		# threshold=480, tolerance=60 → effective=420; avg=420 → excluded
		assigned = [
			{"user": "a@x.id", "day": "2026-06-22", "minutes": 420},
			{"user": "a@x.id", "day": "2026-06-23", "minutes": 420},
			{"user": "a@x.id", "day": "2026-06-24", "minutes": 420},
		]
		out = _build_under_occupied(users, assigned, "2026-06-22", "2026-06-24", 480, 60)
		self.assertEqual(out["rows"], [])

	def test_empty_roster(self):
		out = _build_under_occupied([], [], "2026-06-22", "2026-06-24", 480, 60)
		self.assertEqual(out["rows"], [])
		self.assertEqual(out["threshold"], 480)
		self.assertEqual(out["tolerance"], 60)
		self.assertEqual(out["effective"], 420)
		self.assertEqual(out["day_count"], 3)

	def test_sort_by_deficit(self):
		"""Rows sorted by (-deficit, full_name); highest deficit first."""
		users = [
			{"name": "a@x.id", "full_name": "Alice"},
			{"name": "b@x.id", "full_name": "Bob"},
		]
		# threshold=480, tolerance=0 → effective=480
		# Bob has one day at 480 (not under effective), Alice has all zeros → larger deficit
		assigned = [{"user": "b@x.id", "day": "2026-06-22", "minutes": 480}]
		out = _build_under_occupied(users, assigned, "2026-06-22", "2026-06-23", 480, 0)
		# Alice: avg=0 < 480 (included), deficit=960; Bob: avg=240 < 480 (included), deficit=480
		self.assertEqual(out["rows"][0]["user"], "a@x.id")  # higher deficit first
		self.assertEqual(out["rows"][1]["user"], "b@x.id")

	def test_envelope_fields(self):
		out = _build_under_occupied([], [], "2026-06-22", "2026-06-24", 480, 60)
		self.assertEqual(out["from_date"], "2026-06-22")
		self.assertEqual(out["to_date"], "2026-06-24")
		self.assertEqual(out["effective"], 420)


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
		for key in ("threshold", "tolerance", "effective", "day_count", "rows"):
			self.assertIn(key, out)
		self.assertIsInstance(out["rows"], list)
		self.assertEqual(out["day_count"], 5)
