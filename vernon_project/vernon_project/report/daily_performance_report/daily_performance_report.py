# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from datetime import timedelta
from frappe.utils import getdate


# Map status to its corresponding date field in Project Todo
STATUS_DATE_FIELD_MAP = {
	"🟠 Done": "DATE(todo.developed_at)",
	"🔷 Checked By PL": "DATE(todo.tested_at)",
	"✅ Completed": "DATE(todo.completed_at)",
}

MAX_DATE_RANGE_DAYS = 120


def execute(filters=None):
	columns, data = [], []

	# ------------------------------------------------------
	# Validate Filters
	# ------------------------------------------------------
	if not filters:
		frappe.msgprint("Please set all required filters.")
		return columns, data

	if not filters.get("assigned_to") or not filters.get("assigned_to").strip():
		frappe.msgprint("Please select an Assignee to generate the report.")
		return columns, data

	if not filters.get("date_range"):
		frappe.msgprint("Please select a Date Range.")
		return columns, data

	status = filters.get("status") or "🟠 Done"
	from_date = getdate(filters.get("date_range")[0])
	to_date = getdate(filters.get("date_range")[1])

	if (to_date - from_date).days > MAX_DATE_RANGE_DAYS:
		frappe.msgprint(f"Date range cannot exceed {MAX_DATE_RANGE_DAYS} days.")
		return columns, data

	# ------------------------------------------------------
	# Determine date field based on status
	# ------------------------------------------------------
	date_field = STATUS_DATE_FIELD_MAP.get(status, "deadline")

	# ------------------------------------------------------
	# Query
	# ------------------------------------------------------
	sql = f"""
		SELECT
			todo.name AS todo_id,
			todo.to_do, todo.assigned_to, todo.deadline, todo.estimated, todo.status,
			todo.developed_at, todo.tested_at, todo.completed_at,
			detail.name AS detail_name, detail.title AS detail_title,
			project.name AS project_name, project.project_name AS project_project_name,
			{date_field} AS filter_date
		FROM
			`tabProject Todo` AS todo
			JOIN `tabProject Detail` AS detail ON todo.parent = detail.name
			JOIN `tabProject` AS project ON detail.project = project.name
		WHERE
			{date_field} IS NOT NULL
			AND detail.is_pending = 0
			AND todo.assigned_to = %(assigned_to)s
			AND {date_field} BETWEEN %(from_date)s AND %(to_date)s
		ORDER BY
			{date_field} ASC,
			project.project_name ASC,
			detail.title ASC,
			todo.estimated ASC
	"""

	sql_filter = {
		"status": status,
		"assigned_to": filters.get("assigned_to"),
		"from_date": from_date,
		"to_date": to_date,
	}
	result = frappe.db.sql(sql, sql_filter, as_dict=True)

	# ------------------------------------------------------
	# Define Columns
	# ------------------------------------------------------
	columns = [
		{"fieldname": "todo", "label": "Todo", "fieldtype": "Data", "width": 300},
		{"fieldname": "project", "label": "Project", "fieldtype": "HTML", "width": 200},
		{"fieldname": "detail_project", "label": "Project Detail", "fieldtype": "HTML", "width": 200},
		{"fieldname": "deadline", "label": "Deadline", "fieldtype": "Date", "width": 100},
	]

	# Add date columns from the selected range
	current_date = from_date
	while current_date <= to_date:
		columns.append({
			"fieldname": current_date.strftime("%Y-%m-%d"),
			"label": current_date.strftime("%d/%m"),
			"fieldtype": "Int",
			"width": 60,
		})
		current_date += timedelta(days=1)

	# ------------------------------------------------------
	# Process Data
	# ------------------------------------------------------
	for row in result:
		row_filter_date = getdate(row.filter_date) if row.filter_date else None
		row_deadline = getdate(row.deadline) if row.deadline else None
		is_overdue = row_deadline and row_filter_date and row_filter_date > row_deadline

		row_data = {
			"todo_id": row.todo_id,
			"todo": row.to_do,
			"project": f"<a href='/app/project/{row.project_name}'>{row.project_project_name}</a>",
			"detail_project": f"<a href='/app/project-detail/{row.detail_name}'>{row.detail_title}</a>",
			"deadline": row.deadline,
			"is_overdue": is_overdue,
		}

		# Fill date columns (skip first 4 static columns: todo, project, detail, deadline)
		for col in columns[4:]:
			col_date = getdate(col["fieldname"])
			if row_filter_date and col_date == row_filter_date:
				row_data[col["fieldname"]] = row.estimated or 0
			else:
				row_data[col["fieldname"]] = ""

		data.append(row_data)

	return columns, data
