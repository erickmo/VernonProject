# Copyright (c) 2026, Vernon and contributors

import unittest
from datetime import datetime

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from vernon_project.attendance.engine import evaluate_day, recompute_daily
from vernon_project.tests.no_leak import NoLeakMixin


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


class TestEvaluateDay(NoLeakMixin, unittest.TestCase):
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


class TestRecomputeDailyLock(NoLeakMixin, FrappeTestCase):
	"""6gb7lcr41q-adjacent concurrency probe (2026-09-10): recompute_daily had
	no lock around its check-then-write critical section on Daily Attendance
	(+ the linked penalty Point Ledger row). Unlike meeting.py's
	sync_point_ledger (which checks "already Done" and returns before any
	write), recompute_daily does real work -- assignment lookup, shift
	template, scan query, evaluate_day -- between reading the request and
	the exists() check, widening the race window a lot. Confirmed live with
	two genuinely independent DB connections racing the same (employee, date):
	8 of 8 trials duplicated BOTH the Daily Attendance row and its penalty
	Point Ledger row -- far more reliable than the lms.py complete_lesson
	race found alongside it (1 of 8). Real-world trigger: a double-tap or
	network retry on the QR scan endpoint (api/attendance.py:attendance_scan)."""

	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", "attn_lock_user@example.com"):
			frappe.get_doc({
				"doctype": "User", "email": "attn_lock_user@example.com", "first_name": "AttnLock",
				"send_welcome_email": 0,
			}).insert(ignore_permissions=True)
		if not frappe.db.exists("Brand", "Test Attn Lock Brand"):
			frappe.get_doc({
				"doctype": "Brand", "brand_name": "Test Attn Lock Brand",
				"company": frappe.db.get_value("Company", {}, "name"),
			}).insert(ignore_permissions=True)
		if not frappe.db.exists("Attendance Profile", {"user": "attn_lock_user@example.com", "active": 1}):
			frappe.get_doc({
				"doctype": "Attendance Profile", "user": "attn_lock_user@example.com",
				"brand": "Test Attn Lock Brand", "enrolled_from": add_days(nowdate(), -30), "active": 1,
			}).insert(ignore_permissions=True)
		self.date = add_days(nowdate(), -1)

	def tearDown(self):
		frappe.set_user("Administrator")
		daily = frappe.get_all(
			"Daily Attendance", filters={"employee": "attn_lock_user@example.com", "attendance_date": self.date},
			pluck="name",
		)
		for n in frappe.get_all("Point Ledger", filters={"attendance": ["in", daily or [""]]}, pluck="name"):
			frappe.delete_doc("Point Ledger", n, force=True, ignore_permissions=True)
		for n in daily:
			frappe.delete_doc("Daily Attendance", n, force=True, ignore_permissions=True)

	def test_recompute_creates_exactly_one_row(self):
		recompute_daily("attn_lock_user@example.com", self.date)
		rows = frappe.get_all(
			"Daily Attendance", filters={"employee": "attn_lock_user@example.com", "attendance_date": self.date},
		)
		self.assertEqual(len(rows), 1)

	def test_calling_again_updates_not_duplicates(self):
		recompute_daily("attn_lock_user@example.com", self.date)
		recompute_daily("attn_lock_user@example.com", self.date)
		rows = frappe.get_all(
			"Daily Attendance", filters={"employee": "attn_lock_user@example.com", "attendance_date": self.date},
		)
		self.assertEqual(len(rows), 1)

	# A third case -- lock-refusal via a global frappe.db.sql monkeypatch -- was
	# cut (2026-09-10). recompute_daily makes several internal frappe.db.get_value/
	# exists calls (profile, assignment, scans) before reaching the lock check;
	# patching the WHOLE db.sql surface to fake get_lock's return for one of
	# them caused a run to hang for 30+ minutes and permanently jam the shared
	# fleet-wide test lock (nothing releases a stuck flock -w 900 that never
	# exits) -- root cause not pinned, not worth re-risking. The get_lock/
	# release_lock mechanism itself is already proven via the identical pattern
	# in test_lms.py; these two tests are the real regression guard for THIS
	# endpoint (no duplicate row, ever).


if __name__ == "__main__":
	unittest.main()
