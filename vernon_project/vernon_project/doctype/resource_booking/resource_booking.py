# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_datetime

CONFIRMED = "Confirmed"


def _overlaps(a_start, a_end, b_start, b_end):
	"""True when [a_start, a_end) and [b_start, b_end) intersect."""
	a0, a1 = get_datetime(a_start), get_datetime(a_end)
	b0, b1 = get_datetime(b_start), get_datetime(b_end)
	return a0 < b1 and a1 > b0


def find_conflicts(start, end, room=None, equipment=None, exclude=None):
	"""Confirmed bookings whose window overlaps [start, end) and that share the
	room or any of `equipment` (list of Equipment names). `exclude` = a booking
	name to skip (the row being saved). Returns a list of conflict dicts."""
	equipment = equipment or []
	conflicts = []

	# Candidate bookings: Confirmed, overlapping window, not self. Overlap is
	# pushed into SQL via the two inequalities; _overlaps is the readable mirror.
	filters = [["status", "=", CONFIRMED], ["start", "<", end], ["end", ">", start]]
	if exclude:
		filters.append(["name", "!=", exclude])
	candidates = frappe.get_all(
		"Resource Booking",
		filters=filters,
		fields=["name", "title", "start", "end", "room"],
	)
	if not candidates:
		return conflicts

	names = [c["name"] for c in candidates]
	# Map booking -> set of equipment names, one query over the child table.
	eq_rows = frappe.get_all(
		"Resource Booking Equipment",
		filters={"parenttype": "Resource Booking", "parent": ["in", names]},
		fields=["parent", "equipment"],
	)
	eq_by_booking = {}
	for r in eq_rows:
		eq_by_booking.setdefault(r["parent"], set()).add(r["equipment"])

	want_eq = set(equipment)
	for c in candidates:
		if room and c["room"] == room:
			conflicts.append({
				"resource_type": "Room", "resource": room, "booking": c["name"],
				"title": c["title"], "start": str(c["start"]), "end": str(c["end"]),
			})
		for eq in (want_eq & eq_by_booking.get(c["name"], set())):
			conflicts.append({
				"resource_type": "Equipment", "resource": eq, "booking": c["name"],
				"title": c["title"], "start": str(c["start"]), "end": str(c["end"]),
			})
	return conflicts


class ResourceBooking(Document):
	def validate(self):
		if self.is_new() and not self.booked_by:
			self.booked_by = frappe.session.user
		if get_datetime(self.end) <= get_datetime(self.start):
			frappe.throw(_("End must be after Start."))
		if self.status != CONFIRMED:
			return
		equipment = [row.equipment for row in self.equipment if row.equipment]
		conflicts = find_conflicts(
			self.start, self.end, room=self.room, equipment=equipment,
			exclude=self.name if not self.is_new() else None,
		)
		if conflicts:
			c = conflicts[0]
			frappe.throw(_(
				"{0} '{1}' is already booked from {2} to {3} ({4})."
			).format(c["resource_type"], c["resource"], c["start"], c["end"], c["title"]))


def get_permission_query_conditions(user):
	# Read is open to all authenticated users (visibility makes conflict
	# prevention legible). No row filter.
	return ""


def has_permission(doc, ptype, user):
	if ptype == "read":
		return True
	if "System Manager" in frappe.get_roles(user):
		return True
	return doc.booked_by == user
