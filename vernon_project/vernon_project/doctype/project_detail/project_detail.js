// Copyright (c) 2026, Vernon and contributors
// For license information, please see license.txt

frappe.ui.form.on("Project Detail", {
	refresh(frm) {
		frm.set_query("grouping", function () {
			return {
				filters: {
					project: frm.doc.project || "",
				},
			};
		});
		
		frm.set_query("glossaries", function () {
			return {
				filters: {
					project: frm.doc.project || "",
				},
			};
		});

		// Disable delete button from child table todo if status is not 'Scheduled'
		frm.fields_dict["todo"].grid.wrapper.on("grid-row-render", function (e, row) {
			let status = row.doc.status;
			alert(status)
			if (status !== "⚪️ Planned") {
				row.grid.set_row_property(row.docname, "allow_delete", false);
			} else {
				row.grid.set_row_property(row.docname, "allow_delete", true);
			}
		});

		// ------
		// Set Filter Assigned To hanya yg ada di User Permission
		// ------
		frm.trigger("project");

		// ------
		// Sort Todo berdasarkan deadline ascending, estimated time ascending, assigned to ascending
		// ------
		if (frm.doc.todo) {
			frm.doc.todo.sort((a, b) => {
				let deadlineA = a.deadline ? new Date(a.deadline) : new Date("9999-12-31");
				let deadlineB = b.deadline ? new Date(b.deadline) : new Date("9999-12-31");
				if (deadlineA < deadlineB) return -1;
				if (deadlineA > deadlineB) return 1;
				// Jika deadline sama, sort berdasarkan estimated time
				if (a.estimated < b.estimated) return -1;
				if (a.estimated > b.estimated) return 1;
				// Jika estimated time juga sama, sort berdasarkan assigned_to
				if (a.assigned_to < b.assigned_to) return -1;
				if (a.assigned_to > b.assigned_to) return 1;
				return 0;
			});
			frm.refresh_field("todo");
		}
	},
	
	price(frm) {
		frm.trigger("calculate_total");
	},
	
	discount(frm) {
		frm.trigger("calculate_total");
	},
	
	calculate_total(frm) {
		let price = frm.doc.price || 0;
		let discount = frm.doc.discount || 0;
		frm.set_value("total", price - discount);
	},
	
	project(frm) {
		// Check kalau project diganti, reset grouping & glossaries
		if (frm.is_new() == false && frm.doc.__last_sync_project != frm.doc.project) {
			frm.set_value("grouping", null);
			frm.set_value("glossaries", null);
		}

		if (!frm.doc.project) {
			return;
		}
		
		// Get Project Doc
		frappe.call("vernon_project.api.project.get_project_team_members", {project_name: frm.doc.project}).then((r) => {
			frm.set_query("assigned_to", "todo", function () {
				return {
					filters: {
						email: ["in", r.message],
					},
				};
			});
		});
	}

	
});


frappe.ui.form.on("Project Todo", {
	action: function (frm, cdt, cdn) {
		let row = locals[cdt][cdn];

		// If not save throw save first
		if (frm.doc.__unsaved) {
			frappe.throw({message: __("Please save the document before performing this action."), title: __("Error")});
		}
		
		switch (row.status) {
			case "⚪️ Planned":
			action = "🟠 Done";
			break;
			
			case "🟠 Done":
			action = "🔷 Checked By PL";
			break;
			
			case "🔷 Checked By PL":
			action = "✅ Completed";
			break;
			
			case "✅ Completed":
			action = "";
			break;
		}
		
		if (!action) {
			frappe.throw({ message: __("Project "+ row.to_do + " is already completed."), title: __("Error") });
		}
		frappe.confirm(
			__("Yakin ubah status " + row.to_do + " ke " + action + "?"),
			() => {
				// user klik Yes
				frappe.call({
					method: "vernon_project.api.project_todo.update_status",
					args: {
						todo_id: row.name,
					},
					freeze: true,
					freeze_message: __("Updating status...")
				}).then((r) => {
					frappe.msgprint({
						title: __(r.message.status.charAt(0).toUpperCase() + r.message.status.slice(1)),
						message: r.message.message,
						indicator: r.message.status == "error" ? "red" : "green",
					});
					if (r.message.status == "error") {
						return;
					} else {
						// Reload child table
						frm.reload_doc();
					}
				})
			}
		);
	},

	before_todo_remove: function (frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (row.status !== "⚪️ Planned") {
			frappe.throw({message: __("Cannot delete Project Todo unless its status is 'Scheduled'."), title: __("Error")});
		}
	},
});