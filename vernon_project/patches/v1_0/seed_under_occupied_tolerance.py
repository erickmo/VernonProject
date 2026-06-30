import frappe


def execute():
	# Only seed when unset (None); leave any admin-chosen value, including 0, intact.
	if frappe.db.get_single_value("Vernon Settings", "under_occupied_tolerance_minutes") is None:
		frappe.db.set_single_value("Vernon Settings", "under_occupied_tolerance_minutes", 60)
