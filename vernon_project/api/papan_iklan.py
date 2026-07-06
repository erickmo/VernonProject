# Copyright (c) 2026, Vernon and contributors
# Papan Iklan: a classified-ads board (Sell / Buy / Rent) for logged-in users.
# Post-immediately; admins delete any ad and time-ban posters. Mirrors the
# author-or-admin gate from events_admin.py and the moderation shape of feedback.py.

import json

import frappe
from frappe.utils import today, getdate

from vernon_project.api.mobile import _notify

AD_TYPES = {"Sell", "Buy", "Rent"}
MAX_TITLE = 200
MAX_CONTACT = 100
MAX_LOCATION = 200
MAX_PHOTOS = 5

ALLOWED_IMAGE_EXT = (".png", ".jpg", ".jpeg", ".webp", ".gif")
ALLOWED_IMAGE_MIME = ("image/png", "image/jpeg", "image/webp", "image/gif")
MAX_IMAGE_BYTES = 5 * 1024 * 1024


# ---------- helpers ----------

def _require_user():
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Please log in.", frappe.AuthenticationError)
	return user


def _is_sm(user=None):
	return "System Manager" in frappe.get_roles(user or frappe.session.user)


def _require_admin():
	if not _is_sm():
		frappe.throw("Not permitted", frappe.PermissionError)


def _admins():
	"""Distinct System Manager users."""
	rows = frappe.get_all(
		"Has Role",
		filters={"role": "System Manager", "parenttype": "User"},
		pluck="parent",
	)
	return sorted(set(rows))


def _can_manage(name):
	"""Throw unless the session user authored the ad or is a System Manager.
	Returns the author on success."""
	author = frappe.db.get_value("Papan Iklan", name, "author")
	if author is None:
		frappe.throw("Ad not found", frappe.DoesNotExistError)
	if author != frappe.session.user and not _is_sm():
		frappe.throw("Not permitted", frappe.PermissionError)
	return author


def _active_ban(user):
	"""The active ban row for a user (banned_until >= today), or None."""
	rows = frappe.get_all(
		"Papan Iklan Ban",
		filters={"user": user, "banned_until": [">=", today()]},
		fields=["name", "banned_until", "reason"],
		order_by="banned_until desc",
		limit_page_length=1,
	)
	return rows[0] if rows else None


def _assert_not_banned(user):
	ban = _active_ban(user)
	if ban:
		frappe.throw(
			f"You are banned from posting until {ban['banned_until']}. Reason: {ban['reason']}",
			frappe.PermissionError,
		)


def _clean(data):
	title = (data.get("title") or "").strip()
	if not title:
		frappe.throw("Title is required.")
	if len(title) > MAX_TITLE:
		frappe.throw("Title is too long.")
	ad_type = data.get("ad_type")
	if ad_type not in AD_TYPES:
		frappe.throw("Choose Sell, Buy, or Rent.")
	contact = (data.get("contact") or "").strip()
	if not contact:
		frappe.throw("Contact is required.")
	if len(contact) > MAX_CONTACT:
		frappe.throw("Contact is too long.")
	return title, ad_type, contact


def _apply_fields(doc, data, title, ad_type, contact):
	doc.title = title
	doc.ad_type = ad_type
	doc.contact = contact
	doc.description = data.get("description")
	doc.price = data.get("price") or 0
	doc.rate_period = data.get("rate_period") if ad_type == "Rent" else None
	doc.location = ((data.get("location") or "").strip())[:MAX_LOCATION]
	_apply_photos(doc, data.get("photos"))


def _apply_photos(doc, photos):
	if isinstance(photos, str):
		photos = json.loads(photos)
	photos = photos or []
	if len(photos) > MAX_PHOTOS:
		frappe.throw(f"At most {MAX_PHOTOS} photos.")
	doc.set("photos", [])
	for url in photos:
		if url:
			doc.append("photos", {"image": url})


def _author_card(user):
	row = frappe.db.get_value("User", user, ["full_name", "user_image"], as_dict=True) or {}
	return {
		"author_name": row.get("full_name") or user,
		"author_image": row.get("user_image"),
	}


# ---------- read ----------

PUBLIC_FIELDS = [
	"name", "title", "ad_type", "price", "rate_period", "location",
	"status", "author", "creation",
]


@frappe.whitelist()
def list_ads(ad_type=None, q=None, mine=0):
	"""Active ads newest-first (or the caller's own ads of any status when mine=1)."""
	user = _require_user()
	mine = frappe.utils.cint(mine)
	filters = {"author": user} if mine else {"status": "Active"}
	if ad_type and ad_type in AD_TYPES:
		filters["ad_type"] = ad_type

	or_filters = None
	if q and q.strip():
		like = f"%{q.strip()}%"
		or_filters = {"title": ["like", like], "description": ["like", like]}

	rows = frappe.get_all(
		"Papan Iklan",
		filters=filters,
		or_filters=or_filters,
		fields=PUBLIC_FIELDS,
		order_by="creation desc",
		limit_page_length=0,
	)
	if not rows:
		return []

	names = [r["name"] for r in rows]
	thumbs = {}
	for p in frappe.get_all(
		"Papan Iklan Photo",
		filters={"parent": ["in", names], "parenttype": "Papan Iklan"},
		fields=["parent", "image"],
		order_by="idx asc",
	):
		thumbs.setdefault(p["parent"], p["image"])

	author_ids = {r["author"] for r in rows if r["author"]}
	name_map = {}
	if author_ids:
		for u in frappe.get_all(
			"User", filters={"name": ["in", list(author_ids)]},
			fields=["name", "full_name"],
		):
			name_map[u["name"]] = u["full_name"] or u["name"]

	return [
		{
			"name": r["name"],
			"title": r["title"],
			"ad_type": r["ad_type"],
			"price": r["price"],
			"rate_period": r["rate_period"],
			"location": r["location"],
			"status": r["status"],
			"author": r["author"],
			"author_name": name_map.get(r["author"]) or r["author"],
			"thumbnail": thumbs.get(r["name"]),
			"at": str(r["creation"]),
		}
		for r in rows
	]


@frappe.whitelist()
def get_ad(name):
	user = _require_user()
	doc = frappe.db.get_value(
		"Papan Iklan", name,
		["name", "title", "ad_type", "description", "price", "rate_period",
		 "location", "contact", "status", "author"],
		as_dict=True,
	)
	if not doc:
		frappe.throw("Ad not found", frappe.DoesNotExistError)
	# A Removed ad is visible only to its author or an admin.
	if doc["status"] == "Removed" and doc["author"] != user and not _is_sm(user):
		frappe.throw("Ad not found", frappe.DoesNotExistError)

	doc["photos"] = [
		p["image"] for p in frappe.get_all(
			"Papan Iklan Photo",
			filters={"parent": name, "parenttype": "Papan Iklan"},
			fields=["image"], order_by="idx asc",
		)
	]
	doc.update(_author_card(doc["author"]))
	doc["is_owner"] = doc["author"] == user
	doc["is_admin"] = _is_sm(user)
	return doc


# ---------- author write ----------

@frappe.whitelist()
def create_ad(payload):
	user = _require_user()
	_assert_not_banned(user)
	data = json.loads(payload) if isinstance(payload, str) else payload
	title, ad_type, contact = _clean(data)

	doc = frappe.new_doc("Papan Iklan")
	doc.author = user
	doc.status = "Active"
	_apply_fields(doc, data, title, ad_type, contact)
	doc.insert(ignore_permissions=True)
	return {"name": doc.name}


@frappe.whitelist()
def update_ad(name, payload):
	user = _require_user()
	_can_manage(name)
	_assert_not_banned(user)
	data = json.loads(payload) if isinstance(payload, str) else payload
	title, ad_type, contact = _clean(data)

	doc = frappe.get_doc("Papan Iklan", name)
	_apply_fields(doc, data, title, ad_type, contact)  # note: never touches author/status
	doc.save(ignore_permissions=True)
	return {"name": doc.name}


@frappe.whitelist()
def set_status(name, status):
	"""Owner or admin flips between Active and Fulfilled. (Removed is admin-only,
	via remove_ad, so the author gets a notification.)"""
	_require_user()
	_can_manage(name)
	if status not in ("Active", "Fulfilled"):
		frappe.throw("Invalid status.")
	frappe.db.set_value("Papan Iklan", name, "status", status)
	return {"status": "ok"}


@frappe.whitelist()
def delete_ad(name):
	_require_user()
	_can_manage(name)
	frappe.delete_doc("Papan Iklan", name, ignore_permissions=True)
	return {"ok": True}


# ---------- image upload ----------

@frappe.whitelist()
def upload_ad_image():
	"""Save an uploaded ad photo as a public File and return its URL. Any
	logged-in user. Raster only: the file is served public, so SVG/HTML
	(stored-XSS vectors) are rejected by extension and MIME."""
	_require_user()
	import os
	from frappe.utils.file_manager import save_file

	f = frappe.request.files.get("file")
	if not f:
		frappe.throw("No file uploaded")
	ext = os.path.splitext(f.filename or "")[1].lower()
	if ext not in ALLOWED_IMAGE_EXT:
		frappe.throw("Unsupported image type. Use PNG, JPG, WEBP, or GIF.")
	mimetype = (getattr(f, "mimetype", "") or "").lower()
	if not mimetype or mimetype not in ALLOWED_IMAGE_MIME:
		frappe.throw("Unsupported image type. Use PNG, JPG, WEBP, or GIF.")
	content = f.stream.read()
	if len(content) > MAX_IMAGE_BYTES:
		frappe.throw("Image too large (max 5 MB).")
	saved = save_file(f.filename, content, None, None, is_private=0)
	return {"file_url": saved.file_url}


# ---------- admin / moderation ----------

@frappe.whitelist()
def remove_ad(name, reason=None):
	"""Admin soft-removes any ad (status -> Removed) and notifies the author."""
	_require_admin()
	author = frappe.db.get_value("Papan Iklan", name, "author")
	if author is None:
		frappe.throw("Ad not found", frappe.DoesNotExistError)
	frappe.db.set_value("Papan Iklan", name, "status", "Removed")
	_notify(
		author, "Billboard", "Your ad was removed",
		(reason or "It broke the rules.")[:140],
		"Papan Iklan", name, actor=frappe.session.user,
	)
	return {"status": "ok"}


@frappe.whitelist()
def ban_user(user, banned_until, reason):
	"""Admin time-bans a user from posting. Replaces any existing active ban."""
	_require_admin()
	if not frappe.db.exists("User", user):
		frappe.throw("User not found.")
	reason = (reason or "").strip()
	if not reason:
		frappe.throw("A reason is required.")
	if getdate(banned_until) < getdate(today()):
		frappe.throw("Ban date must be today or later.")

	existing = _active_ban(user)
	if existing:
		frappe.db.set_value("Papan Iklan Ban", existing["name"], {
			"banned_until": banned_until,
			"reason": reason,
			"banned_by": frappe.session.user,
		})
		name = existing["name"]
	else:
		name = frappe.get_doc({
			"doctype": "Papan Iklan Ban",
			"user": user,
			"banned_until": banned_until,
			"reason": reason,
			"banned_by": frappe.session.user,
		}).insert(ignore_permissions=True).name

	_notify(
		user, "Billboard", "You are banned from Papan Iklan",
		f"Until {banned_until}. Reason: {reason}"[:140],
		"Papan Iklan Ban", name, actor=frappe.session.user,
	)
	return {"status": "ok"}


@frappe.whitelist()
def unban_user(user):
	"""Admin lifts a ban early by deleting the user's ban row(s)."""
	_require_admin()
	for b in frappe.get_all("Papan Iklan Ban", filters={"user": user}, pluck="name"):
		frappe.delete_doc("Papan Iklan Ban", b, ignore_permissions=True)
	return {"status": "ok"}


@frappe.whitelist()
def list_bans():
	"""Admin: currently-active bans, newest expiry first."""
	_require_admin()
	rows = frappe.get_all(
		"Papan Iklan Ban",
		filters={"banned_until": [">=", today()]},
		fields=["name", "user", "banned_until", "reason", "banned_by", "creation"],
		order_by="banned_until desc",
		limit_page_length=0,
	)
	ids = {r["user"] for r in rows} | {r["banned_by"] for r in rows if r["banned_by"]}
	name_map = {}
	if ids:
		for u in frappe.get_all("User", filters={"name": ["in", list(ids)]}, fields=["name", "full_name"]):
			name_map[u["name"]] = u["full_name"] or u["name"]
	return [
		{
			"name": r["name"],
			"user": r["user"],
			"user_name": name_map.get(r["user"]) or r["user"],
			"banned_until": str(r["banned_until"]),
			"reason": r["reason"],
			"banned_by": name_map.get(r["banned_by"]) or r["banned_by"],
		}
		for r in rows
	]
