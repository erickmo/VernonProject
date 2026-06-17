// Copyright (c) 2026, Vernon and contributors
// For license information, please see license.txt

frappe.ui.form.on("Project Todo", {
	refresh(frm) {
		// Limit assigned_to to members of the work item's project team.
		frm.set_query("assigned_to", function () {
			if (!frm.doc.project_detail) {
				return {};
			}
			return {
				query: "vernon_project.vernon_project.doctype.project_todo.project_todo.assignable_users",
				filters: { project_detail: frm.doc.project_detail },
			};
		});
	},
});
