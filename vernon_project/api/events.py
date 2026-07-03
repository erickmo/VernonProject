# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe

PUBLIC_EVENT_FIELDS = [
	"name", "title", "cover_image", "start_datetime", "end_datetime",
	"location", "pricing", "points_cost", "price", "capacity",
]


def _require_user():
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)
	return user


def _active_count(event):
	"""Non-cancelled registrations (Pending holds a seat too)."""
	return frappe.db.count("Vernon Event Registration", {"event": event, "status": ["!=", "Cancelled"]})


def _my_status(event, user):
	rows = frappe.get_all(
		"Vernon Event Registration",
		filters={"event": event, "user": user, "status": ["!=", "Cancelled"]},
		fields=["status"],
		limit_page_length=1,
	)
	return rows[0]["status"] if rows else None


def _decorate(row, user):
	count = _active_count(row["name"])
	cap = row.get("capacity") or 0
	row["registered_count"] = count
	row["is_full"] = bool(cap) and count >= cap
	row["my_status"] = _my_status(row["name"], user)
	return row


@frappe.whitelist()
def list_events():
	user = _require_user()
	rows = frappe.get_all(
		"Vernon Event",
		filters={"status": "Published"},
		fields=PUBLIC_EVENT_FIELDS,
		order_by="start_datetime asc",
	)
	return [_decorate(r, user) for r in rows]


@frappe.whitelist()
def get_event(event):
	user = _require_user()
	if not frappe.db.exists("Vernon Event", event):
		frappe.throw("Event not found", frappe.DoesNotExistError)
	row = frappe.db.get_value(
		"Vernon Event", event, PUBLIC_EVENT_FIELDS + ["description", "organizer", "status"], as_dict=True
	)
	if row.status != "Published":
		frappe.throw("Event not available", frappe.PermissionError)
	return _decorate(row, user)


@frappe.whitelist()
def my_registrations():
	user = _require_user()
	rows = frappe.get_all(
		"Vernon Event Registration",
		filters={"user": user, "status": ["!=", "Cancelled"]},
		fields=["name", "event", "registered_on", "status", "method", "amount"],
		order_by="registered_on desc",
	)
	for r in rows:
		r["event_title"] = frappe.db.get_value("Vernon Event", r["event"], "title")
		r["start_datetime"] = frappe.db.get_value("Vernon Event", r["event"], "start_datetime")
	return rows
