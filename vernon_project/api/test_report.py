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

	def test_includes_under_and_excludes_occupied(self):
		"""User with avg < effective is included; user with avg >= effective is excluded."""
		users = [
			{"name": "under@x.id", "full_name": "Under"},
			{"name": "over@x.id", "full_name": "Over"},
		]
		# threshold=480, tolerance=60 → effective=420
		# under@x.id: avg = round((400+400)/2) = 400 < 420 → included
		# over@x.id: avg = round((420+420)/2) = 420 == effective → excluded (strict <)
		assigned = [
			{"user": "under@x.id", "day": "2026-06-22", "minutes": 400},
			{"user": "under@x.id", "day": "2026-06-23", "minutes": 400},
			{"user": "over@x.id", "day": "2026-06-22", "minutes": 420},
			{"user": "over@x.id", "day": "2026-06-23", "minutes": 420},
		]
		out = _build_under_occupied(users, assigned, "2026-06-22", "2026-06-23", 480, 60)
		names = [r["user"] for r in out["rows"]]
		self.assertIn("under@x.id", names)
		self.assertNotIn("over@x.id", names)

	def test_tolerance_boundary_is_strict(self):
		"""avg_daily == effective (420) is excluded; avg_daily == 419 is included."""
		users = [
			{"name": "exact@x.id", "full_name": "Exact"},
			{"name": "low@x.id", "full_name": "Low"},
		]
		# threshold=480, tolerance=60 → effective=420
		# exact@x.id: 420 each day → avg=420 == effective → excluded
		# low@x.id: 419 each day → avg=419 < effective → included
		assigned = [
			{"user": "exact@x.id", "day": "2026-06-22", "minutes": 420},
			{"user": "exact@x.id", "day": "2026-06-23", "minutes": 420},
			{"user": "exact@x.id", "day": "2026-06-24", "minutes": 420},
			{"user": "low@x.id", "day": "2026-06-22", "minutes": 419},
			{"user": "low@x.id", "day": "2026-06-23", "minutes": 419},
			{"user": "low@x.id", "day": "2026-06-24", "minutes": 419},
		]
		out = _build_under_occupied(users, assigned, "2026-06-22", "2026-06-24", 480, 60)
		names = [r["user"] for r in out["rows"]]
		self.assertNotIn("exact@x.id", names)  # 420 → excluded
		self.assertIn("low@x.id", names)       # 419 → included

	def test_deficit_and_under_days_busy_days_do_not_cancel(self):
		"""Busy days contribute 0 to deficit (via max(0,...)); under_days counts days < effective."""
		users = [{"name": "mix@x.id", "full_name": "Mix"}]
		# threshold=480, tolerance=60 → effective=420
		# day 22: 960 (over threshold) → not under, deficit contribution = max(0,480-960)=0
		# day 23: 0 (under effective) → under, deficit contribution = max(0,480-0)=480
		# day 24: 60 (under effective) → under, deficit contribution = max(0,480-60)=420
		# avg = round((960+0+60)/3) = round(340) = 340 < 420 → included
		assigned = [
			{"user": "mix@x.id", "day": "2026-06-22", "minutes": 960},
			{"user": "mix@x.id", "day": "2026-06-23", "minutes": 0},
			{"user": "mix@x.id", "day": "2026-06-24", "minutes": 60},
		]
		out = _build_under_occupied(users, assigned, "2026-06-22", "2026-06-24", 480, 60)
		row = out["rows"][0]
		self.assertEqual(row["under_days"], 2)   # days 23, 24 < effective(420)
		self.assertEqual(row["deficit"], 900)    # 0 + 480 + 420; busy day doesn't cancel

	def test_empty_roster(self):
		out = _build_under_occupied([], [], "2026-06-22", "2026-06-24", 480, 60)
		self.assertEqual(out["rows"], [])
		self.assertEqual(out["threshold"], 480)
		self.assertEqual(out["tolerance"], 60)
		self.assertEqual(out["effective"], 420)
		self.assertEqual(out["day_count"], 3)

	def test_envelope_and_sort_by_deficit_desc(self):
		"""Envelope fields correct; rows sorted by (-deficit, full_name) descending."""
		users = [
			{"name": "a@x.id", "full_name": "Alice"},
			{"name": "b@x.id", "full_name": "Bob"},
		]
		# threshold=480, tolerance=0 → effective=480
		# Alice: all zeros → avg=0 < 480, deficit=480*2=960
		# Bob: day 22 has 480, day 23 has 0 → avg=round(480/2)=240 < 480, deficit=0+480=480
		assigned = [{"user": "b@x.id", "day": "2026-06-22", "minutes": 480}]
		out = _build_under_occupied(users, assigned, "2026-06-22", "2026-06-23", 480, 0)
		self.assertEqual(out["threshold"], 480)
		self.assertEqual(out["tolerance"], 0)
		self.assertEqual(out["effective"], 480)
		self.assertEqual(out["day_count"], 2)
		self.assertEqual(out["from_date"], "2026-06-22")
		self.assertEqual(out["to_date"], "2026-06-23")
		self.assertEqual(out["rows"][0]["user"], "a@x.id")  # deficit=960 first
		self.assertEqual(out["rows"][1]["user"], "b@x.id")  # deficit=480 second


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
