# DiceBear 2D Avatar — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Repurpose the avatar backend from 3D GLB items to DiceBear options: an `Avatar Item` becomes a premium `(style, slot, option_value)`; `User Avatar` stores a `config_json`; the API serves the premium catalog + ownership and validates saves; re-seed premium DiceBear items.

**Architecture:** Additive doctype changes on our own low-data doctypes, plus a rewrite of the avatar section of `vernon_project/api/mobile.py`. Ownership/marketplace/redeem/snapshot logic is reused unchanged. Free DiceBear options live only client-side (not in the DB); only premium options are `Avatar Item` rows.

**Tech Stack:** Frappe (Python doctypes + whitelisted API), MariaDB. DiceBear is frontend-only (Plan 2) — this plan stores opaque style/slot/value strings.

## Global Constraints

- **Live site, no test DB.** Site = `project.vernon.id`; run bench from `/home/frappe/frappe-bench`. Per project convention, formal tests are a final task; each task is verified with `bench --site project.vernon.id execute <dotted.fn>` (NOT `bench console` piping multi-line for-loops — they silently mis-parse).
- **Reload:** `bench restart` needs sudo and fails here; reload Python with `kill -HUP $(pgrep -f 'gunicorn' | sort -n | head -1)`. `bench execute` runs fresh Python so verification works without reload.
- **Module** `Vernon Project`. Python = TABs; doctype JSON = 1-space (Frappe convention).
- **DiceBear v9** is the frontend renderer (Plan 2). Backend stores: `style` ∈ {`lorelei`,`adventurer`,`notionists`}; `slot` = the exact DiceBear option key (lowercase camelCase, e.g. `hair`,`glasses`,`earrings`,`hairAccessories`,`gesture`); `option_value` = a variant id (e.g. `long26`,`variant05`,`flowers`).
- **Premium identity:** a premium attribute is the triple `(style, slot, option_value)`. Ownership = `_avatar_owned_items` (default items + redeemed-reward `avatar_item`s) — unchanged.
- **config_json shape:** `{"style":"lorelei","options":{"hair":["variant48"],"eyes":["variant02"],"skinColor":["f2d3b1"],...}}` (DiceBear passes each option as an array).
- **Git:** on `main`, user works in parallel. `git add` only the specific files each task changes (never `-A`). Review each commit as `SHA^..SHA`.
- **Reuse, don't duplicate:** `_avatar_owned_items`, `_save_snapshot`, `redeem_reward`, `save_file`, `MAX_IMAGE_BYTES` already exist in `mobile.py`.

---

## Task 1: `Avatar Item` — add `style`/`option_value`, repurpose `slot`

**Files:**
- Modify: `vernon_project/vernon_project/doctype/avatar_item/avatar_item.json`
- Modify: `vernon_project/vernon_project/doctype/avatar_item/avatar_item.py`

**Interfaces:**
- Produces: `Avatar Item` with `style` (Data), `slot` (Data = DiceBear option key), `option_value` (Data), plus existing `item_name`/`is_default`/`active`/`thumbnail`. `model_url`/`socket` remain (nullable, unused). Controller no longer requires a socket.

- [ ] **Step 1: Edit the JSON fields**

In `avatar_item.json`: change `slot` from a `Select` to `Data`, and add `style` + `option_value`. Set `field_order` to:
```json
 "field_order": ["item_name","style","slot","option_value","active","is_default","column_break_a","model_url","socket","thumbnail"],
```
Replace the `slot` field object and add the two new ones so the `fields` array contains:
```json
  {"fieldname":"item_name","fieldtype":"Data","label":"Item Name","reqd":1,"unique":1,"in_list_view":1},
  {"fieldname":"style","fieldtype":"Data","label":"DiceBear Style","in_list_view":1},
  {"fieldname":"slot","fieldtype":"Data","label":"DiceBear Slot (option key)","in_list_view":1},
  {"fieldname":"option_value","fieldtype":"Data","label":"Option Value (variant id)","in_list_view":1},
  {"fieldname":"active","fieldtype":"Check","label":"Active","default":"1","in_list_view":1},
  {"fieldname":"is_default","fieldtype":"Check","label":"Default (free for all)","default":"0"},
  {"fieldname":"column_break_a","fieldtype":"Column Break"},
  {"fieldname":"model_url","fieldtype":"Data","label":"(deprecated) Model URL"},
  {"fieldname":"socket","fieldtype":"Data","label":"(deprecated) Socket"},
  {"fieldname":"thumbnail","fieldtype":"Attach Image","label":"Thumbnail"}
```
(Keep the rest of the JSON — autoname `field:item_name`, module, permissions — unchanged.)

- [ ] **Step 2: Simplify the controller (drop socket validation)**

Replace `avatar_item.py` body with:
```python
# Copyright (c) 2026, Vernon and contributors

from frappe.model.document import Document


class AvatarItem(Document):
	pass
```

- [ ] **Step 3: Migrate + verify the columns**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate`
Then: `bench --site project.vernon.id execute frappe.db.has_column --kwargs "{'doctype':'Avatar Item','column':'option_value'}"`
Expected: `True`. Also check `style`: same command with `'column':'style'` → `True`.

- [ ] **Step 4: Commit**

```bash
git add vernon_project/vernon_project/doctype/avatar_item
git commit -m "feat(avatar): Avatar Item = (style, slot, option_value) for DiceBear"
```

---

## Task 2: `User Avatar` — add `config_json`

**Files:**
- Modify: `vernon_project/vernon_project/doctype/user_avatar/user_avatar.json`

**Interfaces:**
- Produces: `User Avatar` with a new `config_json` (Long Text) field holding the DiceBear selection. Existing `snapshot` kept; `base`/`hat`/`face`/`skin_color`/`accent_color` remain (nullable, unused).

- [ ] **Step 1: Add the field**

In `user_avatar.json`, add `config_json` to `field_order` (after `user`) and add to `fields`:
```json
  {"fieldname":"config_json","fieldtype":"Long Text","label":"Avatar Config (JSON)"},
```

- [ ] **Step 2: Migrate + verify**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate`
Then: `bench --site project.vernon.id execute frappe.db.has_column --kwargs "{'doctype':'User Avatar','column':'config_json'}"`
Expected: `True`.

- [ ] **Step 3: Commit**

```bash
git add vernon_project/vernon_project/doctype/user_avatar/user_avatar.json
git commit -m "feat(avatar): User Avatar config_json for DiceBear selection"
```

---

## Task 3: Rewrite the avatar API for DiceBear

**Files:**
- Modify: `vernon_project/vernon_project/api/mobile.py` (the avatar section — replace `_my_avatar_config`, `get_avatar_catalog`, `get_my_avatar`, `save_my_avatar`; keep `_avatar_owned_items`, `_save_snapshot`, constants)

**Interfaces:**
- Consumes: `_avatar_owned_items(user) -> set`, `_save_snapshot(user, dataurl)`, `MAX_IMAGE_BYTES`.
- Produces:
  - `DEFAULT_AVATAR = {"style": "lorelei", "options": {}}`.
  - `_premium_index() -> dict` mapping `(style, slot, option_value)` → Avatar Item name (active only).
  - `_my_avatar_config(user) -> dict` — parsed `config_json` or `DEFAULT_AVATAR`.
  - `get_avatar_catalog() -> {premium:[{name,item_name,style,slot,option_value,thumbnail,owned,price,reward}], my:<config>}`.
  - `get_my_avatar() -> dict` (the config).
  - `save_my_avatar(config_json, snapshot_dataurl=None) -> dict` — validates premium ownership per selected option, persists `config_json` + snapshot→`User.user_image`, returns the saved config.

- [ ] **Step 1: Replace the avatar functions**

Find the existing avatar section in `mobile.py` (constants `DEFAULT_SKIN`/`DEFAULT_ACCENT`, `_avatar_owned_items`, `_my_avatar_config`, `get_avatar_catalog`, `get_my_avatar`, `save_my_avatar`, `_save_snapshot`, `AVATAR_SEED`, `seed_avatar_catalog`). KEEP `_avatar_owned_items` and `_save_snapshot` as-is. REPLACE `_my_avatar_config`, `get_avatar_catalog`, `get_my_avatar`, `save_my_avatar` (and the old `DEFAULT_SKIN`/`DEFAULT_ACCENT` may stay unused) with:

```python
import json as _json

DEFAULT_AVATAR = {"style": "lorelei", "options": {}}
ALLOWED_STYLES = ("lorelei", "adventurer", "notionists")


def _premium_index():
	"""Map (style, slot, option_value) -> Avatar Item name, active items only.
	A selected option is 'premium' iff it appears here; everything else is free."""
	idx = {}
	for it in frappe.get_all(
		"Avatar Item",
		filters={"active": 1},
		fields=["name", "style", "slot", "option_value"],
	):
		idx[(it["style"], it["slot"], it["option_value"])] = it["name"]
	return idx


def _my_avatar_config(user):
	raw = frappe.db.get_value("User Avatar", {"user": user}, "config_json")
	if not raw:
		return dict(DEFAULT_AVATAR)
	try:
		cfg = _json.loads(raw)
	except Exception:
		return dict(DEFAULT_AVATAR)
	if cfg.get("style") not in ALLOWED_STYLES:
		cfg["style"] = DEFAULT_AVATAR["style"]
	if not isinstance(cfg.get("options"), dict):
		cfg["options"] = {}
	return cfg


@frappe.whitelist()
def get_avatar_catalog():
	"""Premium attribute catalog (with ownership + price) + the caller's config.
	Free options are not listed — the client derives them from the DiceBear schema."""
	user = frappe.session.user
	owned = _avatar_owned_items(user)
	items = frappe.get_all(
		"Avatar Item",
		filters={"active": 1},
		fields=["name", "item_name", "style", "slot", "option_value", "thumbnail"],
		order_by="style asc, slot asc, item_name asc",
	)
	priced = frappe.get_all(
		"Marketplace Reward",
		filters={"active": 1, "avatar_item": ["is", "set"]},
		fields=["name", "avatar_item", "point_cost"],
		order_by="point_cost asc",
	)
	price_map = {}
	for p in priced:
		price_map.setdefault(p["avatar_item"], p)  # first (cheapest) wins
	premium = []
	for it in items:
		is_owned = it["name"] in owned
		p = price_map.get(it["name"])
		it["owned"] = is_owned
		it["price"] = float(p["point_cost"]) if (p and not is_owned) else None
		it["reward"] = p["name"] if (p and not is_owned) else None
		premium.append(it)
	return {"premium": premium, "my": _my_avatar_config(user)}


@frappe.whitelist()
def get_my_avatar():
	return _my_avatar_config(frappe.session.user)


@frappe.whitelist()
def save_my_avatar(config_json, snapshot_dataurl=None):
	"""Persist the caller's DiceBear config. Any selected option that is a premium
	Avatar Item must be owned, or the save is rejected."""
	user = frappe.session.user
	cfg = _json.loads(config_json) if isinstance(config_json, str) else config_json
	style = cfg.get("style")
	if style not in ALLOWED_STYLES:
		frappe.throw("Unknown avatar style", frappe.ValidationError)
	options = cfg.get("options") or {}
	if not isinstance(options, dict):
		frappe.throw("Invalid avatar options", frappe.ValidationError)

	owned = _avatar_owned_items(user)
	premium = _premium_index()
	for slot, vals in options.items():
		values = vals if isinstance(vals, list) else [vals]
		for v in values:
			pname = premium.get((style, slot, v))
			if pname and pname not in owned:
				frappe.throw("You don't own that item", frappe.ValidationError)

	clean = {"style": style, "options": options}
	name = frappe.db.exists("User Avatar", {"user": user})
	doc = frappe.get_doc("User Avatar", name) if name else frappe.new_doc("User Avatar")
	doc.user = user
	doc.config_json = _json.dumps(clean)

	url = None
	if snapshot_dataurl:
		url = _save_snapshot(user, snapshot_dataurl)
		if url:
			doc.snapshot = url
	doc.save(ignore_permissions=True)
	if url:
		frappe.db.set_value("User", user, "user_image", url)
	return _my_avatar_config(user)
```

- [ ] **Step 2: Reload + verify it runs (pre-seed, empty premium)**

Run: `cd /home/frappe/frappe-bench && kill -HUP $(pgrep -f 'gunicorn' | sort -n | head -1)`
Then: `bench --site project.vernon.id execute vernon_project.api.mobile.get_avatar_catalog`
Expected: `{'premium': [], 'my': {'style': 'lorelei', 'options': {}}}` — no exception.

- [ ] **Step 3: Verify save accepts a free option**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id execute "frappe.get_attr('vernon_project.api.mobile.save_my_avatar')" --kwargs "{'config_json': '{\"style\":\"lorelei\",\"options\":{\"hair\":[\"variant10\"]}}'}"
```
Expected: returns the saved config `{'style':'lorelei','options':{'hair':['variant10']}}` (free option, no premium → accepted).

- [ ] **Step 4: Commit**

```bash
git add vernon_project/vernon_project/api/mobile.py
git commit -m "feat(avatar): DiceBear catalog/config/save API (premium-ownership validated)"
```

---

## Task 4: Re-seed premium DiceBear items

**Files:**
- Modify: `vernon_project/vernon_project/api/mobile.py` (replace `AVATAR_SEED` + `seed_avatar_catalog`)

**Interfaces:**
- Produces: `seed_avatar_catalog() -> dict` — idempotent; deletes old GLB-era Avatar Items + their rewards, creates DiceBear premium items + linked `Marketplace Reward`s. Returns counts.

- [ ] **Step 1: Replace the seed**

Replace the old `AVATAR_SEED`/`seed_avatar_catalog` with (the `option_value`s below are verified-valid DiceBear v9 variant ids):

```python
# Premium DiceBear attributes sold in the marketplace. style/slot/value are real
# DiceBear v9 variant ids. is_default items are free for everyone.
AVATAR_SEED = [
	{"item_name": "Adventurer Long Hair", "style": "adventurer", "slot": "hair",            "option_value": "long26",   "is_default": 0, "price": 150},
	{"item_name": "Adventurer Glasses",   "style": "adventurer", "slot": "glasses",         "option_value": "variant05", "is_default": 0, "price": 120},
	{"item_name": "Adventurer Earrings",  "style": "adventurer", "slot": "earrings",        "option_value": "variant06", "is_default": 0, "price": 100},
	{"item_name": "Lorelei Fancy Hair",   "style": "lorelei",    "slot": "hair",            "option_value": "variant48", "is_default": 0, "price": 150},
	{"item_name": "Lorelei Flowers",      "style": "lorelei",    "slot": "hairAccessories", "option_value": "flowers",   "is_default": 0, "price": 200},
	{"item_name": "Notionists Phone",     "style": "notionists", "slot": "gesture",         "option_value": "handPhone", "is_default": 0, "price": 90},
]


def seed_avatar_catalog():
	"""Idempotent re-seed of premium DiceBear items + their marketplace rewards.
	Removes any old GLB-era items (those with a model_url and no style)."""
	# clean up old GLB-era items + their rewards (old rows have no style)
	old = frappe.get_all("Avatar Item", filters={"style": ["is", "not set"]}, pluck="name")
	for nm in old:
		for rw in frappe.get_all("Marketplace Reward", filters={"avatar_item": nm}, pluck="name"):
			frappe.delete_doc("Marketplace Reward", rw, ignore_permissions=True, force=True)
		frappe.delete_doc("Avatar Item", nm, ignore_permissions=True, force=True)

	created_items, created_rewards = 0, 0
	for s in AVATAR_SEED:
		if frappe.db.exists("Avatar Item", s["item_name"]):
			frappe.db.set_value("Avatar Item", s["item_name"], {
				"style": s["style"], "slot": s["slot"], "option_value": s["option_value"],
				"is_default": s["is_default"], "active": 1,
			})
		else:
			frappe.get_doc({
				"doctype": "Avatar Item", "item_name": s["item_name"],
				"style": s["style"], "slot": s["slot"], "option_value": s["option_value"],
				"is_default": s["is_default"], "active": 1,
			}).insert(ignore_permissions=True)
			created_items += 1
		if s.get("price") is not None:
			reward_name = f"Avatar: {s['item_name']}"
			if not frappe.db.exists("Marketplace Reward", reward_name):
				frappe.get_doc({
					"doctype": "Marketplace Reward", "reward_name": reward_name,
					"point_cost": s["price"], "stock_quantity": 9999, "active": 1,
					"avatar_item": s["item_name"],
					"description": f"Unlock the {s['item_name']} avatar attribute.",
				}).insert(ignore_permissions=True)
				created_rewards += 1
			else:
				frappe.db.set_value("Marketplace Reward", reward_name, {
					"avatar_item": s["item_name"], "point_cost": s["price"], "active": 1,
				})
	frappe.db.commit()
	return {"created_items": created_items, "created_rewards": created_rewards}
```

- [ ] **Step 2: Reload, run the seed, verify**

```bash
cd /home/frappe/frappe-bench && kill -HUP $(pgrep -f 'gunicorn' | sort -n | head -1)
bench --site project.vernon.id execute vernon_project.api.mobile.seed_avatar_catalog
```
Expected: `{'created_items': 6, 'created_rewards': 6}` (first run; idempotent re-run → `0, 0`).
Then: `bench --site project.vernon.id execute vernon_project.api.mobile.get_avatar_catalog`
Expected: 6 premium items, all `owned: False` with `price` set (150/120/100/150/200/90) and a `reward` name; `my.style == 'lorelei'`.
Then confirm avatar rewards are hidden from the generic marketplace:
`bench --site project.vernon.id execute vernon_project.api.mobile.get_marketplace` → no `"Avatar: ..."` entries.

- [ ] **Step 3: Commit**

```bash
git add vernon_project/vernon_project/api/mobile.py
git commit -m "feat(avatar): seed premium DiceBear marketplace items"
```

---

## Task 5: Tests (final phase)

**Files:**
- Modify: `vernon_project/vernon_project/doctype/user_avatar/test_user_avatar.py` (replace with DiceBear-model tests)

**Interfaces:**
- Consumes: `get_avatar_catalog`, `save_my_avatar`, `_my_avatar_config`, `_premium_index`.

- [ ] **Step 1: Replace the test module**

`test_user_avatar.py`:
```python
# Copyright (c) 2026, Vernon and contributors
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_project.api.mobile import (
	get_avatar_catalog, save_my_avatar, _my_avatar_config, _premium_index,
)

USER = "Administrator"


def _mk_premium(name, style, slot, value, is_default=0):
	if frappe.db.exists("Avatar Item", name):
		frappe.db.set_value("Avatar Item", name, {
			"style": style, "slot": slot, "option_value": value,
			"is_default": is_default, "active": 1})
		return name
	frappe.get_doc({
		"doctype": "Avatar Item", "item_name": name, "style": style,
		"slot": slot, "option_value": value, "is_default": is_default, "active": 1,
	}).insert(ignore_permissions=True)
	return name


class TestUserAvatar(FrappeTestCase):
	def setUp(self):
		frappe.set_user(USER)
		_mk_premium("T Lorelei Flowers", "lorelei", "hairAccessories", "flowers")  # premium, not owned
		_mk_premium("T Free Default Hair", "lorelei", "hair", "variant01", is_default=1)  # free/owned

	def test_premium_index_maps_triple(self):
		idx = _premium_index()
		self.assertEqual(idx.get(("lorelei", "hairAccessories", "flowers")), "T Lorelei Flowers")

	def test_catalog_marks_premium_unowned(self):
		cat = get_avatar_catalog()
		by_name = {i["name"]: i for i in cat["premium"]}
		self.assertIn("T Lorelei Flowers", by_name)
		self.assertFalse(by_name["T Lorelei Flowers"]["owned"])

	def test_save_allows_free_option(self):
		save_my_avatar('{"style":"lorelei","options":{"eyes":["variant03"]}}')
		cfg = _my_avatar_config(USER)
		self.assertEqual(cfg["style"], "lorelei")
		self.assertEqual(cfg["options"]["eyes"], ["variant03"])

	def test_save_rejects_unowned_premium(self):
		with self.assertRaises(frappe.ValidationError):
			save_my_avatar('{"style":"lorelei","options":{"hairAccessories":["flowers"]}}')

	def test_save_rejects_unknown_style(self):
		with self.assertRaises(frappe.ValidationError):
			save_my_avatar('{"style":"bogus","options":{}}')

	def test_snapshot_sets_identity_image(self):
		png = ("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC"
			"AAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=")
		before = frappe.db.get_value("User", USER, "user_image") or ""
		save_my_avatar('{"style":"lorelei","options":{}}', snapshot_dataurl=png)
		img = frappe.db.get_value("User", USER, "user_image") or ""
		self.assertNotEqual(img, before)
		self.assertIn("avatar-administrator", img)
```

- [ ] **Step 2: Run the tests**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.vernon_project.doctype.user_avatar.test_user_avatar`
Expected: all pass. (If the live site can't run tests, fall back to the per-task `bench execute` verifications and note it.)

- [ ] **Step 3: Commit**

```bash
git add vernon_project/vernon_project/doctype/user_avatar/test_user_avatar.py
git commit -m "test(avatar): DiceBear premium ownership + config persistence"
```

---

## Done / handoff to Plan 2

Backend now stores DiceBear configs + premium `(style, slot, value)` items, validates ownership, and serves the catalog. **Plan 2** swaps the frontend: add `@dicebear/core@9` + `@dicebear/collection@9`, remove three/r3f/drei + GLBs + `public/models/`, build the `DiceBearAvatar` SVG component + the rewritten customizer (style picker + per-slot variant pickers + color swatches + premium buy) on `/m` and `/w`, snapshot via `html-to-image`, and redeploy (light build — no swap).
