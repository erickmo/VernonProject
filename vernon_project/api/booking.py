# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
#
# Availability check for Resource Booking. Thin whitelisted wrapper over the
# doctype's find_conflicts (single source of the overlap rule) so the web form
# can show clashes before submit. The doctype's validate() is the real guard.

import frappe

from vernon_project.vernon_project.doctype.resource_booking.resource_booking import find_conflicts


@frappe.whitelist()
def check_availability(start, end, room=None, equipment=None, exclude=None):
	"""equipment may arrive as a JSON string (POST) or list. Returns conflicts."""
	if isinstance(equipment, str):
		equipment = frappe.parse_json(equipment) or []
	return {"conflicts": find_conflicts(start, end, room=room, equipment=equipment, exclude=exclude)}
