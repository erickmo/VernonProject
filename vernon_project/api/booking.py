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
	"""equipment may arrive as a JSON string (POST) or list. Returns conflicts.

	Pre-submit conflict check for a room/equipment booking. Any logged-in user may
	call it — it is a lookup against existing bookings, not a reservation, and it
	writes nothing. Calling it does NOT hold the slot: two callers can both see it
	free, and the Resource Booking save is what actually resolves the race.

	`start` and `end` are required datetimes. Returns
	`{"conflicts": [...]}`; an empty array means free. There is no boolean — check
	the array's length.

	Optional arguments:

	* `room` — the room to check. Omit it to check equipment only.
	* `equipment` — list of equipment ids, or the same list as a JSON string (which
	  is how the POST path sends it). Omitted or unparseable becomes [].
	* `exclude` — a Resource Booking name to ignore when looking for conflicts. Pass
	  the booking being edited, or it will collide with itself and report a conflict
	  against its own current slot."""
	if isinstance(equipment, str):
		equipment = frappe.parse_json(equipment) or []
	return {"conflicts": find_conflicts(start, end, room=room, equipment=equipment, exclude=exclude)}
