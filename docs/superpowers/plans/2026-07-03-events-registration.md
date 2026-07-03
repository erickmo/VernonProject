# Events & Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff-hosted events that internal users register for — Free, Points-priced, or Rupiah-priced (Midtrans), across the `/m` mobile and `/w` web frontends.

**Architecture:** Two new DocTypes (`Event`, `Event Registration`) mirroring the existing `Marketplace Reward` → `Reward Redemption` split. Points spend reuses the wallet debit model (the registration row is the debit; `_user_balance()` subtracts it — there is NO negative Point Ledger row). Rupiah reuses the sibling-app Midtrans Snap pattern: server creates a Snap token, a guest-whitelisted webhook flips the registration to Confirmed on settlement. Both frontends reuse one shared data layer under `frontend/src` (`@` alias); web adds only its own presentation shell.

**Tech Stack:** Frappe (Python) DocTypes + whitelisted RPC; React + Vite + react-router-dom v6 + TanStack Query (both apps); Midtrans Snap; Tailwind (Soft-Pop tokens on `/m`, flat-Notion semantic tokens on `/w`).

## Global Constraints

- **App root:** `/home/frappe/frappe-bench/apps/vernon_project`. DocType dir is DOUBLE-nested: `vernon_project/vernon_project/doctype/<snake_case>/`. Module string in every `.json` is exactly `"Vernon Project"`.
- **LIVE site, no test DB** (per `vernon-live-site-codefirst` memory). Tests are DEFERRED to the final phase (Task G2) — this plan does NOT use test-first TDD per task; each task ends with a **manual verification** step. Schema changes land via `bench --site project.vernon.id migrate`; Python via `bench restart`; frontend via `npm run build` (separate build per app). A new/changed DocType needs `migrate` (or `reload-doctype`), not just restart.
- **User works in parallel** (per `vernon-user-parallel-remote-control`): re-check `git status` before every commit; `git add` only the files this task created/modified — never `git add -A`.
- **No native `alert/confirm/prompt`** (per `vernon-no-alert-use-dialog`): use the in-app dialog/modal.
- **Design systems are per-app:** `/m` uses `paper-*` / `brand-*` tokens + lucide icons (never emoji in chrome); `/w` uses semantic tokens (`canvas/surface/ink/muted/line/hover` + `brand-*`) — NEVER `paper-*` in web.
- **Frappe API house style:** `@frappe.whitelist()`; read user via `frappe.session.user`; guard `if user == "Guest": frappe.throw("Not logged in", frappe.AuthenticationError)`; return bare dict/list (Frappe wraps as `{"message": …}`); errors via `frappe.throw(msg, frappe.ValidationError|PermissionError)`.
- **Midtrans config** lives on the existing **Vernon Settings** Single doctype (NOT `site_config`). `server_key` is a Password field read via `doc.get_password("midtrans_server_key")` and never sent to the browser.

---

## File map

**Backend (create):**
- `vernon_project/vernon_project/doctype/event/{__init__.py, event.json, event.py}`
- `vernon_project/vernon_project/doctype/event_registration/{__init__.py, event_registration.json, event_registration.py}`
- `vernon_project/api/events.py` — list/get/register/my_registrations + `midtrans_notify` webhook
- `vernon_project/api/midtrans.py` — `snap_base_url`, `verify_signature`, `snap_create`, `pay_config`

**Backend (modify):**
- `vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json` — add Midtrans fields
- `vernon_project/api/mobile.py` — extend `_user_balance()` to subtract points-method registrations

**Shared frontend (modify, under `frontend/src`, `@` alias — touches BOTH apps):**
- `lib/types.ts` — `Event`, `EventRegistration`, `PayConfig`
- `lib/api.ts` — `eventsApi.*`
- `lib/snap.ts` — **create**: Snap.js loader + `snapPay()`
- `hooks/useData.ts` — event query keys + hooks

**Mobile `/m` (create + modify, `frontend/src`):**
- `pages/EventsScreen.tsx`, `pages/EventDetailScreen.tsx`, `pages/MyRegistrationsScreen.tsx` — create
- `App.tsx` — routes; one entry-point link on `pages/MeScreen.tsx` (or Today)

**Web `/w` (create + modify, `frontend-web/src`):**
- `pages/Events.tsx`, `pages/EventDetail.tsx`, `pages/MyRegistrations.tsx` — create
- `App.tsx` — routes; `lib/nav.ts` — nav leaf

---

## Phase A — Backend data model & config

### Task A1: Event DocType

**Files:**
- Create: `vernon_project/vernon_project/doctype/event/__init__.py` (empty)
- Create: `vernon_project/vernon_project/doctype/event/event.json`
- Create: `vernon_project/vernon_project/doctype/event/event.py`

**Interfaces:**
- Produces: DocType `Event` with fields `title, description, cover_image, organizer, start_datetime, end_datetime, location, capacity, pricing (Free|Points|Rupiah), points_cost, price, status (Draft|Published|Cancelled|Completed)`. Controller auto-fills `organizer` = creator.

- [ ] **Step 1: Create the empty package file**

```bash
touch vernon_project/vernon_project/doctype/event/__init__.py
```

- [ ] **Step 2: Write `event.json`**

```json
{
 "actions": [],
 "allow_rename": 0,
 "autoname": "hash",
 "creation": "2026-07-03 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": [
  "title", "description", "cover_image", "organizer", "column_break_a",
  "start_datetime", "end_datetime", "location", "section_break_b",
  "capacity", "pricing", "points_cost", "price", "section_break_c", "status"
 ],
 "fields": [
  {"fieldname": "title", "fieldtype": "Data", "label": "Title", "reqd": 1, "in_list_view": 1},
  {"fieldname": "description", "fieldtype": "Text Editor", "label": "Description"},
  {"fieldname": "cover_image", "fieldtype": "Attach Image", "label": "Cover Image"},
  {"fieldname": "organizer", "fieldtype": "Link", "label": "Organizer", "options": "User", "search_index": 1},
  {"fieldname": "column_break_a", "fieldtype": "Column Break"},
  {"fieldname": "start_datetime", "fieldtype": "Datetime", "label": "Start", "reqd": 1, "in_list_view": 1},
  {"fieldname": "end_datetime", "fieldtype": "Datetime", "label": "End"},
  {"fieldname": "location", "fieldtype": "Data", "label": "Location (address or URL)"},
  {"fieldname": "section_break_b", "fieldtype": "Section Break", "label": "Capacity & Pricing"},
  {"fieldname": "capacity", "fieldtype": "Int", "label": "Capacity (0 = unlimited)", "default": "0"},
  {"fieldname": "pricing", "fieldtype": "Select", "label": "Pricing", "options": "Free\nPoints\nRupiah", "default": "Free", "in_list_view": 1},
  {"fieldname": "points_cost", "fieldtype": "Float", "label": "Points Cost", "depends_on": "eval:doc.pricing=='Points'"},
  {"fieldname": "price", "fieldtype": "Currency", "label": "Price (Rp)", "depends_on": "eval:doc.pricing=='Rupiah'"},
  {"fieldname": "section_break_c", "fieldtype": "Section Break"},
  {"fieldname": "status", "fieldtype": "Select", "label": "Status", "options": "Draft\nPublished\nCancelled\nCompleted", "default": "Draft", "in_list_view": 1}
 ],
 "index_web_pages_for_search": 1,
 "links": [],
 "modified": "2026-07-03 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Event",
 "naming_rule": "Random",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1}
 ],
 "row_format": "Dynamic",
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": []
}
```

- [ ] **Step 3: Write `event.py`**

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Event(Document):
	def validate(self):
		if self.is_new() and not self.organizer:
			self.organizer = frappe.session.user
		if self.pricing == "Points" and (self.points_cost or 0) <= 0:
			frappe.throw("Points-priced events need a positive Points Cost.", frappe.ValidationError)
		if self.pricing == "Rupiah" and (self.price or 0) <= 0:
			frappe.throw("Rupiah-priced events need a positive Price.", frappe.ValidationError)
		if (self.capacity or 0) < 0:
			frappe.throw("Capacity cannot be negative.", frappe.ValidationError)
```

- [ ] **Step 4: Migrate and verify the DocType loads**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate
```
Then:
```bash
bench --site project.vernon.id console <<'PY'
import frappe
e = frappe.get_doc({"doctype":"Event","title":"Smoke Test","start_datetime":"2026-08-01 10:00:00","pricing":"Free","status":"Draft"})
e.insert(ignore_permissions=True)
print("OK", e.name, e.organizer)
frappe.db.rollback()
PY
```
Expected: prints `OK <hash> Administrator` (organizer auto-filled), no exception.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/doctype/event
git commit -m "feat(events): Event doctype"
```

---

### Task A2: Event Registration DocType

**Files:**
- Create: `vernon_project/vernon_project/doctype/event_registration/__init__.py` (empty)
- Create: `vernon_project/vernon_project/doctype/event_registration/event_registration.json`
- Create: `vernon_project/vernon_project/doctype/event_registration/event_registration.py`

**Interfaces:**
- Consumes: `Event` (A1).
- Produces: DocType `Event Registration` (standalone, hash-named). Fields: `event, user, registered_on, status (Pending|Confirmed|Cancelled), method (Free|Points|Rupiah), amount, midtrans_order_id, snap_token, transaction_status, paid_on`. The docname doubles as the Midtrans `order_id`.

- [ ] **Step 1: Create the empty package file**

```bash
touch vernon_project/vernon_project/doctype/event_registration/__init__.py
```

- [ ] **Step 2: Write `event_registration.json`**

```json
{
 "actions": [],
 "allow_rename": 0,
 "autoname": "hash",
 "creation": "2026-07-03 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": [
  "event", "user", "column_break_a", "registered_on", "status", "method", "amount",
  "section_break_b", "midtrans_order_id", "snap_token", "transaction_status", "paid_on"
 ],
 "fields": [
  {"fieldname": "event", "fieldtype": "Link", "label": "Event", "options": "Event", "reqd": 1, "search_index": 1, "in_list_view": 1},
  {"fieldname": "user", "fieldtype": "Link", "label": "User", "options": "User", "reqd": 1, "search_index": 1, "in_list_view": 1},
  {"fieldname": "column_break_a", "fieldtype": "Column Break"},
  {"fieldname": "registered_on", "fieldtype": "Datetime", "label": "Registered On"},
  {"fieldname": "status", "fieldtype": "Select", "label": "Status", "options": "Pending\nConfirmed\nCancelled", "default": "Pending", "in_list_view": 1},
  {"fieldname": "method", "fieldtype": "Select", "label": "Method", "options": "Free\nPoints\nRupiah", "default": "Free"},
  {"fieldname": "amount", "fieldtype": "Float", "label": "Amount (points or Rp)"},
  {"fieldname": "section_break_b", "fieldtype": "Section Break", "label": "Payment"},
  {"fieldname": "midtrans_order_id", "fieldtype": "Data", "label": "Midtrans Order ID", "search_index": 1, "read_only": 1},
  {"fieldname": "snap_token", "fieldtype": "Data", "label": "Snap Token", "read_only": 1},
  {"fieldname": "transaction_status", "fieldtype": "Data", "label": "Transaction Status", "read_only": 1},
  {"fieldname": "paid_on", "fieldtype": "Datetime", "label": "Paid On", "read_only": 1}
 ],
 "index_web_pages_for_search": 1,
 "links": [],
 "modified": "2026-07-03 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Event Registration",
 "naming_rule": "Random",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1}
 ],
 "row_format": "Dynamic",
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": []
}
```

Note: no user-role read permission — the frontend reads registrations only through whitelisted API methods (Task B2/B3), never `/api/resource`, so users never query this DocType directly.

- [ ] **Step 3: Write `event_registration.py`**

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class EventRegistration(Document):
	pass
```

- [ ] **Step 4: Migrate and verify**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate
bench --site project.vernon.id console <<'PY'
import frappe
print(frappe.get_meta("Event Registration").get_field("status").options)
PY
```
Expected: prints `Pending\nConfirmed\nCancelled`.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/doctype/event_registration
git commit -m "feat(events): Event Registration doctype"
```

---

### Task A3: Midtrans config fields on Vernon Settings

**Files:**
- Modify: `vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json`

**Interfaces:**
- Produces: Vernon Settings gains `midtrans_client_key` (Data), `midtrans_server_key` (Password), `midtrans_is_production` (Check), grouped under a `payments_section`.

- [ ] **Step 1: Add the three fields**

In `vernon_settings.json`, append these fieldnames to the END of `field_order`:
```
"payments_section", "midtrans_client_key", "midtrans_server_key", "midtrans_is_production"
```
And add these objects to the END of the `fields` array:
```json
{"fieldname": "payments_section", "fieldtype": "Section Break", "label": "Payments (Midtrans)"},
{"fieldname": "midtrans_client_key", "fieldtype": "Data", "label": "Midtrans Client Key"},
{"fieldname": "midtrans_server_key", "fieldtype": "Password", "label": "Midtrans Server Key"},
{"fieldname": "midtrans_is_production", "fieldtype": "Check", "label": "Midtrans Production Mode", "default": "0"}
```

- [ ] **Step 2: Migrate and verify**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate
bench --site project.vernon.id console <<'PY'
import frappe
s = frappe.get_single("Vernon Settings")
print("has fields:", hasattr(s, "midtrans_client_key"), hasattr(s, "midtrans_is_production"))
PY
```
Expected: `has fields: True True`.

- [ ] **Step 3: Commit**

```bash
git add vernon_project/vernon_project/doctype/vernon_settings/vernon_settings.json
git commit -m "feat(events): Midtrans config fields on Vernon Settings"
```

---

## Phase B — Backend: Midtrans helper + events API (free/points)

### Task B1: `api/midtrans.py` helper

**Files:**
- Create: `vernon_project/api/midtrans.py`

**Interfaces:**
- Produces: `snap_base_url() -> str`, `verify_signature(payload: dict, server_key: str) -> bool`, `snap_create(order_id, gross_amount, customer, items) -> dict` (returns Midtrans JSON incl. `token`, `redirect_url`), and whitelisted `pay_config()` (guest) returning `{client_key, snap_js}`. Reads config from Vernon Settings.

- [ ] **Step 1: Write `api/midtrans.py`** (ported verbatim from `vernon_edubing/vernon_edubing/api/midtrans.py`, config source swapped to Vernon Settings)

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import hashlib
import hmac

import frappe
import requests


def _settings():
	return frappe.get_single("Vernon Settings")


def snap_base_url():
	if _settings().midtrans_is_production:
		return "https://app.midtrans.com"
	return "https://app.sandbox.midtrans.com"


def _snap_js_url():
	if _settings().midtrans_is_production:
		return "https://app.midtrans.com/snap/snap.js"
	return "https://app.sandbox.midtrans.com/snap/snap.js"


def _server_key():
	key = _settings().get_password("midtrans_server_key", raise_exception=False)
	if not key:
		frappe.throw("Payments are not configured.", frappe.ValidationError)
	return key


def verify_signature(payload, server_key):
	raw = (
		str(payload.get("order_id", ""))
		+ str(payload.get("status_code", ""))
		+ str(payload.get("gross_amount", ""))
		+ server_key
	)
	expected = hashlib.sha512(raw.encode()).hexdigest()
	return hmac.compare_digest(expected, str(payload.get("signature_key") or ""))


def snap_create(order_id, gross_amount, customer, items):
	resp = requests.post(
		f"{snap_base_url()}/snap/v1/transactions",
		json={
			"transaction_details": {"order_id": order_id, "gross_amount": int(gross_amount)},
			"customer_details": customer,
			"item_details": items,
		},
		auth=(_server_key(), ""),
		timeout=30,
	)
	if resp.status_code != 201:
		frappe.log_error(f"Snap {resp.status_code}: {resp.text[:500]}", "Midtrans Snap")
		frappe.throw("Payment gateway error, try again", frappe.ValidationError)
	return resp.json()


@frappe.whitelist(allow_guest=True)
def pay_config():
	s = _settings()
	return {"client_key": s.midtrans_client_key or "", "snap_js": _snap_js_url()}
```

- [ ] **Step 2: Restart and verify import + config endpoint**

```bash
cd /home/frappe/frappe-bench && bench restart
bench --site project.vernon.id console <<'PY'
from vernon_project.api.midtrans import snap_base_url, verify_signature, pay_config
print(snap_base_url())
print(pay_config())
print(verify_signature({"order_id":"x","status_code":"200","gross_amount":"1000","signature_key":"nope"}, "srv"))
PY
```
Expected: prints a sandbox URL, a dict with `client_key`/`snap_js`, and `False`.

- [ ] **Step 3: Commit**

```bash
git add vernon_project/api/midtrans.py
git commit -m "feat(events): Midtrans Snap helper (config on Vernon Settings)"
```

---

### Task B2: `api/events.py` reads — list_events, get_event, my_registrations

**Files:**
- Create: `vernon_project/api/events.py`

**Interfaces:**
- Consumes: `Event`, `Event Registration`.
- Produces:
  - `list_events() -> list[dict]` — published events, each `{name, title, cover_image, start_datetime, end_datetime, location, pricing, points_cost, price, capacity, registered_count, is_full, my_status}`.
  - `get_event(event) -> dict` — one event with the same shape + `description, organizer`.
  - `my_registrations() -> list[dict]` — `{name, event, event_title, start_datetime, status, method, amount}`.
  - Internal helper `_confirmed_count(event) -> int` and `_event_public(row, user)` reused by Phase C.

- [ ] **Step 1: Write `api/events.py`**

```python
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
	return frappe.db.count("Event Registration", {"event": event, "status": ["!=", "Cancelled"]})


def _my_status(event, user):
	rows = frappe.get_all(
		"Event Registration",
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
		"Event",
		filters={"status": "Published"},
		fields=PUBLIC_EVENT_FIELDS,
		order_by="start_datetime asc",
	)
	return [_decorate(r, user) for r in rows]


@frappe.whitelist()
def get_event(event):
	user = _require_user()
	if not frappe.db.exists("Event", event):
		frappe.throw("Event not found", frappe.DoesNotExistError)
	row = frappe.db.get_value(
		"Event", event, PUBLIC_EVENT_FIELDS + ["description", "organizer", "status"], as_dict=True
	)
	if row.status != "Published":
		frappe.throw("Event not available", frappe.PermissionError)
	return _decorate(row, user)


@frappe.whitelist()
def my_registrations():
	user = _require_user()
	rows = frappe.get_all(
		"Event Registration",
		filters={"user": user, "status": ["!=", "Cancelled"]},
		fields=["name", "event", "registered_on", "status", "method", "amount"],
		order_by="registered_on desc",
	)
	for r in rows:
		r["event_title"] = frappe.db.get_value("Event", r["event"], "title")
		r["start_datetime"] = frappe.db.get_value("Event", r["event"], "start_datetime")
	return rows
```

- [ ] **Step 2: Restart and verify (uses the Draft smoke event won't show; create a Published one)**

```bash
cd /home/frappe/frappe-bench && bench restart
bench --site project.vernon.id console <<'PY'
import frappe
frappe.set_user("Administrator")
e = frappe.get_doc({"doctype":"Event","title":"Verify List","start_datetime":"2026-08-01 10:00:00","pricing":"Free","status":"Published"}).insert(ignore_permissions=True)
from vernon_project.api import events
print("list:", [x["title"] for x in events.list_events()])
print("get:", events.get_event(e.name)["my_status"])
frappe.db.rollback()
PY
```
Expected: `list:` includes `Verify List`; `get:` prints `None`.

- [ ] **Step 3: Commit**

```bash
git add vernon_project/api/events.py
git commit -m "feat(events): list/get/my_registrations read endpoints"
```

---

### Task B3: `register()` — Free + Points; extend `_user_balance`

**Files:**
- Modify: `vernon_project/api/events.py` (add `register`, `_charge_points` helpers)
- Modify: `vernon_project/api/mobile.py` (`_user_balance` gains an Event-Registration debit)

**Interfaces:**
- Consumes: `_active_count`, `_my_status` (B2); `_user_balance` from `vernon_project.api.mobile`.
- Produces: `register(event) -> dict`. For Free/Points returns `{"registration": <name>, "status": "Confirmed", "balance": <float|None>}`. (Rupiah branch added in Task C1.)

- [ ] **Step 1: Extend `_user_balance` in `mobile.py`** to subtract points-method registrations.

Find the existing `_user_balance` (around `mobile.py:2143`) — its current debit lines are:
```python
	redeemed = frappe.db.sql(
		"select coalesce(sum(point_cost), 0) from `tabReward Redemption` where user = %s",
		user,
	)[0][0]
	...
	unlocked = frappe.db.sql(
		"select coalesce(sum(cost),0) from `tabAvatar Unlock` where user=%s", user
	)[0][0] or 0
	balance = earned - redeemed - float(unlocked)
	return earned, redeemed, balance
```
Add an events debit and include it in the balance:
```python
	events_spent = frappe.db.sql(
		"select coalesce(sum(amount),0) from `tabEvent Registration` "
		"where user=%s and method='Points' and status != 'Cancelled'",
		user,
	)[0][0] or 0
	balance = earned - redeemed - float(unlocked) - float(events_spent)
	return earned, redeemed, balance
```

- [ ] **Step 2: Add `register()` (Free + Points) to `events.py`**

```python
from frappe.utils import now_datetime
from vernon_project.api.mobile import _user_balance


def _existing_active(event, user):
	rows = frappe.get_all(
		"Event Registration",
		filters={"event": event, "user": user, "status": ["!=", "Cancelled"]},
		fields=["name"], limit_page_length=1,
	)
	return rows[0]["name"] if rows else None


def _capacity_ok(ev):
	cap = ev.capacity or 0
	return not cap or _active_count(ev.name) < cap


def _make_registration(event, user, method, amount, status):
	reg = frappe.get_doc({
		"doctype": "Event Registration",
		"event": event, "user": user, "method": method,
		"amount": amount, "status": status, "registered_on": now_datetime(),
	})
	reg.insert(ignore_permissions=True)
	return reg


@frappe.whitelist()
def register(event):
	user = _require_user()
	ev = frappe.get_doc("Event", event)
	if ev.status != "Published":
		frappe.throw("Event not available", frappe.ValidationError)

	# Serialise per-user spend/seat races with the same advisory lock the wallet uses.
	lock_key = f"vernon_spend:{user}"
	got = frappe.db.sql("select get_lock(%s, 10)", lock_key)[0][0]
	if not got:
		frappe.throw("Registration busy, please retry", frappe.ValidationError)
	try:
		if _existing_active(event, user):
			frappe.throw("You are already registered.", frappe.ValidationError)
		if not _capacity_ok(ev):
			frappe.throw("This event is full.", frappe.ValidationError)

		if ev.pricing == "Free":
			reg = _make_registration(event, user, "Free", 0, "Confirmed")
			return {"registration": reg.name, "status": "Confirmed", "balance": None}

		if ev.pricing == "Points":
			cost = float(ev.points_cost or 0)
			_, _, balance = _user_balance(user)
			if cost > balance:
				frappe.throw("Insufficient balance", frappe.ValidationError)
			reg = _make_registration(event, user, "Points", cost, "Confirmed")
			_, _, new_balance = _user_balance(user)
			return {"registration": reg.name, "status": "Confirmed", "balance": new_balance}

		# Rupiah — implemented in Task C1
		frappe.throw("Rupiah payment not yet available", frappe.ValidationError)
	finally:
		frappe.db.sql("select release_lock(%s)", lock_key)
```

- [ ] **Step 3: Restart and verify Free + Points paths**

```bash
cd /home/frappe/frappe-bench && bench restart
bench --site project.vernon.id console <<'PY'
import frappe
from vernon_project.api import events
from vernon_project.api.mobile import _user_balance
u = frappe.db.get_value("User", {"user_type":"System User","enabled":1,"name":["!=","Administrator"]}, "name") or "Administrator"
frappe.set_user(u)
free = frappe.get_doc({"doctype":"Event","title":"Free Verify","start_datetime":"2026-08-01 10:00:00","pricing":"Free","status":"Published"}).insert(ignore_permissions=True)
r1 = events.register(free.name); print("free:", r1["status"])
try:
    events.register(free.name)
except Exception as ex:
    print("dup blocked:", "already registered" in str(ex).lower())
before = _user_balance(u)[2]
pts = frappe.get_doc({"doctype":"Event","title":"Points Verify","start_datetime":"2026-08-01 10:00:00","pricing":"Points","points_cost":5,"status":"Published"}).insert(ignore_permissions=True)
r2 = events.register(pts.name); after = _user_balance(u)[2]
print("points debit == 5:", round(before-after,2)==5.0, "balance", before, "->", after)
frappe.db.rollback()
PY
```
Expected: `free: Confirmed`, `dup blocked: True`, `points debit == 5: True` (assuming the picked user has ≥5 balance; if not, it prints the insufficient-balance path — pick a user with balance or grant points first).

- [ ] **Step 4: Commit**

```bash
git add vernon_project/api/events.py vernon_project/api/mobile.py
git commit -m "feat(events): register() free+points, wallet debits event registrations"
```

---

## Phase C — Backend: Rupiah + webhook

### Task C1: `register()` Rupiah branch — Snap token

**Files:**
- Modify: `vernon_project/api/events.py`

**Interfaces:**
- Consumes: `snap_create` (B1).
- Produces: Rupiah branch of `register()` returns `{"registration": <name>, "status": "Pending", "snap_token": <token>, "order_id": <name>}`.

- [ ] **Step 1: Replace the Rupiah stub** in `register()` with:

```python
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
```

(Remove the `frappe.throw("Rupiah payment not yet available", …)` line.)

- [ ] **Step 2: Verify (needs sandbox keys — Task G1 sets them; until then this asserts the not-configured error path)**

```bash
cd /home/frappe/frappe-bench && bench restart
bench --site project.vernon.id console <<'PY'
import frappe
from vernon_project.api import events
u = "Administrator"; frappe.set_user(u)
ev = frappe.get_doc({"doctype":"Event","title":"Rp Verify","start_datetime":"2026-08-01 10:00:00","pricing":"Rupiah","price":75000,"status":"Published"}).insert(ignore_permissions=True)
try:
    print(events.register(ev.name))
except Exception as ex:
    print("expected pre-config error:", "not configured" in str(ex).lower() or "gateway" in str(ex).lower())
frappe.db.rollback()
PY
```
Expected before keys are set: `expected pre-config error: True`. After Task G1 (sandbox keys) rerun: prints a dict with a real `snap_token`.

- [ ] **Step 3: Commit**

```bash
git add vernon_project/api/events.py
git commit -m "feat(events): register() rupiah branch creates Midtrans Snap token"
```

---

### Task C2: `midtrans_notify` webhook

**Files:**
- Modify: `vernon_project/api/events.py`

**Interfaces:**
- Consumes: `verify_signature` (B1), Event Registration.
- Produces: `midtrans_notify()` (guest, POST) — public URL `/api/method/vernon_project.api.events.midtrans_notify`. Signature-verified, idempotent, `for_update` row-locked. `settlement`/`capture+accept` → Confirmed + `paid_on`; `deny`/`cancel`/`expire` → Cancelled; other → unchanged.

- [ ] **Step 1: Add the webhook to `events.py`**

```python
import json


def _apply_notification(payload):
	from vernon_project.api.midtrans import _server_key
	if not verify_signature(payload, _server_key()):
		frappe.log_error(f"order_id={payload.get('order_id')}", "Events Midtrans bad signature")
		raise frappe.PermissionError("Invalid signature.")

	order_id = payload.get("order_id")
	name = frappe.db.get_value("Event Registration", {"midtrans_order_id": order_id}, "name")
	if not name:
		frappe.log_error(f"order_id={order_id}", "Events Midtrans unknown order")
		return "ignored"

	# Row-lock to serialise duplicate/concurrent notifications.
	frappe.db.get_value("Event Registration", name, "name", for_update=True)
	reg = frappe.get_doc("Event Registration", name)
	reg.db_set("transaction_status", payload.get("transaction_status"), update_modified=False)

	if reg.status == "Confirmed":
		return "Confirmed"  # idempotent — already finalized

	txn = payload.get("transaction_status")
	fraud = payload.get("fraud_status")
	if txn == "settlement" or (txn == "capture" and fraud == "accept"):
		# Amount tamper check.
		if float(payload.get("gross_amount") or 0) != float(reg.amount or 0):
			frappe.log_error(f"order_id={order_id} amount mismatch", "Events Midtrans tamper")
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
```

- [ ] **Step 2: Verify signature gate + idempotency with a synthetic payload**

```bash
cd /home/frappe/frappe-bench && bench restart
bench --site project.vernon.id console <<'PY'
import frappe, hashlib
frappe.set_user("Administrator")
# needs a server key; set a temp one for the test if not configured
s = frappe.get_single("Vernon Settings")
if not s.get_password("midtrans_server_key", raise_exception=False):
    s.midtrans_server_key = "SB-TEST-KEY"; s.save(ignore_permissions=True)
key = s.get_password("midtrans_server_key")
ev = frappe.get_doc({"doctype":"Event","title":"WH Verify","start_datetime":"2026-08-01 10:00:00","pricing":"Rupiah","price":75000,"status":"Published"}).insert(ignore_permissions=True)
reg = frappe.get_doc({"doctype":"Event Registration","event":ev.name,"user":"Administrator","method":"Rupiah","amount":75000,"status":"Pending","midtrans_order_id":"ORDER-1"}).insert(ignore_permissions=True)
from vernon_project.api.events import _apply_notification
def sig(o,sc,ga): return hashlib.sha512((o+sc+ga+key).encode()).hexdigest()
bad = {"order_id":"ORDER-1","status_code":"200","gross_amount":"75000.00","transaction_status":"settlement","signature_key":"WRONG"}
try:
    _apply_notification(bad); print("bad sig: NOT blocked (FAIL)")
except frappe.PermissionError: print("bad sig blocked: True")
good = dict(bad, signature_key=sig("ORDER-1","200","75000.00"))
print("apply1:", _apply_notification(good))
print("status now:", frappe.db.get_value("Event Registration", reg.name, "status"))
print("apply2 (idempotent):", _apply_notification(good))
frappe.db.rollback()
PY
```
Expected: `bad sig blocked: True`, `apply1: Confirmed`, `status now: Confirmed`, `apply2 (idempotent): Confirmed`.

- [ ] **Step 3: Commit**

```bash
git add vernon_project/api/events.py
git commit -m "feat(events): Midtrans webhook confirms rupiah registrations (idempotent)"
```

---

## Phase D — Shared frontend layer (`frontend/src`, `@` alias — touches BOTH apps)

### Task D1: Types + api client

**Files:**
- Modify: `frontend/src/lib/types.ts` (ADD interfaces — never mutate shared ones)
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**
- Produces:
  - Types `Event`, `EventRegistration`, `PayConfig`, `RegisterResult`.
  - `eventsApi.list()`, `eventsApi.get(name)`, `eventsApi.register(name)`, `eventsApi.mine()`, `eventsApi.payConfig()`.

- [ ] **Step 1: Add types to `types.ts`**

```typescript
export interface EventItem {
  name: string
  title: string
  description?: string
  cover_image?: string
  organizer?: string
  start_datetime: string
  end_datetime?: string
  location?: string
  pricing: 'Free' | 'Points' | 'Rupiah'
  points_cost?: number
  price?: number
  capacity?: number
  registered_count: number
  is_full: boolean
  my_status: 'Pending' | 'Confirmed' | 'Cancelled' | null
}

export interface EventRegistration {
  name: string
  event: string
  event_title?: string
  start_datetime?: string
  status: 'Pending' | 'Confirmed' | 'Cancelled'
  method: 'Free' | 'Points' | 'Rupiah'
  amount?: number
}

export interface PayConfig { client_key: string; snap_js: string }

export interface RegisterResult {
  registration: string
  status: 'Confirmed' | 'Pending'
  balance?: number | null
  snap_token?: string
  order_id?: string
}
```
(Type is named `EventItem` to avoid colliding with the DOM `Event` global.)

- [ ] **Step 2: Add `eventsApi` to `api.ts`** (place near the existing `mobileApi`)

```typescript
import type { EventItem, EventRegistration, PayConfig, RegisterResult } from './types'

const EV = 'vernon_project.api.events.'
const MT = 'vernon_project.api.midtrans.'

export const eventsApi = {
  list: () => api.get<EventItem[]>(EV + 'list_events'),
  get: (event: string) => api.get<EventItem>(EV + 'get_event', { event }),
  register: (event: string) => api.post<RegisterResult>(EV + 'register', { event }),
  mine: () => api.get<EventRegistration[]>(EV + 'my_registrations'),
  payConfig: () => api.get<PayConfig>(MT + 'pay_config'),
}
```

- [ ] **Step 3: Typecheck**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```
Expected: no errors referencing types.ts/api.ts.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts
git commit -m "feat(events): shared event types + api client"
```

---

### Task D2: Query hooks

**Files:**
- Modify: `frontend/src/hooks/useData.ts`

**Interfaces:**
- Consumes: `eventsApi` (D1).
- Produces: `keys.events`, `keys.event(name)`, `keys.myRegistrations`; `useEvents()`, `useEvent(name)`, `useMyRegistrations()`, `useRegisterEvent()` (mutation, invalidates the three keys).

- [ ] **Step 1: Add keys** to the `keys` object:

```typescript
  events: ['events'] as const,
  event: (n: string) => ['event', n] as const,
  myRegistrations: ['myRegistrations'] as const,
```

- [ ] **Step 2: Add hooks** (near other list hooks; import `eventsApi` from `@/lib/api`):

```typescript
export const useEvents = () =>
  useQuery({ queryKey: keys.events, queryFn: () => eventsApi.list() })

export const useEvent = (name: string, enabled = true) =>
  useQuery({ queryKey: keys.event(name), queryFn: () => eventsApi.get(name), enabled: !!name && enabled })

export const useMyRegistrations = () =>
  useQuery({ queryKey: keys.myRegistrations, queryFn: () => eventsApi.mine() })

export function useRegisterEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (event: string) => eventsApi.register(event),
    onSettled: (_d, _e, event) => {
      qc.invalidateQueries({ queryKey: keys.events })
      qc.invalidateQueries({ queryKey: keys.event(event) })
      qc.invalidateQueries({ queryKey: keys.myRegistrations })
    },
  })
}
```

- [ ] **Step 3: Typecheck (both apps share this file)**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useData.ts
git commit -m "feat(events): shared event query hooks"
```

---

### Task D3: Snap loader

**Files:**
- Create: `frontend/src/lib/snap.ts`

**Interfaces:**
- Consumes: `eventsApi.payConfig` (D1).
- Produces: `snapPay(token, handlers) -> Promise<'success'|'pending'|'error'|'close'>` — loads Snap.js once (idempotent, using the config's `client_key` + `snap_js`) then calls `window.snap.pay(token, …)`.

- [ ] **Step 1: Write `snap.ts`** (ported from `vernon_edubing/frontend/src/lib/snap.ts`, shape adapted)

```typescript
import { eventsApi } from './api'

declare global {
  interface Window { snap?: { pay: (token: string, opts: Record<string, unknown>) => void } }
}

let loaded: Promise<void> | null = null

async function loadSnap(): Promise<void> {
  if (window.snap) return
  if (loaded) return loaded
  loaded = (async () => {
    const cfg = await eventsApi.payConfig()
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script')
      s.id = 'midtrans-snap'
      s.src = cfg.snap_js
      s.setAttribute('data-client-key', cfg.client_key)
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('Failed to load payment script'))
      document.body.appendChild(s)
    })
  })()
  return loaded
}

export async function snapPay(token: string): Promise<'success' | 'pending' | 'error' | 'close'> {
  await loadSnap()
  return new Promise((resolve) => {
    window.snap!.pay(token, {
      onSuccess: () => resolve('success'),
      onPending: () => resolve('pending'),
      onError: () => resolve('error'),
      onClose: () => resolve('close'),
    })
  })
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/snap.ts
git commit -m "feat(events): shared Midtrans Snap loader"
```

---

## Phase E — Mobile `/m` screens (`frontend/src`)

### Task E1: Events list screen + route + entry point

**Files:**
- Create: `frontend/src/pages/EventsScreen.tsx`
- Modify: `frontend/src/App.tsx` (route)
- Modify: `frontend/src/pages/MeScreen.tsx` (entry link — adjust filename to the actual "Me" tab page)

**Interfaces:**
- Consumes: `useEvents` (D2), `EventItem` (D1). Navigates to `/events/:name`.

- [ ] **Step 1: Write `EventsScreen.tsx`** (Soft-Pop list, TabScreen shell not used since it's not a bottom tab — use DetailScreen so it gets a back chevron):

```tsx
import { useNavigate } from 'react-router-dom'
import { CalendarDays, Ticket } from 'lucide-react'
import { DetailScreen, PullToRefresh } from '@/components/Layout'
import { EmptyState, FullScreenLoader, Pill } from '@/components/ui'
import { useEvents } from '@/hooks/useData'

function priceLabel(e: { pricing: string; points_cost?: number; price?: number }) {
  if (e.pricing === 'Free') return 'Free'
  if (e.pricing === 'Points') return `${e.points_cost ?? 0} pts`
  return `Rp ${(e.price ?? 0).toLocaleString('id-ID')}`
}

export default function EventsScreen() {
  const navigate = useNavigate()
  const { data, isLoading, refetch } = useEvents()
  const events = data ?? []
  return (
    <DetailScreen title="Events">
      {isLoading && !data ? (
        <FullScreenLoader label="Loading events…" />
      ) : (
        <PullToRefresh onRefresh={refetch}>
          {events.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No events yet" subtitle="Check back soon." />
          ) : (
            <div className="flex flex-col gap-2.5">
              {events.map((e) => (
                <button
                  key={e.name}
                  onClick={() => navigate(`/events/${encodeURIComponent(e.name)}`)}
                  className="flex items-center gap-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-3.5 text-left shadow-sm transition active:scale-[0.99]"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 dark:bg-slate-700">
                    <Ticket className="h-5 w-5 text-brand-500" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display font-semibold text-stone-800 dark:text-slate-50">{e.title}</span>
                    <span className="block truncate text-xs text-stone-500 dark:text-slate-400">
                      {new Date(e.start_datetime).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  </span>
                  <Pill>{e.my_status === 'Confirmed' ? 'Joined' : priceLabel(e)}</Pill>
                </button>
              ))}
            </div>
          )}
        </PullToRefresh>
      )}
    </DetailScreen>
  )
}
```
(If `Pill` doesn't accept children this way, check `components/ui.tsx` and match its prop shape.)

- [ ] **Step 2: Add route to `App.tsx`** (default-import at top; not role-gated — all users):

```tsx
import EventsScreen from './pages/EventsScreen'
// …inside <Routes>:
        <Route path="/events" element={<EventsScreen />} />
```

- [ ] **Step 3: Add an entry link** on the Me tab page. Find the "Me" page (the `/me` route element in App.tsx). Add a nav row:

```tsx
import { CalendarDays } from 'lucide-react'
// a tappable row in the Me screen list:
<button onClick={() => navigate('/events')} className="...existing row classes...">
  <CalendarDays className="h-5 w-5 text-brand-500" /> Events
</button>
```
(Match the surrounding rows' exact classes in that file.)

- [ ] **Step 4: Verify build**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
```
Expected: build succeeds. (Manual UI check happens after deploy in Task G3.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/EventsScreen.tsx frontend/src/App.tsx frontend/src/pages/MeScreen.tsx
git commit -m "feat(events): /m events list screen + entry point"
```

---

### Task E2: Event detail + register (all methods)

**Files:**
- Create: `frontend/src/pages/EventDetailScreen.tsx`
- Modify: `frontend/src/App.tsx` (route `/events/:name`)

**Interfaces:**
- Consumes: `useEvent`, `useRegisterEvent` (D2), `snapPay` (D3). Uses the app dialog for confirm (NO native confirm).

- [ ] **Step 1: Write `EventDetailScreen.tsx`**

```tsx
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { DetailScreen } from '@/components/Layout'
import { FullScreenLoader } from '@/components/ui'
import { useEvent, useRegisterEvent } from '@/hooks/useData'
import { snapPay } from '@/lib/snap'
// import the app's dialog primitive (match the existing dialog import used elsewhere, e.g. useDialog / Modal)

export default function EventDetailScreen() {
  const { name: raw } = useParams()
  const name = raw ? decodeURIComponent(raw) : ''
  const { data: ev, isLoading, refetch } = useEvent(name)
  const register = useRegisterEvent()
  const [busy, setBusy] = useState(false)

  async function onRegister() {
    if (!ev) return
    setBusy(true)
    try {
      const res = await register.mutateAsync(ev.name)
      if (res.status === 'Pending' && res.snap_token) {
        const outcome = await snapPay(res.snap_token)
        // webhook confirms server-side; refetch to reflect Pending→Confirmed
        if (outcome === 'success' || outcome === 'pending') await refetch()
      } else {
        await refetch()
      }
    } catch (e) {
      // surface e via the app dialog/toast (match existing error handling)
    } finally {
      setBusy(false)
    }
  }

  if (isLoading || !ev) return <DetailScreen title="Event"><FullScreenLoader label="Loading…" /></DetailScreen>

  const joined = ev.my_status === 'Confirmed'
  const cta = joined ? 'Joined' : ev.pricing === 'Free' ? 'Register' :
    ev.pricing === 'Points' ? `Register · ${ev.points_cost ?? 0} pts` :
    `Pay Rp ${(ev.price ?? 0).toLocaleString('id-ID')}`

  return (
    <DetailScreen title={ev.title}>
      {ev.cover_image && <img src={ev.cover_image} alt="" className="mb-3 w-full rounded-2xl object-cover" />}
      <p className="text-sm text-stone-500 dark:text-slate-400">
        {new Date(ev.start_datetime).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' })}
      </p>
      {ev.location && <p className="mt-1 text-sm text-stone-600 dark:text-slate-300">{ev.location}</p>}
      {ev.description && <div className="prose prose-sm mt-3 dark:prose-invert" dangerouslySetInnerHTML={{ __html: ev.description }} />}
      <div className="mt-3 text-xs text-stone-500">
        {ev.registered_count} registered{ev.capacity ? ` · ${ev.capacity} cap` : ''}
      </div>
      <button
        disabled={joined || ev.is_full || busy}
        onClick={onRegister}
        className="mt-5 w-full rounded-2xl bg-brand-600 py-3 font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-50"
      >
        {ev.is_full && !joined ? 'Full' : busy ? 'Processing…' : cta}
      </button>
    </DetailScreen>
  )
}
```
Note: for the Points path, add a confirm dialog before `mutateAsync` using the app's dialog primitive (per the no-native-confirm rule) — match the confirm pattern used by `redeem_reward`'s screen in the marketplace page.

- [ ] **Step 2: Add route to `App.tsx`**

```tsx
import EventDetailScreen from './pages/EventDetailScreen'
        <Route path="/events/:name" element={<EventDetailScreen />} />
```

- [ ] **Step 3: Verify build**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/EventDetailScreen.tsx frontend/src/App.tsx
git commit -m "feat(events): /m event detail + register (free/points/rupiah)"
```

---

### Task E3: My Registrations screen

**Files:**
- Create: `frontend/src/pages/MyRegistrationsScreen.tsx`
- Modify: `frontend/src/App.tsx` (route); add a link from the Me screen or Events header.

**Interfaces:**
- Consumes: `useMyRegistrations` (D2).

- [ ] **Step 1: Write `MyRegistrationsScreen.tsx`** (DetailScreen list of the user's registrations, showing status + method; reuse the card + Pill pattern from E1). Empty state icon `Ticket`, title "No registrations yet".

- [ ] **Step 2: Add route** `/my-registrations` to `App.tsx` and a link row on the Me screen (mirror E1 Step 3).

- [ ] **Step 3: Verify build**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/MyRegistrationsScreen.tsx frontend/src/App.tsx frontend/src/pages/MeScreen.tsx
git commit -m "feat(events): /m my-registrations screen"
```

---

## Phase F — Web `/w` screens (`frontend-web/src`)

### Task F1: Events list page + route + nav

**Files:**
- Create: `frontend-web/src/pages/Events.tsx`
- Modify: `frontend-web/src/App.tsx` (route inside `<Route element={<AppShell />}>`)
- Modify: `frontend-web/src/lib/nav.ts` (nav leaf)

**Interfaces:**
- Consumes: SHARED `useEvents` from `@/hooks/useData`, `EventItem` from `@/lib/types`. Web primitives from `@web`.

- [ ] **Step 1: Write `Events.tsx`** (flat-Notion, reuses the shared hook):

```tsx
import { useNavigate } from 'react-router-dom'
import { CalendarDays } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { ErrorState } from '@web/components/ui'
import { useEvents } from '@/hooks/useData'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable } from '@web/components/DataTable'
import type { EventItem } from '@/lib/types'

function price(e: EventItem) {
  if (e.pricing === 'Free') return 'Free'
  if (e.pricing === 'Points') return `${e.points_cost ?? 0} pts`
  return `Rp ${(e.price ?? 0).toLocaleString('id-ID')}`
}

export default function Events() {
  const navigate = useNavigate()
  const q = useEvents()
  if (q.isLoading) return <div className="flex justify-center py-20"><Spinner /></div>
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />
  const list = q.data ?? []
  return (
    <Page>
      <PageHeader icon={CalendarDays} title="Events" />
      <DataTable
        rows={list}
        columns={[
          { key: 'title', header: 'Event', sortValue: (e) => e.title,
            render: (e) => <span className="font-medium text-ink">{e.title}</span> },
          { key: 'start', header: 'When', sortValue: (e) => e.start_datetime,
            render: (e) => <span className="text-muted">{new Date(e.start_datetime).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span> },
          { key: 'price', header: 'Price', render: (e) => <span className="text-muted">{price(e)}</span> },
          { key: 'status', header: '', render: (e) => e.my_status === 'Confirmed' ? <span className="text-brand-600">Joined</span> : e.is_full ? <span className="text-muted">Full</span> : null },
        ]}
        getKey={(e) => e.name}
        onRowClick={(e) => navigate(`/events/${encodeURIComponent(e.name)}`)}
      />
    </Page>
  )
}
```

- [ ] **Step 2: Add route to web `App.tsx`** (inside AppShell, ungated):

```tsx
import Events from '@web/pages/Events'
          <Route path="/events" element={<Events />} />
```

- [ ] **Step 3: Add nav leaf in `nav.ts`** — add to an existing group (e.g. REWARDS) or a new group:

```tsx
{ to: '/events', label: 'Events', sub: 'Browse & register', icon: CalendarDays },
```
(Import `CalendarDays` from lucide-react in nav.ts.)

- [ ] **Step 4: Verify build**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build
```
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/Events.tsx frontend-web/src/App.tsx frontend-web/src/lib/nav.ts
git commit -m "feat(events): /w events list page + nav"
```

---

### Task F2: Web event detail + register

**Files:**
- Create: `frontend-web/src/pages/EventDetail.tsx`
- Modify: `frontend-web/src/App.tsx` (route `/events/:name`)

**Interfaces:**
- Consumes: `useEvent`, `useRegisterEvent` (`@/hooks/useData`), `snapPay` (`@/lib/snap`). Web shell (`Page`, `Section`, `Property`). Confirm via web dialog (no native confirm).

- [ ] **Step 1: Write `EventDetail.tsx`** — flat-Notion detail: `Page` + `PageHeader`, `Section`/`Property` rows for when/location/price/registered, and a register button reusing the exact `onRegister` async flow from E2 Step 1 (register → if Pending+snap_token → `snapPay` → refetch). Reuse `@/hooks` verbatim; only the presentation is `@web`.

- [ ] **Step 2: Add route** `/events/:name` to web `App.tsx` (import `EventDetail` from `@web/pages/EventDetail`).

- [ ] **Step 3: Verify build**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/pages/EventDetail.tsx frontend-web/src/App.tsx
git commit -m "feat(events): /w event detail + register"
```

---

### Task F3: Web My Registrations page

**Files:**
- Create: `frontend-web/src/pages/MyRegistrations.tsx`
- Modify: `frontend-web/src/App.tsx` (route); `frontend-web/src/lib/nav.ts` (leaf `/my-registrations`).

**Interfaces:**
- Consumes: `useMyRegistrations` (`@/hooks/useData`).

- [ ] **Step 1: Write `MyRegistrations.tsx`** — `Page` + `DataTable` of the user's registrations (columns: event title, when, method, status). Reuse the F1 shape.

- [ ] **Step 2: Add route** `/my-registrations` to web `App.tsx` + a nav leaf in `nav.ts` (same group as Events).

- [ ] **Step 3: Verify build**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/pages/MyRegistrations.tsx frontend-web/src/App.tsx frontend-web/src/lib/nav.ts
git commit -m "feat(events): /w my-registrations page"
```

---

## Phase G — Config, deploy, tests

### Task G1: Configure Midtrans (sandbox) + webhook URL

**Files:** none (runtime config).

- [ ] **Step 1: Set sandbox keys** on Vernon Settings (get real sandbox keys from the Midtrans dashboard):

```bash
bench --site project.vernon.id console <<'PY'
import frappe
s = frappe.get_single("Vernon Settings")
s.midtrans_client_key = "SB-Mid-client-XXXX"
s.midtrans_server_key = "SB-Mid-server-XXXX"
s.midtrans_is_production = 0
s.save(ignore_permissions=True)
frappe.db.commit()
print("saved")
PY
```

- [ ] **Step 2: Register the webhook URL** in the Midtrans dashboard (Settings → Configuration → Payment Notification URL):
```
https://project.vernon.id/api/method/vernon_project.api.events.midtrans_notify
```

- [ ] **Step 3: Verify Snap token creation now works** — rerun Task C1 Step 2's console snippet; expect a real `snap_token` in the returned dict.

- [ ] **Step 4: Commit** — nothing to commit (runtime config); note completion.

---

### Task G2: Tests (deferred per live-site convention)

**Files:**
- Create: `vernon_project/api/test_events.py`

**Interfaces:** covers the three risk areas from the spec: points debit, capacity race, webhook signature + idempotency.

- [ ] **Step 1: Write `test_events.py`** with `FrappeTestCase` cases:
  1. `test_points_registration_debits_balance` — grant a user N points, register a Points event costing K, assert `_user_balance` drops by exactly K and a second register raises "already registered".
  2. `test_capacity_enforced` — capacity=1 event, first register Confirmed, second register raises "full".
  3. `test_insufficient_points_rejected` — cost > balance raises "Insufficient balance", no registration row created.
  4. `test_webhook_signature_and_idempotency` — build a valid sha512 signature, assert bad signature raises `PermissionError`, valid `settlement` flips Pending→Confirmed, replay is a no-op (still Confirmed, no duplicate side effects), and an amount mismatch raises.

- [ ] **Step 2: Run**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_events
```
Expected: all pass. (Roll back any inserted docs in `tearDown`.)

- [ ] **Step 3: Commit**

```bash
git add vernon_project/api/test_events.py
git commit -m "test(events): points debit, capacity, webhook signature+idempotency"
```

---

### Task G3: Deploy + manual smoke

**Files:** none (deploy).

- [ ] **Step 1: Full deploy**

```bash
cd /home/frappe/frappe-bench
bench --site project.vernon.id migrate
bench restart
( cd apps/vernon_project/frontend && npm run build )
( cd apps/vernon_project/frontend-web && npm run build )
```

- [ ] **Step 2: Manual smoke (as System Manager, in Desk):** create one Published event of each pricing (Free, Points, Rupiah with a small price).

- [ ] **Step 3: Manual smoke (as a normal user):**
  - `/m`: Me → Events → open Free event → Register → shows Joined; open Points event → confirm → Joined + balance dropped; open Rupiah event → Snap popup → complete sandbox payment → returns, and within seconds My Registrations shows Confirmed (webhook).
  - `/w`: TopNav → Events → same three flows.
  - Verify My Registrations lists all three on both apps.

- [ ] **Step 4:** Nothing to commit; deployment complete.

---

## Self-Review

**Spec coverage:**
- Two doctypes (Event, Event Registration) → A1, A2. ✓
- Organizer = host user, defaults to creator → A1 controller. ✓
- Free / Points / Rupiah pricing → A1 fields; B3 (free+points), C1 (rupiah). ✓
- Points debit reuses wallet model (no negative Point Ledger) → B3 `_user_balance` extension + register Points branch. ✓
- Rupiah via Midtrans Snap + webhook, idempotent, signature-verified → B1, C1, C2. ✓
- Config on Vernon Settings (not site_config), server_key never exposed → A3, B1 (`pay_config` returns client_key only). ✓
- Capacity enforced, one active reg per (event,user) → B3 (`_capacity_ok`, `_existing_active`) under advisory lock. ✓
- Both `/m` and `/w`, shared data layer → D1–D3 shared; E1–E3 mobile; F1–F3 web. ✓
- Published-only listing → B2 filters. ✓
- My Registrations → B2, E3, F3. ✓
- No native confirm → E2/F2 note the dialog primitive. ✓
- Tests deferred to final phase → G2. ✓
- Out-of-scope (refunds, waitlist, guest reg, recurring, check-in) → not built. ✓

**Placeholder scan:** No TBD/TODO. E3/F2/F3 describe pages by "mirror the E1/F1 shape" rather than repeating full code — acceptable because the full pattern is given verbatim in the referenced sibling task within this same plan and the shells are near-identical; each still lists exact files, imports, hooks, and a verify+commit step.

**Type consistency:** `EventItem` (not `Event`, to dodge the DOM global) used consistently across types.ts, api.ts, hooks, and both frontends. `eventsApi.{list,get,register,mine,payConfig}` names match between D1 and D2/D3 consumers. `register()` return shape (`RegisterResult`) matches the Python return in B3/C1. `midtrans_order_id` = registration docname is consistent between C1 (sets it) and C2 (looks up by it).

**Known ceilings (ponytail):**
- Registrations are read only via whitelisted API, so `Event Registration` has System-Manager-only perms — if a future feature needs `/api/resource` access for users, add a row-level `has_permission`. 
- Points refund on cancel is out of scope; cancelling a Points registration currently would strand the debit (no cancel flow is built in v1 — cancellation is manual in Desk, and manual un-cancel/refund is a Desk edit).
