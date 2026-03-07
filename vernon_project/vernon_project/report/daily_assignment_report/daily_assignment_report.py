# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from datetime import timedelta
from frappe.utils import getdate

def execute(filters=None):
	columns, data = [], []

	# ------------------------------------------------------
	# Validate Filters
	# ------------------------------------------------------
	if not filters or not filters.get("assigned_to") or not filters.get("assigned_to").strip():
		frappe.msgprint("Please select an Assignee to generate the report.")

	# ------------------------------------------------------
	# Query
	# ------------------------------------------------------
	# Get Project todo, column is date from first

	sql = """
		SELECT 
			todo.name as todo_name, todo.ongoing,
			todo.to_do, todo.assigned_to, todo.deadline, todo.estimated, todo.status, todo.notes,
			detail.name AS detail_name, detail.title AS detail_title,
			project.name AS project_name, project.project_name as project_project_name,
			project.project_owner, project.project_leader
		FROM
			`tabProject Todo` AS todo
			JOIN `tabProject Detail` AS detail ON todo.parent = detail.name
			JOIN `tabProject` AS project ON detail.project = project.name
		WHERE
			todo.deadline IS NOT NULL
			AND detail.is_pending = 0
			AND todo.status = %(status)s
			AND todo.assigned_to = %(assigned_to)s
	"""

	sql += """
		ORDER BY
			todo.deadline ASC,
			project.project_name ASC,
			detail.title ASC,
			todo.estimated ASC
	"""

	# ------------------------------------------------------
	# Execute Query
	# ------------------------------------------------------
	sql_filter = {
		"status": filters.get("status"),
		"assigned_to": filters.get("assigned_to")
	}
	result = frappe.db.sql(sql, sql_filter, as_dict=True)

	# ------------------------------------------------------
	# Define Columns
	# ------------------------------------------------------
	columns = [
		{"fieldname": "ongoing", "label": "ongoing", "fieldtype": "Check", "width": 30},
		{"fieldname": "todo", "label": "Todo", "fieldtype": "Data", "width": 300},
		{"fieldname": "project", "label": "Project", "fieldtype": "HTML", "width": 200},
		{"fieldname": "detail_project", "label": "Project Detail", "fieldtype": "HTML", "width": 200},
		{"fieldname": "deadline", "label": "Deadline", "fieldtype": "Date"},
		{"fieldname": "status", "label": "Status", "fieldtype": "Data", "width": 120},
		{"fieldname": "action", "label": "Action", "fieldtype": "Button", "width": 80},
		{"fieldname": "note", "label": "Note", "fieldtype": "HTML", "width": 40},
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
		has_notes = bool(row.notes and row.notes.strip())
		note_icon = "📝" if has_notes else "💬"
		row_data = {
			"ongoing": row.ongoing,
			"todo_name": row.todo_name,
			"assigned_to": row.assigned_to,
			"project_owner": row.project_owner,
			"project_leader": row.project_leader,
			"notes": row.notes or "",
			"todo": row.to_do,
			"project": f"<a href='/app/project/{row.project_name}'>{row.project_project_name}</a>",
			"detail_project": f"<a href='/app/project-detail/{row.detail_name}'>{row.detail_title}</a>",
			"deadline": row.deadline,
			"status": row.status,
			"action": "Next",
			"note": f'<span class="note-cell" data-todo="{row.todo_name}" style="cursor:pointer;font-size:16px;display:block;text-align:center;">{note_icon}</span>',
			"detail_name": row.detail_name,
		}
		# Find the right column and set the estimated time
		for x in columns[8:]:  # Skip first 8 columns (ongoing, todo, project, detail_project, deadline, status, action, note)
			if row.deadline and row.deadline.strftime("%d/%m") == x["fieldname"]:
				row_data[x["fieldname"]] = row.estimated
			else:
				row_data[x["fieldname"]] = ''
		data.append(row_data)

	return columns, data
