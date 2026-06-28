# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# Daily Estimated Time report
# ---------------------------
# Shared endpoint for the web app and the mobile PWA. Aggregates each active
# user's Project Todo day-allocations into a user x day matrix and flags any
# day whose total falls below Vernon Settings.min_daily_estimated_minutes.

import frappe
from frappe.utils import getdate, add_days, date_diff

MAX_SPAN_DAYS = 92


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

	rows = []
	if names:
		# GROUP BY in SQL (precedent: daily_assignment_report.py). assigned_to lives on
		# the parent Project Todo; estimated_minutes on its Allocation child rows.
		rows = frappe.db.sql(
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

	planned_rows = rows  # existing Project Todo Allocation aggregation

	assigned_rows = []
	if names:
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
			{"users": names, "from_date": str(start), "to_date": str(end)}, as_dict=True,
		)
		todos_with_explicit = {r["todo"] for r in explicit}
		assigned_rows = [{"user": r["user"], "day": r["day"], "minutes": r["minutes"]} for r in explicit]
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
			{"users": names, "from_date": str(start), "to_date": str(end)}, as_dict=True,
		)
		for r in defaults:
			if r["todo"] not in todos_with_explicit:
				assigned_rows.append({"user": r["user"], "day": r["day"], "minutes": r["minutes"]})

	return _build_daily_matrix(users, assigned_rows, planned_rows, start, end, threshold)
