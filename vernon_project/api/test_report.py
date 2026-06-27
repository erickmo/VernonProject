import unittest

import frappe
from vernon_project.api.report import _date_list, _build_daily_matrix, daily_estimated_time


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
