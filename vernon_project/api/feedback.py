# Copyright (c) 2026, Vernon and contributors
# Company feedback: criticism & suggestions from users to the company.

import frappe

from vernon_project.api.mobile import _notify, _humanize_datetime

TYPES = {"Criticism", "Suggestion", "Praise", "Bug"}
STATUSES = {"New", "Reviewed", "Resolved", "Rejected"}
MAX_MESSAGE = 5000


def _require_admin():
	if "System Manager" not in frappe.get_roles(frappe.session.user):
		frappe.throw("Not permitted", frappe.PermissionError)


def _admins():
	"""Distinct, enabled System Manager users."""
	rows = frappe.get_all(
		"Has Role",
		filters={"role": "System Manager", "parenttype": "User"},
		pluck="parent",
	)
	return sorted({r for r in rows})


@frappe.whitelist()
def submit_feedback(feedback_type, message, is_anonymous=0):
	"""Create a Company Feedback row and notify admins. Any logged-in user."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Please log in to send feedback.", frappe.AuthenticationError)

	if feedback_type not in TYPES:
		frappe.throw("Invalid feedback type.")

	message = (message or "").strip()
	if not message:
		frappe.throw("Message is required.")
	if len(message) > MAX_MESSAGE:
		frappe.throw("Message is too long.")

	anon = bool(frappe.utils.cint(is_anonymous))

	doc = frappe.get_doc({
		"doctype": "Company Feedback",
		"feedback_type": feedback_type,
		"message": message,
		"is_anonymous": 1 if anon else 0,
		"submitted_by": None if anon else user,
		"status": "New",
	}).insert(ignore_permissions=True)

	if anon:
		# Frappe stamps owner = session user on insert; scrub it so anonymous
		# feedback is unattributable even to admins.
		frappe.db.set_value(
			"Company Feedback", doc.name, "owner", "Administrator",
			update_modified=False,
		)

	frappe.db.commit()

	# Best-effort notify; _notify swallows errors and skips self/protected.
	preview = message[:140]
	actor = None if anon else user
	for admin in _admins():
		_notify(
			admin, "Feedback", f"New {feedback_type.lower()} feedback",
			preview, "Company Feedback", doc.name, actor=actor,
		)

	return {"status": "ok"}


@frappe.whitelist()
def list_feedback(status=None):
	"""Admin-only. Newest-first feedback with a display submitter."""
	_require_admin()
	filters = {}
	if status and status in STATUSES:
		filters["status"] = status

	rows = frappe.get_all(
		"Company Feedback",
		filters=filters,
		fields=[
			"name", "feedback_type", "message", "status",
			"is_anonymous", "submitted_by", "creation",
		],
		order_by="creation desc",
		limit_page_length=0,
	)

	names = {r["submitted_by"] for r in rows if r["submitted_by"]}
	name_map = {}
	if names:
		for u in frappe.get_all(
			"User", filters={"name": ["in", list(names)]},
			fields=["name", "full_name"],
		):
			name_map[u["name"]] = u["full_name"] or u["name"]

	items = [
		{
			"name": r["name"],
			"feedback_type": r["feedback_type"],
			"message": r["message"],
			"status": r["status"],
			"is_anonymous": bool(r["is_anonymous"]),
			"submitter": "Anonymous" if r["is_anonymous"]
			else (name_map.get(r["submitted_by"]) or r["submitted_by"] or "—"),
			"at": str(r["creation"]),
			"at_human": _humanize_datetime(r["creation"]),
		}
		for r in rows
	]
	return {"items": items}


@frappe.whitelist()
def set_feedback_status(name, status):
	"""Admin-only status transition."""
	_require_admin()
	if status not in STATUSES:
		frappe.throw("Invalid status.")
	if not frappe.db.exists("Company Feedback", name):
		frappe.throw("Feedback not found.")
	frappe.db.set_value("Company Feedback", name, "status", status)
	return {"status": "ok"}
