import frappe


def execute():
	# Only seed when unset (None); leave any admin-chosen value, including 0, intact.
	if frappe.db.get_single_value("Vernon Settings", "min_daily_estimated_minutes") is None:
		frappe.db.set_single_value("Vernon Settings", "min_daily_estimated_minutes", 480)
