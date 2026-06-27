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


def _build_daily_matrix(active_users, rows, from_date, to_date, threshold):
	"""Pure pivot. `active_users`: [{name, full_name}]. `rows`: [{user, day, minutes}].
	Returns the report contract dict. Days with total < threshold are flagged."""
	dates = _date_list(from_date, to_date)
	threshold = int(threshold or 0)

	by_user = {}
	for r in rows:
		day = str(r["day"])
		by_user.setdefault(r["user"], {})
		by_user[r["user"]][day] = by_user[r["user"]].get(day, 0) + int(r["minutes"] or 0)

	out_rows = []
	for u in active_users:
		umap = by_user.get(u["name"], {})
		per_day = {}
		flagged = []
		total = 0
		for d in dates:
			m = int(umap.get(d, 0))
			per_day[d] = m
			total += m
			if m < threshold:
				flagged.append(d)
		out_rows.append({
			"user": u["name"],
			"full_name": u.get("full_name") or u["name"],
			"per_day": per_day,
			"total": total,
			"flagged_dates": flagged,
		})

	return {
		"threshold": threshold,
		"from_date": str(getdate(from_date)),
		"to_date": str(getdate(to_date)),
		"dates": dates,
		"rows": out_rows,
	}


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
			  AND alloc.allocation_date BETWEEN %(from_date)s AND %(to_date)s
			GROUP BY todo.assigned_to, alloc.allocation_date
			""",
			{"users": names, "from_date": str(start), "to_date": str(end)},
			as_dict=True,
		)

	return _build_daily_matrix(users, rows, start, end, threshold)
