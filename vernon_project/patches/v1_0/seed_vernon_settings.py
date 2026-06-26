import frappe


def execute():
	if not frappe.db.get_single_value("Vernon Settings", "max_estimated_minutes"):
		frappe.db.set_single_value("Vernon Settings", "max_estimated_minutes", 1440)
