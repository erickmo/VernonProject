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


def calendar_days(from_date, to_date):
	"""Inclusive calendar-day span. Pure. Per-event statutory limits count calendar days."""
	def _d(v):
		return v if isinstance(v, date) else date.fromisoformat(str(v)[:10])
	return (_d(to_date) - _d(from_date)).days + 1


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


def default_annual_type():
	"""Name of the Leave Type flagged is_default_annual (the annual pool). None if unseeded."""
	import frappe
	return frappe.db.get_value("Leave Type", {"is_default_annual": 1, "enabled": 1}, "name")


def used_days(employee, year, exclude=None, leave_type=None):
	"""Working-days of this employee's Leave exceptions (Approved OR Pending) in `year`
	for the given leave_type (defaults to the annual pool).

	Pending counts too, so a still-pending request reserves quota and closes the
	sequential double-book (two requests each fitting alone but not together).
	`exclude` drops the row being validated (its own days are added by the caller).
	"""
	import frappe

	lt = leave_type or default_annual_type()
	ys, ye = f"{year}-01-01", f"{year}-12-31"
	filters = {
		"employee": employee,
		"exception_type": "Leave",
		"leave_type": lt,
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


def prior_taken(employee):
	"""Per-employee opening balance: leave already taken THIS year before the system existed.

	# ponytail: single Int, applies only to the current calendar year; admin clears it
	# at year start (by next year all leave is system-recorded). Not year-tagged.
	"""
	import frappe

	return int(frappe.db.get_value("Employee Profile", {"user": employee}, "prior_leave_taken") or 0)


def used_including_prior(employee, year, exclude=None):
	"""System-recorded used days for `year`, plus the pre-system opening balance for the current year."""
	import frappe
	from frappe.utils import getdate, nowdate

	total = used_days(employee, year, exclude=exclude)
	if year == getdate(nowdate()).year:
		total += prior_taken(employee)
	return total


_GENDER_LABEL = {"Male": "laki-laki", "Female": "perempuan"}


def check_request(employee, leave_type_name, from_date, to_date, has_proof):
	"""Raise frappe.ValidationError (Bahasa) if this leave request violates its type's
	gender / proof / limit rules. Silent if OK. Authoritative — called by request_exception."""
	import frappe
	from frappe import _
	from frappe.utils import getdate, nowdate

	t = frappe.db.get_value(
		"Leave Type",
		{"name": leave_type_name, "enabled": 1},
		["name", "leave_name", "limit_kind", "day_limit", "gender", "requires_proof", "is_default_annual"],
		as_dict=True,
	)
	if not t:
		frappe.throw(_("Pilih kategori cuti."))

	# 1. Gender
	if t.gender and t.gender != "Any":
		emp_gender = frappe.db.get_value("Employee Profile", {"user": employee}, "gender")
		if not emp_gender:
			frappe.throw(_("Lengkapi jenis kelamin di profil Anda untuk mengajukan {0}.").format(t.leave_name))
		if emp_gender != t.gender:
			frappe.throw(_("{0} hanya untuk karyawan {1}.").format(t.leave_name, _GENDER_LABEL.get(t.gender, t.gender)))

	# 2. Proof
	if t.requires_proof and not has_proof:
		frappe.throw(_("{0} wajib melampirkan lampiran pendukung.").format(t.leave_name))

	# 3. Limit by kind
	if t.limit_kind == "Documented":
		return
	if t.limit_kind == "Per Event":
		span = calendar_days(from_date, to_date)
		if t.day_limit and span > t.day_limit:
			frappe.throw(_("{0} maksimal {1} hari per pengajuan.").format(t.leave_name, t.day_limit))
		return
	# Annual Quota
	requested = 0
	for (y, s, e) in year_slices(from_date, to_date):
		requested += working_days(employee, s, e)
	# Ceiling: default-annual type honours the per-employee override + prior balance.
	year = getdate(from_date).year
	if t.is_default_annual:
		ceiling = effective_quota(employee)
		used = used_days(employee, year, leave_type=t.name)
		if year == getdate(nowdate()).year:
			ceiling += 0  # prior_taken is added to `used`, not ceiling
			used += prior_taken(employee)
	else:
		ceiling = int(t.day_limit or 0)
		used = used_days(employee, year, leave_type=t.name)
	if used + requested > ceiling:
		remaining = max(ceiling - used, 0)
		frappe.throw(_("Sisa {0} Anda {1} hari, tidak cukup untuk {2} hari.").format(t.leave_name, remaining, requested))


if __name__ == "__main__":
	# Pure self-check for the year-split (no DB). Run: python leave_quota.py
	assert year_slices("2026-03-01", "2026-03-05") == [(2026, date(2026, 3, 1), date(2026, 3, 5))]
	xs = year_slices("2026-12-28", "2027-01-03")
	assert xs == [
		(2026, date(2026, 12, 28), date(2026, 12, 31)),
		(2027, date(2027, 1, 1), date(2027, 1, 3)),
	], xs
	assert year_slices("2026-06-10", "2026-06-10") == [(2026, date(2026, 6, 10), date(2026, 6, 10))]

	# calendar_days is pure — inclusive span.
	assert calendar_days("2026-03-01", "2026-03-03") == 3
	assert calendar_days("2026-03-01", "2026-03-01") == 1
	assert calendar_days("2026-12-31", "2027-01-02") == 3
	print("leave_quota self-check OK")
