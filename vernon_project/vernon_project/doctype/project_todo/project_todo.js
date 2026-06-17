// Copyright (c) 2026, Vernon and contributors
// For license information, please see license.txt

frappe.ui.form.on("Project Todo", {
	refresh(frm) {
		// Limit the Project Detail (project_detail) searchable select to the chosen project.
		frm.set_query("project_detail", function () {
			if (!frm.doc.project) {
				return {};
			}
			return { filters: { project: frm.doc.project } };
		});

		// Limit assigned_to to members of the project detail's project team.
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

	project(frm) {
		// Changing the project invalidates the current Project Detail selection.
		if (frm.doc.project_detail) {
			const linked = frm.doc.__project_of_detail;
			if (linked && linked !== frm.doc.project) {
				frm.set_value("project_detail", null);
			}
		}
	},

	project_detail(frm) {
		// Keep project in sync with the selected Project Detail (and remember it so a
		// later project change knows whether to clear the Project Detail).
		if (!frm.doc.project_detail) {
			frm.doc.__project_of_detail = null;
			return;
		}
		frappe.db.get_value("Project Detail", frm.doc.project_detail, "project").then((r) => {
			const proj = r && r.message && r.message.project;
			frm.doc.__project_of_detail = proj || null;
			if (proj && proj !== frm.doc.project) {
				frm.set_value("project", proj);
			}
		});
	},
	action(frm) {
		if (frm.doc.__unsaved) {
			frappe.throw({ message: __("Please save the document before performing this action."), title: __("Error") });
		}
		let next = "";
		switch (frm.doc.status) {
			case "⚪️ Planned": next = "🟠 Done"; break;
			case "🟠 Done": next = "🔷 Checked By PL"; break;
			case "🔷 Checked By PL": next = "✅ Completed"; break;
			case "✅ Completed": next = ""; break;
		}
		if (!next) {
			frappe.throw({ message: __("Project " + frm.doc.to_do + " is already completed."), title: __("Error") });
		}
		frappe.confirm(
			__("Yakin ubah status " + frm.doc.to_do + " ke " + next + "?"),
			() => {
				frappe.call({
					method: "vernon_project.api.project_todo.update_status",
					args: { todo_id: frm.doc.name },
					freeze: true,
					freeze_message: __("Updating status..."),
				}).then((r) => {
					frappe.msgprint({
						title: __(r.message.status.charAt(0).toUpperCase() + r.message.status.slice(1)),
						message: r.message.message,
						indicator: r.message.status == "error" ? "red" : "green",
					});
					if (r.message.status != "error") {
						frm.reload_doc();
					}
				});
			}
		);
	},
});
