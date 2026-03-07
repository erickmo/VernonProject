// Copyright (c) 2026, Vernon and contributors
// For license information, please see license.txt

frappe.query_reports["Todo Report"] = {
	"filters": [
		{
			"fieldname": "project",
			"label": "Project",
			"fieldtype": "Link",
			"options": "Project",
			"width": 150,
		},
		{
			"fieldname": "assigned_to",
			"label": "Assigned To",
			"fieldtype": "Link",
			"options": "User",
			"default": frappe.session.user,
			"width": 150,
		},
		{
			"fieldname": "grouping",
			"label": "Grouping",
			"fieldtype": "Link",
			"options": "Glossary",
			"width": 100,
		},
		{
			"fieldname": "status",
			"label": "Project Detail Status",
			"fieldtype": "Select",
			"options": "\nOngoing\nCompleted\nOn Hold",
			"width": 100,
			"default": "Ongoing",
		},
		{
			"fieldname": "date_range",
			"label": "Todo Deadline Between",
			"fieldtype": "Date Range",
			"width": 200,
		},
		{
			"fieldname": "todo_status",
			"label": "Todo Status",
			"fieldtype": "Select",
			"options": "\n⚪️ Planned\n🟠 Done\n🔷 Checked By PL\n✅ Completed",
			"width": 100,
			"default": "⚪️ Planned",
		}

	]
};
