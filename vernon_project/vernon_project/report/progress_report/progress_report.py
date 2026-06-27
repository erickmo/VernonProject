# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
import datetime
import json
from frappe.utils import add_days

def execute(filters=None):
	columns, data = [], []

	# --------------------------------------------------------------------------
	# Define Columns
	# --------------------------------------------------------------------------
	# Filter Project (values escaped — frappe.db.escape returns a quoted literal).
	filter_project = ""
	if filters and filters.get("project"):
		filter_project = f" AND pd.project = {frappe.db.escape(filters.get('project'))} "

	# Filter User
	filter_user = ""
	if filters and filters.get("user"):
		filter_user = f" AND pt.assigned_to = {frappe.db.escape(filters.get('user'))} "

	# Filter Date
	filter_date = ""
	if filters and filters.get("date_range"):
		date_range = filters.get("date_range")
		if len(date_range) == 2:
			date_from = frappe.db.escape(date_range[0])
			date_to = frappe.db.escape(add_days(date_range[1], 1))
			filter_date = f" AND ((pt.developed_at >= {date_from} AND pt.developed_at < {date_to}) OR (pt.tested_at >= {date_from} AND pt.tested_at < {date_to}) OR (pt.completed_at >= {date_from} AND pt.completed_at < {date_to})) "

	# --------------------------------------------------------------------------


	# Get todo data SQL
	sql = f"""
		SELECT
			pt.name AS todo_id,
			pt.to_do AS to_do,
			pt.deadline AS todo_deadline,
			pt.assigned_to AS assigned_to,
			pt.estimated AS estimated,
			pt.status AS todo_status,
			pt.developed_at AS developed_at,
			pt.developed_by AS developed_by,
			pt.tested_at AS tested_at,
			pt.tested_by AS tested_by,
			pt.completed_at AS completed_at,
			pt.completed_by AS completed_by,
			p.project_name AS project,
			pd.title AS project_detail,
			g.glossary AS glossary,
			pd.name AS project_detail_id
		FROM
			`tabProject Todo` pt
		JOIN
			`tabProject Detail` pd on pt.project_detail = pd.name
		JOIN
			`tabProject` p on pd.project = p.name
		JOIN
			`tabGlossary` g on pd.grouping = g.name
		WHERE
			pd.todo_count > 0
			AND pt.status != 'Scheduled'
			{filter_project}
			{filter_user}
			{filter_date}
		ORDER BY
			pt.deadline ASC,
			pd.name ASC,
			pt.estimated ASC
	"""

	results = frappe.db.sql(sql, as_dict=True)	

	for row in results:
		data.append({
			"todo_id": row.todo_id,
			"to_do": row.to_do,
			"todo_status": row.todo_status,
			"todo_deadline": row.todo_deadline,
			"assigned_to": row.assigned_to,
			"estimated": row.estimated,
			"developed_at": row.get("developed_at"),
			"developed_by": row.get("developed_by"),
			"tested_at": row.get("tested_at"),
			"tested_by": row.get("tested_by"),
			"completed_at": row.get("completed_at"),
			"completed_by": row.get("completed_by"),
			"project": f" {row.project} - {row.project_detail} - {row.glossary} ",
			"project_detail_id": row.project_detail_id,
		})

	# Set Column from data
	columns = [
		{"fieldname": "to_do", "label": "To Do", "fieldtype": "Data", "width": 200},
		{"fieldname": "todo_status", "label": "Status", "fieldtype": "Data", "width": 100},
		{"fieldname": "todo_deadline", "label": "Deadline", "fieldtype": "Date", "width": 100},
		{"fieldname": "assigned_to", "label": "Assigned To", "fieldtype": "Data", "width": 150},
		{"fieldname": "estimated", "label": "Estimated (Hours)", "fieldtype": "Int", "width": 50},
		{"fieldname": "developed_at", "label": "Developed At", "fieldtype": "Datetime", "width": 100},
		{"fieldname": "developed_by", "label": "Developed By", "fieldtype": "Data", "width": 150},
		{"fieldname": "tested_at", "label": "Tested At", "fieldtype": "Datetime", "width": 100},
		{"fieldname": "tested_by", "label": "Tested By", "fieldtype": "Data", "width": 150},
		{"fieldname": "completed_at", "label": "Completed At", "fieldtype": "Datetime", "width": 100},
		{"fieldname": "completed_by", "label": "Completed By", "fieldtype": "Data", "width": 150},
		{"fieldname": "project", "label": "Project", "fieldtype": "Data", "width": 500},
		{"fieldname": "project_detail_id", "label": "Project Detail ID", "fieldtype": "Link", "options": "Project Detail", "width": 150},
	]


	# -------------------------------------------------------------------------
	return columns, data
