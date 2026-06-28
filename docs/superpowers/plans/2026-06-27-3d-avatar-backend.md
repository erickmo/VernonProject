# 3D Avatar — Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the avatar data model, cosmetic catalog, ownership/marketplace logic, and per-user save (with snapshot→identity), all API-testable without any 3D asset.

**Architecture:** Two new doctypes (`Avatar Item`, `User Avatar`) plus one link field on the existing `Marketplace Reward`. Ownership reuses `Reward Redemption` (no new ownership doctype). New whitelisted methods in `api/mobile.py` serve the catalog, the user's config, and a validated save that writes the composed snapshot PNG to `User.user_image` so the existing image-based identity propagates everywhere. This plan is the backend half; the three.js renderer, customizer UI, marketplace UI, and the actual GLB asset files are **Plan 2**.

**Tech Stack:** Frappe (Python doctypes + whitelisted API), MariaDB. No frontend in this plan.

## Global Constraints

- **Live site, no test DB.** Site = `project.vernon.id`. Per project convention, formal tests are deferred to the final task; each implementation task is verified with `bench execute` of a dotted function (NOT `bench console` piping — piping multi-line for-loops to console silently mis-parses).
- **Deploy mechanics:** doctype/schema changes require `bench --site project.vernon.id migrate`; Python changes require `bench restart`. (Frontend npm build is Plan 2 only.)
- **Module** for all new doctypes: `Vernon Project`. modules.txt already registers it.
- **Shared asset URL convention:** GLB `model_url` values are absolute `/assets/vernon_project/models/<file>.glb` — served from the app's shared `public/models/`, fetched identically by both `/m` and `/w`. The files themselves are delivered in Plan 2; in this plan `model_url` is just a string.
- **Identity image field** is `User.user_image` (boot returns it at `api/mobile.py:614`; leaderboard/comments read it). The snapshot writes here.
- **No native alert/confirm** is a frontend rule — N/A to this backend plan, but error messages thrown here surface in a dialog later, so keep them short and human.
- **Git hygiene:** the user works this repo in parallel on `main`. Create a branch first (`feat/3d-avatar-backend`, or an isolated worktree via superpowers:using-git-worktrees at execution time). Commit per task, `git add` only the specific files this plan creates/modifies — never `git add -A`.
- **Reuse, don't duplicate:** `_user_balance`, `redeem_reward`, `save_file`, `MAX_IMAGE_BYTES`, `_require_marketplace_manager` already exist in `api/mobile.py`. Use them.

---

## Task 1: `Avatar Item` doctype (cosmetic/base catalog)

**Files:**
- Create: `vernon_project/vernon_project/doctype/avatar_item/__init__.py` (empty)
- Create: `vernon_project/vernon_project/doctype/avatar_item/avatar_item.json`
- Create: `vernon_project/vernon_project/doctype/avatar_item/avatar_item.py`

**Interfaces:**
- Produces: doctype `Avatar Item` with fields `item_name` (name), `slot` (`Base`/`Hat`/`Face`), `model_url`, `socket`, `thumbnail`, `is_default`, `active`. `validate()` requires a socket for Hat/Face and clears it for Base.

- [ ] **Step 1: Create the empty package init**

`vernon_project/vernon_project/doctype/avatar_item/__init__.py` — empty file.

- [ ] **Step 2: Create the doctype JSON**

`vernon_project/vernon_project/doctype/avatar_item/avatar_item.json`:

```json
{
 "actions": [],
 "allow_rename": 1,
 "autoname": "field:item_name",
 "creation": "2026-06-27 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": ["item_name","slot","active","is_default","column_break_a","model_url","socket","thumbnail"],
 "fields": [
  {"fieldname":"item_name","fieldtype":"Data","label":"Item Name","reqd":1,"unique":1,"in_list_view":1},
  {"fieldname":"slot","fieldtype":"Select","label":"Slot","options":"Base\nHat\nFace","reqd":1,"in_list_view":1},
  {"fieldname":"active","fieldtype":"Check","label":"Active","default":"1","in_list_view":1},
  {"fieldname":"is_default","fieldtype":"Check","label":"Default (free for all)","default":"0","in_list_view":1},
  {"fieldname":"column_break_a","fieldtype":"Column Break"},
  {"fieldname":"model_url","fieldtype":"Data","label":"Model URL (GLB path)"},
  {"fieldname":"socket","fieldtype":"Data","label":"Socket (anchor node)"},
  {"fieldname":"thumbnail","fieldtype":"Attach Image","label":"Thumbnail"}
 ],
 "image_field":"thumbnail",
 "index_web_pages_for_search":1,
 "links":[],
 "modified":"2026-06-27 00:00:00.000000",
 "modified_by":"Administrator",
 "module":"Vernon Project",
 "name":"Avatar Item",
 "naming_rule":"By fieldname",
 "owner":"Administrator",
 "permissions":[
  {"role":"System Manager","create":1,"delete":1,"email":1,"export":1,"print":1,"read":1,"report":1,"share":1,"write":1},
  {"role":"Marketplace Manager","create":1,"delete":1,"email":1,"export":1,"print":1,"read":1,"report":1,"share":1,"write":1}
 ],
 "row_format":"Dynamic",
 "sort_field":"modified",
 "sort_order":"DESC",
 "states":[]
}
```

- [ ] **Step 3: Create the controller**

`vernon_project/vernon_project/doctype/avatar_item/avatar_item.py`:

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class AvatarItem(Document):
	def validate(self):
		if self.slot in ("Hat", "Face") and not self.socket:
			frappe.throw("Socket is required for Hat/Face items")
		if self.slot == "Base":
			self.socket = None
```

- [ ] **Step 4: Migrate and verify the doctype exists**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate`
Then: `bench --site project.vernon.id execute frappe.db.exists --kwargs "{'dt':'DocType','dn':'Avatar Item'}"`
Expected: prints `Avatar Item` (truthy).

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/doctype/avatar_item
git commit -m "feat(avatar): Avatar Item doctype (cosmetic/base catalog)"
```

---

## Task 2: `User Avatar` doctype (per-user equipped config + snapshot)

**Files:**
- Create: `vernon_project/vernon_project/doctype/user_avatar/__init__.py` (empty)
- Create: `vernon_project/vernon_project/doctype/user_avatar/user_avatar.json`
- Create: `vernon_project/vernon_project/doctype/user_avatar/user_avatar.py`

**Interfaces:**
- Produces: doctype `User Avatar`, one row per user (`autoname = field:user`, `user` unique). Fields `base`/`hat`/`face` (Link → Avatar Item), `skin_color`, `accent_color` (hex strings), `snapshot` (Attach Image). Ownership/slot validation lives in the API (Task 5), not the controller, because it needs session + ownership context.

- [ ] **Step 1: Create the empty package init**

`vernon_project/vernon_project/doctype/user_avatar/__init__.py` — empty file.

- [ ] **Step 2: Create the doctype JSON**

`vernon_project/vernon_project/doctype/user_avatar/user_avatar.json`:

```json
{
 "actions": [],
 "allow_rename": 0,
 "autoname": "field:user",
 "creation": "2026-06-27 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": ["user","base","hat","face","column_break_a","skin_color","accent_color","snapshot"],
 "fields": [
  {"fieldname":"user","fieldtype":"Link","label":"User","options":"User","reqd":1,"unique":1,"in_list_view":1},
  {"fieldname":"base","fieldtype":"Link","label":"Base","options":"Avatar Item","reqd":1},
  {"fieldname":"hat","fieldtype":"Link","label":"Hat","options":"Avatar Item"},
  {"fieldname":"face","fieldtype":"Link","label":"Face","options":"Avatar Item"},
  {"fieldname":"column_break_a","fieldtype":"Column Break"},
  {"fieldname":"skin_color","fieldtype":"Data","label":"Skin Color"},
  {"fieldname":"accent_color","fieldtype":"Data","label":"Accent Color"},
  {"fieldname":"snapshot","fieldtype":"Attach Image","label":"Snapshot"}
 ],
 "image_field":"snapshot",
 "index_web_pages_for_search":1,
 "links":[],
 "modified":"2026-06-27 00:00:00.000000",
 "modified_by":"Administrator",
 "module":"Vernon Project",
 "name":"User Avatar",
 "naming_rule":"By fieldname",
 "owner":"Administrator",
 "permissions":[
  {"role":"System Manager","create":1,"delete":1,"email":1,"export":1,"print":1,"read":1,"report":1,"share":1,"write":1}
 ],
 "row_format":"Dynamic",
 "sort_field":"modified",
 "sort_order":"DESC",
 "states":[]
}
```

- [ ] **Step 3: Create the controller**

`vernon_project/vernon_project/doctype/user_avatar/user_avatar.py`:

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class UserAvatar(Document):
	pass
```

- [ ] **Step 4: Migrate and verify**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate`
Then: `bench --site project.vernon.id execute frappe.db.exists --kwargs "{'dt':'DocType','dn':'User Avatar'}"`
Expected: prints `User Avatar`.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/doctype/user_avatar
git commit -m "feat(avatar): User Avatar doctype (per-user config + snapshot)"
```

---

## Task 3: Link cosmetics into the marketplace (`Marketplace Reward.avatar_item`)

**Files:**
- Modify: `vernon_project/vernon_project/doctype/marketplace_reward/marketplace_reward.json`

**Interfaces:**
- Produces: optional `avatar_item` (Link → Avatar Item) on `Marketplace Reward`. When set, redeeming that reward grants ownership of the item. Existing non-cosmetic rewards leave it empty and behave unchanged.

- [ ] **Step 1: Add `avatar_item` to `field_order`**

In `marketplace_reward.json`, change the `field_order` array's tail from:

```json
  "image", "description"
```
to:
```json
  "image", "description", "avatar_item"
```

- [ ] **Step 2: Add the field definition**

In the `"fields"` array, after the `description` field object, add:

```json
  ,{"fieldname": "avatar_item", "fieldtype": "Link", "label": "Avatar Item", "options": "Avatar Item"}
```

- [ ] **Step 3: Migrate and verify the column exists**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate`
Then: `bench --site project.vernon.id execute frappe.db.has_column --kwargs "{'doctype':'Marketplace Reward','column':'avatar_item'}"`
Expected: prints `True`.

- [ ] **Step 4: Commit**

```bash
git add vernon_project/vernon_project/doctype/marketplace_reward/marketplace_reward.json
git commit -m "feat(avatar): link Avatar Item from Marketplace Reward"
```

---

## Task 4: Catalog + ownership + read API

**Files:**
- Modify: `vernon_project/vernon_project/api/mobile.py` (append a new section at end of file)

**Interfaces:**
- Consumes: existing `frappe`, `_user_balance` (not needed here), `Reward Redemption`, `Marketplace Reward`, `Avatar Item`, `User Avatar`.
- Produces:
  - `_avatar_owned_items(user) -> set[str]` — owned Avatar Item names.
  - `_my_avatar_config(user) -> dict` — `{base, hat, face, skin_color, accent_color, snapshot}`; defaults when no row.
  - `get_avatar_catalog() -> {items: [...], my: {...}}` — each item dict has `name, item_name, slot, model_url, socket, thumbnail, owned: bool, price: float|None, reward: str|None`.
  - `get_my_avatar() -> dict` — same shape as `_my_avatar_config`.
  - module constants `DEFAULT_SKIN`, `DEFAULT_ACCENT`.

- [ ] **Step 1: Append the section to `api/mobile.py`**

```python
# --------------------------------------------------------------------------------
# Avatar — customizable 3D avatar config + cosmetic catalog/ownership.
# Ownership = default items + items granted by a redeemed Marketplace Reward.
# The composed PNG snapshot is written to User.user_image (the identity image).
# --------------------------------------------------------------------------------

DEFAULT_SKIN = "#E8B894"
DEFAULT_ACCENT = "#6366F1"


def _avatar_owned_items(user):
	"""Set of Avatar Item names the user owns: every active default item, plus
	items granted by a Marketplace Reward the user has redeemed."""
	owned = set(
		frappe.get_all("Avatar Item", filters={"is_default": 1, "active": 1}, pluck="name")
	)
	redeemed = frappe.get_all("Reward Redemption", filters={"user": user}, pluck="reward")
	if redeemed:
		linked = frappe.get_all(
			"Marketplace Reward",
			filters={"name": ["in", list(set(redeemed))], "avatar_item": ["is", "set"]},
			fields=["avatar_item"],
		)
		owned.update(r["avatar_item"] for r in linked if r.get("avatar_item"))
	return owned


def _my_avatar_config(user):
	"""Current equipped config, or sensible defaults if the user has no row yet."""
	name = frappe.db.exists("User Avatar", {"user": user})
	if not name:
		base = frappe.db.get_value(
			"Avatar Item", {"slot": "Base", "is_default": 1, "active": 1}, "name"
		)
		return {
			"base": base, "hat": None, "face": None,
			"skin_color": DEFAULT_SKIN, "accent_color": DEFAULT_ACCENT, "snapshot": None,
		}
	return frappe.db.get_value(
		"User Avatar", name,
		["base", "hat", "face", "skin_color", "accent_color", "snapshot"],
		as_dict=True,
	)


@frappe.whitelist()
def get_avatar_catalog():
	"""Active catalog with per-item ownership + price, plus the caller's config."""
	user = frappe.session.user
	owned = _avatar_owned_items(user)
	items = frappe.get_all(
		"Avatar Item",
		filters={"active": 1},
		fields=["name", "item_name", "slot", "model_url", "socket", "thumbnail"],
		order_by="slot asc, item_name asc",
	)
	priced = frappe.get_all(
		"Marketplace Reward",
		filters={"active": 1, "avatar_item": ["is", "set"]},
		fields=["name", "avatar_item", "point_cost"],
	)
	price_map = {p["avatar_item"]: p for p in priced}
	for it in items:
		is_owned = it["name"] in owned
		it["owned"] = is_owned
		p = price_map.get(it["name"])
		it["price"] = float(p["point_cost"]) if (p and not is_owned) else None
		it["reward"] = p["name"] if (p and not is_owned) else None
	return {"items": items, "my": _my_avatar_config(user)}


@frappe.whitelist()
def get_my_avatar():
	return _my_avatar_config(frappe.session.user)
```

- [ ] **Step 2: Restart so the new methods load**

Run: `cd /home/frappe/frappe-bench && bench restart`

- [ ] **Step 3: Verify the catalog endpoint runs (empty catalog is fine)**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id execute vernon_project.api.mobile.get_avatar_catalog`
Expected: prints `{'items': [], 'my': {...}}` — no exception. (`my.base` is None until items are seeded.)

- [ ] **Step 4: Commit**

```bash
git add vernon_project/vernon_project/api/mobile.py
git commit -m "feat(avatar): catalog + ownership + read API"
```

---

## Task 5: `save_my_avatar` — validated save + snapshot→identity

**Files:**
- Modify: `vernon_project/vernon_project/api/mobile.py` (append after Task 4's section)

**Interfaces:**
- Consumes: `_avatar_owned_items`, `_my_avatar_config`, `DEFAULT_SKIN`, `DEFAULT_ACCENT`, existing `MAX_IMAGE_BYTES`, `save_file`.
- Produces:
  - `save_my_avatar(config, snapshot_dataurl=None) -> dict` — validates each equipped item is owned and slot-correct (Base required), upserts the `User Avatar` row, and (if a PNG data-URL is given) writes the snapshot File + sets `User.user_image`. Returns the saved `_my_avatar_config`.
  - `_save_snapshot(user, dataurl) -> str|None` — decode/persist helper; returns the file URL or None on malformed input.

- [ ] **Step 1: Append the save methods**

```python
@frappe.whitelist()
def save_my_avatar(config, snapshot_dataurl=None):
	"""Persist the caller's avatar. Server is the source of truth: every equipped
	item must be owned and in the right slot, or the save is rejected."""
	import json as _json

	user = frappe.session.user
	if isinstance(config, str):
		config = _json.loads(config)

	owned = _avatar_owned_items(user)

	def _check(item, want_slot):
		if not item:
			return None
		if item not in owned:
			frappe.throw("You don't own that item", frappe.ValidationError)
		if frappe.db.get_value("Avatar Item", item, "slot") != want_slot:
			frappe.throw(f"That item is not a {want_slot}", frappe.ValidationError)
		return item

	base = _check(config.get("base"), "Base")
	if not base:
		frappe.throw("Base style is required", frappe.ValidationError)
	hat = _check(config.get("hat"), "Hat")
	face = _check(config.get("face"), "Face")

	name = frappe.db.exists("User Avatar", {"user": user})
	doc = frappe.get_doc("User Avatar", name) if name else frappe.new_doc("User Avatar")
	doc.user = user
	doc.base = base
	doc.hat = hat
	doc.face = face
	doc.skin_color = (config.get("skin_color") or DEFAULT_SKIN)[:9]
	doc.accent_color = (config.get("accent_color") or DEFAULT_ACCENT)[:9]

	if snapshot_dataurl:
		url = _save_snapshot(user, snapshot_dataurl)
		if url:
			doc.snapshot = url
			frappe.db.set_value("User", user, "user_image", url)

	doc.save(ignore_permissions=True)
	return _my_avatar_config(user)


def _save_snapshot(user, dataurl):
	"""Decode a `data:image/png;base64,...` URL, save as a public File, return its
	URL. Returns None on malformed input so the config still saves."""
	import base64
	from frappe.utils.file_manager import save_file

	try:
		header, b64 = dataurl.split(",", 1)
		if "image/png" not in header:
			return None
		content = base64.b64decode(b64)
		if len(content) > MAX_IMAGE_BYTES:
			frappe.throw("Snapshot too large")
		saved = save_file(f"avatar-{frappe.scrub(user)}.png", content, "User", user, is_private=0)
		return saved.file_url
	except frappe.ValidationError:
		raise
	except Exception:
		return None
```

- [ ] **Step 2: Restart**

Run: `cd /home/frappe/frappe-bench && bench restart`

- [ ] **Step 3: Verify rejection of an unowned item**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id execute vernon_project.api.mobile.save_my_avatar --kwargs "{'config': {'base': 'Nonexistent'}}" 2>&1 | tail -3
```
Expected: a ValidationError "You don't own that item" (no row written). Full happy-path save is verified in Task 7 after seeding.

- [ ] **Step 4: Commit**

```bash
git add vernon_project/vernon_project/api/mobile.py
git commit -m "feat(avatar): save_my_avatar with ownership/slot validation + snapshot->identity"
```

---

## Task 6: Seed the catalog (idempotent helper + run)

**Files:**
- Modify: `vernon_project/vernon_project/api/mobile.py` (append `seed_avatar_catalog`)

**Interfaces:**
- Consumes: `Avatar Item`, `Marketplace Reward`.
- Produces: `seed_avatar_catalog() -> dict` — idempotent. Creates the v1 Avatar Items and, for priced ones, a linked Marketplace Reward (with stock). Safe to re-run. `model_url` paths point at `/assets/vernon_project/models/...` (files delivered in Plan 2). Returns counts.

- [ ] **Step 1: Append the seed function**

```python
# v1 avatar catalog. model_url files are bundled in Plan 2 (frontend); the paths
# are stable and shared by both SPAs at /assets/vernon_project/models/.
AVATAR_SEED = [
	{"item_name": "Human",   "slot": "Base", "is_default": 1, "model_url": "/assets/vernon_project/models/base_human.glb",   "socket": None,        "price": None},
	{"item_name": "Cat",     "slot": "Base", "is_default": 0, "model_url": "/assets/vernon_project/models/base_cat.glb",     "socket": None,        "price": 200},
	{"item_name": "Cap",     "slot": "Hat",  "is_default": 1, "model_url": "/assets/vernon_project/models/hat_cap.glb",      "socket": "head_top",  "price": None},
	{"item_name": "Crown",   "slot": "Hat",  "is_default": 0, "model_url": "/assets/vernon_project/models/hat_crown.glb",    "socket": "head_top",  "price": 500},
	{"item_name": "Glasses", "slot": "Face", "is_default": 0, "model_url": "/assets/vernon_project/models/face_glasses.glb", "socket": "face",      "price": 150},
]


def seed_avatar_catalog():
	"""Idempotent: create v1 Avatar Items + a linked Marketplace Reward for each
	priced one. Re-running updates model_url/socket/default flags in place."""
	created_items, created_rewards = 0, 0
	for s in AVATAR_SEED:
		if frappe.db.exists("Avatar Item", s["item_name"]):
			frappe.db.set_value("Avatar Item", s["item_name"], {
				"slot": s["slot"], "is_default": s["is_default"],
				"model_url": s["model_url"], "socket": s["socket"], "active": 1,
			})
		else:
			frappe.get_doc({
				"doctype": "Avatar Item",
				"item_name": s["item_name"], "slot": s["slot"],
				"is_default": s["is_default"], "model_url": s["model_url"],
				"socket": s["socket"], "active": 1,
			}).insert(ignore_permissions=True)
			created_items += 1

		if s["price"] is not None:
			reward_name = f"Avatar: {s['item_name']}"
			if not frappe.db.exists("Marketplace Reward", reward_name):
				frappe.get_doc({
					"doctype": "Marketplace Reward",
					"reward_name": reward_name, "point_cost": s["price"],
					"stock_quantity": 9999, "active": 1, "avatar_item": s["item_name"],
					"description": f"Unlock the {s['item_name']} avatar item.",
				}).insert(ignore_permissions=True)
				created_rewards += 1
			else:
				frappe.db.set_value("Marketplace Reward", reward_name, {
					"avatar_item": s["item_name"], "point_cost": s["price"], "active": 1,
				})
	frappe.db.commit()
	return {"created_items": created_items, "created_rewards": created_rewards}
```

- [ ] **Step 2: Restart, then run the seed**

Run: `cd /home/frappe/frappe-bench && bench restart`
Then: `bench --site project.vernon.id execute vernon_project.api.mobile.seed_avatar_catalog`
Expected: prints `{'created_items': 5, 'created_rewards': 3}` (first run).

- [ ] **Step 3: Verify catalog reflects ownership**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id execute vernon_project.api.mobile.get_avatar_catalog`
Expected: 5 items. `Human` and `Cap` (`is_default`) → `owned: True, price: None`. `Cat`/`Crown`/`Glasses` → `owned: False` with `price` 200/500/150 and a `reward` name. `my.base` = `Human`.

- [ ] **Step 4: Commit**

```bash
git add vernon_project/vernon_project/api/mobile.py
git commit -m "feat(avatar): idempotent v1 catalog seed"
```

---

## Task 7: Tests (final phase, per live-site convention)

**Files:**
- Create: `vernon_project/vernon_project/doctype/user_avatar/test_user_avatar.py`

**Interfaces:**
- Consumes: all of the above. Uses Frappe's `FrappeTestCase`. Mirrors existing `test_project_todo.py` style (hermetic: creates its own fixtures, cleans up).

- [ ] **Step 1: Write the test module**

`vernon_project/vernon_project/doctype/user_avatar/test_user_avatar.py`:

```python
# Copyright (c) 2026, Vernon and contributors
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_project.api.mobile import (
	_avatar_owned_items, get_avatar_catalog, save_my_avatar, _my_avatar_config,
)

USER = "Administrator"


def _mk_item(name, slot, is_default=0, socket=None):
	if frappe.db.exists("Avatar Item", name):
		return name
	frappe.get_doc({
		"doctype": "Avatar Item", "item_name": name, "slot": slot,
		"is_default": is_default, "active": 1, "socket": socket,
		"model_url": f"/assets/vernon_project/models/{name}.glb",
	}).insert(ignore_permissions=True)
	return name


class TestUserAvatar(FrappeTestCase):
	def setUp(self):
		frappe.set_user(USER)
		_mk_item("T Human", "Base", is_default=1)
		_mk_item("T Cap", "Hat", is_default=1, socket="head_top")
		_mk_item("T Crown", "Hat", socket="head_top")  # not default → locked

	def test_default_items_are_owned(self):
		owned = _avatar_owned_items(USER)
		self.assertIn("T Human", owned)
		self.assertIn("T Cap", owned)
		self.assertNotIn("T Crown", owned)

	def test_catalog_marks_locked_item(self):
		cat = get_avatar_catalog()
		by_name = {i["name"]: i for i in cat["items"]}
		self.assertTrue(by_name["T Human"]["owned"])
		self.assertFalse(by_name["T Crown"]["owned"])

	def test_save_rejects_unowned(self):
		with self.assertRaises(frappe.ValidationError):
			save_my_avatar({"base": "T Human", "hat": "T Crown"})

	def test_save_rejects_slot_mismatch(self):
		with self.assertRaises(frappe.ValidationError):
			save_my_avatar({"base": "T Cap"})  # Cap is a Hat, not a Base

	def test_save_happy_path_persists(self):
		save_my_avatar({"base": "T Human", "hat": "T Cap", "skin_color": "#112233"})
		cfg = _my_avatar_config(USER)
		self.assertEqual(cfg["base"], "T Human")
		self.assertEqual(cfg["hat"], "T Cap")
		self.assertEqual(cfg["skin_color"], "#112233")

	def test_snapshot_sets_identity_image(self):
		# 1x1 transparent PNG
		png = ("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC"
			"AAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=")
		save_my_avatar({"base": "T Human"}, snapshot_dataurl=png)
		img = frappe.db.get_value("User", USER, "user_image") or ""
		self.assertIn("avatar-administrator", img)  # identity now points at the snapshot
```

- [ ] **Step 2: Run the tests**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.vernon_project.doctype.user_avatar.test_user_avatar`
Expected: all tests pass. (If the site lacks a test DB and tests can't run, fall back to the per-task `bench execute` verifications already done and note it — per the live-site convention.)

- [ ] **Step 3: Commit**

```bash
git add vernon_project/vernon_project/doctype/user_avatar/test_user_avatar.py
git commit -m "test(avatar): ownership, slot validation, save, snapshot identity"
```

---

## Done / handoff to Plan 2

After this plan: catalog, ownership, save, and snapshot→identity all work and are API-verified. **Plan 2** adds the three.js renderer + customizer + marketplace UI on `/m` and `/w`, and delivers the actual GLB files into `vernon_project/public/models/` at the `model_url` paths seeded here (plus socket normalization of `head_top` / `face`).
