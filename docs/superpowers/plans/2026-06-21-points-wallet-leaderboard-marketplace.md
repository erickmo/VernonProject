# Points Wallet, Log, Leaderboard & Marketplace — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn earned points into a spendable currency surfaced across the mobile app — homepage balance, wallet log, period leaderboard (brand-filterable), and a redeemable rewards marketplace.

**Architecture:** Two new Frappe doctypes (Marketplace Reward, Reward Redemption) plus a new auto-created role (Marketplace Manager). Balance is computed live from Point Ledger (credits) minus Reward Redemption (debits); nothing is materialized. Five new whitelisted endpoints in `vernon_project/api/mobile.py` serve the React PWA. Three new DetailScreen pages (`/wallet`, `/leaderboard`, `/marketplace`) plus a balance card on Profile and a balance chip on the Today hero. Catalog CRUD + redemption fulfillment happen in Frappe Desk (Marketplace Manager role), not in the mobile app.

**Tech Stack:** Frappe (Python doctypes + whitelisted methods), React + TypeScript + Vite, TanStack React Query, Tailwind. Spec: `docs/superpowers/specs/2026-06-21-points-wallet-leaderboard-marketplace-design.md`.

## Global Constraints

- **Live site, no test DB.** Verify each task manually against `project.vernon.id`. No automated tests in this plan (deferred to a final phase, per project convention).
- **Deploy after each backend/schema task:** `bench --site project.vernon.id migrate` (new/changed doctypes), `bench --site project.vernon.id restart` or `bench restart` (Python changes). Frontend tasks: `cd frontend && npm run build` (emits hashed bundle into `vernon_project/public/frontend/assets/` + rewrites `index.html`/`www/m.html`).
- **No native `alert`/`confirm`/`prompt`.** Confirmation/feedback uses the existing sheet + Toast pattern.
- **Endpoints query with `frappe.get_all` / `frappe.db.sql`** (these ignore per-doctype read permissions), operate on `frappe.session.user`, and return plain dicts/lists — matching existing `mobile.py` conventions. Python files use **TAB** indentation (Frappe convention).
- **Balance is never negative** — server re-validates inside the redeem transaction.
- **Money/point amounts are Floats.** Snapshot `reward_name` + `point_cost` onto each redemption so catalog edits never rewrite history.
- **Leaderboard metric = earned points** (assignee + leader) in period; spending does NOT lower rank. Periods: `weekly` (ISO week Mon→today), `monthly` (calendar month, default), `all`. Top 50 + always include caller (`me`).

---

## File Structure

**Backend (create):**
- `vernon_project/vernon_project/doctype/marketplace_reward/marketplace_reward.json` + `marketplace_reward.py` + `__init__.py`
- `vernon_project/vernon_project/doctype/reward_redemption/reward_redemption.json` + `reward_redemption.py` + `__init__.py`

**Backend (modify):**
- `vernon_project/api/mobile.py` — append wallet/leaderboard/marketplace endpoints + helpers.

**Frontend (create):**
- `frontend/src/pages/WalletLogScreen.tsx`
- `frontend/src/pages/LeaderboardScreen.tsx`
- `frontend/src/pages/MarketplaceScreen.tsx`
- `frontend/src/components/RedeemSheet.tsx`

**Frontend (modify):**
- `frontend/src/lib/types.ts` — new interfaces
- `frontend/src/lib/api.ts` — new `mobileApi` methods
- `frontend/src/hooks/useData.ts` — new query keys + hooks
- `frontend/src/App.tsx` — three new routes
- `frontend/src/pages/Profile.tsx` — Rewards balance card
- `frontend/src/pages/Today.tsx` — balance chip in hero

---

## Task 1: Marketplace Reward doctype

**Files:**
- Create: `vernon_project/vernon_project/doctype/marketplace_reward/__init__.py`
- Create: `vernon_project/vernon_project/doctype/marketplace_reward/marketplace_reward.json`
- Create: `vernon_project/vernon_project/doctype/marketplace_reward/marketplace_reward.py`

**Interfaces:**
- Produces: doctype `Marketplace Reward` with fields `reward_name` (Data, autoname), `point_cost` (Float), `image` (Attach Image), `description` (Small Text), `stock_quantity` (Int), `active` (Check). Role `Marketplace Manager` (auto-created from the permission block on migrate, same way `Group Manager` exists).

- [ ] **Step 1: Create the package init**

```python
# vernon_project/vernon_project/doctype/marketplace_reward/__init__.py
```
(empty file)

- [ ] **Step 2: Create the doctype JSON**

```json
{
 "actions": [],
 "allow_rename": 1,
 "autoname": "field:reward_name",
 "creation": "2026-06-21 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": [
  "reward_name", "active", "column_break_a",
  "point_cost", "stock_quantity", "section_break_b",
  "image", "description"
 ],
 "fields": [
  {"fieldname": "reward_name", "fieldtype": "Data", "label": "Reward Name", "reqd": 1, "unique": 1, "in_list_view": 1},
  {"fieldname": "active", "fieldtype": "Check", "label": "Active", "default": "1", "in_list_view": 1},
  {"fieldname": "column_break_a", "fieldtype": "Column Break"},
  {"fieldname": "point_cost", "fieldtype": "Float", "label": "Point Cost", "reqd": 1, "in_list_view": 1},
  {"fieldname": "stock_quantity", "fieldtype": "Int", "label": "Stock Quantity", "default": "0", "in_list_view": 1},
  {"fieldname": "section_break_b", "fieldtype": "Section Break"},
  {"fieldname": "image", "fieldtype": "Attach Image", "label": "Image"},
  {"fieldname": "description", "fieldtype": "Small Text", "label": "Description"}
 ],
 "image_field": "image",
 "index_web_pages_for_search": 1,
 "links": [],
 "modified": "2026-06-21 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Marketplace Reward",
 "naming_rule": "By fieldname",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1},
  {"role": "Marketplace Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1}
 ],
 "row_format": "Dynamic",
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": []
}
```

- [ ] **Step 3: Create the controller**

```python
# vernon_project/vernon_project/doctype/marketplace_reward/marketplace_reward.py
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class MarketplaceReward(Document):
	def validate(self):
		if self.point_cost is None or self.point_cost < 0:
			frappe.throw("Point Cost must be zero or greater.")
		if self.stock_quantity is None or self.stock_quantity < 0:
			frappe.throw("Stock Quantity must be zero or greater.")
```

- [ ] **Step 4: Migrate**

Run: `bench --site project.vernon.id migrate`
Expected: completes without error; output mentions syncing `Marketplace Reward`.

- [ ] **Step 5: Verify the doctype + role exist**

Run:
```bash
bench --site project.vernon.id execute frappe.client.get_count --args '["Marketplace Reward"]'
bench --site project.vernon.id execute frappe.db.exists --kwargs '{"doctype":"Role","name":"Marketplace Manager"}'
```
Expected: count `0` (no rows yet, no error → doctype exists); the second prints `Marketplace Manager` (role auto-created).

- [ ] **Step 6: Create one reward for later UI testing (via Desk)**

Run:
```bash
bench --site project.vernon.id execute frappe.client.insert --args '[{"doctype":"Marketplace Reward","reward_name":"Coffee Voucher","point_cost":10,"stock_quantity":5,"active":1,"description":"One free coffee."}]'
```
Expected: returns the inserted doc dict with `"name": "Coffee Voucher"`.

- [ ] **Step 7: Commit**

```bash
git add vernon_project/vernon_project/doctype/marketplace_reward/
git commit -m "feat(points): Marketplace Reward doctype + Marketplace Manager role"
```

---

## Task 2: Reward Redemption doctype

**Files:**
- Create: `vernon_project/vernon_project/doctype/reward_redemption/__init__.py`
- Create: `vernon_project/vernon_project/doctype/reward_redemption/reward_redemption.json`
- Create: `vernon_project/vernon_project/doctype/reward_redemption/reward_redemption.py`

**Interfaces:**
- Consumes: `Marketplace Reward` (Link target from Task 1).
- Produces: doctype `Reward Redemption` with fields `user` (Link User), `reward` (Link Marketplace Reward), `reward_name` (Data snapshot), `point_cost` (Float snapshot), `status` (Select `Pending`/`Fulfilled`), `redeemed_on` (Datetime), `fulfilled_on` (Datetime), `note` (Small Text).

- [ ] **Step 1: Create the package init**

```python
# vernon_project/vernon_project/doctype/reward_redemption/__init__.py
```
(empty file)

- [ ] **Step 2: Create the doctype JSON**

```json
{
 "actions": [],
 "allow_rename": 0,
 "autoname": "hash",
 "creation": "2026-06-21 00:00:00.000000",
 "doctype": "DocType",
 "engine": "InnoDB",
 "field_order": [
  "user", "reward", "column_break_a",
  "reward_name", "point_cost", "section_break_b",
  "status", "redeemed_on", "fulfilled_on", "note"
 ],
 "fields": [
  {"fieldname": "user", "fieldtype": "Link", "label": "User", "options": "User", "reqd": 1, "in_list_view": 1, "search_index": 1},
  {"fieldname": "reward", "fieldtype": "Link", "label": "Reward", "options": "Marketplace Reward", "reqd": 1},
  {"fieldname": "column_break_a", "fieldtype": "Column Break"},
  {"fieldname": "reward_name", "fieldtype": "Data", "label": "Reward Name", "in_list_view": 1},
  {"fieldname": "point_cost", "fieldtype": "Float", "label": "Point Cost", "in_list_view": 1},
  {"fieldname": "section_break_b", "fieldtype": "Section Break"},
  {"fieldname": "status", "fieldtype": "Select", "label": "Status", "options": "Pending\nFulfilled", "default": "Pending", "in_list_view": 1},
  {"fieldname": "redeemed_on", "fieldtype": "Datetime", "label": "Redeemed On"},
  {"fieldname": "fulfilled_on", "fieldtype": "Datetime", "label": "Fulfilled On"},
  {"fieldname": "note", "fieldtype": "Small Text", "label": "Note"}
 ],
 "index_web_pages_for_search": 1,
 "links": [],
 "modified": "2026-06-21 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Reward Redemption",
 "naming_rule": "Random",
 "owner": "Administrator",
 "permissions": [
  {"role": "System Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1},
  {"role": "Marketplace Manager", "create": 1, "delete": 1, "email": 1, "export": 1, "print": 1, "read": 1, "report": 1, "share": 1, "write": 1}
 ],
 "row_format": "Dynamic",
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": []
}
```

- [ ] **Step 3: Create the controller**

```python
# vernon_project/vernon_project/doctype/reward_redemption/reward_redemption.py
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class RewardRedemption(Document):
	def before_save(self):
		# Stamp the fulfilment time when an admin flips status to Fulfilled.
		if self.status == "Fulfilled" and not self.fulfilled_on:
			self.fulfilled_on = now_datetime()
```

- [ ] **Step 4: Migrate**

Run: `bench --site project.vernon.id migrate`
Expected: completes without error; syncs `Reward Redemption`.

- [ ] **Step 5: Verify the doctype exists**

Run: `bench --site project.vernon.id execute frappe.client.get_count --args '["Reward Redemption"]'`
Expected: `0` with no error.

- [ ] **Step 6: Commit**

```bash
git add vernon_project/vernon_project/doctype/reward_redemption/
git commit -m "feat(points): Reward Redemption doctype"
```

---

## Task 3: Backend wallet endpoints (`get_wallet`, `get_wallet_log`)

**Files:**
- Modify: `vernon_project/api/mobile.py` (append at end of file)

**Interfaces:**
- Produces:
  - `_user_balance(user) -> (earned: float, redeemed: float, balance: float)` — internal helper used by Tasks 3 & 5.
  - `get_wallet() -> {"earned": float, "redeemed": float, "balance": float}`
  - `get_wallet_log() -> [{"kind": "credit"|"debit", "amount": float, "title": str, "subtitle": str|None, "status": str|None, "date": str|None, "date_human": str|None, "balance": float}]` (latest 100, newest first, each carrying running balance-after-transaction).

- [ ] **Step 1: Append the balance helper + wallet endpoints**

Add to the end of `vernon_project/api/mobile.py` (TAB indentation):

```python
# --------------------------------------------------------------------------------
# Points wallet — balance, transaction log
# Balance is computed live: sum(Point Ledger credits) - sum(Reward Redemption debits).
# Nothing is materialized, so there is no balance to drift out of sync.
# --------------------------------------------------------------------------------


def _user_balance(user):
	"""Return (earned, redeemed, balance) for a user as floats."""
	earned = frappe.db.sql(
		"select coalesce(sum(points_earned), 0) from `tabPoint Ledger` where user = %s",
		user,
	)[0][0]
	redeemed = frappe.db.sql(
		"select coalesce(sum(point_cost), 0) from `tabReward Redemption` where user = %s",
		user,
	)[0][0]
	earned, redeemed = float(earned), float(redeemed)
	return earned, redeemed, earned - redeemed


@frappe.whitelist()
def get_wallet():
	"""Spendable-points summary for the logged-in user."""
	earned, redeemed, balance = _user_balance(frappe.session.user)
	return {"earned": earned, "redeemed": redeemed, "balance": balance}


@frappe.whitelist()
def get_wallet_log():
	"""Unified credit/debit timeline (latest 100), newest first, with a running
	balance-after-transaction attached to each row."""
	user = frappe.session.user

	credits = frappe.get_all(
		"Point Ledger",
		filters={"user": user},
		fields=["points_earned as amount", "todo", "group", "role", "credited_on as date"],
		order_by="credited_on desc",
		limit=100,
	)
	debits = frappe.get_all(
		"Reward Redemption",
		filters={"user": user},
		fields=["point_cost", "reward_name", "status", "redeemed_on as date"],
		order_by="redeemed_on desc",
		limit=100,
	)

	# Resolve todo subjects for credit titles in one query.
	todo_ids = [c["todo"] for c in credits if c.get("todo")]
	subj = {}
	if todo_ids:
		for r in frappe.get_all(
			"Project Todo", filters={"name": ["in", todo_ids]}, fields=["name", "to_do"]
		):
			subj[r["name"]] = r["to_do"]

	rows = []
	for c in credits:
		rows.append(
			{
				"kind": "credit",
				"amount": float(c["amount"] or 0),
				"title": subj.get(c.get("todo")) or "Points earned",
				"subtitle": c.get("group") or (c.get("role") and f"{c['role']} reward"),
				"status": None,
				"date": str(c["date"]) if c.get("date") else None,
				"date_human": _humanize_datetime(c.get("date")),
			}
		)
	for d in debits:
		rows.append(
			{
				"kind": "debit",
				"amount": -float(d["point_cost"] or 0),
				"title": d.get("reward_name") or "Redemption",
				"subtitle": "Marketplace",
				"status": d.get("status"),
				"date": str(d["date"]) if d.get("date") else None,
				"date_human": _humanize_datetime(d.get("date")),
			}
		)

	# Sort merged newest-first; rows with no date sink to the bottom.
	rows.sort(key=lambda r: r["date"] or "", reverse=True)
	rows = rows[:100]

	# Running balance walks newest -> oldest from the current total.
	_, _, running = _user_balance(user)
	for r in rows:
		r["balance"] = round(running, 2)
		running -= r["amount"]

	return rows
```

- [ ] **Step 2: Restart so the new endpoints load**

Run: `bench --site project.vernon.id restart` (or `bench restart`)
Expected: completes without error.

- [ ] **Step 3: Verify balance + log against a real user**

Pick a user that has Point Ledger rows. Run:
```bash
bench --site project.vernon.id execute vernon_project.api.mobile.get_wallet --kwargs '{}' --as-dict 2>/dev/null || \
bench --site project.vernon.id console
```
In console:
```python
frappe.set_user("mo@intinusa.id")
import vernon_project.api.mobile as m
print(m.get_wallet())
print(m.get_wallet_log()[:3])
```
Expected: `get_wallet()` returns a dict with numeric `earned`/`redeemed`/`balance` where `balance == earned - redeemed`. `get_wallet_log()` returns a list; the first row's `balance` equals the wallet `balance`.

- [ ] **Step 4: Commit**

```bash
git add vernon_project/api/mobile.py
git commit -m "feat(points): get_wallet + get_wallet_log endpoints"
```

---

## Task 4: Backend leaderboard endpoint (`get_leaderboard`)

**Files:**
- Modify: `vernon_project/api/mobile.py` (append after Task 3 code)

**Interfaces:**
- Consumes: `_user_name_map` (existing helper), Point Ledger, Project, Brand.
- Produces: `get_leaderboard(period="monthly", brand=None) -> {"period": str, "brand": str|None, "brands": [str], "entries": [{"user","full_name","image","points","rank"}], "me": {...}|None}`. Top 50 entries; `me` always set if the caller has any points in range.

- [ ] **Step 1: Append the leaderboard endpoint**

Add to the end of `vernon_project/api/mobile.py`:

```python
# --------------------------------------------------------------------------------
# Leaderboard — rank users by points EARNED in a period, optionally by brand.
# Spending never lowers rank (we sum Point Ledger only, not redemptions).
# --------------------------------------------------------------------------------


def _period_start(period):
	"""Return the inclusive start date for a period, or None for all-time."""
	from frappe.utils import get_first_day, get_first_day_of_week

	if period == "weekly":
		return get_first_day_of_week(nowdate())
	if period == "monthly":
		return get_first_day(getdate(nowdate()))
	return None


@frappe.whitelist()
def get_leaderboard(period="monthly", brand=None):
	"""Top 50 users by points earned in the period; plus the caller's own rank."""
	if period not in ("weekly", "monthly", "all"):
		period = "monthly"
	brand = brand or None

	start = _period_start(period)
	conds = []
	params = {}
	join = ""
	if start is not None:
		conds.append("pl.credited_on >= %(start)s")
		params["start"] = start
	if brand:
		join = "join `tabProject` p on p.name = pl.project"
		conds.append("p.brand = %(brand)s")
		params["brand"] = brand

	where = ("where " + " and ".join(conds)) if conds else ""
	sql = f"""
		select pl.user as user, coalesce(sum(pl.points_earned), 0) as points
		from `tabPoint Ledger` pl
		{join}
		{where}
		group by pl.user
		having points <> 0
		order by points desc, pl.user asc
	"""
	ranked = frappe.db.sql(sql, params, as_dict=True)

	name_map = _user_name_map([r["user"] for r in ranked])

	def shape(row, rank):
		info = name_map.get(row["user"], {})
		return {
			"user": row["user"],
			"full_name": info.get("full_name") or row["user"],
			"image": info.get("user_image"),
			"points": float(row["points"]),
			"rank": rank,
		}

	entries, me = [], None
	caller = frappe.session.user
	for i, row in enumerate(ranked):
		shaped = shape(row, i + 1)
		if i < 50:
			entries.append(shaped)
		if row["user"] == caller:
			me = shaped

	brands = [b["brand_name"] for b in frappe.get_all("Brand", fields=["brand_name"], order_by="brand_name asc")]

	return {"period": period, "brand": brand, "brands": brands, "entries": entries, "me": me}
```

- [ ] **Step 2: Restart**

Run: `bench --site project.vernon.id restart`
Expected: no error.

- [ ] **Step 3: Verify ranking + period + brand filter**

In `bench --site project.vernon.id console`:
```python
import vernon_project.api.mobile as m
lb = m.get_leaderboard(period="monthly")
print(lb["period"], len(lb["entries"]), lb.get("brands"))
print([(e["rank"], e["full_name"], e["points"]) for e in lb["entries"][:5]])
print("all-time:", len(m.get_leaderboard(period="all")["entries"]))
if lb["brands"]:
    print("brand-filtered:", len(m.get_leaderboard(period="all", brand=lb["brands"][0])["entries"]))
```
Expected: entries sorted by descending `points`, `rank` ascending `1..N`; `brands` is a list of brand names; all-time count ≥ monthly count; brand-filtered count ≤ all-time count.

- [ ] **Step 4: Commit**

```bash
git add vernon_project/api/mobile.py
git commit -m "feat(points): get_leaderboard endpoint (period + brand)"
```

---

## Task 5: Backend marketplace endpoints (`get_marketplace`, `redeem_reward`)

**Files:**
- Modify: `vernon_project/api/mobile.py` (append after Task 4 code)

**Interfaces:**
- Consumes: `_user_balance` (Task 3), `Marketplace Reward`, `Reward Redemption`.
- Produces:
  - `get_marketplace() -> {"balance": float, "rewards": [{"name","reward_name","point_cost","image","description","stock_quantity"}]}` (active rewards only).
  - `redeem_reward(reward) -> {"balance": float, "redemption": str}` — instant deduct, atomic, raises `frappe.ValidationError` on insufficient balance / out of stock / unavailable.

- [ ] **Step 1: Append the marketplace endpoints**

Add to the end of `vernon_project/api/mobile.py`:

```python
# --------------------------------------------------------------------------------
# Marketplace — browse active rewards and redeem (instant deduct).
# --------------------------------------------------------------------------------


@frappe.whitelist()
def get_marketplace():
	"""Active catalog + the caller's spendable balance."""
	_, _, balance = _user_balance(frappe.session.user)
	rewards = frappe.get_all(
		"Marketplace Reward",
		filters={"active": 1},
		fields=["name", "reward_name", "point_cost", "image", "description", "stock_quantity"],
		order_by="point_cost asc, reward_name asc",
	)
	for r in rewards:
		r["point_cost"] = float(r["point_cost"] or 0)
	return {"balance": balance, "rewards": rewards}


@frappe.whitelist()
def redeem_reward(reward):
	"""Instant-deduct redemption. Re-checks active + stock + balance inside the
	transaction (row-locked) so concurrent redeems cannot oversell or push a
	balance negative."""
	user = frappe.session.user

	# Lock the catalog row for the duration of the transaction.
	row = frappe.db.sql(
		"""select name, reward_name, point_cost, stock_quantity, active
		from `tabMarketplace Reward` where name = %s for update""",
		reward,
		as_dict=True,
	)
	if not row:
		frappe.throw("Reward unavailable", frappe.ValidationError)
	r = row[0]
	if not r["active"]:
		frappe.throw("Reward unavailable", frappe.ValidationError)
	if (r["stock_quantity"] or 0) <= 0:
		frappe.throw("Out of stock", frappe.ValidationError)

	cost = float(r["point_cost"] or 0)
	_, _, balance = _user_balance(user)
	if cost > balance:
		frappe.throw("Insufficient balance", frappe.ValidationError)

	redemption = frappe.get_doc(
		{
			"doctype": "Reward Redemption",
			"user": user,
			"reward": r["name"],
			"reward_name": r["reward_name"],
			"point_cost": cost,
			"status": "Pending",
			"redeemed_on": now_datetime(),
		}
	)
	redemption.insert(ignore_permissions=True)

	frappe.db.set_value(
		"Marketplace Reward", r["name"], "stock_quantity", (r["stock_quantity"] or 0) - 1
	)

	_, _, new_balance = _user_balance(user)
	return {"balance": new_balance, "redemption": redemption.name}
```

Note: `now_datetime` is already imported at the top of the module via Task 2's controller usage? It is NOT imported in mobile.py. Add it to the existing import line.

- [ ] **Step 2: Add `now_datetime` to the mobile.py imports**

In `vernon_project/api/mobile.py`, change the existing import (line ~13):

```python
from frappe.utils import getdate, nowdate, pretty_date, get_datetime, date_diff
```
to:
```python
from frappe.utils import getdate, nowdate, pretty_date, get_datetime, date_diff, now_datetime
```

- [ ] **Step 3: Restart**

Run: `bench --site project.vernon.id restart`
Expected: no error.

- [ ] **Step 4: Verify catalog + a redeem round-trip**

In `bench --site project.vernon.id console`:
```python
import frappe, vernon_project.api.mobile as m
frappe.set_user("mo@intinusa.id")
mk = m.get_marketplace()
print("balance", mk["balance"], "rewards", [(r["reward_name"], r["point_cost"], r["stock_quantity"]) for r in mk["rewards"]])
# Redeem the Coffee Voucher created in Task 1 (cost 10). Requires balance >= 10.
before = mk["balance"]
res = m.redeem_reward("Coffee Voucher")
print("after", res["balance"], "redemption", res["redemption"])
assert abs((before - 10) - res["balance"]) < 0.01, "balance did not drop by cost"
frappe.db.rollback()  # undo the test redemption + stock decrement
```
Expected: balance prints; after redeem the balance dropped by 10 and a redemption name is returned; assertion passes. (Rollback undoes the test.) If the test user has < 10 points, instead call `m.redeem_reward("Coffee Voucher")` and confirm it raises `Insufficient balance`.

- [ ] **Step 5: Verify guard rails**

In console:
```python
import frappe, vernon_project.api.mobile as m
frappe.set_user("mo@intinusa.id")
frappe.db.set_value("Marketplace Reward", "Coffee Voucher", "stock_quantity", 0)
try:
    m.redeem_reward("Coffee Voucher")
    print("NO ERROR — BUG")
except frappe.ValidationError as e:
    print("blocked as expected:", e)
frappe.db.rollback()
```
Expected: prints `blocked as expected: Out of stock`.

- [ ] **Step 6: Commit**

```bash
git add vernon_project/api/mobile.py
git commit -m "feat(points): get_marketplace + redeem_reward (instant deduct)"
```

---

## Task 6: Frontend foundation — types, API client, hooks

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/hooks/useData.ts`

**Interfaces:**
- Produces (types): `Wallet`, `WalletLogEntry`, `LeaderboardEntry`, `Leaderboard`, `MarketplaceReward`, `MarketplaceData`.
- Produces (api): `mobileApi.getWallet`, `getWalletLog`, `getLeaderboard(period, brand?)`, `getMarketplace`, `redeemReward(reward)`.
- Produces (hooks): `useWallet()`, `useWalletLog()`, `useLeaderboard(period, brand)`, `useMarketplace()`, `useRedeemReward()`; query keys `wallet`, `walletLog`, `leaderboard`, `marketplace`.

- [ ] **Step 1: Add types to `frontend/src/lib/types.ts`**

Append at the end of the file:

```typescript
export interface Wallet {
  earned: number
  redeemed: number
  balance: number
}

export interface WalletLogEntry {
  kind: 'credit' | 'debit'
  amount: number
  title: string
  subtitle: string | null
  status: string | null
  date: string | null
  date_human: string | null
  balance: number
}

export interface LeaderboardEntry {
  user: string
  full_name: string
  image: string | null
  points: number
  rank: number
}

export type LeaderboardPeriod = 'weekly' | 'monthly' | 'all'

export interface Leaderboard {
  period: LeaderboardPeriod
  brand: string | null
  brands: string[]
  entries: LeaderboardEntry[]
  me: LeaderboardEntry | null
}

export interface MarketplaceReward {
  name: string
  reward_name: string
  point_cost: number
  image: string | null
  description: string | null
  stock_quantity: number
}

export interface MarketplaceData {
  balance: number
  rewards: MarketplaceReward[]
}
```

- [ ] **Step 2: Add API methods to `frontend/src/lib/api.ts`**

Inside the `mobileApi` object (e.g. just after the `runReport` entry), add:

```typescript
  getWallet: () => api.get(M + 'get_wallet'),
  getWalletLog: () => api.get(M + 'get_wallet_log'),
  getLeaderboard: (period: string, brand?: string | null) =>
    api.get(M + 'get_leaderboard', { period, ...(brand ? { brand } : {}) }),
  getMarketplace: () => api.get(M + 'get_marketplace'),
  redeemReward: (reward: string) =>
    api.post<{ balance: number; redemption: string }>(M + 'redeem_reward', { reward }),
```

- [ ] **Step 3: Add query keys + hooks to `frontend/src/hooks/useData.ts`**

Add to the `keys` object (after `users: ['users'] as const,`):

```typescript
  wallet: ['wallet'] as const,
  walletLog: ['wallet-log'] as const,
  leaderboard: (period: string, brand: string | null) =>
    ['leaderboard', period, brand ?? ''] as const,
  marketplace: ['marketplace'] as const,
```

Add the type imports to the existing `import type { ... } from '@/lib/types'` block:

```typescript
  Wallet,
  WalletLogEntry,
  Leaderboard,
  MarketplaceData,
```

Append the hooks at the end of the file:

```typescript
export const useWallet = () =>
  useQuery({ queryKey: keys.wallet, queryFn: () => mobileApi.getWallet() as Promise<Wallet> })

export const useWalletLog = () =>
  useQuery({ queryKey: keys.walletLog, queryFn: () => mobileApi.getWalletLog() as Promise<WalletLogEntry[]> })

export const useLeaderboard = (period: string, brand: string | null) =>
  useQuery({
    queryKey: keys.leaderboard(period, brand),
    queryFn: () => mobileApi.getLeaderboard(period, brand) as Promise<Leaderboard>,
  })

export const useMarketplace = () =>
  useQuery({ queryKey: keys.marketplace, queryFn: () => mobileApi.getMarketplace() as Promise<MarketplaceData> })

export function useRedeemReward() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (reward: string) => mobileApi.redeemReward(reward),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.marketplace })
      qc.invalidateQueries({ queryKey: keys.wallet })
      qc.invalidateQueries({ queryKey: keys.walletLog })
    },
  })
}
```

- [ ] **Step 4: Type-check the build**

Run: `cd frontend && npm run build`
Expected: build succeeds (TypeScript compiles, no unused-import errors). New hashed assets appear under `vernon_project/public/frontend/assets/`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/hooks/useData.ts vernon_project/public/frontend
git commit -m "feat(points): frontend types, api client, and query hooks"
```

---

## Task 7: Wallet log screen + route

**Files:**
- Create: `frontend/src/pages/WalletLogScreen.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useWalletLog`, `useWallet`, `WalletLogEntry`, `DetailScreen`, `EmptyState`, `FullScreenLoader`.
- Produces: route `/wallet` rendering `WalletLogScreen`.

- [ ] **Step 1: Create the screen**

```tsx
// frontend/src/pages/WalletLogScreen.tsx
import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { EmptyState, FullScreenLoader } from '@/components/ui'
import { useWallet, useWalletLog } from '@/hooks/useData'

const fmt = (n: number) =>
  (n < 0 ? '' : '+') + n.toLocaleString(undefined, { maximumFractionDigits: 1 })

export default function WalletLogScreen() {
  const { data: wallet } = useWallet()
  const { data: log, isLoading } = useWalletLog()

  return (
    <DetailScreen title="Points log">
      <div className="mb-4 flex items-center gap-3 rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-card">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
          <Wallet className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-brand-200">Spendable balance</p>
          <p className="text-2xl font-bold leading-tight">
            {(wallet?.balance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </p>
        </div>
      </div>

      {isLoading && !log ? (
        <FullScreenLoader />
      ) : !log || log.length === 0 ? (
        <EmptyState icon={Wallet} title="No activity yet" subtitle="Earned and spent points will show up here." />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-card">
          {log.map((e, i) => {
            const credit = e.kind === 'credit'
            return (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    credit
                      ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {credit ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{e.title}</p>
                  <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                    {[e.subtitle, e.status, e.date_human].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`text-sm font-semibold ${
                      credit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {fmt(e.amount)}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    bal {e.balance.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </DetailScreen>
  )
}
```

- [ ] **Step 2: Register the route in `frontend/src/App.tsx`**

Add the import near the other page imports:
```tsx
import WalletLogScreen from './pages/WalletLogScreen'
```
Add the route inside `<Routes>` (next to `/me`):
```tsx
        <Route path="/wallet" element={<WalletLogScreen />} />
```

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Verify in the app**

Open `https://project.vernon.id/m/#/wallet` (or navigate once Task 10 links exist). Confirm: balance header shows a number; the list shows credit (green, `+`) rows for completed-todo earnings with a running `bal` that matches the header on the first row; empty state renders for a user with no activity.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/WalletLogScreen.tsx frontend/src/App.tsx vernon_project/public/frontend
git commit -m "feat(points): wallet log screen at /wallet"
```

---

## Task 8: Leaderboard screen + route

**Files:**
- Create: `frontend/src/pages/LeaderboardScreen.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useLeaderboard`, `Leaderboard`, `LeaderboardEntry`, `LeaderboardPeriod`, `DetailScreen`, `Segmented`, `Avatar`, `EmptyState`, `FullScreenLoader`.
- Produces: route `/leaderboard` rendering `LeaderboardScreen`.

- [ ] **Step 1: Create the screen**

```tsx
// frontend/src/pages/LeaderboardScreen.tsx
import { useState } from 'react'
import { Trophy } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Avatar, EmptyState, FullScreenLoader, Segmented } from '@/components/ui'
import { useBoot, useLeaderboard } from '@/hooks/useData'
import type { LeaderboardEntry, LeaderboardPeriod } from '@/lib/types'

const PERIODS: { value: LeaderboardPeriod; label: string }[] = [
  { value: 'weekly', label: 'Week' },
  { value: 'monthly', label: 'Month' },
  { value: 'all', label: 'All-time' },
]

const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null)

function Row({ e, isMe }: { e: LeaderboardEntry; isMe: boolean }) {
  return (
    <li
      className={`flex items-center gap-3 px-4 py-3 ${
        isMe ? 'bg-brand-50 dark:bg-brand-500/10' : ''
      }`}
    >
      <div className="w-7 shrink-0 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
        {medal(e.rank) ?? e.rank}
      </div>
      <Avatar name={e.full_name} image={e.image} size={36} />
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">
        {e.full_name} {isMe && <span className="text-brand-600 dark:text-brand-300">· you</span>}
      </p>
      <p className="text-sm font-bold text-slate-900 dark:text-slate-50">
        {e.points.toLocaleString(undefined, { maximumFractionDigits: 1 })}
      </p>
    </li>
  )
}

export default function LeaderboardScreen() {
  const { data: boot } = useBoot()
  const [period, setPeriod] = useState<LeaderboardPeriod>('monthly')
  const [brand, setBrand] = useState<string>('')
  const { data, isLoading } = useLeaderboard(period, brand || null)

  const meInTop = !!data?.me && data.entries.some((e) => e.user === data.me!.user)

  return (
    <DetailScreen title="Leaderboard">
      <Segmented options={PERIODS} value={period} onChange={setPeriod} />

      {data && data.brands.length > 0 && (
        <select
          value={brand}
          onChange={(ev) => setBrand(ev.target.value)}
          className="mt-3 w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200"
        >
          <option value="">All brands</option>
          {data.brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      )}

      {isLoading && !data ? (
        <FullScreenLoader />
      ) : !data || data.entries.length === 0 ? (
        <EmptyState icon={Trophy} title="No points yet" subtitle="Complete work to climb the board." />
      ) : (
        <>
          <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-card">
            {data.entries.map((e) => (
              <Row key={e.user} e={e} isMe={e.user === boot?.user} />
            ))}
          </ul>

          {data.me && !meInTop && (
            <ul className="mt-3 overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-card ring-1 ring-brand-200 dark:ring-brand-500/30">
              <Row e={data.me} isMe />
            </ul>
          )}
        </>
      )}
    </DetailScreen>
  )
}
```

- [ ] **Step 2: Register the route in `frontend/src/App.tsx`**

Import:
```tsx
import LeaderboardScreen from './pages/LeaderboardScreen'
```
Route (next to `/wallet`):
```tsx
        <Route path="/leaderboard" element={<LeaderboardScreen />} />
```

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Verify in the app**

Open `https://project.vernon.id/m/#/leaderboard`. Confirm: defaults to **Month**; switching to Week/All-time refetches and reorders; brand dropdown appears and filtering changes the list; top 3 show medals; the caller's row is highlighted, and if outside top 50 it appears pinned below.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/LeaderboardScreen.tsx frontend/src/App.tsx vernon_project/public/frontend
git commit -m "feat(points): leaderboard screen at /leaderboard"
```

---

## Task 9: Marketplace screen + redeem sheet + route

**Files:**
- Create: `frontend/src/components/RedeemSheet.tsx`
- Create: `frontend/src/pages/MarketplaceScreen.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useMarketplace`, `useRedeemReward`, `MarketplaceReward`, `DetailScreen`, `EmptyState`, `FullScreenLoader`, `Spinner`, `useToast`.
- Produces: route `/marketplace`; `RedeemSheet` confirm modal.

- [ ] **Step 1: Create the redeem confirmation sheet**

Mirror the existing `ChangePasswordSheet` bottom-sheet pattern (fixed overlay + slide-up panel).

```tsx
// frontend/src/components/RedeemSheet.tsx
import { Spinner } from '@/components/ui'
import type { MarketplaceReward } from '@/lib/types'

export function RedeemSheet({
  reward,
  balance,
  pending,
  onConfirm,
  onClose,
}: {
  reward: MarketplaceReward | null
  balance: number
  pending: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  if (!reward) return null
  const after = balance - reward.point_cost
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative mx-auto w-full max-w-md rounded-t-3xl bg-white dark:bg-slate-800 p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-600" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Redeem {reward.reward_name}?</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          This spends <span className="font-semibold">{reward.point_cost}</span> points. Balance after:{' '}
          <span className="font-semibold">{after.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            disabled={pending}
            className="flex-1 rounded-2xl bg-slate-100 dark:bg-slate-700 py-3 font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3 font-semibold text-white disabled:opacity-60"
          >
            {pending ? <Spinner className="h-4 w-4" /> : 'Redeem'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create the marketplace screen**

```tsx
// frontend/src/pages/MarketplaceScreen.tsx
import { useState } from 'react'
import { Store, Coins } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { EmptyState, FullScreenLoader } from '@/components/ui'
import { RedeemSheet } from '@/components/RedeemSheet'
import { useMarketplace, useRedeemReward } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import type { MarketplaceReward } from '@/lib/types'

export default function MarketplaceScreen() {
  const { data, isLoading } = useMarketplace()
  const redeem = useRedeemReward()
  const toast = useToast()
  const [selected, setSelected] = useState<MarketplaceReward | null>(null)

  const balance = data?.balance ?? 0

  const confirm = () => {
    if (!selected) return
    redeem.mutate(selected.name, {
      onSuccess: (res) => {
        toast('success', `Redeemed — balance ${res.balance.toLocaleString(undefined, { maximumFractionDigits: 1 })}`)
        setSelected(null)
      },
      onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not redeem'),
    })
  }

  return (
    <DetailScreen title="Marketplace">
      <div className="mb-4 flex items-center gap-3 rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-card">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
          <Coins className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-brand-200">Spendable balance</p>
          <p className="text-2xl font-bold leading-tight">
            {balance.toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </p>
        </div>
      </div>

      {isLoading && !data ? (
        <FullScreenLoader />
      ) : !data || data.rewards.length === 0 ? (
        <EmptyState icon={Store} title="No rewards yet" subtitle="Check back soon." />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {data.rewards.map((r) => {
            const soldOut = r.stock_quantity <= 0
            const tooPricey = r.point_cost > balance
            const disabled = soldOut || tooPricey
            return (
              <div key={r.name} className="flex flex-col overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-card">
                <div className="aspect-square w-full bg-slate-100 dark:bg-slate-700">
                  {r.image ? (
                    <img src={r.image} alt={r.reward_name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-300 dark:text-slate-600">
                      <Store className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{r.reward_name}</p>
                  {r.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-400 dark:text-slate-500">{r.description}</p>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm font-bold text-brand-700 dark:text-brand-300">{r.point_cost} pts</span>
                    {soldOut && <span className="text-[11px] font-semibold text-rose-500">Sold out</span>}
                  </div>
                  <button
                    onClick={() => setSelected(r)}
                    disabled={disabled}
                    className="mt-2 rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400"
                  >
                    {soldOut ? 'Sold out' : tooPricey ? 'Not enough' : 'Redeem'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <RedeemSheet
        reward={selected}
        balance={balance}
        pending={redeem.isPending}
        onConfirm={confirm}
        onClose={() => !redeem.isPending && setSelected(null)}
      />
    </DetailScreen>
  )
}
```

- [ ] **Step 3: Register the route in `frontend/src/App.tsx`**

Import:
```tsx
import MarketplaceScreen from './pages/MarketplaceScreen'
```
Route:
```tsx
        <Route path="/marketplace" element={<MarketplaceScreen />} />
```

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Verify in the app**

Open `https://project.vernon.id/m/#/marketplace`. Confirm: balance header shows; the "Coffee Voucher" card renders with cost/stock; tapping **Redeem** opens the sheet showing balance-after; confirming shows a success toast and the balance drops; redeeming when cost > balance shows the button as "Not enough" (disabled); a 0-stock item shows "Sold out". (Reset the test reward's stock in Desk afterward if needed.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/MarketplaceScreen.tsx frontend/src/components/RedeemSheet.tsx frontend/src/App.tsx vernon_project/public/frontend
git commit -m "feat(points): marketplace screen + redeem sheet at /marketplace"
```

---

## Task 10: Rewards entry points — Profile card + Today hero chip

**Files:**
- Modify: `frontend/src/pages/Profile.tsx`
- Modify: `frontend/src/pages/Today.tsx`

**Interfaces:**
- Consumes: `useWallet`, `useNavigate`, lucide icons (`Coins`, `Trophy`, `Store`, `Wallet`).
- Produces: a Rewards balance card on Me linking to `/wallet`, `/leaderboard`, `/marketplace`; a balance chip on the Today hero linking to `/marketplace`.

- [ ] **Step 1: Add the Rewards card to `frontend/src/pages/Profile.tsx`**

Add `Coins` to the lucide import on line 2 (it already imports `Trophy, Store`):
```tsx
import { LogOut, Wifi, WifiOff, BookOpen, ShieldCheck, RefreshCw, ChevronRight, Trophy, Store, Users, KeyRound, Coins } from 'lucide-react'
```
Add the wallet hook import to the `@/hooks/useData` import on line 7:
```tsx
import { useBoot, canManageGroups, canManageBrands, canManageUsers, useWallet } from '@/hooks/useData'
```
Inside the component, after `const { data: boot, isLoading } = useBoot()`:
```tsx
  const { data: wallet } = useWallet()
```
Insert this block immediately after the online/offline status `<div>` (the block ending `…showing saved data'}</div>`), before the Appearance card:
```tsx
          {/* Rewards */}
          <div className="mt-3 overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-card">
            <div className="flex items-center gap-3 bg-gradient-to-br from-brand-600 to-brand-800 px-4 py-4 text-white">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15">
                <Coins className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-brand-200">Spendable points</p>
                <p className="text-xl font-bold leading-tight">
                  {(wallet?.balance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </p>
              </div>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              <Row icon={Wallet} label="Points log" onClick={() => navigate('/wallet')} />
              <Row icon={Trophy} label="Leaderboard" onClick={() => navigate('/leaderboard')} />
              <Row icon={Store} label="Marketplace" onClick={() => navigate('/marketplace')} />
            </div>
          </div>
```
Add `Wallet` to the lucide import as well (used by the row icon):
```tsx
import { LogOut, Wifi, WifiOff, BookOpen, ShieldCheck, RefreshCw, ChevronRight, Trophy, Store, Users, KeyRound, Coins, Wallet } from 'lucide-react'
```

- [ ] **Step 2: Add the balance chip to the Today hero**

In `frontend/src/pages/Today.tsx`, add the wallet hook (near the other hooks at the top of the component):
```tsx
  const { data: wallet } = useWallet()
```
Add `useWallet` to the existing `@/hooks/useData` import, and add `Coins` to the lucide import.

Inside the hero, add a balance chip alongside the overdue/review chips — insert after the review-count button block (around line 222), still inside the `flex flex-wrap gap-2` container:
```tsx
                    <button
                      onClick={() => navigate('/marketplace')}
                      className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 font-semibold active:scale-95"
                    >
                      <Coins className="h-3 w-3" /> {(wallet?.balance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} pts
                    </button>
```

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: build succeeds (verify `useWallet`/`Coins`/`Wallet` imports resolve in both files).

- [ ] **Step 4: Verify in the app**

Reload `https://project.vernon.id/m`. Confirm: the **Home** hero shows a points chip that navigates to `/marketplace`; the **Me** tab shows the Rewards card with the balance and three working links (Points log → `/wallet`, Leaderboard → `/leaderboard`, Marketplace → `/marketplace`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Profile.tsx frontend/src/pages/Today.tsx vernon_project/public/frontend
git commit -m "feat(points): rewards card on Me + balance chip on Home"
```

---

## Self-Review

**Spec coverage:**
- Homepage spendable balance → Task 10 (Today hero chip). ✓
- Wallet log (unified credits+debits, running balance, latest 100) → Task 3 (endpoint) + Task 7 (screen). ✓
- Leaderboard (weekly/monthly/all, default monthly; earned-points metric; brand filter; top 50 + me; sequential rank) → Task 4 + Task 8. ✓
- Marketplace (global catalog, instant deduct, fields name/cost/image/description/stock/active, Pending→Fulfilled) → Tasks 1, 2, 5, 9. ✓
- Marketplace Manager role; Desk-based admin → Tasks 1 & 2 (permissions, role auto-create). ✓
- Nav: Rewards hub under Me → Task 10. ✓
- Edge cases (insufficient balance, out of stock, inactive hidden, concurrency, empty states) → Task 5 (server guards, row lock) + Tasks 7/8/9 (disabled buttons, empty states). ✓
- No native alert → RedeemSheet + Toast (Task 9). ✓
- Snapshots for history integrity → Task 2 fields + Task 5 redeem writes. ✓

**Type consistency:** `Wallet`, `WalletLogEntry`, `Leaderboard`/`LeaderboardEntry`/`LeaderboardPeriod`, `MarketplaceData`/`MarketplaceReward` are defined once in Task 6 and consumed unchanged in Tasks 7–10. API method names (`getWallet`, `getWalletLog`, `getLeaderboard`, `getMarketplace`, `redeemReward`) match hook usage and endpoint names (`get_wallet`, `get_wallet_log`, `get_leaderboard`, `get_marketplace`, `redeem_reward`).

**Placeholder scan:** No TBD/TODO; every code step contains complete content.

---

## Execution Notes

- Tasks are ordered so backend (1–5) lands before the frontend that consumes it (6–10). Each task is independently committable and verifiable.
- The `vernon_project/public/frontend/**` build artifacts change on every frontend `npm run build`; commit them with the source change that produced them (existing repo convention — those assets are tracked).
- After Task 10, optionally run a final end-to-end pass on `project.vernon.id`: complete a todo → see points land in the log → check rank on the leaderboard → redeem in the marketplace → see the debit in the log.
