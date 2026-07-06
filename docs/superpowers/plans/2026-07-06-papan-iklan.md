# Papan Iklan (Classified Ads) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A classified-ads board ("Papan Iklan") where any logged-in Vernon user posts an ad to Sell / Buy / Rent, browses others' ads, contacts the poster, and comments; admins delete any ad and time-ban users from posting. Ships on both `/m` (mobile) and `/w` (web).

**Architecture:** Three new doctypes (`Papan Iklan`, `Papan Iklan Photo` child, `Papan Iklan Ban`) modelled on `Vernon Event` / `Vernon Banner`. One API module `vernon_project/api/papan_iklan.py` modelled on `feedback.py` + `events_admin.py` (author-or-admin gates, `ignore_permissions=True`, reactive moderation). The React frontends both consume a shared method map + React-Query hooks in `frontend/src` (the web app has no API layer of its own — it imports `@/lib/api` and `@/hooks/useData` from the mobile package). Comments reuse the existing generic `CommentThread` keyed by `("Papan Iklan", <name>)`. Image upload reuses the hardened `upload_reward_image` pattern.

**Tech Stack:** Frappe (Python) backend; Vite + React + react-router + Tailwind + React-Query frontends; MariaDB via Frappe ORM.

## Global Constraints

- **Live site, no test DB.** Site name is `project.vernon.id`. Per project convention (code-first, live site) automated tests are deferred to a final phase — each task below verifies with a `bench` console check, a whitelisted-method call, or by loading the screen, then commits. No pytest per task.
- **Deploy mechanics:** schema changes → `bench --site project.vernon.id migrate`; Python changes → `bench --site project.vernon.id migrate` is not enough, also `bench restart`; frontend changes → `npm run build` in the relevant frontend dir (build copies `index.html` into `www/m.html` / `www/w.html`).
- **Module** is `"Vernon Project"` for every doctype. Doctypes grant desk permissions to `System Manager` ONLY; all real access goes through the API with `ignore_permissions=True`.
- **`author` and `status` are NEVER set from a client payload.** `author` is stamped server-side; `status` changes only via `set_status` / `remove_ad`.
- **Notification `type` must be one of the `Vernon Notification` Select options** or `_notify` silently drops the notification. This plan adds a new option `Billboard`.
- **No native `alert`/`confirm`/`prompt`.** Use `useToast()` (`@/components/Toast`), `useConfirm()` (`@/components/Confirm`), or an inline modal.
- **Git hygiene:** the user works in parallel on the same repo. Re-check `git status` before each commit and `git add` only the files this plan creates/modifies. Commit on branch `main` (project convention — no feature branch).
- Doctype on-disk path is triple-nested: `apps/vernon_project/vernon_project/vernon_project/doctype/<snake>/`.

---

### Task 1: Three doctypes + controllers

**Files:**
- Create: `vernon_project/vernon_project/vernon_project/doctype/papan_iklan_photo/__init__.py` (empty)
- Create: `vernon_project/vernon_project/vernon_project/doctype/papan_iklan_photo/papan_iklan_photo.json`
- Create: `vernon_project/vernon_project/vernon_project/doctype/papan_iklan_photo/papan_iklan_photo.py`
- Create: `vernon_project/vernon_project/vernon_project/doctype/papan_iklan/__init__.py` (empty)
- Create: `vernon_project/vernon_project/vernon_project/doctype/papan_iklan/papan_iklan.json`
- Create: `vernon_project/vernon_project/vernon_project/doctype/papan_iklan/papan_iklan.py`
- Create: `vernon_project/vernon_project/vernon_project/doctype/papan_iklan_ban/__init__.py` (empty)
- Create: `vernon_project/vernon_project/vernon_project/doctype/papan_iklan_ban/papan_iklan_ban.json`
- Create: `vernon_project/vernon_project/vernon_project/doctype/papan_iklan_ban/papan_iklan_ban.py`

All paths are relative to the app root `/home/frappe/frappe-bench/apps/vernon_project`.

**Interfaces:**
- Produces doctypes `Papan Iklan`, `Papan Iklan Photo`, `Papan Iklan Ban` with the exact fieldnames the API in Tasks 2–3 reads/writes: `Papan Iklan`: `title, ad_type, description, price, rate_period, location, contact, photos, author, status`; `Papan Iklan Photo`: `image`; `Papan Iklan Ban`: `user, banned_until, reason, banned_by`.

- [ ] **Step 1: Create the child photo doctype (must exist before the parent references it)**

`papan_iklan_photo/__init__.py`: empty file.

`papan_iklan_photo/papan_iklan_photo.json`:
```json
{
 "actions": [],
 "allow_rename": 0,
 "creation": "2026-07-06 00:00:00.000000",
 "doctype": "DocType",
 "editable_grid": 1,
 "engine": "InnoDB",
 "field_order": ["image"],
 "fields": [
  {"fieldname": "image", "fieldtype": "Attach Image", "label": "Image", "in_list_view": 1, "reqd": 1}
 ],
 "index_web_pages_for_search": 1,
 "istable": 1,
 "links": [],
 "modified": "2026-07-06 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Papan Iklan Photo",
 "owner": "Administrator",
 "permissions": [],
 "row_format": "Dynamic",
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": []
}
```

`papan_iklan_photo/papan_iklan_photo.py`:
```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class PapanIklanPhoto(Document):
	pass
```

- [ ] **Step 2: Create the parent ad doctype**

`papan_iklan/__init__.py`: empty file.

`papan_iklan/papan_iklan.json`:
```json
{
 "actions": [],
 "allow_rename": 0,
 "autoname": "hash",
 "creation": "2026-07-06 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": [
  "title", "ad_type", "description", "section_break_price",
  "price", "rate_period", "location", "contact",
  "section_break_photos", "photos",
  "section_break_meta", "author", "status"
 ],
 "fields": [
  {"fieldname": "title", "fieldtype": "Data", "label": "Title", "reqd": 1, "in_list_view": 1},
  {"fieldname": "ad_type", "fieldtype": "Select", "label": "Type", "options": "Sell\nBuy\nRent", "reqd": 1, "in_list_view": 1, "in_standard_filter": 1},
  {"fieldname": "description", "fieldtype": "Text Editor", "label": "Description"},
  {"fieldname": "section_break_price", "fieldtype": "Section Break"},
  {"fieldname": "price", "fieldtype": "Currency", "label": "Price (Rp)"},
  {"fieldname": "rate_period", "fieldtype": "Select", "label": "Rate Period", "options": "\nper Hari\nper Bulan\nper Tahun", "depends_on": "eval:doc.ad_type=='Rent'"},
  {"fieldname": "location", "fieldtype": "Data", "label": "Location"},
  {"fieldname": "contact", "fieldtype": "Data", "label": "Contact (WhatsApp/phone)", "reqd": 1},
  {"fieldname": "section_break_photos", "fieldtype": "Section Break", "label": "Photos"},
  {"fieldname": "photos", "fieldtype": "Table", "label": "Photos", "options": "Papan Iklan Photo"},
  {"fieldname": "section_break_meta", "fieldtype": "Section Break"},
  {"fieldname": "author", "fieldtype": "Link", "label": "Author", "options": "User", "search_index": 1, "read_only": 1},
  {"fieldname": "status", "fieldtype": "Select", "label": "Status", "options": "Active\nFulfilled\nRemoved", "default": "Active", "in_list_view": 1, "in_standard_filter": 1}
 ],
 "index_web_pages_for_search": 1,
 "links": [],
 "modified": "2026-07-06 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Papan Iklan",
 "naming_rule": "Random",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1}
 ],
 "row_format": "Dynamic",
 "sort_field": "creation",
 "sort_order": "DESC",
 "states": []
}
```

`papan_iklan/papan_iklan.py`:
```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

AD_TYPES = ("Sell", "Buy", "Rent")


class PapanIklan(Document):
	def validate(self):
		if self.is_new() and not self.author:
			self.author = frappe.session.user
		if self.ad_type not in AD_TYPES:
			frappe.throw("Choose Sell, Buy, or Rent.", frappe.ValidationError)
		if (self.price or 0) < 0:
			frappe.throw("Price cannot be negative.", frappe.ValidationError)
		if self.ad_type != "Rent":
			self.rate_period = None
```

- [ ] **Step 3: Create the ban doctype**

`papan_iklan_ban/__init__.py`: empty file.

`papan_iklan_ban/papan_iklan_ban.json`:
```json
{
 "actions": [],
 "allow_rename": 0,
 "autoname": "hash",
 "creation": "2026-07-06 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": ["user", "banned_until", "reason", "banned_by"],
 "fields": [
  {"fieldname": "user", "fieldtype": "Link", "label": "User", "options": "User", "reqd": 1, "in_list_view": 1, "search_index": 1},
  {"fieldname": "banned_until", "fieldtype": "Date", "label": "Banned Until", "reqd": 1, "in_list_view": 1},
  {"fieldname": "reason", "fieldtype": "Small Text", "label": "Reason", "reqd": 1, "in_list_view": 1},
  {"fieldname": "banned_by", "fieldtype": "Link", "label": "Banned By", "options": "User", "read_only": 1}
 ],
 "index_web_pages_for_search": 0,
 "links": [],
 "modified": "2026-07-06 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Papan Iklan Ban",
 "naming_rule": "Random",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1}
 ],
 "row_format": "Dynamic",
 "sort_field": "creation",
 "sort_order": "DESC",
 "states": []
}
```

`papan_iklan_ban/papan_iklan_ban.py`:
```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class PapanIklanBan(Document):
	def validate(self):
		if self.is_new() and not self.banned_by:
			self.banned_by = frappe.session.user
```

- [ ] **Step 4: Migrate to create the tables**

Run: `bench --site project.vernon.id migrate`
Expected: completes without error; output mentions syncing the new DocTypes.

- [ ] **Step 5: Verify the tables + fields exist**

Run:
```bash
echo 'print(frappe.db.exists("DocType","Papan Iklan"), frappe.db.exists("DocType","Papan Iklan Photo"), frappe.db.exists("DocType","Papan Iklan Ban"), [f.fieldname for f in frappe.get_meta("Papan Iklan").fields])' | bench --site project.vernon.id console
```
Expected: prints `Papan Iklan Papan Iklan Photo Papan Iklan Ban` followed by a field list containing `title, ad_type, price, rate_period, contact, photos, author, status`.
(ponytail: single `print`, no loop — piping a loop into `bench console` mis-parses.)

- [ ] **Step 6: Commit**

```bash
git add vernon_project/vernon_project/vernon_project/doctype/papan_iklan vernon_project/vernon_project/vernon_project/doctype/papan_iklan_photo vernon_project/vernon_project/vernon_project/doctype/papan_iklan_ban
git commit -m "feat(papan-iklan): 3 doctypes (ad + photo child + ban)"
```

---

### Task 2: Backend user API

**Files:**
- Create: `vernon_project/api/papan_iklan.py`

**Interfaces:**
- Consumes: `Papan Iklan`, `Papan Iklan Photo`, `Papan Iklan Ban` doctypes (Task 1); `_notify` from `vernon_project.api.mobile`.
- Produces whitelisted methods (dotted path `vernon_project.api.papan_iklan.*`) consumed by Task 4:
  - `list_ads(ad_type=None, q=None, mine=0)` → `list[dict]` (list-item shape below)
  - `get_ad(name)` → `dict` (detail shape below)
  - `create_ad(payload)` → `{"name": str}`
  - `update_ad(name, payload)` → `{"name": str}`
  - `set_status(name, status)` → `{"status": "ok"}`
  - `delete_ad(name)` → `{"ok": True}`
  - `upload_ad_image()` → `{"file_url": str}`
- Also produces module-level helpers reused by Task 3: `_is_sm`, `_require_admin`, `_admins`, `_active_ban`, `AD_TYPES`.
- **List-item shape:** `{name, title, ad_type, price, rate_period, location, status, author, author_name, thumbnail, at}`.
- **Detail shape:** `{name, title, ad_type, description, price, rate_period, location, contact, status, author, author_name, author_image, photos: [url], is_owner, is_admin}`.

- [ ] **Step 1: Write the full module**

`vernon_project/api/papan_iklan.py`:
```python
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
	return sorted({r for r in rows})


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
	_require_user()
	_can_manage(name)
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
	if mimetype and mimetype not in ALLOWED_IMAGE_MIME:
		frappe.throw("Unsupported image type. Use PNG, JPG, WEBP, or GIF.")
	content = f.stream.read()
	if len(content) > MAX_IMAGE_BYTES:
		frappe.throw("Image too large (max 5 MB).")
	saved = save_file(f.filename, content, None, None, is_private=0)
	return {"file_url": saved.file_url}
```

- [ ] **Step 2: Restart so the new module + whitelisted methods load**

Run: `bench --site project.vernon.id migrate && bench restart`
Expected: no error.

- [ ] **Step 3: Verify create + list + ban gate with a console check**

Run (single line — no loop):
```bash
echo 'frappe.set_user("Administrator"); import vernon_project.api.papan_iklan as pi; n=pi.create_ad(frappe.as_json({"title":"Test chair","ad_type":"Sell","price":150000,"contact":"0811","photos":[]}))["name"]; print("created", n); print("listed", any(a["name"]==n for a in pi.list_ads())); frappe.get_doc({"doctype":"Papan Iklan Ban","user":"Administrator","banned_until":frappe.utils.add_days(frappe.utils.today(),3),"reason":"x"}).insert(ignore_permissions=True); import traceback\ntry:\n pi.create_ad(frappe.as_json({"title":"blocked","ad_type":"Sell","contact":"0811","photos":[]}))\n print("BAN GATE FAILED")\nexcept frappe.PermissionError:\n print("ban gate ok")\nfrappe.db.rollback()' | bench --site project.vernon.id console
```
Expected: prints `created <hash>`, `listed True`, `ban gate ok`. (`frappe.db.rollback()` discards the test rows.)

- [ ] **Step 4: Commit**

```bash
git add vernon_project/api/papan_iklan.py
git commit -m "feat(papan-iklan): user API — list/get/create/update/status/delete + image upload + ban gate"
```

---

### Task 3: Backend admin/moderation API + notification type

**Files:**
- Modify: `vernon_project/api/papan_iklan.py` (append admin endpoints)
- Modify: `vernon_project/vernon_project/vernon_project/doctype/vernon_notification/vernon_notification.json` (add `Billboard` to the `type` Select)

**Interfaces:**
- Consumes: `_require_admin`, `_is_sm`, `_active_ban`, `_notify` (Task 2).
- Produces whitelisted methods consumed by Task 4:
  - `remove_ad(name, reason=None)` → `{"status": "ok"}`
  - `ban_user(user, banned_until, reason)` → `{"status": "ok"}`
  - `unban_user(user)` → `{"status": "ok"}`
  - `list_bans()` → `list[{name, user, user_name, banned_until, reason, banned_by}]`

- [ ] **Step 1: Add `Billboard` to the notification `type` options**

In `vernon_notification.json`, the `type` field currently reads:
```json
  {"fieldname": "type", "fieldtype": "Select", "label": "Type", "options": "Assignment\nApproval\nComment\nMention\nPoints\nRedemption\nKudos\nFeedback\nDeadline\nEncouragement\nAttendance", "in_list_view": 1},
```
Change the `options` value to end with `\nBillboard`:
```json
  {"fieldname": "type", "fieldtype": "Select", "label": "Type", "options": "Assignment\nApproval\nComment\nMention\nPoints\nRedemption\nKudos\nFeedback\nDeadline\nEncouragement\nAttendance\nBillboard", "in_list_view": 1},
```

- [ ] **Step 2: Append the admin endpoints to `papan_iklan.py`**

Append to the end of `vernon_project/api/papan_iklan.py`:
```python
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
```

- [ ] **Step 3: Migrate (picks up the notification option) + restart**

Run: `bench --site project.vernon.id migrate && bench restart`
Expected: no error.

- [ ] **Step 4: Verify ban + notification does not silently vanish**

Run (single line):
```bash
echo 'frappe.set_user("Administrator"); import vernon_project.api.papan_iklan as pi; u="Administrator"; pi.ban_user(u, frappe.utils.add_days(frappe.utils.today(),5), "spam"); print("active", bool(pi._active_ban(u))); print("bans", len(pi.list_bans())); pi.unban_user(u); print("after unban", bool(pi._active_ban(u))); frappe.db.rollback()' | bench --site project.vernon.id console
```
Expected: `active True`, `bans 1` (or more), `after unban False`. No `_notify failed` error is logged (the `Billboard` type is valid).

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/papan_iklan.py vernon_project/vernon_project/vernon_project/doctype/vernon_notification/vernon_notification.json
git commit -m "feat(papan-iklan): admin moderation API (remove/ban/unban/list) + Billboard notification type"
```

---

### Task 4: Shared frontend plumbing (types, API map, hooks)

Both frontends consume this. Written once in `frontend/src`.

**Files:**
- Modify: `frontend/src/lib/types.ts` (append ad types)
- Modify: `frontend/src/lib/api.ts` (append `papanApi` + `uploadAdImage`; add type imports)
- Modify: `frontend/src/hooks/useData.ts` (append query keys, `canModerateAds`, hooks)

**Interfaces:**
- Consumes: Task 2–3 whitelisted methods.
- Produces (for Tasks 5–8): types `AdType, AdStatus, AdListItem, AdDetail, AdPayload, AdBan`; `papanApi` + `uploadAdImage` from `@/lib/api`; hooks `useAds, useAd, useSaveAd, useSetAdStatus, useDeleteAd, useAdminRemoveAd, useAdBans, useBanUser, useUnbanUser` and guard `canModerateAds` from `@/hooks/useData`.

- [ ] **Step 1: Add types**

Append to `frontend/src/lib/types.ts`:
```ts
// ---- Papan Iklan (classified ads) ----
export type AdType = 'Sell' | 'Buy' | 'Rent'
export type AdStatus = 'Active' | 'Fulfilled' | 'Removed'

export interface AdListItem {
  name: string
  title: string
  ad_type: AdType
  price: number | null
  rate_period: string | null
  location: string | null
  status: AdStatus
  author: string
  author_name: string
  thumbnail: string | null
  at: string
}

export interface AdDetail {
  name: string
  title: string
  ad_type: AdType
  description: string | null
  price: number | null
  rate_period: string | null
  location: string | null
  contact: string
  status: AdStatus
  author: string
  author_name: string
  author_image: string | null
  photos: string[]
  is_owner: boolean
  is_admin: boolean
}

export interface AdPayload {
  title: string
  ad_type: AdType
  description: string
  price: number
  rate_period: string
  location: string
  contact: string
  photos: string[]
}

export interface AdBan {
  name: string
  user: string
  user_name: string
  banned_until: string
  reason: string
  banned_by: string
}
```

- [ ] **Step 2: Add the API method map + image uploader**

In `frontend/src/lib/api.ts`, extend the top `import type { ... } from './types'` line to also import `AdListItem, AdDetail, AdPayload, AdBan`.

Then append (after the other method-map blocks, near `eventsAdminApi`):
```ts
const PI = 'vernon_project.api.papan_iklan.'

export const papanApi = {
  list: (ad_type?: string, q?: string, mine?: boolean) =>
    api.get<AdListItem[]>(PI + 'list_ads', {
      ...(ad_type ? { ad_type } : {}),
      ...(q ? { q } : {}),
      ...(mine ? { mine: 1 } : {}),
    }),
  get: (name: string) => api.get<AdDetail>(PI + 'get_ad', { name }),
  create: (payload: AdPayload) =>
    api.post<{ name: string }>(PI + 'create_ad', { payload: JSON.stringify(payload) }),
  update: (name: string, payload: AdPayload) =>
    api.post<{ name: string }>(PI + 'update_ad', { name, payload: JSON.stringify(payload) }),
  setStatus: (name: string, status: string) =>
    api.post<{ status: string }>(PI + 'set_status', { name, status }),
  remove: (name: string) => api.post<{ ok: boolean }>(PI + 'delete_ad', { name }),
  adminRemove: (name: string, reason: string) =>
    api.post<{ status: string }>(PI + 'remove_ad', { name, reason }),
  ban: (user: string, banned_until: string, reason: string) =>
    api.post<{ status: string }>(PI + 'ban_user', { user, banned_until, reason }),
  unban: (user: string) => api.post<{ status: string }>(PI + 'unban_user', { user }),
  bans: () => api.get<AdBan[]>(PI + 'list_bans'),
}

// Multipart upload for an ad photo. Returns the saved public URL.
export async function uploadAdImage(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(METHOD + 'vernon_project.api.papan_iklan.upload_ad_image', {
    method: 'POST',
    headers: { Accept: 'application/json', 'X-Frappe-CSRF-Token': csrf() },
    body: fd,
    credentials: 'same-origin',
  })
  let data: any = null
  try { data = await res.json() } catch { /* non-JSON */ }
  if (!res.ok) {
    const msg =
      (data && (data._server_messages || data.exception || data.message)) || `Upload failed (${res.status})`
    throw new ApiError(typeof msg === 'string' ? msg : 'Upload failed', res.status)
  }
  const out = data?.message ?? data
  return out.file_url as string
}
```

- [ ] **Step 3: Add query keys, guard, and hooks**

In `frontend/src/hooks/useData.ts`:

(a) Extend the top import from `../lib/api` to include `papanApi`, and the import from `../lib/types` to include `AdPayload`.

(b) Add to the `keys` object:
```ts
  ads: (adType?: string, q?: string, mine?: boolean) =>
    ['ads', adType ?? 'all', q ?? '', mine ? 'mine' : 'all'] as const,
  ad: (n: string) => ['ad', n] as const,
  adBans: ['adBans'] as const,
```

(c) Add the guard (near `canManageMarketplace`):
```ts
export function canModerateAds(boot: Boot | undefined): boolean {
  return !!boot && boot.roles.includes('System Manager')
}
```

(d) Append the hooks:
```ts
export const useAds = (adType?: string, q?: string, mine?: boolean) =>
  useQuery({ queryKey: keys.ads(adType, q, mine), queryFn: () => papanApi.list(adType, q, mine) })

export const useAd = (name: string) =>
  useQuery({ queryKey: keys.ad(name), queryFn: () => papanApi.get(name), enabled: !!name })

export function useSaveAd() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ payload, name }: { payload: AdPayload; name?: string }) =>
      name ? papanApi.update(name, payload) : papanApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ads'] }),
  })
}

export function useSetAdStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { name: string; status: string }) => papanApi.setStatus(v.name, v.status),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['ads'] })
      qc.invalidateQueries({ queryKey: keys.ad(v.name) })
    },
  })
}

export function useDeleteAd() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => papanApi.remove(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ads'] }),
  })
}

export function useAdminRemoveAd() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { name: string; reason: string }) => papanApi.adminRemove(v.name, v.reason),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['ads'] })
      qc.invalidateQueries({ queryKey: keys.ad(v.name) })
    },
  })
}

export const useAdBans = () =>
  useQuery({ queryKey: keys.adBans, queryFn: () => papanApi.bans() })

export function useBanUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { user: string; banned_until: string; reason: string }) =>
      papanApi.ban(v.user, v.banned_until, v.reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.adBans }),
  })
}

export function useUnbanUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (user: string) => papanApi.unban(user),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.adBans }),
  })
}
```

- [ ] **Step 4: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: no errors referencing the new symbols. (Pre-existing unrelated errors, if any, are out of scope — confirm none mention `papanApi`, `AdPayload`, `useAds`, etc.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/hooks/useData.ts
git commit -m "feat(papan-iklan): shared frontend plumbing — types, API map, hooks"
```

---

### Task 5: Mobile browse + detail screens

**Files:**
- Create: `frontend/src/pages/PapanIklanScreen.tsx`
- Create: `frontend/src/pages/PapanIklanDetailScreen.tsx`
- Modify: `frontend/src/App.tsx` (imports + routes)

**Interfaces:**
- Consumes: `useAds, useAd, useSetAdStatus, useDeleteAd, useAdminRemoveAd, useBanUser` from `@/hooks/useData`; `CommentThread` from `@/components/CommentThread`; `DetailScreen` from `@/components/Layout`; `Segmented, Spinner, EmptyState` from `@/components/ui`; `Fab` from `@/components/Fab`; `useToast`, `useConfirm`.
- Produces routes `/papan-iklan`, `/papan-iklan/:name`.

- [ ] **Step 1: Confirm the comment endpoint accepts an arbitrary reference doctype**

The `CommentThread` reuse depends on the server not restricting comment reference doctypes. Check:

Run: `grep -n "def add_comment\|def get_comments" /home/frappe/frappe-bench/apps/vernon_project/vernon_project/api/mobile.py`

Open those two functions. If either validates `reference_doctype` against an allow-list (a set/tuple of permitted doctypes), add `"Papan Iklan"` to that list and note it in the commit. If there is no allow-list (it accepts any reference), no change is needed. Do not add speculative gating.

- [ ] **Step 2: Write the browse screen**

`frontend/src/pages/PapanIklanScreen.tsx`:
```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tag, MapPin, ShoppingBag, Search } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Segmented, Spinner, EmptyState } from '@/components/ui'
import { Fab } from '@/components/Fab'
import { useAds } from '@/hooks/useData'
import type { AdListItem, AdType } from '@/lib/types'

const TYPE_TABS = [
  { value: 'all', label: 'All' },
  { value: 'Sell', label: 'Jual' },
  { value: 'Buy', label: 'Beli' },
  { value: 'Rent', label: 'Sewa' },
] as const

const TYPE_LABEL: Record<AdType, string> = { Sell: 'Jual', Buy: 'Beli', Rent: 'Sewa' }
const TYPE_TONE: Record<AdType, string> = {
  Sell: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
  Buy: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
  Rent: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
}

function priceText(a: AdListItem) {
  if (!a.price) return 'Nego'
  const rp = `Rp ${a.price.toLocaleString('id-ID')}`
  return a.rate_period ? `${rp} ${a.rate_period}` : rp
}

export default function PapanIklanScreen() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<string>('all')
  const [q, setQ] = useState('')
  const list = useAds(tab === 'all' ? undefined : tab, q.trim() || undefined)

  const items = list.data ?? []

  return (
    <DetailScreen title="Papan Iklan">
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari iklan…"
            className="w-full rounded-xl border border-slate-200 bg-transparent py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:text-slate-100"
          />
        </div>

        <Segmented options={TYPE_TABS.map((t) => ({ value: t.value, label: t.label }))} value={tab} onChange={setTab} scroll />

        {list.isLoading ? (
          <div className="py-16 text-center"><Spinner className="mx-auto h-5 w-5 text-slate-400" /></div>
        ) : items.length === 0 ? (
          <EmptyState icon={ShoppingBag} title="Belum ada iklan" subtitle="Jadilah yang pertama pasang iklan." />
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((a) => (
              <button
                key={a.name}
                onClick={() => navigate(`/papan-iklan/${encodeURIComponent(a.name)}`)}
                className="flex gap-3 rounded-2xl border border-paper-edge bg-paper-card p-3 text-left shadow-card active:scale-[0.99] dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-700">
                  {a.thumbnail ? (
                    <img src={a.thumbnail} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-300"><Tag className="h-6 w-6" /></div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TYPE_TONE[a.ad_type]}`}>{TYPE_LABEL[a.ad_type]}</span>
                    {a.status === 'Fulfilled' && <span className="text-[11px] font-medium text-stone-400">Selesai</span>}
                  </div>
                  <p className="mt-1 truncate text-sm font-semibold text-stone-800 dark:text-slate-100">{a.title}</p>
                  <p className="text-sm font-medium text-brand-600">{priceText(a)}</p>
                  {a.location && (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-stone-400"><MapPin className="h-3 w-3" />{a.location}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <Fab onTap={() => navigate('/papan-iklan/new')} onLongPress={() => navigate('/papan-iklan/new')} />
    </DetailScreen>
  )
}
```

- [ ] **Step 3: Write the detail screen (contact, comments, owner + admin actions)**

`frontend/src/pages/PapanIklanDetailScreen.tsx`:
```tsx
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MessageCircle, Trash2, CheckCircle2, RotateCcw, ShieldX, Ban, MapPin } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import CommentThread from '@/components/CommentThread'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { useAd, useSetAdStatus, useDeleteAd, useAdminRemoveAd, useBanUser } from '@/hooks/useData'
import type { AdDetail } from '@/lib/types'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100'

function priceText(a: AdDetail) {
  if (!a.price) return 'Nego'
  const rp = `Rp ${a.price.toLocaleString('id-ID')}`
  return a.rate_period ? `${rp} ${a.rate_period}` : rp
}
const waLink = (contact: string) => `https://wa.me/${contact.replace(/[^0-9]/g, '')}`

export default function PapanIklanDetailScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { name: rawName } = useParams()
  const name = rawName ? decodeURIComponent(rawName) : ''
  const { data: ad, isLoading } = useAd(name)
  const setStatus = useSetAdStatus()
  const del = useDeleteAd()
  const adminRemove = useAdminRemoveAd()
  const ban = useBanUser()

  const [banOpen, setBanOpen] = useState(false)
  const [banUntil, setBanUntil] = useState('')
  const [banReason, setBanReason] = useState('')

  if (isLoading || !ad) {
    return <DetailScreen title="Iklan"><Spinner className="mx-auto h-5 w-5 text-slate-400" /></DetailScreen>
  }

  const toggleFulfilled = () => {
    const next = ad.status === 'Fulfilled' ? 'Active' : 'Fulfilled'
    setStatus.mutate({ name, status: next }, {
      onSuccess: () => toast('success', next === 'Fulfilled' ? 'Ditandai selesai' : 'Diaktifkan lagi'),
      onError: (e) => toast('error', (e as Error).message),
    })
  }
  const remove = async () => {
    if (!(await confirm({ title: 'Hapus iklan ini?', confirmLabel: 'Hapus', destructive: true }))) return
    del.mutate(name, {
      onSuccess: () => { toast('success', 'Iklan dihapus'); navigate('/papan-iklan') },
      onError: (e) => toast('error', (e as Error).message),
    })
  }
  const adminTakedown = async () => {
    if (!(await confirm({ title: 'Turunkan iklan ini?', confirmLabel: 'Turunkan', destructive: true }))) return
    adminRemove.mutate({ name, reason: 'Melanggar aturan.' }, {
      onSuccess: () => { toast('success', 'Iklan diturunkan'); navigate('/papan-iklan') },
      onError: (e) => toast('error', (e as Error).message),
    })
  }
  const submitBan = () => {
    if (!banUntil) return toast('error', 'Pilih tanggal berakhir')
    if (!banReason.trim()) return toast('error', 'Alasan wajib diisi')
    ban.mutate({ user: ad.author, banned_until: banUntil, reason: banReason.trim() }, {
      onSuccess: () => { toast('success', 'Pengguna dibanned'); setBanOpen(false); setBanReason(''); setBanUntil('') },
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  return (
    <DetailScreen title="Iklan">
      <div className="flex flex-col gap-4">
        {ad.photos.length > 0 && (
          <div className="flex snap-x gap-2 overflow-x-auto">
            {ad.photos.map((src) => (
              <img key={src} src={src} alt="" className="h-56 w-72 shrink-0 snap-center rounded-2xl object-cover" />
            ))}
          </div>
        )}

        <div>
          <h2 className="text-lg font-bold text-stone-900 dark:text-slate-50">{ad.title}</h2>
          <p className="text-base font-semibold text-brand-600">{priceText(ad)}</p>
          {ad.location && <p className="mt-1 flex items-center gap-1 text-sm text-stone-400"><MapPin className="h-4 w-4" />{ad.location}</p>}
          <p className="mt-1 text-xs text-stone-400">oleh {ad.author_name}</p>
        </div>

        {ad.description && (
          <div className="prose prose-sm max-w-none text-stone-700 dark:prose-invert dark:text-slate-200" dangerouslySetInnerHTML={{ __html: ad.description }} />
        )}

        <a href={waLink(ad.contact)} target="_blank" rel="noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3.5 font-semibold text-white active:scale-[0.99]">
          <MessageCircle className="h-4 w-4" /> Hubungi ({ad.contact})
        </a>

        {ad.is_owner && (
          <div className="flex flex-col gap-2">
            <button onClick={() => navigate(`/papan-iklan/${encodeURIComponent(name)}/edit`)}
              className="rounded-xl bg-white py-3 text-sm font-semibold text-brand-600 shadow-sm active:scale-95 dark:bg-slate-800">Edit iklan</button>
            <button onClick={toggleFulfilled} disabled={setStatus.isPending}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-sm font-semibold text-stone-700 shadow-sm active:scale-95 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-200">
              {ad.status === 'Fulfilled' ? <><RotateCcw className="h-4 w-4" /> Aktifkan lagi</> : <><CheckCircle2 className="h-4 w-4" /> Tandai selesai</>}
            </button>
            <button onClick={remove} disabled={del.isPending}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-sm font-semibold text-rose-600 shadow-sm active:scale-95 disabled:opacity-60 dark:bg-slate-800">
              <Trash2 className="h-4 w-4" /> Hapus iklan
            </button>
          </div>
        )}

        {ad.is_admin && !ad.is_owner && (
          <div className="flex flex-col gap-2 rounded-2xl border border-rose-200 bg-rose-50/50 p-3 dark:border-rose-500/30 dark:bg-rose-500/10">
            <p className="text-xs font-semibold text-rose-600">Admin</p>
            <button onClick={adminTakedown} disabled={adminRemove.isPending}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-sm font-semibold text-rose-600 shadow-sm active:scale-95 disabled:opacity-60 dark:bg-slate-800">
              <ShieldX className="h-4 w-4" /> Turunkan iklan
            </button>
            <button onClick={() => setBanOpen(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-sm font-semibold text-rose-600 shadow-sm active:scale-95 dark:bg-slate-800">
              <Ban className="h-4 w-4" /> Ban pengguna
            </button>
          </div>
        )}

        <div className="border-t border-paper-edge pt-4 dark:border-slate-700">
          <CommentThread referenceDoctype="Papan Iklan" referenceName={name} />
        </div>
      </div>

      {banOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setBanOpen(false)} />
          <div className="fixed inset-x-4 bottom-8 z-50 rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card animate-pop dark:border-slate-700 dark:bg-slate-800">
            <p className="mb-3 text-sm font-semibold text-stone-800 dark:text-slate-100">Ban {ad.author_name} dari Papan Iklan</p>
            <label className="mb-1 block text-xs font-semibold text-stone-500">Berakhir tanggal</label>
            <input type="date" className={field} value={banUntil} onChange={(e) => setBanUntil(e.target.value)} />
            <label className="mb-1 mt-3 block text-xs font-semibold text-stone-500">Alasan</label>
            <textarea className={field} rows={2} value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="Kenapa dibanned?" />
            <div className="mt-3 flex gap-2">
              <button onClick={() => setBanOpen(false)} className="flex-1 rounded-xl bg-white py-2.5 text-sm font-semibold text-stone-600 shadow-sm dark:bg-slate-700 dark:text-slate-200">Batal</button>
              <button onClick={submitBan} disabled={ban.isPending} className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60">Ban</button>
            </div>
          </div>
        </>
      )}
    </DetailScreen>
  )
}
```

- [ ] **Step 4: Register routes**

In `frontend/src/App.tsx`, add imports near the other page imports:
```tsx
import PapanIklanScreen from './pages/PapanIklanScreen'
import PapanIklanDetailScreen from './pages/PapanIklanDetailScreen'
```
Add these routes inside `<Routes>` (alongside the plain routes, e.g. next to `/feedback`). The `/new` and `/:name/edit` routes point at the form built in Task 6, so add all four now:
```tsx
        <Route path="/papan-iklan" element={<PapanIklanScreen />} />
        <Route path="/papan-iklan/:name" element={<PapanIklanDetailScreen />} />
```
(Do NOT yet add `/papan-iklan/new` and `/papan-iklan/:name/edit` — those come with Task 6. The detail screen's Edit/Fab buttons navigate to them; they will 404-redirect home until Task 6 lands, which is fine mid-implementation.)

- [ ] **Step 5: Verify build compiles**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/PapanIklanScreen.tsx frontend/src/pages/PapanIklanDetailScreen.tsx frontend/src/App.tsx
# include mobile.py only if Step 1 required adding "Papan Iklan" to a comment allow-list
git commit -m "feat(papan-iklan): mobile browse + detail screens"
```

---

### Task 6: Mobile create/edit form

**Files:**
- Create: `frontend/src/pages/PapanIklanFormScreen.tsx`
- Modify: `frontend/src/App.tsx` (two routes)

**Interfaces:**
- Consumes: `useSaveAd, useAd` from `@/hooks/useData`; `uploadAdImage` from `@/lib/api`; `DetailScreen`, `Segmented`, `Spinner`, `useToast`; `AdPayload, AdDetail` types.
- Produces routes `/papan-iklan/new`, `/papan-iklan/:name/edit`.

- [ ] **Step 1: Write the form**

`frontend/src/pages/PapanIklanFormScreen.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, ImagePlus, X } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Segmented, Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { uploadAdImage } from '@/lib/api'
import { useSaveAd, useAd } from '@/hooks/useData'
import type { AdPayload, AdType } from '@/lib/types'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100'

const TYPES = [
  { value: 'Sell', label: 'Jual' },
  { value: 'Buy', label: 'Beli' },
  { value: 'Rent', label: 'Sewa' },
] as const
const PERIODS = ['', 'per Hari', 'per Bulan', 'per Tahun']

const empty: AdPayload = {
  title: '', ad_type: 'Sell', description: '', price: 0, rate_period: '', location: '', contact: '', photos: [],
}

export default function PapanIklanFormScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const { name: rawName } = useParams()
  const name = rawName ? decodeURIComponent(rawName) : ''
  const isEdit = !!name
  const save = useSaveAd()
  const { data: existing, isLoading } = useAd(isEdit ? name : '')

  const [form, setForm] = useState<AdPayload>(empty)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isEdit || !existing) return
    setForm({
      title: existing.title ?? '',
      ad_type: existing.ad_type ?? 'Sell',
      description: existing.description ?? '',
      price: existing.price ?? 0,
      rate_period: existing.rate_period ?? '',
      location: existing.location ?? '',
      contact: existing.contact ?? '',
      photos: existing.photos ?? [],
    })
  }, [isEdit, existing])

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (form.photos.length >= 5) { toast('error', 'Maksimal 5 foto'); return }
    setUploading(true)
    try {
      const url = await uploadAdImage(f)
      setForm((s) => ({ ...s, photos: [...s.photos, url] }))
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Upload gagal')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }
  const removePhoto = (url: string) => setForm((s) => ({ ...s, photos: s.photos.filter((p) => p !== url) }))

  const onSave = () => {
    if (!form.title.trim()) return toast('error', 'Judul wajib diisi')
    if (!form.contact.trim()) return toast('error', 'Kontak wajib diisi')
    const payload: AdPayload = {
      ...form,
      title: form.title.trim(),
      contact: form.contact.trim(),
      price: Number(form.price) || 0,
      rate_period: form.ad_type === 'Rent' ? form.rate_period : '',
    }
    save.mutate({ payload, name: isEdit ? name : undefined }, {
      onSuccess: (r) => { toast('success', isEdit ? 'Iklan disimpan' : 'Iklan dipasang'); navigate(`/papan-iklan/${encodeURIComponent(r.name)}`) },
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  if (isEdit && isLoading) {
    return <DetailScreen title="Iklan"><Spinner className="mx-auto h-5 w-5 text-slate-400" /></DetailScreen>
  }

  return (
    <DetailScreen title={isEdit ? 'Edit iklan' : 'Pasang iklan'}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-stone-500">Jenis</label>
          <Segmented options={TYPES.map((t) => ({ value: t.value, label: t.label }))} value={form.ad_type}
            onChange={(v: string) => setForm((f) => ({ ...f, ad_type: v as AdType }))} />
        </div>

        <input className={field} placeholder="Judul" value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />

        <div className="flex gap-3">
          <label className="flex-1 text-xs font-semibold text-stone-500">Harga (Rp) — kosongkan jika nego
            <input type="number" className={field} value={form.price || ''}
              onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) || 0 }))} /></label>
          {form.ad_type === 'Rent' && (
            <label className="w-32 text-xs font-semibold text-stone-500">Periode
              <select className={field} value={form.rate_period}
                onChange={(e) => setForm((f) => ({ ...f, rate_period: e.target.value }))}>
                {PERIODS.map((p) => <option key={p} value={p}>{p || '—'}</option>)}
              </select></label>
          )}
        </div>

        <input className={field} placeholder="Lokasi (opsional)" value={form.location}
          onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
        <input className={field} placeholder="Kontak (WhatsApp/telepon)" value={form.contact}
          onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} />
        <textarea className={field} rows={4} placeholder="Deskripsi" value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-stone-500">Foto (maks 5)</label>
          <div className="flex flex-wrap gap-2">
            {form.photos.map((src) => (
              <div key={src} className="relative h-20 w-20 overflow-hidden rounded-xl">
                <img src={src} alt="" className="h-full w-full object-cover" />
                <button onClick={() => removePhoto(src)} className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"><X className="h-3 w-3" /></button>
              </div>
            ))}
            {form.photos.length < 5 && (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                className="flex h-20 w-20 items-center justify-center rounded-xl border border-dashed border-slate-300 text-slate-400 dark:border-slate-600">
                {uploading ? <Spinner className="h-4 w-4" /> : <ImagePlus className="h-5 w-5" />}
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
        </div>

        <button onClick={onSave} disabled={save.isPending || uploading}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
          {save.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} {isEdit ? 'Simpan' : 'Pasang iklan'}
        </button>
      </div>
    </DetailScreen>
  )
}
```

- [ ] **Step 2: Register routes**

In `frontend/src/App.tsx`, add the import:
```tsx
import PapanIklanFormScreen from './pages/PapanIklanFormScreen'
```
Add the routes ABOVE the `/papan-iklan/:name` route (so `/new` is not swallowed by `:name`):
```tsx
        <Route path="/papan-iklan/new" element={<PapanIklanFormScreen />} />
        <Route path="/papan-iklan/:name/edit" element={<PapanIklanFormScreen />} />
```
Final order: `/papan-iklan`, `/papan-iklan/new`, `/papan-iklan/:name/edit`, `/papan-iklan/:name`.

- [ ] **Step 3: Verify build compiles**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/PapanIklanFormScreen.tsx frontend/src/App.tsx
git commit -m "feat(papan-iklan): mobile create/edit form with photo upload"
```

---

### Task 7: Mobile admin bans screen

**Files:**
- Create: `frontend/src/pages/PapanIklanBansScreen.tsx`
- Modify: `frontend/src/App.tsx` (gated route)

**Interfaces:**
- Consumes: `useAdBans, useUnbanUser, canModerateAds, useBoot` from `@/hooks/useData`; `DetailScreen`, `Spinner`, `EmptyState`, `useToast`, `useConfirm`.
- Produces gated route `/papan-iklan/bans`.

- [ ] **Step 1: Write the bans screen**

`frontend/src/pages/PapanIklanBansScreen.tsx`:
```tsx
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ban, ShieldCheck } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { useBoot, canModerateAds, useAdBans, useUnbanUser } from '@/hooks/useData'

export default function PapanIklanBansScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { data: boot } = useBoot()
  const bans = useAdBans()
  const unban = useUnbanUser()

  const blocked = !!boot && !canModerateAds(boot)
  useEffect(() => { if (blocked) navigate('/', { replace: true }) }, [blocked, navigate])
  if (blocked) return null

  const items = bans.data ?? []

  const lift = async (user: string, userName: string) => {
    if (!(await confirm({ title: `Cabut ban ${userName}?`, confirmLabel: 'Cabut' }))) return
    unban.mutate(user, {
      onSuccess: () => toast('success', 'Ban dicabut'),
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  return (
    <DetailScreen title="Papan Iklan — Ban">
      {bans.isLoading ? (
        <div className="py-16 text-center"><Spinner className="mx-auto h-5 w-5 text-slate-400" /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Tidak ada ban aktif" />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((b) => (
            <div key={b.name} className="rounded-2xl border border-paper-edge bg-paper-card p-3 shadow-card dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center gap-2">
                <Ban className="h-4 w-4 text-rose-500" />
                <p className="text-sm font-semibold text-stone-800 dark:text-slate-100">{b.user_name}</p>
              </div>
              <p className="mt-1 text-xs text-stone-500">Sampai {b.banned_until} · {b.reason}</p>
              <p className="text-[11px] text-stone-400">oleh {b.banned_by}</p>
              <button onClick={() => lift(b.user, b.user_name)} disabled={unban.isPending}
                className="mt-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-brand-600 shadow-sm active:scale-95 disabled:opacity-60 dark:bg-slate-700">Cabut ban</button>
            </div>
          ))}
        </div>
      )}
    </DetailScreen>
  )
}
```

- [ ] **Step 2: Register the gated route**

In `frontend/src/App.tsx`, add the import and add `canModerateAds` to the existing `from './hooks/useData'` guard import. Add the route inside a role gate:
```tsx
import PapanIklanBansScreen from './pages/PapanIklanBansScreen'
// ...
        {canModerateAds(boot) && (
          <Route path="/papan-iklan/bans" element={<PapanIklanBansScreen />} />
        )}
```
Place it BEFORE `/papan-iklan/:name` so `bans` is not captured as a `:name`.

- [ ] **Step 3: Verify build compiles**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/PapanIklanBansScreen.tsx frontend/src/App.tsx
git commit -m "feat(papan-iklan): mobile admin bans screen"
```

---

### Task 8: Web pages + routes + nav + breadcrumb

The web app reuses the shared hooks/types from Task 4. It needs its own pages (web design system: `Page`/`PageHeader`, `DataTable`, `@web/components/ui`), routes, a nav entry, and a breadcrumb section label.

**Files:**
- Create: `frontend-web/src/pages/PapanIklan.tsx`
- Create: `frontend-web/src/pages/PapanIklanDetail.tsx`
- Create: `frontend-web/src/pages/PapanIklanForm.tsx`
- Create: `frontend-web/src/pages/PapanIklanBans.tsx`
- Modify: `frontend-web/src/App.tsx` (imports + routes)
- Modify: `frontend-web/src/lib/nav.ts` (one leaf, one gated admin leaf)
- Modify: `frontend-web/src/components/AppShell.tsx` (SECTION crumb entry)

**Interfaces:**
- Consumes: shared hooks `useAds, useAd, useSaveAd, useSetAdStatus, useDeleteAd, useAdminRemoveAd, useBanUser, useAdBans, useUnbanUser, canModerateAds, useBoot` from `@/hooks/useData`; `uploadAdImage` from `@/lib/api`; `CommentThread` from `@/components/CommentThread`; web primitives `Page, PageHeader` (`@web/components/Page`), `DataTable` (`@web/components/DataTable`), `Button, Field` (`@web/components/ui`), `ErrorState` (`@web/components/ui`), `Spinner` (`@/components/ui`), `useToast` (`@/components/Toast`).
- Produces routes `/papan-iklan`, `/papan-iklan/new`, `/papan-iklan/:name`, `/papan-iklan/:name/edit`, gated `/papan-iklan/bans`; a nav leaf; a crumb label.

- [ ] **Step 1: Browse page (DataTable)**

`frontend-web/src/pages/PapanIklan.tsx`:
```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Megaphone, Plus } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { Button, ErrorState } from '@web/components/ui'
import { useAds } from '@/hooks/useData'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable } from '@web/components/DataTable'
import type { AdListItem, AdType } from '@/lib/types'

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'Sell', label: 'Jual' },
  { value: 'Buy', label: 'Beli' },
  { value: 'Rent', label: 'Sewa' },
] as const
const TYPE_LABEL: Record<AdType, string> = { Sell: 'Jual', Buy: 'Beli', Rent: 'Sewa' }

function price(a: AdListItem) {
  if (!a.price) return 'Nego'
  const rp = `Rp ${a.price.toLocaleString('id-ID')}`
  return a.rate_period ? `${rp} ${a.rate_period}` : rp
}

export default function PapanIklan() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<string>('all')
  const [q, setQ] = useState('')
  const list = useAds(tab === 'all' ? undefined : tab, q.trim() || undefined)

  return (
    <Page>
      <PageHeader icon={Megaphone} title="Papan Iklan"
        actions={<Button variant="primary" onClick={() => navigate('/papan-iklan/new')}><Plus className="h-4 w-4" /> Pasang iklan</Button>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${tab === t.value ? 'bg-brand-600 text-white' : 'bg-hover/[0.05] text-muted hover:bg-hover/[0.1]'}`}>{t.label}</button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari…"
          className="ml-auto rounded-xl border border-line bg-transparent px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none" />
      </div>

      {list.isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : list.isError ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : (
        <DataTable
          rows={list.data ?? []}
          columns={[
            { key: 'title', header: 'Iklan', sortValue: (a) => a.title, render: (a) => <span className="font-medium text-ink">{a.title}</span> },
            { key: 'type', header: 'Jenis', render: (a) => <span className="text-muted">{TYPE_LABEL[a.ad_type]}</span> },
            { key: 'price', header: 'Harga', render: (a) => <span className="text-muted">{price(a)}</span> },
            { key: 'location', header: 'Lokasi', render: (a) => <span className="text-muted">{a.location ?? '—'}</span> },
            { key: 'author', header: 'Oleh', render: (a) => <span className="text-muted">{a.author_name}</span> },
          ]}
          getKey={(a) => a.name}
          onRowClick={(a) => navigate(`/papan-iklan/${encodeURIComponent(a.name)}`)}
        />
      )}
    </Page>
  )
}
```
(If `PageHeader` has no `actions` prop, place the `Button` directly under the header instead — check `@web/components/Page` signature when wiring.)

- [ ] **Step 2: Detail page**

`frontend-web/src/pages/PapanIklanDetail.tsx`:
```tsx
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Megaphone, MessageCircle, Trash2, CheckCircle2, RotateCcw, ShieldX, Ban } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { Button, Field } from '@web/components/ui'
import CommentThread from '@/components/CommentThread'
import { useToast } from '@/components/Toast'
import { useAd, useSetAdStatus, useDeleteAd, useAdminRemoveAd, useBanUser } from '@/hooks/useData'
import { Page, PageHeader } from '@web/components/Page'
import type { AdDetail } from '@/lib/types'

function price(a: AdDetail) {
  if (!a.price) return 'Nego'
  const rp = `Rp ${a.price.toLocaleString('id-ID')}`
  return a.rate_period ? `${rp} ${a.rate_period}` : rp
}
const waLink = (c: string) => `https://wa.me/${c.replace(/[^0-9]/g, '')}`
const fieldCls = 'w-full rounded-xl border border-line px-3 py-2 text-sm text-ink bg-hover/[0.04] focus:border-brand-600 focus:outline-none'

export default function PapanIklanDetail() {
  const navigate = useNavigate()
  const toast = useToast()
  const { name: rawName } = useParams()
  const name = rawName ? decodeURIComponent(rawName) : ''
  const { data: ad, isLoading } = useAd(name)
  const setStatus = useSetAdStatus()
  const del = useDeleteAd()
  const adminRemove = useAdminRemoveAd()
  const ban = useBanUser()
  const [banUntil, setBanUntil] = useState('')
  const [banReason, setBanReason] = useState('')
  const [banOpen, setBanOpen] = useState(false)

  if (isLoading || !ad) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>

  const toggleFulfilled = () => setStatus.mutate(
    { name, status: ad.status === 'Fulfilled' ? 'Active' : 'Fulfilled' },
    { onSuccess: () => toast('success', 'Status diperbarui'), onError: (e) => toast('error', (e as Error).message) },
  )
  const remove = () => del.mutate(name, {
    onSuccess: () => { toast('success', 'Iklan dihapus'); navigate('/papan-iklan') },
    onError: (e) => toast('error', (e as Error).message),
  })
  const takedown = () => adminRemove.mutate({ name, reason: 'Melanggar aturan.' }, {
    onSuccess: () => { toast('success', 'Iklan diturunkan'); navigate('/papan-iklan') },
    onError: (e) => toast('error', (e as Error).message),
  })
  const submitBan = () => {
    if (!banUntil) return toast('error', 'Pilih tanggal')
    if (!banReason.trim()) return toast('error', 'Alasan wajib')
    ban.mutate({ user: ad.author, banned_until: banUntil, reason: banReason.trim() }, {
      onSuccess: () => { toast('success', 'Pengguna dibanned'); setBanOpen(false) },
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  return (
    <Page>
      <PageHeader icon={Megaphone} title={ad.title} />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          {ad.photos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {ad.photos.map((s) => <img key={s} src={s} alt="" className="h-64 w-80 shrink-0 rounded-2xl object-cover" />)}
            </div>
          )}
          <p className="text-lg font-semibold text-brand-600">{price(ad)}</p>
          {ad.location && <p className="text-sm text-muted">{ad.location}</p>}
          <p className="text-xs text-muted">oleh {ad.author_name}</p>
          {ad.description && <div className="prose prose-sm max-w-none text-ink" dangerouslySetInnerHTML={{ __html: ad.description }} />}
          <div className="border-t border-line pt-4"><CommentThread referenceDoctype="Papan Iklan" referenceName={name} /></div>
        </div>

        <div className="space-y-3">
          <a href={waLink(ad.contact)} target="_blank" rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white"><MessageCircle className="h-4 w-4" /> Hubungi ({ad.contact})</a>

          {ad.is_owner && (
            <>
              <Button variant="secondary" onClick={() => navigate(`/papan-iklan/${encodeURIComponent(name)}/edit`)}>Edit iklan</Button>
              <Button variant="secondary" onClick={toggleFulfilled} disabled={setStatus.isPending}>
                {ad.status === 'Fulfilled' ? <><RotateCcw className="h-4 w-4" /> Aktifkan</> : <><CheckCircle2 className="h-4 w-4" /> Tandai selesai</>}
              </Button>
              <Button variant="danger" onClick={remove} disabled={del.isPending}><Trash2 className="h-4 w-4" /> Hapus</Button>
            </>
          )}
          {ad.is_admin && !ad.is_owner && (
            <div className="space-y-2 rounded-xl border border-rose-200 p-3">
              <p className="text-xs font-semibold text-rose-600">Admin</p>
              <Button variant="danger" onClick={takedown} disabled={adminRemove.isPending}><ShieldX className="h-4 w-4" /> Turunkan</Button>
              <Button variant="danger" onClick={() => setBanOpen((v) => !v)}><Ban className="h-4 w-4" /> Ban pengguna</Button>
              {banOpen && (
                <div className="space-y-2">
                  <Field label="Sampai tanggal">{(id) => <input id={id} type="date" className={fieldCls} value={banUntil} onChange={(e) => setBanUntil(e.target.value)} />}</Field>
                  <Field label="Alasan">{(id) => <textarea id={id} className={fieldCls} rows={2} value={banReason} onChange={(e) => setBanReason(e.target.value)} />}</Field>
                  <Button variant="danger" onClick={submitBan} disabled={ban.isPending}>Konfirmasi ban</Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Page>
  )
}
```
(Check `@web/components/ui` `Button` `variant` names — if `danger`/`secondary` differ, use the closest existing variant. Confirm `Field`'s render-prop shape matches `Feedback.tsx` usage: `<Field label="…">{(id) => …}</Field>`.)

- [ ] **Step 3: Form page**

`frontend-web/src/pages/PapanIklanForm.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Megaphone, ImagePlus, X } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { Button, Field } from '@web/components/ui'
import { useToast } from '@/components/Toast'
import { uploadAdImage } from '@/lib/api'
import { useSaveAd, useAd } from '@/hooks/useData'
import { Page, PageHeader } from '@web/components/Page'
import type { AdPayload, AdType } from '@/lib/types'

const cls = 'w-full rounded-xl border border-line px-3 py-2 text-sm text-ink bg-hover/[0.04] focus:border-brand-600 focus:outline-none'
const TYPES: { value: AdType; label: string }[] = [
  { value: 'Sell', label: 'Jual' }, { value: 'Buy', label: 'Beli' }, { value: 'Rent', label: 'Sewa' },
]
const PERIODS = ['', 'per Hari', 'per Bulan', 'per Tahun']
const empty: AdPayload = { title: '', ad_type: 'Sell', description: '', price: 0, rate_period: '', location: '', contact: '', photos: [] }

export default function PapanIklanForm() {
  const navigate = useNavigate()
  const toast = useToast()
  const { name: rawName } = useParams()
  const name = rawName ? decodeURIComponent(rawName) : ''
  const isEdit = !!name
  const save = useSaveAd()
  const { data: existing, isLoading } = useAd(isEdit ? name : '')
  const [form, setForm] = useState<AdPayload>(empty)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isEdit || !existing) return
    setForm({
      title: existing.title ?? '', ad_type: existing.ad_type ?? 'Sell', description: existing.description ?? '',
      price: existing.price ?? 0, rate_period: existing.rate_period ?? '', location: existing.location ?? '',
      contact: existing.contact ?? '', photos: existing.photos ?? [],
    })
  }, [isEdit, existing])

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return
    if (form.photos.length >= 5) { toast('error', 'Maksimal 5 foto'); return }
    setUploading(true)
    try { const url = await uploadAdImage(f); setForm((s) => ({ ...s, photos: [...s.photos, url] })) }
    catch (err) { toast('error', err instanceof Error ? err.message : 'Upload gagal') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const onSave = () => {
    if (!form.title.trim()) return toast('error', 'Judul wajib')
    if (!form.contact.trim()) return toast('error', 'Kontak wajib')
    const payload: AdPayload = { ...form, title: form.title.trim(), contact: form.contact.trim(), price: Number(form.price) || 0, rate_period: form.ad_type === 'Rent' ? form.rate_period : '' }
    save.mutate({ payload, name: isEdit ? name : undefined }, {
      onSuccess: (r) => { toast('success', isEdit ? 'Disimpan' : 'Dipasang'); navigate(`/papan-iklan/${encodeURIComponent(r.name)}`) },
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  if (isEdit && isLoading) return <Page><div className="flex justify-center py-20"><Spinner /></div></Page>

  return (
    <Page>
      <PageHeader icon={Megaphone} title={isEdit ? 'Edit iklan' : 'Pasang iklan'} />
      <div className="max-w-2xl space-y-4">
        <Field label="Jenis">{() => (
          <div className="flex gap-2">
            {TYPES.map((t) => (
              <button key={t.value} type="button" onClick={() => setForm((f) => ({ ...f, ad_type: t.value }))}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${form.ad_type === t.value ? 'bg-brand-600 text-white' : 'bg-hover/[0.05] text-muted'}`}>{t.label}</button>
            ))}
          </div>
        )}</Field>
        <Field label="Judul" required>{(id) => <input id={id} className={cls} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />}</Field>
        <div className="flex gap-3">
          <Field label="Harga (Rp) — kosong = nego">{(id) => <input id={id} type="number" className={cls} value={form.price || ''} onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) || 0 }))} />}</Field>
          {form.ad_type === 'Rent' && (
            <Field label="Periode">{(id) => (
              <select id={id} className={cls} value={form.rate_period} onChange={(e) => setForm((f) => ({ ...f, rate_period: e.target.value }))}>
                {PERIODS.map((p) => <option key={p} value={p}>{p || '—'}</option>)}
              </select>
            )}</Field>
          )}
        </div>
        <Field label="Lokasi">{(id) => <input id={id} className={cls} value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />}</Field>
        <Field label="Kontak (WhatsApp/telepon)" required>{(id) => <input id={id} className={cls} value={form.contact} onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} />}</Field>
        <Field label="Deskripsi">{(id) => <textarea id={id} className={cls} rows={5} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />}</Field>
        <Field label="Foto (maks 5)">{() => (
          <div className="flex flex-wrap gap-2">
            {form.photos.map((s) => (
              <div key={s} className="relative h-24 w-24 overflow-hidden rounded-xl">
                <img src={s} alt="" className="h-full w-full object-cover" />
                <button onClick={() => setForm((f) => ({ ...f, photos: f.photos.filter((p) => p !== s) }))} className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"><X className="h-3 w-3" /></button>
              </div>
            ))}
            {form.photos.length < 5 && (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="flex h-24 w-24 items-center justify-center rounded-xl border border-dashed border-line text-muted">
                {uploading ? <Spinner className="h-4 w-4" /> : <ImagePlus className="h-5 w-5" />}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} />
          </div>
        )}</Field>
        <Button variant="primary" onClick={onSave} disabled={save.isPending || uploading}>{isEdit ? 'Simpan' : 'Pasang iklan'}</Button>
      </div>
    </Page>
  )
}
```

- [ ] **Step 4: Bans page**

`frontend-web/src/pages/PapanIklanBans.tsx`:
```tsx
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ban } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { Button, ErrorState } from '@web/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canModerateAds, useAdBans, useUnbanUser } from '@/hooks/useData'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable } from '@web/components/DataTable'

export default function PapanIklanBans() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: boot } = useBoot()
  const bans = useAdBans()
  const unban = useUnbanUser()

  const blocked = !!boot && !canModerateAds(boot)
  useEffect(() => { if (blocked) navigate('/', { replace: true }) }, [blocked, navigate])
  if (blocked) return null

  return (
    <Page>
      <PageHeader icon={Ban} title="Papan Iklan — Ban" />
      {bans.isLoading ? <div className="flex justify-center py-20"><Spinner /></div>
        : bans.isError ? <ErrorState onRetry={() => bans.refetch()} />
        : (bans.data ?? []).length === 0 ? <EmptyState icon={Ban} title="Tidak ada ban aktif" />
        : (
          <DataTable
            rows={bans.data ?? []}
            columns={[
              { key: 'user', header: 'Pengguna', render: (b) => <span className="font-medium text-ink">{b.user_name}</span> },
              { key: 'until', header: 'Sampai', render: (b) => <span className="text-muted">{b.banned_until}</span> },
              { key: 'reason', header: 'Alasan', render: (b) => <span className="text-muted">{b.reason}</span> },
              { key: 'by', header: 'Oleh', render: (b) => <span className="text-muted">{b.banned_by}</span> },
              { key: 'act', header: '', render: (b) => <Button variant="secondary" onClick={() => unban.mutate(b.user, { onSuccess: () => toast('success', 'Dicabut'), onError: (e) => toast('error', (e as Error).message) })}>Cabut</Button> },
            ]}
            getKey={(b) => b.name}
          />
        )}
    </Page>
  )
}
```

- [ ] **Step 5: Register routes in web App.tsx**

In `frontend-web/src/App.tsx` add page imports and, inside the `<Route element={<AppShell />}>` block, the public routes plus the gated bans route (order matters — `new`/`bans` before `:name`):
```tsx
import PapanIklan from '@web/pages/PapanIklan'
import PapanIklanDetail from '@web/pages/PapanIklanDetail'
import PapanIklanForm from '@web/pages/PapanIklanForm'
import PapanIklanBans from '@web/pages/PapanIklanBans'
```
```tsx
          <Route path="/papan-iklan" element={<PapanIklan />} />
          <Route path="/papan-iklan/new" element={<PapanIklanForm />} />
          {canModerateAds(b) && <Route path="/papan-iklan/bans" element={<PapanIklanBans />} />}
          <Route path="/papan-iklan/:name/edit" element={<PapanIklanForm />} />
          <Route path="/papan-iklan/:name" element={<PapanIklanDetail />} />
```
Add `canModerateAds` to the existing `from '@/hooks/useData'` import in this file.

- [ ] **Step 6: Nav entry + breadcrumb**

In `frontend-web/src/lib/nav.ts`: import `Megaphone` from `lucide-react` (top import block) and add a public leaf to the `WORK` array (or `REWARDS`, wherever community features sit):
```ts
  { to: '/papan-iklan', label: 'Papan Iklan', sub: 'Jual · beli · sewa', icon: Megaphone },
```
And add a gated admin leaf inside the `admin` array:
```ts
    ...(canModerateAds(b) ? [{ to: '/papan-iklan/bans', label: 'Iklan Bans', sub: 'Banned posters', icon: Ban } as NavLeaf] : []),
```
Import `Ban` too, and add `canModerateAds` to the `@/hooks/useData` import in nav.ts.

In `frontend-web/src/components/AppShell.tsx`, add to the `SECTION` map:
```ts
  'papan-iklan': { label: 'Papan Iklan', to: '/papan-iklan' },
```

- [ ] **Step 7: Verify build compiles**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit`
Expected: no new errors. Fix any mismatch against actual `@web/components/ui` prop names (`Button` variants, `Field` render-prop, `PageHeader` `actions`) surfaced here.

- [ ] **Step 8: Commit**

```bash
git add frontend-web/src/pages/PapanIklan.tsx frontend-web/src/pages/PapanIklanDetail.tsx frontend-web/src/pages/PapanIklanForm.tsx frontend-web/src/pages/PapanIklanBans.tsx frontend-web/src/App.tsx frontend-web/src/lib/nav.ts frontend-web/src/components/AppShell.tsx
git commit -m "feat(papan-iklan): web pages, routes, nav, breadcrumb"
```

---

### Task 9: Build, deploy, and manual end-to-end verification

**Files:** none (build artifacts + verification).

- [ ] **Step 1: Build both bundles**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build
```
Expected: both succeed; each copies its `index.html` into `vernon_project/www/m.html` / `w.html` (per the build config). Confirm the `build` script exists in each `package.json` first — recent commits (`build(hr): rebuild /m + /w bundles`) confirm it does.

- [ ] **Step 2: Ensure backend is live**

Run: `bench --site project.vernon.id migrate && bench restart`
Expected: no error.

- [ ] **Step 3: Commit the rebuilt bundles**

```bash
git add vernon_project/www frontend/dist frontend-web/dist
git status --short   # confirm only Papan Iklan-related build output is staged; unstage anything else
git commit -m "build(papan-iklan): rebuild /m + /w bundles"
```
(Match whatever bundle paths prior `build(...)` commits staged — inspect `git show --stat` of commit `e581182` to see exactly which dirs the build writes, and stage the same ones.)

- [ ] **Step 4: Manual verification path**

As a normal (non-admin) logged-in user on `/m` and `/w`:
1. Open Papan Iklan → browse; filter Jual/Beli/Sewa; search.
2. Pasang iklan: type Sewa, set a price + period, upload 2 photos, contact number → submit. Confirm it appears in the list with a thumbnail and `Rp … per Bulan`.
3. Open the ad → "Hubungi" opens `wa.me/<digits>`; add a comment; confirm it shows.
4. As owner: edit the ad, mark Fulfilled (drops out of the default Active list), delete an ad.

As a System Manager:
5. Open another user's ad → "Turunkan iklan" (status Removed, disappears from board); the author gets a `Billboard` notification.
6. "Ban pengguna" with an until-date + reason → confirm the banned user, when they try to post, is blocked with the until-date + reason message.
7. Open Papan Iklan → Ban (mobile `/papan-iklan/bans`, web nav "Iklan Bans") → see the ban, "Cabut ban" → confirm the user can post again.
8. Confirm a non-admin cannot reach `/papan-iklan/bans` (redirects home) and sees no admin buttons on ads.

- [ ] **Step 5: Record the initiative in memory**

Add a memory file summarizing the shipped feature (doctypes, API module, both frontends, ban model, `Billboard` notification type) and a `MEMORY.md` pointer, per the memory convention.

---

## Notes on deferred / deliberately-skipped items

- **Automated tests** deferred to a final phase (live-site convention). The per-task `bench console` checks and manual path above are the verification.
- **Approval queue, categories, price sort/range, custom moderator role, ad auto-expiry** — out of scope per the design; the numeric `price` and `ad_type` fields leave the door open for sort/filter later without a schema change.
- **Comment reference allow-list** — Task 5 Step 1 verifies whether the existing comment API restricts reference doctypes; add `"Papan Iklan"` only if such a list exists.
