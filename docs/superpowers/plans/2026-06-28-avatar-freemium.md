# Avatar Freemium — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Make the first 3 variants per slot free and the rest premium (5000 pts each, per-tile buy, previewable), with server-enforced unlocks and friendly "Style N" labels + mini-preview thumbnails.

**Architecture:** Rule-based free/premium (`AVATAR_FREE` map = first-3 per style/slot) + a new `Avatar Unlock` doctype for purchases; `buy_avatar_option` charges a flat price; `save_my_avatar` rejects unowned premium; the frontend marks index≥3 variants premium, previews on tap, buys per tile.

**Tech Stack:** Frappe (Python API + doctype), React + DiceBear (SVG), TanStack Query.

## Global Constraints

- **Live site, no test DB.** Site `project.vernon.id`; bench from `/home/frappe/frappe-bench`. Per-task verify via `bench --site project.vernon.id execute` (NOT `bench console` piping for-loops). Tests = final task.
- **Reload:** `kill -HUP $(pgrep -f 'gunicorn' | sort -n | head -1)` (`bench restart` needs sudo). `bench execute`/run-tests use fresh Python.
- **Git:** on `main`, user works in parallel + may have pre-staged work in the index. Commit with EXPLICIT PATHSPEC: `git commit <paths> -m ...` (never `git add -A`/bare commit). Review each commit as `SHA^..SHA`.
- **Free rule:** a value is FREE iff `value ∈ AVATAR_FREE[style][slot]` (slots absent from the map — colors, `*Probability` — are always free). Premium = any other value for a mapped slot. Price = `PREMIUM_PRICE = 5000`.
- **Frontend free-by-index ↔ backend free-by-value** agree because both use the same DiceBear v9 enum order (first 3). Pinned to the installed v9.
- **Module** `Vernon Project`; Python TABs; doctype JSON 1-space.
- **No native alert/confirm** — use dialog/Toast. Reuse `_user_balance`, `redeem_reward`'s lock pattern, `_save_snapshot`.

---

## Task 1: `AVATAR_FREE` map + `_is_free` + price (backend)

**Files:** Modify `vernon_project/api/mobile.py` (avatar section).

**Interfaces:**
- Produces: `AVATAR_FREE` dict, `PREMIUM_PRICE = 5000`, `_is_free(style, slot, value) -> bool`.

- [ ] **Step 1: Add the map + helper**

In the avatar section of `mobile.py`, add:
```python
# First-3 free variants per (style, slot); 4th+ are premium. Generated from the
# installed DiceBear v9 enums (same order the frontend introspects).
AVATAR_FREE = {
	"lorelei": {"hair": ["variant48", "variant47", "variant46"], "eyes": ["variant24", "variant23", "variant22"], "eyebrows": ["variant13", "variant12", "variant11"], "mouth": ["happy01", "happy02", "happy03"], "glasses": ["variant01", "variant02", "variant03"], "earrings": ["variant01", "variant02", "variant03"], "nose": ["variant01", "variant02", "variant03"], "hairAccessories": ["flowers"]},
	"adventurer": {"hair": ["short16", "short15", "short14"], "eyes": ["variant26", "variant25", "variant24"], "eyebrows": ["variant10", "variant09", "variant08"], "mouth": ["variant30", "variant29", "variant28"], "glasses": ["variant01", "variant02", "variant03"], "earrings": ["variant06", "variant01", "variant02"], "features": ["mustache", "blush", "birthmark"]},
	"notionists": {"hair": ["variant63", "variant62", "variant61"], "eyes": ["variant05", "variant04", "variant03"], "brows": ["variant13", "variant12", "variant11"], "lips": ["variant30", "variant29", "variant28"], "glasses": ["variant11", "variant10", "variant09"], "nose": ["variant20", "variant19", "variant18"], "gesture": ["wavePointLongArms", "waveOkLongArms", "waveLongArms"]},
}
PREMIUM_PRICE = 5000


def _is_free(style, slot, value):
	"""A value is free iff it's a first-3 variant of a premium-checked slot.
	Slots not in the map (colors, *Probability) are always free."""
	slot_free = AVATAR_FREE.get(style, {}).get(slot)
	if slot_free is None:
		return True
	return value in slot_free
```

- [ ] **Step 2: Reload + verify**

```bash
cd /home/frappe/frappe-bench && kill -HUP $(pgrep -f 'gunicorn' | sort -n | head -1)
bench --site project.vernon.id execute "frappe.get_attr('vernon_project.api.mobile._is_free')" --kwargs "{'style':'lorelei','slot':'hair','value':'variant48'}"
bench --site project.vernon.id execute "frappe.get_attr('vernon_project.api.mobile._is_free')" --kwargs "{'style':'lorelei','slot':'hair','value':'variant10'}"
```
Expected: first prints `True` (free), second `False` (premium). (A color slot like `skinColor` → True.)

- [ ] **Step 3: Commit**

`git commit vernon_project/api/mobile.py -m "feat(avatar): AVATAR_FREE map + _is_free + PREMIUM_PRICE"`

---

## Task 2: `Avatar Unlock` doctype

**Files:** Create `vernon_project/vernon_project/doctype/avatar_unlock/{__init__.py, avatar_unlock.json, avatar_unlock.py}`.

**Interfaces:**
- Produces: `Avatar Unlock` (user, style, slot, option_value, cost, unlocked_on).

- [ ] **Step 1: `__init__.py`** — empty file.

- [ ] **Step 2: `avatar_unlock.json`**

```json
{
 "actions": [],
 "allow_rename": 0,
 "autoname": "hash",
 "creation": "2026-06-28 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": ["user","style","slot","option_value","cost","unlocked_on"],
 "fields": [
  {"fieldname":"user","fieldtype":"Link","label":"User","options":"User","reqd":1,"in_list_view":1},
  {"fieldname":"style","fieldtype":"Data","label":"Style","reqd":1,"in_list_view":1},
  {"fieldname":"slot","fieldtype":"Data","label":"Slot","reqd":1,"in_list_view":1},
  {"fieldname":"option_value","fieldtype":"Data","label":"Option Value","reqd":1,"in_list_view":1},
  {"fieldname":"cost","fieldtype":"Float","label":"Cost"},
  {"fieldname":"unlocked_on","fieldtype":"Datetime","label":"Unlocked On"}
 ],
 "index_web_pages_for_search":1,
 "links":[],
 "modified":"2026-06-28 00:00:00.000000",
 "modified_by":"Administrator",
 "module":"Vernon Project",
 "name":"Avatar Unlock",
 "naming_rule":"Random",
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

- [ ] **Step 3: `avatar_unlock.py`**

```python
# Copyright (c) 2026, Vernon and contributors

from frappe.model.document import Document


class AvatarUnlock(Document):
	pass
```

- [ ] **Step 4: Migrate + verify**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate
bench --site project.vernon.id execute frappe.db.exists --kwargs "{'dt':'DocType','dn':'Avatar Unlock'}"
```
Expected: prints `Avatar Unlock`.

- [ ] **Step 5: Commit**

`git commit vernon_project/vernon_project/doctype/avatar_unlock -m "feat(avatar): Avatar Unlock doctype"`

---

## Task 3: balance + buy + save-validation + catalog (backend)

**Files:** Modify `vernon_project/api/mobile.py`.

**Interfaces:**
- Consumes: `_user_balance`, `_is_free`, `AVATAR_FREE`, `PREMIUM_PRICE`, `_my_avatar_config`, `now_datetime`.
- Produces: `_avatar_owned_options(user) -> set`, `buy_avatar_option(style, slot, value)`, updated `_user_balance` (subtracts unlock cost), updated `save_my_avatar` (premium validation), updated `get_avatar_catalog` (`{free_count, price, unlocked, my, balance}`).

- [ ] **Step 1: Subtract unlock spend in `_user_balance`**

Find `_user_balance`. After it computes `redeemed`, add unlock spend and include it in the balance. The function currently returns `(earned, redeemed, balance)` with `balance = earned - redeemed`. Change to also subtract unlocks:
```python
	unlocked = frappe.db.sql(
		"select coalesce(sum(cost),0) from `tabAvatar Unlock` where user=%s", user
	)[0][0] or 0
	balance = earned - redeemed - float(unlocked)
```
(Keep the return signature `(earned, redeemed, balance)`; `redeemed` unchanged — only `balance` now nets unlocks.)

- [ ] **Step 2: Owned-options helper + buy endpoint**

Add:
```python
def _avatar_owned_options(user):
	rows = frappe.get_all("Avatar Unlock", filters={"user": user},
		fields=["style", "slot", "option_value"])
	return {(r["style"], r["slot"], r["option_value"]) for r in rows}


@frappe.whitelist()
def buy_avatar_option(style, slot, value):
	"""Unlock one premium variant for PREMIUM_PRICE. Row-locked per user so
	concurrent buys can't overspend."""
	user = frappe.session.user
	if _is_free(style, slot, value):
		frappe.throw("That option is free", frappe.ValidationError)
	if frappe.db.exists("Avatar Unlock", {"user": user, "style": style, "slot": slot, "option_value": value}):
		_, _, bal = _user_balance(user)
		return {"balance": bal}
	lock_key = f"vernon_avatar_buy:{user}"
	if not frappe.db.sql("select get_lock(%s, 10)", lock_key)[0][0]:
		frappe.throw("Busy, please retry", frappe.ValidationError)
	try:
		if frappe.db.exists("Avatar Unlock", {"user": user, "style": style, "slot": slot, "option_value": value}):
			_, _, bal = _user_balance(user)
			return {"balance": bal}
		_, _, balance = _user_balance(user)
		if balance < PREMIUM_PRICE:
			frappe.throw("Insufficient balance", frappe.ValidationError)
		frappe.get_doc({
			"doctype": "Avatar Unlock", "user": user, "style": style, "slot": slot,
			"option_value": value, "cost": PREMIUM_PRICE, "unlocked_on": now_datetime(),
		}).insert(ignore_permissions=True)
		_, _, new_balance = _user_balance(user)
		return {"balance": new_balance}
	finally:
		frappe.db.sql("select release_lock(%s)", lock_key)
```

- [ ] **Step 3: Premium validation in `save_my_avatar`**

In `save_my_avatar`, replace the existing premium-ownership loop (the one using `_premium_index`) with the new free/unlock check:
```python
	owned = _avatar_owned_options(user)
	for slot, vals in options.items():
		if slot not in AVATAR_FREE.get(style, {}):
			continue  # color/probability/unmapped slots are always free
		values = vals if isinstance(vals, list) else [vals]
		for v in values:
			if not _is_free(style, slot, v) and (style, slot, v) not in owned:
				frappe.throw("Unlock that item first", frappe.ValidationError)
```
(Leave the rest of `save_my_avatar` — config persist, snapshot, `doc.base=doc.hat=doc.face=None`, `user_image` — unchanged.)

- [ ] **Step 4: Update `get_avatar_catalog`**

Replace `get_avatar_catalog` body with:
```python
@frappe.whitelist()
def get_avatar_catalog():
	user = frappe.session.user
	_, _, balance = _user_balance(user)
	unlocked = [
		{"style": s, "slot": sl, "option_value": v}
		for (s, sl, v) in _avatar_owned_options(user)
	]
	return {
		"free_count": 3, "price": PREMIUM_PRICE, "unlocked": unlocked,
		"my": _my_avatar_config(user), "balance": balance,
	}
```
(`_premium_index` may stay defined but unused.)

- [ ] **Step 5: Reload + verify**

```bash
cd /home/frappe/frappe-bench && kill -HUP $(pgrep -f 'gunicorn' | sort -n | head -1)
bench --site project.vernon.id execute vernon_project.api.mobile.get_avatar_catalog
bench --site project.vernon.id execute "frappe.get_attr('vernon_project.api.mobile.save_my_avatar')" --kwargs "{'config_json': '{\"style\":\"lorelei\",\"options\":{\"hair\":[\"variant10\"]}}'}"
```
Expected: catalog returns `{free_count:3, price:5000, unlocked:[], my:{...}, balance:<n>}`. The save call **rejects** with "Unlock that item first" (variant10 is premium, not owned). A save with `variant48` (free) would succeed.

- [ ] **Step 6: Commit**

`git commit vernon_project/api/mobile.py -m "feat(avatar): buy_avatar_option + premium save-validation + balance + catalog"`

---

## Task 4: retire old premium seed (backend)

**Files:** Modify `vernon_project/api/mobile.py` (`seed_avatar_catalog`).

- [ ] **Step 1: Replace the seed to remove old premium rows**

Replace `seed_avatar_catalog` (and the now-unused `AVATAR_SEED`) with:
```python
def seed_avatar_catalog():
	"""Freemium model uses rule-based premium + Avatar Unlock — no premium
	Avatar Item rows. Remove any previously-seeded ones + their rewards."""
	removed = 0
	for nm in frappe.get_all("Avatar Item", pluck="name"):
		for rw in frappe.get_all("Marketplace Reward", filters={"avatar_item": nm}, pluck="name"):
			frappe.delete_doc("Marketplace Reward", rw, ignore_permissions=True, force=True)
		frappe.delete_doc("Avatar Item", nm, ignore_permissions=True, force=True)
		removed += 1
	frappe.db.commit()
	return {"removed_items": removed}
```

- [ ] **Step 2: Reload, run, verify**

```bash
cd /home/frappe/frappe-bench && kill -HUP $(pgrep -f 'gunicorn' | sort -n | head -1)
bench --site project.vernon.id execute vernon_project.api.mobile.seed_avatar_catalog
bench --site project.vernon.id execute frappe.client.get_count --kwargs "{'doctype':'Avatar Item'}"
```
Expected: removes the 6 (re-run → 0); Avatar Item count → 0.

- [ ] **Step 3: Commit**

`git commit vernon_project/api/mobile.py -m "feat(avatar): retire enumerated premium items (freemium is rule-based)"`

---

## Task 5: frontend styles helpers + api/hooks/types

**Files:** Modify `frontend/src/avatar/styles.ts`, `frontend/src/lib/types.ts`, `frontend/src/lib/api.ts`, `frontend/src/hooks/useData.ts`.

**Interfaces:**
- Produces: `PREMIUM_FREE_COUNT = 3`, `variantLabel(index) -> "Style N"`; `AvatarCatalog` gains `unlocked: {style,slot,option_value}[]`, `price`, `free_count`, `balance` (drop `premium`); `mobileApi.buyAvatarOption(style,slot,value)`; `useBuyAvatarOption` hook.

- [ ] **Step 1: `styles.ts`**

Add:
```ts
export const PREMIUM_FREE_COUNT = 3
export function variantLabel(index: number): string {
  return `Style ${index + 1}`
}
```

- [ ] **Step 2: `types.ts`**

Replace `PremiumItem`/the old `AvatarCatalog` with:
```ts
export interface AvatarUnlock { style: string; slot: string; option_value: string }
export interface AvatarCatalog {
  free_count: number
  price: number
  balance: number
  unlocked: AvatarUnlock[]
  my: AvatarConfig
}
```

- [ ] **Step 3: `api.ts`**

Update `getAvatarCatalog` return type to `AvatarCatalog`; add:
```ts
  buyAvatarOption: (style: string, slot: string, value: string) =>
    api.post<{ balance: number }>(M + 'buy_avatar_option', { style, slot, value }),
```

- [ ] **Step 4: `useData.ts`**

Add (mirror `useSaveAvatar`'s invalidation; use real `mobileApi`/`keys`):
```ts
export function useBuyAvatarOption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ style, slot, value }: { style: string; slot: string; value: string }) =>
      mobileApi.buyAvatarOption(style, slot, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.avatarCatalog })
      qc.invalidateQueries({ queryKey: keys.boot })
    },
  })
}
```

- [ ] **Step 5: Typecheck**

`cd frontend && npx tsc --noEmit` — expect errors only in the customizer files (Task 6 rewrites them); the avatar module + data layer must be clean.

- [ ] **Step 6: Commit**

`git commit frontend/src/avatar/styles.ts frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/hooks/useData.ts -m "feat(avatar): freemium helpers + buyAvatarOption + catalog types"`

---

## Task 6: mobile customizer — premium tiles, preview, per-tile buy

**Files:** Modify `frontend/src/pages/AvatarCustomizerScreen.tsx`.

**Interfaces:**
- Consumes: `slotsForStyle`, `PREMIUM_FREE_COUNT`, `variantLabel`, `DiceBearAvatar`, `useAvatarCatalog`/`useSaveAvatar`/`useBuyAvatarOption`, catalog `{unlocked, price, balance, my}`.

- [ ] **Step 1: Rework the slot variant pickers**

For each slot from `slotsForStyle(draft.style)`, render variant tiles with `value`/`index`:
  - `isFree = index < PREMIUM_FREE_COUNT`.
  - `isOwned = isFree || catalog.unlocked.some(u => u.style===draft.style && u.slot===slot && u.option_value===value)`.
  - Tile content: a mini `<DiceBearAvatar config={{ style: draft.style, options: { ...draft.options, [slot]: [value] } }} className="h-12 w-12" />` + label `variantLabel(index)`. Premium-unowned tiles overlay 🔒 + `{catalog.price}` + a small **Buy** button.
  - Tap tile = **preview**: `setOption(slot, value)` (applies to draft; for PROB_SLOTS also set probability '100'). Works for premium too (preview only).
  - **Buy** button (premium-unowned): `await buyAvatar.mutate({style: draft.style, slot, value})` (via `useBuyAvatarOption`); on error toast `err.message` (e.g. "Insufficient balance"). On success the catalog refetches → tile becomes owned.
- Header: show `catalog.balance` points.
- **Save gating:** compute `hasUnownedPremium` = any `(slot,[v])` in draft.options where slot is a variant slot, the value's index ≥3, and not in `unlocked`. If true, disable Save (or on click toast "Unlock the 🔒 items you previewed first"). Otherwise save as today.

(To map a draft value back to its index for the gate, use `slotsForStyle(draft.style)`'s order: `values.indexOf(v)`.)

- [ ] **Step 2: Typecheck**

`cd frontend && npx tsc --noEmit` → clean.

- [ ] **Step 3: Commit**

`git commit frontend/src/pages/AvatarCustomizerScreen.tsx -m "feat(avatar): mobile freemium tiles + preview + per-tile buy"`

---

## Task 7: web customizer — same

**Files:** Modify `frontend-web/src/pages/AvatarCustomizer.tsx`.

- [ ] **Step 1: Mirror Task 6 in Bento style**

Read `frontend/src/pages/AvatarCustomizerScreen.tsx` (Task 6 result) and replicate: free/premium by index, mini-preview tiles, `variantLabel`, per-tile Buy (`useBuyAvatarOption`), balance header, Save gated on no-unowned-premium. Reuse the shared `@/avatar/*` + hooks. Buy errors via toast; never native alert.

- [ ] **Step 2: Typecheck**

`cd frontend-web && npx tsc --noEmit` → clean.

- [ ] **Step 3: Commit**

`git commit frontend-web/src/pages/AvatarCustomizer.tsx -m "feat(avatar): web freemium tiles + preview + per-tile buy"`

---

## Task 8: tests (backend)

**Files:** Modify `vernon_project/vernon_project/doctype/user_avatar/test_user_avatar.py`.

- [ ] **Step 1: Replace/extend tests**

```python
# Copyright (c) 2026, Vernon and contributors
import frappe
from frappe.tests.utils import FrappeTestCase
from vernon_project.api.mobile import (
	_is_free, buy_avatar_option, save_my_avatar, _my_avatar_config,
	_avatar_owned_options, PREMIUM_PRICE,
)

USER = "Administrator"


class TestAvatarFreemium(FrappeTestCase):
	def setUp(self):
		frappe.set_user(USER)
		# ensure Administrator can afford a 5000 unlock during the test (rolled back)
		frappe.get_doc({
			"doctype": "Point Ledger", "user": USER, "role": "Assignee",
			"points_earned": PREMIUM_PRICE + 1000, "source": "Grant",
		}).insert(ignore_permissions=True)

	def test_is_free_boundary(self):
		self.assertTrue(_is_free("lorelei", "hair", "variant48"))   # 1st
		self.assertFalse(_is_free("lorelei", "hair", "variant10"))  # premium
		self.assertTrue(_is_free("lorelei", "skinColor", "f2d3b1")) # color always free

	def test_save_rejects_unowned_premium(self):
		with self.assertRaises(frappe.ValidationError):
			save_my_avatar('{"style":"lorelei","options":{"hair":["variant10"]}}')

	def test_save_allows_free(self):
		save_my_avatar('{"style":"lorelei","options":{"hair":["variant48"]}}')
		self.assertEqual(_my_avatar_config(USER)["options"]["hair"], ["variant48"])

	def test_buy_then_save(self):
		buy_avatar_option("lorelei", "hair", "variant10")
		self.assertIn(("lorelei", "hair", "variant10"), _avatar_owned_options(USER))
		save_my_avatar('{"style":"lorelei","options":{"hair":["variant10"]}}')  # now allowed
		self.assertEqual(_my_avatar_config(USER)["options"]["hair"], ["variant10"])

	def test_buy_free_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			buy_avatar_option("lorelei", "hair", "variant48")  # free → reject
```

- [ ] **Step 2: Run**

`cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.vernon_project.doctype.user_avatar.test_user_avatar`
Expected: all pass. (If the site can't run tests, note it + rely on per-task `bench execute`.)

- [ ] **Step 3: Commit**

`git commit vernon_project/vernon_project/doctype/user_avatar/test_user_avatar.py -m "test(avatar): freemium free/premium + buy + save validation"`

---

## Task 9: build + deploy

- [ ] **Step 1: Build both (light)**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && NODE_OPTIONS=--max-old-space-size=2048 npm run build
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && NODE_OPTIONS=--max-old-space-size=2048 npm run build
```

- [ ] **Step 2: Deploy + reload**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git commit vernon_project/public/frontend vernon_project/public/frontend_web vernon_project/www/m.html vernon_project/www/w.html vernon_project/www/vernon_sw.js -m "build(avatar): deploy freemium customizer"
kill -HUP $(pgrep -f 'gunicorn' | sort -n | head -1)
```

- [ ] **Step 3: Verify**

```bash
curl -sS -o /dev/null -w "/m=%{http_code} /w=" https://project.vernon.id/m; curl -sS -o /dev/null -w "%{http_code}\n" https://project.vernon.id/w
```
Expected: both 200. Ask the user to open `/m/avatar`: first 3 variants per slot free, rest 🔒 + 5000 + Buy, preview works on tap, buying unlocks, Save blocked while previewing unowned premium.

## Done

Freemium avatar: 3 free variants per slot, the rest 5000-pt per-tile purchases, previewable, friendly "Style N" labels + mini-previews. Server-enforced.
