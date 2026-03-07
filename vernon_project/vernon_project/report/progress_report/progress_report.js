// Copyright (c) 2026, Vernon and contributors
// For license information, please see license.txt

frappe.query_reports["Progress Report"] = {
	"filters": [
		{
			"fieldname": "project",
			"label": "Project",
			"fieldtype": "Link",
			"options": "Project",
			"width": 150,
		},
		{
			"fieldname": "user",
			"label": "User",
			"default": frappe.session.user,
			"fieldtype": "Link",
			"options": "User",
			"width": 150,
		},
		{
			"fieldname": "date_range",
			"label": "Todo Date Range",
			"fieldtype": "Date Range",
			"width": 200,
		},
	]
};
