# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# Leave-quota computation. `year_slices` is pure (no frappe) so it self-checks
# via `python leave_quota.py`, mirroring attendance/approval.py.

from datetime import date

DEFAULT_QUOTA = 12


def year_slices(from_date, to_date):
	"""Split an inclusive [from, to] span into per-calendar-year (year, start, end) slices.

	A cross-year leave (Dec 28 -> Jan 3) consumes from BOTH years' quotas.
	Accepts date objects or ISO strings.
	"""
	def _d(v):
		return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])

	start, end = _d(from_date), _d(to_date)
	slices = []
	y = start.year
	while y <= end.year:
		ys, ye = date(y, 1, 1), date(y, 12, 31)
		slices.append((y, max(start, ys), min(end, ye)))
		y += 1
	return slices


def working_days(employee, start, end):
	"""Count working days in [start, end]: has a shift assignment that weekday AND not a holiday.

	Reuses attendance.engine helpers. An employee with no shift assignments counts 0
	(not on the attendance/shift system) -> their leave never consumes quota.
	"""
	import frappe
	from frappe.utils import add_days, getdate

	from vernon_project.attendance.engine import _assignment_for, _is_holiday

	brand = frappe.db.get_value("Attendance Profile", {"user": employee, "active": 1}, "brand")
	d, last, n = getdate(start), getdate(end), 0
	while d <= last:
		if _assignment_for(employee, d) and not (brand and _is_holiday(brand, d)):
			n += 1
		d = add_days(d, 1)
	return n


def effective_quota(employee):
	"""Per-employee override if set (non-zero), else the Vernon Settings global default."""
	import frappe

	q = frappe.db.get_value("Employee Profile", {"user": employee}, "annual_leave_quota")
	if q:
		return int(q)
	default = frappe.db.get_single_value("Vernon Settings", "default_annual_leave_quota")
	return int(default or DEFAULT_QUOTA)


def used_days(employee, year, exclude=None):
	"""Working-days of this employee's Leave exceptions (Approved OR Pending) in `year`.

	Pending counts too, so a still-pending request reserves quota and closes the
	sequential double-book (two requests each fitting alone but not together).
	`exclude` drops the row being validated (its own days are added by the caller).
	"""
	import frappe

	ys, ye = f"{year}-01-01", f"{year}-12-31"
	filters = {
		"employee": employee,
		"exception_type": "Leave",
		"status": ["in", ["Approved", "Pending"]],
		"from_date": ["<=", ye],
		"to_date": [">=", ys],
	}
	if exclude:
		filters["name"] = ["!=", exclude]
	total = 0
	for r in frappe.get_all("Attendance Exception", filters=filters, fields=["from_date", "to_date"]):
		for (y, s, e) in year_slices(r.from_date, r.to_date):
			if y == year:
				total += working_days(employee, s, e)
	return total


if __name__ == "__main__":
	# Pure self-check for the year-split (no DB). Run: python leave_quota.py
	assert year_slices("2026-03-01", "2026-03-05") == [(2026, date(2026, 3, 1), date(2026, 3, 5))]
	xs = year_slices("2026-12-28", "2027-01-03")
	assert xs == [
		(2026, date(2026, 12, 28), date(2026, 12, 31)),
		(2027, date(2027, 1, 1), date(2027, 1, 3)),
	], xs
	assert year_slices("2026-06-10", "2026-06-10") == [(2026, date(2026, 6, 10), date(2026, 6, 10))]
	print("leave_quota self-check OK")
