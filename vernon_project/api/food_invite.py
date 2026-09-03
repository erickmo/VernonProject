# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt
"""Makan Bareng — invite people to buy/eat food together.

Fire-and-forget for the sender: no roster screen. The invite persists only so
the shared link and the order-by cutoff work; the payoff for "Yes, I'll order"
is a notification back to the inviter. Popup reaches recipients three ways —
socket realtime (instant, if the app is open), in-app Vernon Notification, and
Web Push (offline) — all via the existing _notify plumbing.
"""

import frappe
from frappe import _
from frappe.utils import get_datetime, now_datetime

from vernon_project.api.mobile import (
	PROTECTED_USERS,
	_enabled_only,
	_notify,
	_user_name_map,
)

DOCTYPE = "Food Invite"
NOTIF_TYPE = "Food Invite"
AUDIENCES = ("Specific", "Internal", "Project", "Link")


def _require_login():
	if frappe.session.user == "Guest":
		frappe.throw(_("Not logged in"), frappe.AuthenticationError)
	return frappe.session.user


def _is_closed(order_by):
	return bool(order_by) and get_datetime(order_by) < now_datetime()


def _parse_users(users):
	if isinstance(users, str):
		users = frappe.parse_json(users) if users else []
	return [u for u in (users or []) if u]


def _resolve_recipients(audience_type, users, project, inviter):
	"""Emails to popup + notify, by audience. Never the inviter, protected, or
	disabled accounts. Link audience has no pre-targeted recipients."""
	if audience_type == "Specific":
		emails = _parse_users(users)
	elif audience_type == "Internal":
		emails = frappe.get_all(
			"User", filters={"enabled": 1, "custom_member_type": "Internal Team"}, pluck="name"
		)
	elif audience_type == "Project":
		if not project:
			frappe.throw(_("Pick a project"))
		emails = frappe.get_all(
			"Project Team", filters={"parent": project, "parenttype": "Project"}, pluck="user"
		)
	else:  # Link
		return []
	emails = [e for e in _enabled_only(emails) if e not in PROTECTED_USERS and e != inviter]
	return sorted(set(emails))


def _serialize(doc, user):
	"""The shape the popup and the /food/:name page both render."""
	yes = [r.user for r in doc.recipients if r.response == "Yes"]
	no = [r.user for r in doc.recipients if r.response == "No"]
	mine = next((r.response for r in doc.recipients if r.user == user), None)
	name_map = _user_name_map(set(yes) | {doc.inviter})
	return {
		"name": doc.name,
		"message": doc.message,
		"place": doc.place,
		"order_by": str(doc.order_by),
		"inviter": doc.inviter,
		"inviter_name": (name_map.get(doc.inviter) or {}).get("full_name") or doc.inviter,
		"is_inviter": doc.inviter == user,
		"closed": _is_closed(doc.order_by),
		"my_response": mine or None,
		"yes_count": len(yes),
		"no_count": len(no),
		"yes_names": [(name_map.get(u) or {}).get("full_name") or u for u in yes],
	}


@frappe.whitelist()
def create_invite(message, order_by, audience_type="Specific", place=None, users=None, project=None):
	inviter = _require_login()
	message = (message or "").strip()
	if not message:
		frappe.throw(_("Message is required"))
	if not order_by or get_datetime(order_by) <= now_datetime():
		frappe.throw(_("Order-by time must be in the future"))
	if audience_type not in AUDIENCES:
		frappe.throw(_("Invalid audience"))

	recipients = _resolve_recipients(audience_type, users, project, inviter)
	if audience_type != "Link" and not recipients:
		frappe.throw(_("No one to invite"))

	place = (place or "").strip() or None
	doc = frappe.get_doc({
		"doctype": DOCTYPE,
		"inviter": inviter,
		"message": message,
		"place": place,
		"order_by": order_by,
		"audience_type": audience_type,
		"project": project if audience_type == "Project" else None,
		"recipients": [{"user": u} for u in recipients],
	}).insert(ignore_permissions=True)
	frappe.db.commit()

	title = _("🍜 Makan bareng?")
	body = f"{message} · {place}" if place else message
	# ponytail: per-recipient publish + _notify. Fine for typical groups; if an
	# "Internal" blast to ~100 users ever drags, batch the notify enqueue.
	for u in recipients:
		frappe.publish_realtime("food_invite", {"invite": doc.name}, user=u, after_commit=True)
		_notify(u, NOTIF_TYPE, title, body, reference_doctype=DOCTYPE, reference_name=doc.name, actor=inviter)

	return {"status": "success", "invite": doc.name}


@frappe.whitelist()
def respond(invite, response):
	user = _require_login()
	if response not in ("Yes", "No"):
		frappe.throw(_("Invalid response"))
	doc = frappe.get_doc(DOCTYPE, invite)
	if _is_closed(doc.order_by):
		return {"status": "closed"}
	row = next((r for r in doc.recipients if r.user == user), None)
	if row is None:
		# Link audience / forwarded link: first response self-enrolls.
		row = doc.append("recipients", {"user": user})
	row.response = response
	row.responded_at = now_datetime()
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	if response == "Yes" and doc.inviter != user:
		name = frappe.db.get_value("User", user, "full_name") or user
		_notify(
			doc.inviter, NOTIF_TYPE, _("Ada yang ikut pesan 🍜"),
			_("{0} ikut makan bareng").format(name),
			reference_doctype=DOCTYPE, reference_name=doc.name, actor=user,
		)
	return {"status": "success", "response": response}


@frappe.whitelist()
def get_invite(invite):
	user = _require_login()
	return _serialize(frappe.get_doc(DOCTYPE, invite), user)


@frappe.whitelist()
def get_pending_invites():
	"""Open invites where the session user is a recipient who hasn't answered.
	Drives the app-wide popup (poll backstop + realtime refetch). Usually 0-1."""
	user = _require_login()
	rows = frappe.get_all(
		"Food Invite Recipient",
		filters={"user": user, "response": ["in", ["", None]]},
		fields=["parent"],
		limit_page_length=0,
	)
	names = list({r["parent"] for r in rows})
	if not names:
		return []
	invites = frappe.get_all(
		DOCTYPE,
		filters={"name": ["in", names], "order_by": [">", now_datetime()]},
		pluck="name",
		order_by="creation desc",
	)
	return [_serialize(frappe.get_doc(DOCTYPE, n), user) for n in invites]


@frappe.whitelist()
def food_invitable_users(txt=""):
	"""Enabled Internal-Team + Intern users for the 'specific people' picker.
	Any logged-in user may search — a social invite, not sensitive data."""
	_require_login()
	like = f"%{(txt or '').strip()}%"
	rows = frappe.db.sql(
		"""SELECT name AS user, full_name FROM `tabUser`
		   WHERE enabled = 1 AND name NOT IN %(protected)s
		     AND custom_member_type IN ('Internal Team', 'Intern')
		     AND (name LIKE %(like)s OR full_name LIKE %(like)s)
		   ORDER BY full_name LIMIT 50""",
		{"protected": tuple(PROTECTED_USERS), "like": like},
		as_dict=True,
	)
	return {"users": rows}
