// Copyright (c) 2026, Vernon and contributors
// For license information, please see license.txt

const LEAD_QUERY =
	"vernon_project.vernon_project.doctype.project.project.user_with_role_query";

frappe.ui.form.on("Project", {
	refresh(frm) {
		frm.set_query("project_owner", () => ({
			query: LEAD_QUERY,
			filters: { role: "Project Owner" },
		}));
		frm.set_query("project_leader", () => ({
			query: LEAD_QUERY,
			filters: { role: "Project Leader" },
		}));
	},
});
