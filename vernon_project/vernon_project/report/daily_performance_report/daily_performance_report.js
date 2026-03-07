// Copyright (c) 2026, Vernon and contributors
// For license information, please see license.txt

frappe.query_reports["Daily Performance Report"] = {
	onload: function (report) {
		// Add row hover highlight style
		frappe.dom.set_style(`
			.report-wrapper .dt-row .dt-cell--focus {
				background-color: #f0f0f0 !important;
			}
			.report-wrapper .dt-row--highlight .dt-cell {
				background-color: #f0f0f0 !important;
			}
		`);

		// Highlight entire row when a cell is selected
		report.page.wrapper.on('click', '.dt-cell', function () {
			$('.dt-row--highlight').removeClass('dt-row--highlight');
			$(this).closest('.dt-row').addClass('dt-row--highlight');
		});
	},
	"filters": [
		{
			"fieldname": "status",
			"label": __("Status"),
			"fieldtype": "Select",
			"options": "🟠 Done\n🔷 Checked By PL\n✅ Completed",
			"default": "🟠 Done"
		},
		{
			"fieldname": "date_range",
			"label": __("Date Range"),
			"fieldtype": "DateRange",
			"reqd": 1,
			"default": [
				frappe.datetime.add_days(frappe.datetime.get_today(), -7),
				frappe.datetime.get_today()
			]
		},
		{
			"fieldname": "assigned_to",
			"label": __("Assigned To"),
			"fieldtype": "Link",
			"options": "User",
			"reqd": 1,
			"default": frappe.session.user
		},
	],
	formatter: function (value, row, column, data, default_formatter) {
		if (!data) return default_formatter(value, row, column, data);

		// Overdue: deadline column in red
		if (column.fieldname === "deadline" && data.is_overdue) {
			return "<span style='color: red; font-weight: bold;'>" + value + "</span>";
		}

		// Date columns (not static columns) — check overdue
		if (column.fieldname && column.fieldname.match(/^\d{4}-\d{2}-\d{2}$/)) {
			if (value === "0" || value === 0) {
				return "<span style='color: #ccc;'>" + value + "</span>";
			}
			if (data.is_overdue && value) {
				return "<span style='color: red; font-weight: bold;'>" + value + "</span>";
			}
		}

		// Estimated == 0 show in light grey
		if (value == "0" || value == 0) {
			return "<span style='color: #ccc;'>" + value + "</span>";
		}

		return default_formatter(value, row, column, data);
	}
};
