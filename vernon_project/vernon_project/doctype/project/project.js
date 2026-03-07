// Copyright (c) 2026, Vernon and contributors
// For license information, please see license.txt

frappe.ui.form.on("Project", {
	refresh(frm) {
		// project group, is_group = 0
		frm.set_query("project_group", function () {
			return {
				filters: {
					is_group: 0,
				},
			};
		});	

	},
});
