# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from datetime import timedelta
from frappe.utils import getdate
from vernon_project.api.mobile import _visible_projects, _can_see_user_work

def execute(filters=None):
	columns, data = [], []

	# ------------------------------------------------------
	# Validate Filters
	# ------------------------------------------------------
	if not filters or not filters.get("project"):
		frappe.msgprint("Please select a Project to generate the report.")

	# Permission scope — see progress_report.py for why this lives in execute()
	# (reachable directly via Frappe's own frappe.desk.query_report.run, not
	# just this app's SPA wrapper). 2026-09-08 permission sweep.
	requester = frappe.session.user
	if filters and filters.get("project") and filters.get("project") not in set(_visible_projects()):
		frappe.throw("You are not allowed to see this project.", frappe.PermissionError)
	if filters and filters.get("assigned_to") and not _can_see_user_work(requester, filters.get("assigned_to")):
		frappe.throw("You are not allowed to see this user's work.", frappe.PermissionError)

	# ------------------------------------------------------
	# Query
	# ------------------------------------------------------
	# Get Project todo, column is date from first


	# Status filter — supports a single value or a list (multi-select)
	st = filters.get("status") if filters else None
	st = st if isinstance(st, (list, tuple)) else ([st] if st else [])
	st = [s for s in st if s]
	status_clause = (
		f" AND todo.status IN ({', '.join(frappe.db.escape(s) for s in st)}) " if st else ""
	)

	sql = f"""
		SELECT
			todo.name, todo.to_do, todo.assigned_to, todo.deadline, todo.estimated, todo.status,
			detail.name AS detail_name, detail.project AS detail_project,
			project.name AS project_name
		FROM
			`tabProject Todo` AS todo
			JOIN `tabProject Detail` AS detail ON todo.project_detail = detail.name
			JOIN `tabProject` AS project ON detail.project = project.name
		WHERE
			todo.deadline IS NOT NULL
			AND project.name = %(project)s
			{status_clause}
			AND detail.is_pending = 0
	"""

	if filters.get("assigned_to"):
		sql += " AND todo.assigned_to = %(assigned_to)s"

	sql += """
		ORDER BY
			todo.deadline ASC,
			todo.assigned_to ASC,
			todo.estimated ASC
	"""

	# ------------------------------------------------------
	# Execute Query
	# ------------------------------------------------------
	sql_filter = {
		"project": filters.get("project"),
	}
	if filters.get("assigned_to"):
		sql_filter["assigned_to"] = filters.get("assigned_to")
	result = frappe.db.sql(sql, sql_filter, as_dict=True)

	# ------------------------------------------------------
	# Define Columns
	# ------------------------------------------------------
	columns = [
		{"fieldname": "todo", "label": "Todo", "fieldtype": "Data", "width": 300},
		{"fieldname": "project", "label": "Project", "fieldtype": "Link", "options": "Project Detail", "width": 200},
		{"fieldname": "assigned_to", "label": "Assigned To", "fieldtype": "Data"},
		{"fieldname": "deadline", "label": "Deadline", "fieldtype": "Date"},
		{"fieldname": "status", "label": "Status", "fieldtype": "Data", "width": 120},
	]
	# get the earliest and latest deadline from the result
	deadlines = sorted(set(row.deadline for row in result if row.deadline))
	earliest_deadline = deadlines[0] if deadlines else None
	latest_deadline = deadlines[-1] if deadlines else None
	
	# Add Deadline Column, Day by Day from earliest to latest (prev day + 1)
	if earliest_deadline and latest_deadline:
		current_date = earliest_deadline
		while current_date <= latest_deadline:
			columns.append({
				"fieldname": current_date.strftime("%d/%m"),
				"label": current_date.strftime("%d/%m"),
				"fieldtype": "Int",
			})
			current_date += timedelta(days=1)

	# ------------------------------------------------------
	# Process Data
	# ------------------------------------------------------
	# for each row, add a column for each deadline, if the deadline is equal to the column, check it
	for row in result:
		row_data = {
			"todo_id": row.name,
			"todo": row.to_do,
			"project": f"{row.detail_name}",
			"assigned_to": row.assigned_to,
			"deadline": row.deadline,
			"status": row.status,
		}
		# Find the right column and set the estimated time
		for x in columns[5:]:  # Skip the first 5 columns (todo, project, assigned_to, deadline, status)
			if row.deadline and row.deadline.strftime("%d/%m") == x["fieldname"]:
				# row_data[x["fieldname"]] = f"{row.estimated if row.status == '⚪️ Planned' else ''}" 
				row_data[x["fieldname"]] = f"{row.estimated}" 
			else:
				row_data[x["fieldname"]] = ''
		data.append(row_data)

	return columns, data
