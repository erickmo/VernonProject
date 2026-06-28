# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# evaluate_day is pure (stdlib only) so it imports nothing here; the DB-bound
# shell in Task B3 adds the frappe imports.

WEEKDAY_FIELDS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def _result(status, late_minutes=0, early_minutes=0, penalty_points=0, first_scan=None, last_scan=None):
	return {
		"status": status,
		"late_minutes": late_minutes,
		"early_minutes": early_minutes,
		"penalty_points": penalty_points,
		"first_scan": first_scan,
		"last_scan": last_scan,
	}


def evaluate_day(*, has_assignment, expected_start, expected_end, exception_type,
				 is_holiday, scans, grace_minutes, late_rate, early_rate, absence_penalty):
	"""Pure: compute a day's attendance status + penalty from plain inputs."""
	if not has_assignment:
		return _result("OffDay")
	if exception_type == "Leave":
		return _result("Excused-Leave")
	if exception_type == "WFH":
		return _result("Excused-WFH")
	if is_holiday:
		return _result("Holiday")
	if not scans:
		return _result("Absent", penalty_points=absence_penalty)

	first = min(scans)
	last = max(scans)
	raw_late = int((first - expected_start).total_seconds() // 60)
	raw_early = int((expected_end - last).total_seconds() // 60)
	late_min = max(0, raw_late - grace_minutes)
	early_min = max(0, raw_early - grace_minutes)
	penalty = late_min * late_rate + early_min * early_rate

	if late_min and early_min:
		status = "Late+EarlyLeave"
	elif late_min:
		status = "Late"
	elif early_min:
		status = "EarlyLeave"
	else:
		status = "Present"
	return _result(status, late_minutes=late_min, early_minutes=early_min,
				   penalty_points=penalty, first_scan=first, last_scan=last)
