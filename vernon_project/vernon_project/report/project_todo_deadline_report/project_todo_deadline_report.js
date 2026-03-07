// Copyright (c) 2026, Vernon and contributors
// For license information, please see license.txt

frappe.query_reports["Project Todo Deadline Report"] = {
	"filters": [
		// Project
		{
			"fieldname": "project",
			"label": __("Project"),
			"fieldtype": "Link",
			"options": "Project",
			"reqd": 1,
			"filters": {
				"status": "Ongoing"
			},
			"default": ""
		},
		{
			"fieldname": "status",
			"label": __("Status"),
			"fieldtype": "Select",
			"options": "\n⚪️ Planned\n🟠 Done\n🔷 Checked By PL\n✅ Completed",
			"default": "⚪️ Planned"
		},
		// Assigned To
		{
			"fieldname": "assigned_to",
			"label": __("Assigned To"),
			"fieldtype": "Link",
			"options": "User"
		},
	],
	formatter: function (value, row, column, data, default_formatter) {
		// Column
		if (column.fieldname == "deadline") {
			if (value < frappe.datetime.get_today()) {
				return "<span style='color: red; font-weight: bold;'>" + value + "</span>";
			} else if (value == frappe.datetime.get_today()) {
				return "<span style='color: orange; font-weight: bold;'>" + value + "</span>";
			} else {
				return default_formatter(value, row, column, data);
			}
		}
		// Estimated == 0 
		if (value == "0" || value == 0) {
			return "<span style='color: #ccc; font-weight: bold;'>" + value + "</span>";
		} else {
			return default_formatter(value, row, column, data);
		}
	}
};
