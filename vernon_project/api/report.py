# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# Daily Estimated Time report + Under-Occupied report
# ---------------------------------------------------
# Shared endpoint for the web app and the mobile PWA. Aggregates each active
# user's Project Todo day-allocations into a user x day matrix and flags any
# day whose total falls below Vernon Settings.min_daily_estimated_minutes.

import datetime

import frappe
from frappe.utils import getdate, add_days, date_diff, nowdate

MAX_SPAN_DAYS = 92

# Weekday flags on Shift Assignment, indexed by date.weekday() (Mon=0 .. Sun=6).
WEEKDAY_FIELDS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

# Project Todo statuses excluded from the "due" buzz list (finished / dead — nothing to chase).
STATUS_COMPLETED = "✅ Completed"      # ✅ Completed
STATUS_CANCELLED = "\U0001f6ab Cancelled"  # 🚫 Cancelled
STATUS_PLANNED = "⚪️ Planned"       # ⚪️ Planned (medium white circle + variation selector)
STATUS_CHECKED = "\U0001f537 Checked By PL"   # 🔷 Checked By PL


def _date_list(from_date, to_date):
	"""Inclusive list of 'YYYY-MM-DD' strings from from_date to to_date."""
	start = getdate(from_date)
	span = date_diff(getdate(to_date), start)  # to - from, in days
	return [str(add_days(start, i)) for i in range(span + 1)]


def _build_daily_matrix(active_users, assigned_rows, planned_rows, from_date, to_date, threshold):
	"""Pivot two row-sets into a user x day matrix. `assigned_rows`/`planned_rows`:
	[{user, day, minutes}]. Days whose ASSIGNED total < threshold are flagged."""
	dates = _date_list(from_date, to_date)
	threshold = int(threshold or 0)

	def pivot(rows):
		by_user = {}
		for r in rows:
			by_user.setdefault(r["user"], {})
			day = str(r["day"])
			by_user[r["user"]][day] = by_user[r["user"]].get(day, 0) + int(r["minutes"] or 0)
		return by_user

	a_by_user = pivot(assigned_rows)
	p_by_user = pivot(planned_rows)

	out_rows = []
	for u in active_users:
		a = a_by_user.get(u["name"], {})
		p = p_by_user.get(u["name"], {})
		per_a, per_p, flagged = {}, {}, []
		a_total = p_total = 0
		for d in dates:
			am, pm = int(a.get(d, 0)), int(p.get(d, 0))
			per_a[d], per_p[d] = am, pm
			a_total += am
			p_total += pm
			if am < threshold:
				flagged.append(d)
		out_rows.append({
			"user": u["name"], "full_name": u.get("full_name") or u["name"],
			"per_day_assigned": per_a, "per_day_planned": per_p,
			"assigned_total": a_total, "planned_total": p_total, "flagged_dates": flagged,
		})

	return {"threshold": threshold, "from_date": str(getdate(from_date)),
		"to_date": str(getdate(to_date)), "dates": dates, "rows": out_rows}


def _is_system_manager():
	return "System Manager" in frappe.get_roles(frappe.session.user)


def _require_system_manager():
	if not _is_system_manager():
		frappe.throw("Not permitted", frappe.PermissionError)


@frappe.whitelist()
def daily_estimated_time_access():
	"""Whether the current user may view the Daily Estimated Time report.
	Single source for the web/mobile nav+page gate — same rule the report
	endpoint enforces, so the UI can hide the entry without a 403 round-trip."""
	return {"can_view": _is_system_manager()}


def _active_users():
	"""Enabled System Users, excluding Guest/Administrator. [{name, full_name}]."""
	return frappe.get_all(
		"User",
		filters={
			"enabled": 1,
			"user_type": "System User",
			"name": ["not in", ("Guest", "Administrator")],
		},
		fields=["name", "full_name"],
		order_by="full_name asc",
		limit_page_length=0,
	)


def _assigned_minutes(names, from_date, to_date):
	"""Assigned minutes per user per day for the given user list and date range.
	Handles explicit Project Todo Assigned Allocation rows + virtual-default dedup
	(todos with no explicit rows contribute their full estimate on their deadline).
	Returns [{user, day, minutes}]. Empty list when names is empty."""
	if not names:
		return []
	from_date, to_date = str(getdate(from_date)), str(getdate(to_date))
	# Explicit assigned allocation rows in range.
	explicit = frappe.db.sql(
		"""
		SELECT todo.assigned_to AS user, alloc.allocation_date AS day,
		       SUM(alloc.estimated_minutes) AS minutes, todo.name AS todo
		FROM `tabProject Todo Assigned Allocation` AS alloc
		JOIN `tabProject Todo` AS todo ON alloc.parent = todo.name
		WHERE todo.assigned_to IN %(users)s AND alloc.parenttype = 'Project Todo'
		  AND todo.status != '\U0001f6ab Cancelled'
		  AND alloc.allocation_date BETWEEN %(from_date)s AND %(to_date)s
		GROUP BY todo.assigned_to, alloc.allocation_date, todo.name
		""",
		{"users": names, "from_date": str(from_date), "to_date": str(to_date)}, as_dict=True,
	)
	todos_with_explicit = {r["todo"] for r in explicit}
	result = [{"user": r["user"], "day": r["day"], "minutes": r["minutes"]} for r in explicit]
	# Virtual default: todos with NO explicit assigned rows contribute their whole
	# estimate on their deadline (if the deadline falls in range).
	defaults = frappe.db.sql(
		"""
		SELECT name AS todo, assigned_to AS user, deadline AS day, estimated AS minutes
		FROM `tabProject Todo`
		WHERE assigned_to IN %(users)s AND IFNULL(estimated, 0) > 0
		  AND status != '\U0001f6ab Cancelled'
		  AND deadline BETWEEN %(from_date)s AND %(to_date)s
		""",
		{"users": names, "from_date": str(from_date), "to_date": str(to_date)}, as_dict=True,
	)
	for r in defaults:
		if r["todo"] not in todos_with_explicit:
			result.append({"user": r["user"], "day": r["day"], "minutes": r["minutes"]})
	return result


@frappe.whitelist()
def daily_estimated_time(from_date, to_date):
	"""Per-active-user daily estimated minutes (Project Todo day-allocations)
	for the inclusive [from_date, to_date] range, with below-threshold days flagged.
	Shared by the web app and the mobile PWA."""
	_require_system_manager()

	start = getdate(from_date)
	end = getdate(to_date)
	if end < start:
		frappe.throw("from_date must be on or before to_date.", frappe.ValidationError)
	if date_diff(end, start) > MAX_SPAN_DAYS:
		frappe.throw(f"Date range too large (max {MAX_SPAN_DAYS} days).", frappe.ValidationError)

	threshold = frappe.db.get_single_value("Vernon Settings", "min_daily_estimated_minutes") or 0

	users = _active_users()
	names = [u["name"] for u in users]

	planned_rows = []
	if names:
		# GROUP BY in SQL (precedent: daily_assignment_report.py). assigned_to lives on
		# the parent Project Todo; estimated_minutes on its Allocation child rows.
		planned_rows = frappe.db.sql(
			"""
			SELECT todo.assigned_to AS user,
			       alloc.allocation_date AS day,
			       SUM(alloc.estimated_minutes) AS minutes
			FROM `tabProject Todo Allocation` AS alloc
			JOIN `tabProject Todo` AS todo ON alloc.parent = todo.name
			WHERE todo.assigned_to IN %(users)s
			  AND alloc.parenttype = 'Project Todo'
			  AND todo.status != '\U0001f6ab Cancelled'
			  AND alloc.allocation_date BETWEEN %(from_date)s AND %(to_date)s
			GROUP BY todo.assigned_to, alloc.allocation_date
			""",
			{"users": names, "from_date": str(start), "to_date": str(end)},
			as_dict=True,
		)

	assigned_rows = _assigned_minutes(names, str(start), str(end))

	return _build_daily_matrix(users, assigned_rows, planned_rows, start, end, threshold)


def _time_to_minutes(t):
	"""A Shift Template Time value → minutes past midnight. Accepts timedelta,
	datetime.time, or 'HH:MM[:SS]' strings. None → None."""
	if t is None:
		return None
	if isinstance(t, datetime.timedelta):
		return int(t.total_seconds() // 60)
	if isinstance(t, datetime.time):
		return t.hour * 60 + t.minute
	if isinstance(t, str):
		parts = t.split(":")
		return int(parts[0]) * 60 + int(parts[1])
	return None


def _template_minutes(start, end):
	"""Length of a shift in minutes. Missing/non-positive → 0. Overnight shifts
	aren't supported (Shift Template forbids end ≤ start), so plain subtraction is safe."""
	s, e = _time_to_minutes(start), _time_to_minutes(end)
	if s is None or e is None:
		return 0
	return max(0, e - s)


def _resolve_expected(names, dates, assignments, template_minutes, holidays):
	"""Pure: per user per day, the scheduled shift minutes. For each day, pick the
	latest-effective Shift Assignment that covers it and has that weekday set; skip
	off days, holidays, and 0-minute templates. Returns [{user, day, minutes}] — days
	with no shift produce NO row (the occupancy builders leave those days unevaluated)."""
	by_emp = {}
	for a in assignments:
		by_emp.setdefault(a["employee"], []).append(a)

	out = []
	for u in names:
		u_assigns = by_emp.get(u, [])
		u_holidays = holidays.get(u) or set()
		for d in dates:
			if d in u_holidays:
				continue
			weekday_field = WEEKDAY_FIELDS[getdate(d).weekday()]
			chosen = None
			for a in u_assigns:
				covers = str(a["effective_from"]) <= d and (
					not a.get("effective_to") or str(a["effective_to"]) >= d
				)
				if covers and a.get(weekday_field):
					if chosen is None or str(a["effective_from"]) >= str(chosen["effective_from"]):
						chosen = a
			if not chosen:
				continue
			minutes = int(template_minutes.get(chosen["shift_template"], 0) or 0)
			if minutes > 0:
				out.append({"user": u, "day": d, "minutes": minutes})
	return out


def _holidays_by_user(names, from_date, to_date):
	"""{user: set('YYYY-MM-DD')} of holidays in range via active Attendance Profile →
	Brand.holiday_list → Attendance Holiday. Users without a profile/brand → no holidays."""
	profiles = frappe.get_all(
		"Attendance Profile",
		filters={"user": ["in", names], "active": 1},
		fields=["user", "brand"],
	)
	if not profiles:
		return {}
	list_by_brand = {
		b: frappe.db.get_value("Brand", b, "holiday_list")
		for b in {p["brand"] for p in profiles if p.get("brand")}
	}
	dates_by_list = {}
	for hl in {v for v in list_by_brand.values() if v}:
		days = frappe.get_all(
			"Attendance Holiday",
			filters={
				"parent": hl, "parenttype": "Attendance Holiday List",
				"holiday_date": ["between", [from_date, to_date]],
			},
			pluck="holiday_date",
		)
		dates_by_list[hl] = {str(d) for d in days}
	out = {}
	for p in profiles:
		hl = list_by_brand.get(p.get("brand"))
		if hl and dates_by_list.get(hl):
			out.setdefault(p["user"], set()).update(dates_by_list[hl])
	return out


def _expected_minutes(names, from_date, to_date):
	"""Expected working minutes per user per day from Shift Assignment → Shift Template,
	for the inclusive [from_date, to_date] range. Works for any date (past or future),
	unlike Daily Attendance. Returns [{user, day, minutes}]; off/holiday days omitted."""
	if not names:
		return []
	from_date, to_date = str(getdate(from_date)), str(getdate(to_date))
	assignments = frappe.get_all(
		"Shift Assignment",
		filters={"employee": ["in", names], "effective_from": ["<=", to_date]},
		or_filters=[["effective_to", ">=", from_date], ["effective_to", "is", "not set"]],
		fields=["employee", "shift_template", "effective_from", "effective_to", *WEEKDAY_FIELDS],
	)
	if not assignments:
		return []
	template_minutes = {
		t["name"]: _template_minutes(t.get("start_time"), t.get("end_time"))
		for t in frappe.get_all("Shift Template", fields=["name", "start_time", "end_time"])
	}
	holidays = _holidays_by_user(names, from_date, to_date)
	return _resolve_expected(names, _date_list(from_date, to_date), assignments, template_minutes, holidays)


def _daily_minimum(is_holiday, has_assignments, chosen, global_min):
	"""Pure: the daily floor in minutes for one user-day.

	is_holiday:      date is a holiday for the user  -> 0.
	chosen:          {'min': int} for the covering shift on this weekday, or None (day off /
	                 no covering assignment). Shift min>0 overrides; else the global floor.
	has_assignments: user has >=1 covering Shift Assignment. No assignments at all -> global
	                 (works every weekday); assignments but this weekday off (chosen None) -> 0.
	global_min:      the per-weekday global floor for this date (from Vernon Settings), already
	                 resolved by the caller.
	"""
	global_min = int(global_min or 0)
	if is_holiday:
		return 0
	if chosen is not None:
		return int(chosen["min"]) if chosen.get("min") else global_min
	return 0 if has_assignments else global_min


# Per-weekday minimum fields on Brand, indexed by date.weekday() (Mon=0..Sun=6).
WEEKDAY_MIN_FIELDS = [
	"min_minutes_monday", "min_minutes_tuesday", "min_minutes_wednesday", "min_minutes_thursday",
	"min_minutes_friday", "min_minutes_saturday", "min_minutes_sunday",
]


def _resolve_min_minutes(user, date):
	"""Per-user daily minimum estimated minutes for one date — the auto-plan / underperformed /
	assignment-overload floor, and the recurrence skip-a-0-day gate. The base is the user's
	Brand per-weekday minimum (Brand.min_minutes_<weekday>), which is authoritative: 0 = the
	brand does not work that weekday. Users with no Brand (no active Attendance Profile) fall
	back to the flat Vernon Settings min_daily_estimated_minutes. A covering Shift
	Template.minimum_estimated_minutes overrides the base for that user; holidays and non-shift
	weekdays (a user who has shifts but is off this weekday) -> 0."""
	wd = getdate(date).weekday()
	date = str(getdate(date))
	brand = frappe.db.get_value("Attendance Profile", {"user": user, "active": 1}, "brand") if user else None
	if brand:
		base = int(frappe.db.get_value("Brand", brand, WEEKDAY_MIN_FIELDS[wd]) or 0)
	else:
		base = int(frappe.db.get_single_value("Vernon Settings", "min_daily_estimated_minutes") or 0)
	is_holiday = date in (_holidays_by_user([user], date, date).get(user) or set())
	assignments = frappe.get_all(
		"Shift Assignment",
		filters={"employee": user, "effective_from": ["<=", date]},
		or_filters=[["effective_to", ">=", date], ["effective_to", "is", "not set"]],
		fields=["shift_template", "effective_from", "effective_to", *WEEKDAY_FIELDS],
	)
	chosen_assign = None
	for a in assignments:
		if a.get(WEEKDAY_FIELDS[wd]) and (
			chosen_assign is None
			or str(a["effective_from"]) >= str(chosen_assign["effective_from"])
		):
			chosen_assign = a
	chosen = None
	if chosen_assign:
		chosen = {"min": int(frappe.db.get_value(
			"Shift Template", chosen_assign["shift_template"], "minimum_estimated_minutes") or 0)}
	return _daily_minimum(is_holiday, bool(assignments), chosen, base)


def _pivot(rows):
	"""[{user, day, minutes}] → {user: {day: minutes}}, summing duplicate day entries."""
	out = {}
	for r in rows:
		out.setdefault(r["user"], {})
		day = str(r["day"])
		out[r["user"]][day] = out[r["user"]].get(day, 0) + int(r["minutes"] or 0)
	return out


def _occupancy_envelope(tolerance, day_count, from_date, to_date, rows):
	return {
		"tolerance": tolerance,
		"day_count": day_count,
		"from_date": str(getdate(from_date)),
		"to_date": str(getdate(to_date)),
		"rows": rows,
	}


def _validated_range(from_date, to_date):
	start, end = getdate(from_date), getdate(to_date)
	if end < start:
		frappe.throw("from_date must be on or before to_date.", frappe.ValidationError)
	if date_diff(end, start) > MAX_SPAN_DAYS:
		frappe.throw(f"Date range too large (max {MAX_SPAN_DAYS} days).", frappe.ValidationError)
	return start, end


def _build_under_occupied(active_users, assigned_rows, expected_rows, from_date, to_date, tolerance):
	"""Pure aggregator for the Under-Occupied report — per-user shift target.

	Only days with a resolved shift target (a row in `expected_rows`) are evaluated;
	days with no shift carry no target and are ignored. For an evaluated day with
	target t and assigned a:
	  under day  ->  a < t - tolerance    (strict)
	  deficit   +=  max(0, t - a)         (over-target days don't cancel)
	A user is included when they have >= 1 under day. Sorted by (-deficit, full_name).
	"""
	tolerance = int(tolerance or 0)
	day_count = len(_date_list(from_date, to_date))
	assigned = _pivot(assigned_rows)
	expected = _pivot(expected_rows)

	rows = []
	for u in active_users:
		a = assigned.get(u["name"], {})
		t = expected.get(u["name"], {})
		if not t:
			continue  # no shift days in range -> no verdict
		under_days = sum(1 for d in t if a.get(d, 0) < t[d] - tolerance)
		if not under_days:
			continue
		rows.append({
			"user": u["name"],
			"full_name": u.get("full_name") or u["name"],
			"assigned_total": sum(a.get(d, 0) for d in t),
			"expected_total": sum(t.values()),
			"under_days": under_days,
			"deficit": sum(max(0, t[d] - a.get(d, 0)) for d in t),
		})

	rows.sort(key=lambda r: (-r["deficit"], r["full_name"]))
	return _occupancy_envelope(tolerance, day_count, from_date, to_date, rows)


@frappe.whitelist()
def under_occupied(from_date, to_date):
	"""Under-occupied users for the inclusive [from_date, to_date] range. A user is
	under-occupied when their assigned minutes fall below their scheduled shift minutes
	(per day, from Shift Assignment -> Shift Template) by more than the tolerance.
	Days with no shift carry no target and are ignored."""
	_require_system_manager()
	start, end = _validated_range(from_date, to_date)
	tolerance = frappe.db.get_single_value("Vernon Settings", "under_occupied_tolerance_minutes") or 0

	users = _active_users()
	names = [u["name"] for u in users]
	assigned_rows = _assigned_minutes(names, str(start), str(end))
	expected_rows = _expected_minutes(names, str(start), str(end))

	return _build_under_occupied(users, assigned_rows, expected_rows, start, end, tolerance)


def _build_over_occupied(active_users, assigned_rows, expected_rows, from_date, to_date, tolerance):
	"""Pure aggregator for the Over-Occupied report — mirror of under, per-user shift target.

	For an evaluated day (a shift day) with target t and assigned a:
	  over day  ->  a > t + tolerance     (strict)
	  surplus  +=  max(0, a - t)          (light days don't cancel)
	A user is included when they have >= 1 over day. Sorted by (-surplus, full_name).
	"""
	tolerance = int(tolerance or 0)
	day_count = len(_date_list(from_date, to_date))
	assigned = _pivot(assigned_rows)
	expected = _pivot(expected_rows)

	rows = []
	for u in active_users:
		a = assigned.get(u["name"], {})
		t = expected.get(u["name"], {})
		if not t:
			continue
		over_days = sum(1 for d in t if a.get(d, 0) > t[d] + tolerance)
		if not over_days:
			continue
		rows.append({
			"user": u["name"],
			"full_name": u.get("full_name") or u["name"],
			"assigned_total": sum(a.get(d, 0) for d in t),
			"expected_total": sum(t.values()),
			"over_days": over_days,
			"surplus": sum(max(0, a.get(d, 0) - t[d]) for d in t),
		})

	rows.sort(key=lambda r: (-r["surplus"], r["full_name"]))
	return _occupancy_envelope(tolerance, day_count, from_date, to_date, rows)


@frappe.whitelist()
def over_occupied(from_date, to_date):
	"""Over-occupied users for the inclusive [from_date, to_date] range. A user is
	over-occupied when their assigned minutes rise above their scheduled shift minutes
	(per day, from Shift Assignment -> Shift Template) by more than the tolerance —
	the same per-user target and slack band the Under-Occupied report uses, mirrored up."""
	_require_system_manager()
	start, end = _validated_range(from_date, to_date)
	tolerance = frappe.db.get_single_value("Vernon Settings", "under_occupied_tolerance_minutes") or 0

	users = _active_users()
	names = [u["name"] for u in users]
	assigned_rows = _assigned_minutes(names, str(start), str(end))
	expected_rows = _expected_minutes(names, str(start), str(end))

	return _build_over_occupied(users, assigned_rows, expected_rows, start, end, tolerance)


def _overload_verdict(assigned, added, minimum, tolerance):
	"""Pure: would `added` minutes on top of `assigned` push a user's day above the daily
	minimum + tolerance? Strict >. Returns the advisory dict for the assignee picker."""
	assigned, added = int(assigned or 0), int(added or 0)
	minimum, tolerance = int(minimum or 0), int(tolerance or 0)
	return {
		"over": minimum > 0 and (assigned + added) > (minimum + tolerance),
		"assigned": assigned,
		"added": added,
		"minimum": minimum,
		"tolerance": tolerance,
	}


@frappe.whitelist()
def assignment_overload_check(user, date, added_minutes):
	"""Advisory for the assignee picker: does assigning `added_minutes` of work to `user` on
	`date` push their day total above the daily minimum + tolerance? Non-blocking. `assigned`
	= the user's already-allocated minutes that day (same source as the Over-Occupied report).
	ponytail: on self-reassign the todo's own virtual-default allocation is already counted in
	`assigned`, so the estimate can double-count — acceptable for a soft warning; the UI only
	shows it when the assignee actually changes. Session-authed (whitelist); returns aggregate
	minutes only, no todo content."""
	user = frappe.utils.cstr(user)
	date = str(getdate(date))
	added = frappe.utils.cint(added_minutes)
	minimum = _resolve_min_minutes(user, date)
	tolerance = int(frappe.db.get_single_value("Vernon Settings", "under_occupied_tolerance_minutes") or 0)
	assigned = _pivot(_assigned_minutes([user], date, date)).get(user, {}).get(date, 0)
	verdict = _overload_verdict(assigned, added, minimum, tolerance)
	verdict.update({"user": user, "date": date})
	return verdict


# Days to look back for the current user's most recent scheduled shift day.
PREV_SHIFT_LOOKBACK_DAYS = 14


def _previous_shift_shortfall(expected_by_day, assigned_by_day, threshold):
	"""Pure verdict for the home-page danger banner. Both dicts are {'YYYY-MM-DD': minutes}
	for ONE user; `expected_by_day` already excludes off/holiday days (no shift -> no key),
	so its latest key is the most recent scheduled shift day. A day is a shortfall when its
	assigned/estimated minutes fall below `threshold` (Min Daily Estimated Minutes).
	Returns under=False (and date=None) when there is nothing to evaluate."""
	threshold = int(threshold or 0)
	if threshold <= 0 or not expected_by_day:
		return {"under": False, "date": None, "assigned": 0, "minimum": threshold, "expected": 0}
	day = max(expected_by_day)  # ISO date strings sort chronologically
	assigned = int(assigned_by_day.get(day, 0))
	return {
		"under": assigned < threshold,
		"date": day,
		"assigned": assigned,
		"minimum": threshold,
		"expected": int(expected_by_day[day]),
	}


@frappe.whitelist()
def my_previous_shift_shortfall():
	"""Home-page danger banner: did the CURRENT user's most recent scheduled shift day
	(before today) fall below their resolved daily minimum in assigned minutes? Off/holiday
	days are skipped (no shift target), matching the Under-Occupied report. Also returns
	`today_minimum` (the resolved floor for TODAY) so the auto-plan can fill toward it.
	Self-serve — scoped to the caller only, so no System-Manager gate."""
	user = frappe.session.user
	if user in ("Guest", "Administrator"):
		verdict = _previous_shift_shortfall({}, {}, 0)
		verdict["today_minimum"] = 0
		return verdict
	end = add_days(getdate(nowdate()), -1)  # strictly before today
	start = add_days(end, -(PREV_SHIFT_LOOKBACK_DAYS - 1))
	names = [user]
	expected = _pivot(_expected_minutes(names, str(start), str(end))).get(user, {})
	assigned = _pivot(_assigned_minutes(names, str(start), str(end))).get(user, {})
	day = max(expected) if expected else None
	threshold = _resolve_min_minutes(user, day) if day else 0
	verdict = _previous_shift_shortfall(expected, assigned, threshold)
	verdict["today_minimum"] = _resolve_min_minutes(user, str(nowdate()))
	return verdict


def _build_todos_due(role_by_project, todos, users, due, today):
	"""Pure: shape open Project Todos into a "who to chase" list, deadline ascending.

	role_by_project: {project: {my_role, project_name}} for the caller's projects.
	todos: [{name, to_do, project, assigned_to, deadline, status}] — already filtered
	       to open, assigned, deadline <= due; order is re-established here.
	users:  {user: {full_name, email, mobile_no, name}} assignee contact lookup.
	`overdue` = deadline strictly before `today`. Rows sorted by (deadline asc,
	project_name) so the soonest-due sit at the top of the buzz list.
	"""
	rows = []
	for t in todos:
		u = users.get(t["assigned_to"], {})
		meta = role_by_project.get(t["project"], {})
		deadline = t.get("deadline")
		deadline_str = str(deadline) if deadline else None
		rows.append({
			"todo": t["name"],
			"to_do": t.get("to_do"),
			"project": t["project"],
			"project_name": meta.get("project_name") or t["project"],
			"my_role": meta.get("my_role", ""),
			"deadline": deadline_str,
			"status": t.get("status"),
			"assigned_to": t["assigned_to"],
			"assignee_name": u.get("full_name") or t["assigned_to"],
			"assignee_email": u.get("email") or u.get("name") or t["assigned_to"],
			"assignee_mobile": u.get("mobile_no"),
			"overdue": bool(deadline and getdate(deadline) < today),
		})
	rows.sort(key=lambda r: (r["deadline"] is None, r["deadline"] or "", r["project_name"]))
	return {"due_by": str(due), "rows": rows}


@frappe.whitelist()
def todos_due(due_by):
	"""Open Project Todos across the projects the current user owns / leads / admins,
	with a deadline on or before `due_by` (overdue included), soonest first. Each row
	carries the assignee's name, email and mobile so the caller can chase them on- or
	off-system. Personal report: inherently scoped to frappe.session.user's projects,
	so no role gate — a user only ever sees todos in projects they run."""
	me = frappe.session.user
	due = getdate(due_by)

	projects = frappe.get_all(
		"Project",
		or_filters={"project_owner": me, "project_leader": me, "project_admin": me},
		fields=["name", "project_name", "project_owner", "project_leader", "project_admin"],
		limit_page_length=0,
	)
	role_by_project = {}
	for p in projects:
		roles = []
		if p["project_owner"] == me:
			roles.append("Owner")
		if p["project_leader"] == me:
			roles.append("Leader")
		if p["project_admin"] == me:
			roles.append("Admin")
		role_by_project[p["name"]] = {
			"my_role": ", ".join(roles),
			"project_name": p.get("project_name") or p["name"],
		}
	if not role_by_project:
		return {"due_by": str(due), "rows": []}

	todos = frappe.get_all(
		"Project Todo",
		filters={
			"project": ["in", list(role_by_project)],
			"deadline": ["<=", str(due)],
			"assigned_to": ["is", "set"],
			"status": ["not in", [STATUS_COMPLETED, STATUS_CANCELLED]],
		},
		fields=["name", "to_do", "project", "assigned_to", "deadline", "status"],
		order_by="deadline asc",
		limit_page_length=0,
	)

	uids = list({t["assigned_to"] for t in todos})
	users = {
		u["name"]: u
		for u in frappe.get_all(
			"User",
			filters={"name": ["in", uids]},
			fields=["name", "full_name", "email", "mobile_no"],
			limit_page_length=0,
		)
	} if uids else {}

	return _build_todos_due(role_by_project, todos, users, due, getdate())


@frappe.whitelist()
def logbook(from_date, to_date, user=None):
	"""Per-day plan-vs-done logbook for one user over the inclusive [from_date, to_date]
	range. Self-scoped by default (frappe.session.user); a System Manager may pass `user`
	to view anyone else's logbook. Each day lists the todos the user planned to work on
	(from their day allocations) and the todos they marked done that day, with lateness,
	approval result and points, plus a range summary."""
	caller = frappe.session.user
	target = user or caller
	if user and user != caller:
		_require_system_manager()

	start, end = _validated_range(from_date, to_date)
	dates = _date_list(start, end)
	params = {"target": target, "from_date": str(start), "to_date": str(end),
		"cancelled": STATUS_CANCELLED}

	# PLAN: one row per (todo, allocation day) the user scheduled work in range.
	plan_rows = frappe.db.sql(
		"""
		SELECT todo.name AS todo, todo.to_do AS to_do, todo.project AS project,
		       todo.project_detail AS project_detail, proj.project_name AS project_name,
		       todo.estimated AS estimated, todo.deadline AS deadline,
		       alloc.allocation_date AS allocation_date,
		       alloc.estimated_minutes AS planned_minutes
		FROM `tabProject Todo Allocation` AS alloc
		JOIN `tabProject Todo` AS todo ON alloc.parent = todo.name
		LEFT JOIN `tabProject` AS proj ON todo.project = proj.name
		WHERE todo.assigned_to = %(target)s
		  AND alloc.parenttype = 'Project Todo'
		  AND alloc.allocation_date BETWEEN %(from_date)s AND %(to_date)s
		ORDER BY alloc.allocation_date, todo.name
		""",
		params, as_dict=True,
	)

	# COMPLETED: one row per todo whose done-date (done_started_at, else developed_at)
	# lands in range. Cancelled todos are dead — excluded.
	completed_rows = frappe.db.sql(
		"""
		SELECT todo.name AS todo, todo.to_do AS to_do, todo.project AS project,
		       todo.project_detail AS project_detail, proj.project_name AS project_name,
		       todo.estimated AS estimated, todo.deadline AS deadline,
		       todo.status AS status, todo.rejected_at AS rejected_at,
		       todo.assignee_earned AS assignee_earned,
		       DATE(COALESCE(todo.done_started_at, todo.developed_at)) AS done_on
		FROM `tabProject Todo` AS todo
		LEFT JOIN `tabProject` AS proj ON todo.project = proj.name
		WHERE todo.assigned_to = %(target)s
		  AND todo.status != %(cancelled)s
		  AND DATE(COALESCE(todo.done_started_at, todo.developed_at))
		      BETWEEN %(from_date)s AND %(to_date)s
		ORDER BY done_on, todo.name
		""",
		params, as_dict=True,
	)

	plan_by_date, plan_items = {}, []
	for r in plan_rows:
		item = {
			"todo": r.todo, "to_do": r.to_do,
			"project_detail": r.project_detail,
			"project_name": r.project_name or r.project or r.project_detail,
			"planned_minutes": int(r.planned_minutes or 0),
			"estimated": int(r.estimated or 0),
			"deadline": str(r.deadline) if r.deadline else None,
		}
		plan_items.append(item)
		plan_by_date.setdefault(str(r.allocation_date), []).append(item)

	completed_by_date, completed_items = {}, []
	for r in completed_rows:
		done_on = str(r.done_on)
		if r.deadline:
			late_days = max(0, date_diff(done_on, r.deadline))
			early_days = max(0, date_diff(r.deadline, done_on))
		else:
			late_days = early_days = 0
		# Rejected: bounced back to Planned after review, with a rejection stamped.
		if r.rejected_at and r.status == STATUS_PLANNED:
			result = "rejected"
		elif r.status in (STATUS_CHECKED, STATUS_COMPLETED):
			result = "approved"
		else:
			result = "pending"
		item = {
			"todo": r.todo, "to_do": r.to_do,
			"project_detail": r.project_detail,
			"project_name": r.project_name or r.project or r.project_detail,
			"estimated": int(r.estimated or 0),
			"deadline": str(r.deadline) if r.deadline else None,
			"done_on": done_on,
			"late_days": late_days, "early_days": early_days,
			"status": r.status, "result": result,
			"points": float(r.assignee_earned or 0),
		}
		completed_items.append(item)
		completed_by_date.setdefault(done_on, []).append(item)

	days = [
		{"date": d, "plan": plan_by_date.get(d, []), "completed": completed_by_date.get(d, [])}
		for d in dates
	]

	todos_done = len(completed_items)
	late = sum(1 for c in completed_items if c["late_days"] > 0)
	summary = {
		"planned_minutes": sum(p["planned_minutes"] for p in plan_items),
		"done_minutes_estimated": sum(c["estimated"] for c in completed_items),
		"todos_planned": len({p["todo"] for p in plan_items}),
		"todos_done": todos_done,
		"on_time": sum(1 for c in completed_items if c["late_days"] == 0 and c["early_days"] == 0),
		"late": late,
		"early": sum(1 for c in completed_items if c["early_days"] > 0),
		"approved": sum(1 for c in completed_items if c["result"] == "approved"),
		"rejected": sum(1 for c in completed_items if c["result"] == "rejected"),
		"pending": sum(1 for c in completed_items if c["result"] == "pending"),
		"points_earned": sum(c["points"] for c in completed_items),
		"on_time_rate": (todos_done - late) / todos_done if todos_done else 0,
	}

	return {
		"from_date": str(start), "to_date": str(end),
		"user": target,
		"full_name": frappe.db.get_value("User", target, "full_name") or target,
		"dates": dates, "days": days, "summary": summary,
	}


def _runs_project(user, project_row):
	"""True iff `user` owns, leads, or admins the project. `project_row` is a dict with
	project_owner / project_leader / project_admin (falsy/None -> not permitted)."""
	if not project_row:
		return False
	return user in (
		project_row.get("project_owner"),
		project_row.get("project_leader"),
		project_row.get("project_admin"),
	)


@frappe.whitelist(methods=["POST"])
def buzz_todo(todo):
	"""Nudge a Project Todo's assignee — in-app notification + Web Push (device vibrates
	on Android). Caller must own/lead/admin the todo's project (same scope as the
	todos_due report). Reuses the shared _notify() so the recipient gets it on the bell
	and as a push even when the app is closed."""
	me = frappe.session.user
	# Whitelist trust boundary: a JSON POST body can smuggle a dict/list, which
	# frappe.db.get_value would treat as FILTERS instead of a docname. Force a string.
	todo = frappe.utils.cstr(todo)
	row = frappe.db.get_value(
		"Project Todo", todo,
		["name", "to_do", "project", "assigned_to", "deadline"],
		as_dict=True,
	)
	if not row:
		frappe.throw("Todo not found.", frappe.DoesNotExistError)
	if not row.assigned_to:
		frappe.throw("This todo has no assignee to buzz.", frappe.ValidationError)

	project = frappe.db.get_value(
		"Project", row.project,
		["project_owner", "project_leader", "project_admin"],
		as_dict=True,
	)
	if not _runs_project(me, project):
		frappe.throw("You don't run this project.", frappe.PermissionError)

	deadline = frappe.utils.formatdate(row.deadline) if row.deadline else "soon"
	from vernon_project.api.mobile import _notify

	_notify(
		recipient=row.assigned_to,
		type="Deadline",
		title=f"{frappe.utils.get_fullname(me)} nudged you",
		body=f"“{row.to_do}” is due {deadline}",
		reference_doctype="Project Todo",
		reference_name=row.name,
		actor=me,
	)
	return {"ok": True, "assignee": row.assigned_to}
