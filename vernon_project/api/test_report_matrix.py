import unittest
from vernon_project.api.report import _build_daily_matrix


class TestDailyMatrix(unittest.TestCase):
	def test_two_series_and_flags(self):
		users = [{"name": "u@x.com", "full_name": "U"}]
		assigned = [{"user": "u@x.com", "day": "2026-06-22", "minutes": 120}]
		planned = [{"user": "u@x.com", "day": "2026-06-22", "minutes": 90}]
		out = _build_daily_matrix(users, assigned, planned, "2026-06-22", "2026-06-23", threshold=100)
		row = out["rows"][0]
		self.assertEqual(row["per_day_assigned"]["2026-06-22"], 120)
		self.assertEqual(row["per_day_planned"]["2026-06-22"], 90)
		self.assertEqual(row["assigned_total"], 120)
		self.assertEqual(row["planned_total"], 90)
		# 2026-06-22 assigned 120 >= 100 (ok); 2026-06-23 assigned 0 < 100 (flagged)
		self.assertEqual(row["flagged_dates"], ["2026-06-23"])
