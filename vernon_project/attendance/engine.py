# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# evaluate_day is pure (stdlib only) so it imports nothing here; the DB-bound
# shell in Task B3 adds the frappe imports.

import frappe
from frappe.utils import add_days, cint, flt, get_datetime, getdate, now_datetime, nowdate

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


def _active_profile(employee):
	row = frappe.db.get_value(
		"Attendance Profile", {"user": employee, "active": 1},
		["name", "brand", "enrolled_from"], as_dict=True,
	)
	return row


def _assignment_for(employee, date):
	"""Most recent effective Shift Assignment covering `date` whose weekday is set."""
	weekday_field = WEEKDAY_FIELDS[getdate(date).weekday()]
	rows = frappe.get_all(
		"Shift Assignment",
		filters={
			"employee": employee,
			"effective_from": ["<=", date],
			weekday_field: 1,
		},
		or_filters=[["effective_to", ">=", date], ["effective_to", "is", "not set"]],
		fields=["shift_template", "effective_from"],
		order_by="effective_from desc",
		limit=1,
	)
	return rows[0] if rows else None


def _approved_exception(employee, date):
	rows = frappe.get_all(
		"Attendance Exception",
		filters={
			"employee": employee,
			"status": "Approved",
			"from_date": ["<=", date],
			"to_date": [">=", date],
		},
		fields=["exception_type"],
		order_by="exception_type asc",  # 'Leave' < 'WFH' -> Leave wins ties
		limit=1,
	)
	return rows[0].exception_type if rows else None


def _is_holiday(brand, date):
	holiday_list = frappe.db.get_value("Brand", brand, "holiday_list")
	if not holiday_list:
		return False
	return bool(frappe.db.exists(
		"Attendance Holiday",
		{"parent": holiday_list, "parenttype": "Attendance Holiday List", "holiday_date": date},
	))


def _scans_on(employee, date):
	rows = frappe.get_all(
		"Attendance Scan",
		filters={"employee": employee, "scan_time": ["between", [f"{date} 00:00:00", f"{date} 23:59:59"]]},
		fields=["scan_time", "station"],
		order_by="scan_time asc",
	)
	return rows


def recompute_daily(employee, date):
	"""Rebuild Daily Attendance for (employee, date) from current sources. Idempotent."""
	date = getdate(date)
	if date > getdate(nowdate()):
		return None  # never compute the future; direct callers rely on this guard
	profile = _active_profile(employee)
	if not profile or getdate(profile.enrolled_from) > date:
		return None

	assignment = _assignment_for(employee, date)
	expected_start = expected_end = None
	shift_template = None
	if assignment:
		shift_template = assignment.shift_template
		start_t, end_t = frappe.db.get_value("Shift Template", shift_template, ["start_time", "end_time"])
		expected_start = get_datetime(f"{date} {start_t}")
		expected_end = get_datetime(f"{date} {end_t}")

	scan_rows = _scans_on(employee, date)
	result = evaluate_day(
		has_assignment=bool(assignment),
		expected_start=expected_start,
		expected_end=expected_end,
		exception_type=_approved_exception(employee, date),
		is_holiday=_is_holiday(profile.brand, date),
		scans=[get_datetime(r.scan_time) for r in scan_rows],
		grace_minutes=cint(frappe.db.get_single_value("Vernon Settings", "attendance_grace_minutes")),
		late_rate=flt(frappe.db.get_single_value("Vernon Settings", "late_penalty_per_minute")),
		early_rate=flt(frappe.db.get_single_value("Vernon Settings", "early_leave_penalty_per_minute")),
		absence_penalty=flt(frappe.db.get_single_value("Vernon Settings", "absence_penalty")),
	)

	values = {
		"employee": employee,
		"attendance_date": date,
		"status": result["status"],
		"shift_template": shift_template,
		"expected_start": expected_start,
		"expected_end": expected_end,
		"first_scan": result["first_scan"],
		"last_scan": result["last_scan"],
		"station_first": scan_rows[0].station if scan_rows else None,
		"station_last": scan_rows[-1].station if scan_rows else None,
		"late_minutes": result["late_minutes"],
		"early_minutes": result["early_minutes"],
		"penalty_points": result["penalty_points"],
	}
	existing = frappe.db.exists("Daily Attendance", {"employee": employee, "attendance_date": date})
	if existing:
		doc = frappe.get_doc("Daily Attendance", existing)
		doc.update(values)
		doc.save(ignore_permissions=True)
	else:
		doc = frappe.get_doc({"doctype": "Daily Attendance", **values})
		doc.insert(ignore_permissions=True)

	_upsert_penalty_ledger(doc.name, employee, result["penalty_points"])
	return result


def _upsert_penalty_ledger(daily_name, employee, penalty_points):
	"""Idempotent negative Point Ledger row keyed on the Daily Attendance docname."""
	values = {
		"user": employee,
		"source": "Attendance",
		"attendance": daily_name,
		"points_earned": -flt(penalty_points),
		"credited_on": now_datetime(),
	}
	existing = frappe.db.exists("Point Ledger", {"attendance": daily_name})
	if existing:
		doc = frappe.get_doc("Point Ledger", existing)
		doc.update(values)
		doc.save(ignore_permissions=True)
	else:
		frappe.get_doc({"doctype": "Point Ledger", **values}).insert(ignore_permissions=True)


def recompute_range(employee, from_date, to_date):
	"""Recompute each day in [from_date, min(to_date, today)]. Never computes the future."""
	today = getdate(nowdate())
	start = getdate(from_date)
	end = min(getdate(to_date), today) if to_date else today
	d = start
	while d <= end:
		recompute_daily(employee, d)
		d = add_days(d, 1)


def nightly_finalize():
	"""Scheduled daily: finalise yesterday for every active employee."""
	yesterday = add_days(nowdate(), -1)
	for emp in frappe.get_all("Attendance Profile", filters={"active": 1}, pluck="user"):
		try:
			recompute_daily(emp, yesterday)
		except Exception:
			frappe.log_error(title="attendance nightly_finalize failed")
