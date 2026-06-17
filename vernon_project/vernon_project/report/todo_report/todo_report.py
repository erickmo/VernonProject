# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
import datetime
import json



def execute(filters=None):
	columns, data = [], []

	# --------------------------------------------------------------------------
	# Define Columns
	# --------------------------------------------------------------------------
	# Filter Project
	filter_project = ""
	if filters and filters.get("project"):
		filter_project = f" AND pd.project = '{filters.get('project')}' "

	# Filter Grouping
	filter_grouping = ""
	if filters and filters.get("grouping"):
		filter_grouping = f" AND pd.grouping = '{filters.get('grouping')}' "

	# Filter Assigned To
	filter_assigned_to = ""
	if filters and filters.get("assigned_to"):
		filter_assigned_to = f" AND pt.assigned_to = '{filters.get('assigned_to')}' "

	# Filter Status (Project Detail status) — supports a single value or a list
	filter_status = ""
	if filters and filters.get("status"):
		st = filters.get("status")
		st = st if isinstance(st, (list, tuple)) else [st]
		st = [s for s in st if s]
		if st:
			filter_status = f" AND pd.status IN ({', '.join(frappe.db.escape(s) for s in st)}) "

	# Filter Deadline From filter date_range
	filter_deadline_from = ""
	filter_deadline_to = ""
	if filters and filters.get("date_range"):
		date_range = filters.get("date_range")
		if len(date_range) == 2:
			filter_deadline_from = f" AND pt.deadline >= '{date_range[0]}' "
			filter_deadline_to = f" AND pt.deadline <= '{date_range[1]}' "

	# Filter Todo Status — supports a single value or a list
	filter_todo_status = ""
	if filters and filters.get("todo_status"):
		ts = filters.get("todo_status")
		ts = ts if isinstance(ts, (list, tuple)) else [ts]
		ts = [s for s in ts if s]
		if ts:
			filter_todo_status = f" AND pt.status IN ({', '.join(frappe.db.escape(s) for s in ts)}) "

	# Get todo data SQL
	sql = f"""
		SELECT
			pt.name AS todo_id,
			pt.to_do AS to_do,
			pt.deadline AS todo_deadline,
			pt.assigned_to AS assigned_to,
			pt.estimated AS estimated,
			pt.status AS todo_status,
			pd.title AS project_detail,
			pd.latest_deadline AS project_detail_deadline,
			pd.name AS project_detail_id,
			p.project_name AS project,
			pd.status AS status,
			g.glossary AS grouping,
			pd.latest_todo AS latest_todo,
			pd.expected_outcome AS expected_outcome,
			pt.notes AS notes,
			pd.keterangan_di_sow AS sow_note
		FROM
			`tabProject Todo` pt
		JOIN
			`tabProject Detail` pd on pt.project_detail = pd.name
		JOIN
			`tabProject` p on pd.project = p.name
		JOIN
			`tabGlossary` g on pd.grouping = g.name
		WHERE
			pd.status = 'Ongoing' AND
			pd.todo_count > 0
			{filter_grouping}
			{filter_project}
			{filter_assigned_to}
			{filter_status}
			{filter_deadline_from}
			{filter_deadline_to}
			{filter_todo_status}
		ORDER BY
			pt.deadline ASC,
			pd.name ASC,
			pt.estimated ASC
	"""

	results = frappe.db.sql(sql, as_dict=True)	

	for row in results:
		data.append(row)

	columns = [
		{"label": "To Do", "fieldname": "to_do", "fieldtype": "Data", "width": 300},
		{"label": "To Do Status", "fieldname": "todo_status", "fieldtype": "Data", "width": 100},
		{"label": "ToDo Deadline", "fieldname": "todo_deadline", "fieldtype": "Date", "width": 120},
		{"label": "Assigned To", "fieldname": "assigned_to", "fieldtype": "Data", "width": 150},
		{"label": "Estimated (min)", "fieldname": "estimated", "fieldtype": "Int", "width": 50},
		{"label": "Project", "fieldname": "project", "fieldtype": "Data", "width": 200},
		{"label": "Project Detail", "fieldname": "project_detail", "fieldtype": "Data", "width": 200},
		{"label": "Project Detail ID", "fieldname": "project_detail_id", "fieldtype": "Link", "options": "Project Detail", "width": 200},
		{"label": "Project Detail Status", "fieldname": "status", "fieldtype": "Data", "width": 100},
		{"label": "Grouping", "fieldname": "grouping", "fieldtype": "Data", "width": 150},
		{"label": "SOW", "fieldname": "sow_note", "fieldtype": "Data", "width": 300},
		{"label": "Note", "fieldname": "notes", "fieldtype": "Data", "width": 300},
	]

	# -------------------------------------------------------------------------
	return columns, data
