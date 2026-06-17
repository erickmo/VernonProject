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
