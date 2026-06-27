import unittest

from vernon_project.api.report import _date_list, _build_daily_matrix


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
