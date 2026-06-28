# Copyright (c) 2026, Vernon and contributors

import frappe


def execute():
	defaults = {
		"qr_validity_seconds": 30,
		"attendance_grace_minutes": 5,
		"late_penalty_per_minute": 0,
		"early_leave_penalty_per_minute": 0,
		"absence_penalty": 0,
	}
	for field, value in defaults.items():
		if frappe.db.get_single_value("Vernon Settings", field) is None:
			frappe.db.set_single_value("Vernon Settings", field, value)
