# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import json

import frappe
from frappe.utils import now_datetime

PUBLIC_EVENT_FIELDS = [
	"name", "title", "cover_image", "start_datetime", "end_datetime",
	"location", "pricing", "points_cost", "price", "capacity",
	"category", "is_featured", "parent_event",
]


def _require_user():
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Not logged in", frappe.AuthenticationError)
	return user


def _active_count(event, for_update=False):
	"""Non-cancelled registrations (Pending holds a seat too). register() passes
	for_update: its snapshot (taken by the get_doc before it locks the event row)
	predates any seat committed while it waited, and a plain count would miss it."""
	return frappe.db.sql(
		"select count(*) from `tabVernon Event Registration` where event = %s and status != 'Cancelled'"
		+ (" for update" if for_update else ""),
		event,
	)[0][0]


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
	# ponytail: client-side filtering. If published-event count reaches thousands,
	# add server params (period, category, pricing, q) here and paginate.
	return [_decorate(r, user) for r in rows if not r.get("parent_event")]


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
	_decorate(row, user)
	children = frappe.get_all(
		"Vernon Event",
		filters={"parent_event": event, "status": "Published"},
		fields=PUBLIC_EVENT_FIELDS,
		order_by="start_datetime asc",
	)
	row["sub_events"] = [_decorate(c, user) for c in children]
	return row


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


def _existing_active(event, user):
	# Locking read, same reason as _active_count: a plain read here misses a
	# registration this user's other request committed a moment ago.
	rows = frappe.db.sql(
		"select name from `tabVernon Event Registration`"
		" where event = %s and user = %s and status != 'Cancelled' limit 1 for update",
		(event, user),
	)
	return rows[0][0] if rows else None


def _capacity_ok(ev, for_update=False):
	cap = ev.capacity or 0
	return not cap or _active_count(ev.name, for_update=for_update) < cap


def _make_registration(event, user, method, amount, status):
	reg = frappe.get_doc({
		"doctype": "Vernon Event Registration",
		"event": event, "user": user, "method": method,
		"amount": amount, "status": status, "registered_on": now_datetime(),
	})
	reg.insert(ignore_permissions=True)
	return reg


@frappe.whitelist()
def register(event):
	from vernon_project.api.mobile import _user_balance
	user = _require_user()
	ev = frappe.get_doc("Vernon Event", event)
	if ev.status != "Published":
		frappe.throw("Event not available", frappe.ValidationError)

	# Serialise per-user spend/seat races with the same advisory lock the wallet uses.
	lock_key = f"vernon_spend:{user}"
	got = frappe.db.sql("select get_lock(%s, 10)", lock_key)[0][0]
	if not got:
		frappe.throw("Registration busy, please retry", frappe.ValidationError)
	try:
		existing = _existing_active(event, user)
		if existing:
			reg = frappe.get_doc("Vernon Event Registration", existing, for_update=True)
			if reg.status == "Pending" and reg.method == "Rupiah" and reg.snap_token:
				# ponytail: resume the abandoned Snap payment instead of dead-ending; the same order_id/token is re-opened. Midtrans expiry eventually cancels a truly-abandoned Pending, freeing the seat.
				return {"registration": reg.name, "status": "Pending",
					"snap_token": reg.snap_token, "order_id": reg.name}
			frappe.throw("You are already registered.", frappe.ValidationError)
		# The advisory lock above is keyed per-USER, which is right for the wallet
		# but cannot cover the capacity check: capacity is a per-EVENT invariant,
		# and two different users take two different locks, so neither sees the
		# other's seat and both pass the count below. Serialise contending
		# registrants on the event row itself -- the same second layer
		# redeem_reward uses (`... for update` on the shared catalog row) so that
		# concurrent redeems cannot oversell stock.
		frappe.db.sql("select name from `tabVernon Event` where name = %s for update", event)
		if not _capacity_ok(ev, for_update=True):
			frappe.throw("This event is full.", frappe.ValidationError)

		if ev.pricing == "Free":
			reg = _make_registration(event, user, "Free", 0, "Confirmed")
			return {"registration": reg.name, "status": "Confirmed", "balance": None}

		if ev.pricing == "Points":
			cost = float(ev.points_cost or 0)
			_, _, balance = _user_balance(user, for_update=True)
			if cost > balance:
				frappe.throw("Insufficient balance", frappe.ValidationError)
			reg = _make_registration(event, user, "Points", cost, "Confirmed")
			_, _, new_balance = _user_balance(user)
			return {"registration": reg.name, "status": "Confirmed", "balance": new_balance}

		if ev.pricing == "Rupiah":
				from vernon_project.api.midtrans import snap_create
				amount = float(ev.price or 0)
				reg = _make_registration(event, user, "Rupiah", amount, "Pending")
				# order_id = the registration docname; webhook looks it up by this.
				data = snap_create(
					order_id=reg.name,
					gross_amount=amount,
					customer={"first_name": (frappe.db.get_value("User", user, "full_name") or user)[:50],
						"email": user if "@" in user else None},
					items=[{"id": ev.name, "price": int(amount), "quantity": 1, "name": ev.title[:50]}],
				)
				reg.db_set({"midtrans_order_id": reg.name, "snap_token": data.get("token")})
				return {"registration": reg.name, "status": "Pending",
					"snap_token": data.get("token"), "order_id": reg.name}
	finally:
		frappe.db.sql("select release_lock(%s)", lock_key)


def _apply_notification(payload):
	from vernon_project.api.midtrans import _server_key, verify_signature
	if not verify_signature(payload, _server_key()):
		frappe.log_error(title="Events Midtrans bad signature", message=f"order_id={payload.get('order_id')}")
		raise frappe.PermissionError("Invalid signature.")

	order_id = payload.get("order_id")
	name = frappe.db.get_value("Vernon Event Registration", {"midtrans_order_id": order_id}, "name")
	if not name:
		frappe.log_error(title="Events Midtrans unknown order", message=f"order_id={order_id}")
		return "ignored"

	# Row-lock to serialise duplicate/concurrent notifications.
	frappe.db.get_value("Vernon Event Registration", name, "name", for_update=True)
	reg = frappe.get_doc("Vernon Event Registration", name)
	reg.db_set("transaction_status", payload.get("transaction_status"), update_modified=False)

	if reg.status == "Confirmed":
		return "Confirmed"  # idempotent — already finalized

	txn = payload.get("transaction_status")
	fraud = payload.get("fraud_status")
	if txn == "settlement" or (txn == "capture" and fraud == "accept"):
		# Amount tamper check.
		if float(payload.get("gross_amount") or 0) != float(reg.amount or 0):
			frappe.log_error(title="Events Midtrans tamper", message=f"order_id={order_id} amount mismatch")
			raise frappe.PermissionError("Amount mismatch.")
		reg.db_set({"status": "Confirmed", "paid_on": frappe.utils.now()})
		return "Confirmed"
	if txn in ("deny", "cancel", "expire"):
		reg.db_set("status", "Cancelled")
		return "Cancelled"
	return reg.status  # pending etc. — leave as is


@frappe.whitelist(allow_guest=True, methods=["POST"])
def midtrans_notify():
	try:
		payload = json.loads(frappe.request.get_data() or b"{}")
	except ValueError:
		frappe.throw("Invalid payload", frappe.ValidationError)
	result = _apply_notification(payload)
	frappe.db.commit()
	return {"status": result}
