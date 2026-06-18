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
		set_level_options(frm);
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
	async group(frm) {
		await set_level_options(frm);
		// Clear level/point if the previous level no longer belongs to this group.
		if (frm.doc.level && !(frm._group_levels || {}).hasOwnProperty(frm.doc.level)) {
			frm.set_value("level", null);
			frm.set_value("point", 0);
		}
	},

	level(frm) {
		const map = frm._group_levels || {};
		if (frm.doc.level && map.hasOwnProperty(frm.doc.level)) {
			frm.set_value("point", map[frm.doc.level]);
		} else {
			frm.set_value("point", 0);
		}
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

async function set_level_options(frm) {
	frm._group_levels = {};
	if (!frm.doc.group) {
		frm.set_df_property("level", "options", [""]);
		return;
	}
	const grp = await frappe.db.get_doc("Group", frm.doc.group);
	const names = [""];
	(grp.levels || []).forEach((row) => {
		frm._group_levels[row.level_name] = row.point;
		names.push(row.level_name);
	});
	frm.set_df_property("level", "options", names);
}
