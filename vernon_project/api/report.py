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
