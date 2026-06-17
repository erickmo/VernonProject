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

		frm.trigger("project");

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
		
	}


});