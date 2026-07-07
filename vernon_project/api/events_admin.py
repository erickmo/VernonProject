# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import json

import frappe

from vernon_project.api.events import _active_count, _require_user

MANAGE_FIELDS = ["name", "title", "start_datetime", "status", "pricing", "capacity"]
EDITABLE = [
	"title", "description", "cover_image", "start_datetime", "end_datetime",
	"location", "capacity", "pricing", "points_cost", "price", "status",
	"category", "is_featured", "parent_event",
]  # NOTE: 'organizer' deliberately excluded — never set from client payload.
# ponytail: parent_event ownership isn't re-checked; all organizers are trusted staff.
# Add a _can_manage(parent) check here if untrusted organizers are ever introduced.


def _is_sm(user=None):
	return "System Manager" in frappe.get_roles(user or frappe.session.user)


def _can_manage(event):
	"""Throw unless the session user is the event's organizer or a System Manager."""
	organizer = frappe.db.get_value("Vernon Event", event, "organizer")
	if organizer is None:
		frappe.throw("Event not found", frappe.DoesNotExistError)
	if organizer != frappe.session.user and not _is_sm():
		frappe.throw("Not permitted", frappe.PermissionError)


@frappe.whitelist()
def manage_list_events():
	user = _require_user()
	filters = {} if _is_sm(user) else {"organizer": user}
	rows = frappe.get_all(
		"Vernon Event", filters=filters, fields=MANAGE_FIELDS, order_by="start_datetime desc"
	)
	for r in rows:
		r["registered_count"] = _active_count(r["name"])
	return rows


@frappe.whitelist()
def get_managed_event(name):
	"""Full editable fields for one event, gated by _can_manage (so a non-SM
	organizer can load their own Draft — the doctype itself is SM-only-read)."""
	_require_user()
	_can_manage(name)
	return frappe.db.get_value("Vernon Event", name, ["name"] + EDITABLE, as_dict=True)


@frappe.whitelist()
def save_event(payload, name=None):
	user = _require_user()
	data = json.loads(payload) if isinstance(payload, str) else payload
	if name:
		_can_manage(name)
		doc = frappe.get_doc("Vernon Event", name)
	else:
		doc = frappe.new_doc("Vernon Event")
		doc.organizer = user
	for f in EDITABLE:
		if f in data:
			doc.set(f, data[f])
	doc.save(ignore_permissions=True)  # controller validate() enforces pricing/cost rules
	return {"name": doc.name}


@frappe.whitelist()
def delete_event(name):
	_require_user()
	_can_manage(name)
	# Frappe raises LinkExistsError if registrations reference the event — surfaced
	# to the client, which shows "cancel registrations / set status Cancelled first".
	frappe.delete_doc("Vernon Event", name, ignore_permissions=True)
	return {"ok": True}


ROSTER_FIELDS = ["name", "user", "status", "method", "amount", "attended", "registered_on"]


@frappe.whitelist()
def event_roster(event):
	_require_user()
	_can_manage(event)
	rows = frappe.get_all(
		"Vernon Event Registration", filters={"event": event},
		fields=ROSTER_FIELDS, order_by="registered_on desc",
	)
	for r in rows:
		r["full_name"] = frappe.db.get_value("User", r["user"], "full_name") or r["user"]
	return rows


def _reg_event(name):
	event = frappe.db.get_value("Vernon Event Registration", name, "event")
	if not event:
		frappe.throw("Registration not found", frappe.DoesNotExistError)
	return event


@frappe.whitelist()
def cancel_registration(name):
	_require_user()
	_can_manage(_reg_event(name))
	# Sets Cancelled. Points auto-refund (_user_balance sums only non-Cancelled
	# Points regs) and the seat auto-frees (_active_count ignores Cancelled).
	# Rupiah money refunds are out of scope (manual). Idempotent.
	frappe.db.set_value("Vernon Event Registration", name, "status", "Cancelled")
	return {"ok": True}


@frappe.whitelist()
def mark_attended(name, attended):
	_require_user()
	_can_manage(_reg_event(name))
	frappe.db.set_value(
		"Vernon Event Registration", name, "attended", 1 if int(attended) else 0
	)
	return {"ok": True}
