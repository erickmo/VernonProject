# Copyright (c) 2026, Vernon and contributors

import unittest
from datetime import datetime

from vernon_project.attendance.engine import evaluate_day


def _args(**over):
	base = dict(
		has_assignment=True,
		expected_start=datetime(2026, 6, 1, 9, 0, 0),
		expected_end=datetime(2026, 6, 1, 17, 0, 0),
		exception_type=None,
		is_holiday=False,
		scans=[],
		grace_minutes=5,
		late_rate=2.0,
		early_rate=3.0,
		absence_penalty=50.0,
	)
	base.update(over)
	return base


class TestEvaluateDay(unittest.TestCase):
	def test_off_day_when_no_assignment(self):
		r = evaluate_day(**_args(has_assignment=False))
		self.assertEqual(r["status"], "OffDay")
		self.assertEqual(r["penalty_points"], 0)

	def test_leave_excused(self):
		r = evaluate_day(**_args(exception_type="Leave", scans=[]))
		self.assertEqual(r["status"], "Excused-Leave")
		self.assertEqual(r["penalty_points"], 0)

	def test_wfh_excused_without_scan(self):
		r = evaluate_day(**_args(exception_type="WFH", scans=[]))
		self.assertEqual(r["status"], "Excused-WFH")
		self.assertEqual(r["penalty_points"], 0)

	def test_holiday_excused(self):
		r = evaluate_day(**_args(is_holiday=True, scans=[]))
		self.assertEqual(r["status"], "Holiday")
		self.assertEqual(r["penalty_points"], 0)

	def test_absent_when_working_day_no_scans(self):
		r = evaluate_day(**_args(scans=[]))
		self.assertEqual(r["status"], "Absent")
		self.assertEqual(r["penalty_points"], 50.0)

	def test_present_within_grace(self):
		# in at 09:04 (within 5 min grace), out at 17:00 exactly
		r = evaluate_day(**_args(scans=[datetime(2026, 6, 1, 9, 4), datetime(2026, 6, 1, 17, 0)]))
		self.assertEqual(r["status"], "Present")
		self.assertEqual(r["late_minutes"], 0)
		self.assertEqual(r["early_minutes"], 0)
		self.assertEqual(r["penalty_points"], 0)

	def test_late_beyond_grace(self):
		# in at 09:20 -> 20 raw - 5 grace = 15 late min * 2.0 = 30
		r = evaluate_day(**_args(scans=[datetime(2026, 6, 1, 9, 20), datetime(2026, 6, 1, 17, 0)]))
		self.assertEqual(r["status"], "Late")
		self.assertEqual(r["late_minutes"], 15)
		self.assertEqual(r["penalty_points"], 30.0)

	def test_early_leave_beyond_grace(self):
		# out at 16:40 -> 20 raw - 5 = 15 early min * 3.0 = 45
		r = evaluate_day(**_args(scans=[datetime(2026, 6, 1, 9, 0), datetime(2026, 6, 1, 16, 40)]))
		self.assertEqual(r["status"], "EarlyLeave")
		self.assertEqual(r["early_minutes"], 15)
		self.assertEqual(r["penalty_points"], 45.0)

	def test_late_and_early(self):
		r = evaluate_day(**_args(scans=[datetime(2026, 6, 1, 9, 20), datetime(2026, 6, 1, 16, 40)]))
		self.assertEqual(r["status"], "Late+EarlyLeave")
		self.assertEqual(r["penalty_points"], 30.0 + 45.0)

	def test_first_and_last_scan_used(self):
		# many scans: earliest = check-in, latest = check-out
		scans = [
			datetime(2026, 6, 1, 12, 0),
			datetime(2026, 6, 1, 9, 2),
			datetime(2026, 6, 1, 17, 1),
			datetime(2026, 6, 1, 13, 0),
		]
		r = evaluate_day(**_args(scans=scans))
		self.assertEqual(r["first_scan"], datetime(2026, 6, 1, 9, 2))
		self.assertEqual(r["last_scan"], datetime(2026, 6, 1, 17, 1))
		self.assertEqual(r["status"], "Present")

	def test_single_scan_is_present_not_earlyleave(self):
		# one scan (checked in on time, not yet out) must NOT be early-leave
		r = evaluate_day(**_args(scans=[datetime(2026, 6, 1, 9, 0)]))
		self.assertEqual(r["status"], "Present")
		self.assertEqual(r["early_minutes"], 0)
		self.assertEqual(r["penalty_points"], 0)

	def test_single_late_scan_still_late(self):
		# a lone late check-in is still Late (late detection stays on single scan)
		r = evaluate_day(**_args(scans=[datetime(2026, 6, 1, 9, 20)]))
		self.assertEqual(r["status"], "Late")
		self.assertEqual(r["late_minutes"], 15)
		self.assertEqual(r["early_minutes"], 0)

	def test_late_at_grace_boundary(self):
		# exactly at grace = no penalty; one minute past = 1
		self.assertEqual(evaluate_day(**_args(scans=[datetime(2026,6,1,9,5), datetime(2026,6,1,17,0)]))["late_minutes"], 0)
		self.assertEqual(evaluate_day(**_args(scans=[datetime(2026,6,1,9,6), datetime(2026,6,1,17,0)]))["late_minutes"], 1)


if __name__ == "__main__":
	unittest.main()
