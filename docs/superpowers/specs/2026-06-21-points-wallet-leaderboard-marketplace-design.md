# Points Wallet, Log, Leaderboard & Marketplace — Design

**Date:** 2026-06-21
**Status:** Approved (design); implementation pending

## Summary

The app already awards points: completing a Project Todo writes one or two
**Point Ledger** rows (Assignee and/or Leader) via
`project_todo.py::sync_point_ledger()`. Points are currently visible only on the
todo-detail screen. This feature turns points into a **spendable currency** and
surfaces them across the mobile app:

1. **Homepage balance** — spendable balance shown in the Today hero.
2. **Wallet log** — unified timeline of credits (earnings) and debits
   (redemptions) with running balance.
3. **Leaderboard** — ranks all users by points earned in a period
   (Weekly / Monthly / All-time, default Monthly), optionally grouped by Brand.
4. **Marketplace** — browse rewards and redeem points (instant deduct).

Navigation: a **Rewards** card on the Me/Profile screen links to the three
sub-screens; the Today hero also shows the balance and links to Marketplace.

## Definitions

- **Earned** = `Σ point_ledger.points_earned` for the user (all-time, both roles).
- **Redeemed** = `Σ reward_redemption.point_cost` for the user (all statuses;
  there is no cancellation — see Redemption lifecycle).
- **Spendable balance** = `earned − redeemed`. Server-enforced to never go
  negative.
- **Leaderboard metric** = points *earned* in the selected period
  (`assignee + leader`). Spending in the marketplace does **not** lower rank.

## Data model

### New doctype: Marketplace Reward
Catalog item. Managed in Frappe Desk by the Marketplace Manager role.

| Field | Type | Notes |
|-------|------|-------|
| `reward_name` | Data | required, in_list_view |
| `point_cost` | Float | required, ≥ 0 |
| `image` | Attach Image | optional |
| `description` | Small Text | optional |
| `stock_quantity` | Int | default 0; decrements on redeem; 0 = sold out |
| `active` | Check | default 1; inactive items hidden from users |

Permissions: System Manager + **Marketplace Manager** = full CRUD. Project roles
have read only (not strictly needed; catalog is served through the API).

### New doctype: Reward Redemption
One row per redemption. Created server-side by `redeem_reward` (instant deduct);
never created directly from the mobile UI.

| Field | Type | Notes |
|-------|------|-------|
| `user` | Link → User | required |
| `reward` | Link → Marketplace Reward | required |
| `reward_name` | Data | snapshot at redeem time (catalog edits don't rewrite history) |
| `point_cost` | Float | snapshot at redeem time |
| `status` | Select: `Pending`\|`Fulfilled` | default `Pending` |
| `redeemed_on` | Datetime | set on create |
| `fulfilled_on` | Datetime | set when Marketplace Manager fulfills |
| `note` | Small Text | optional, admin/user note |

Permissions: user reads own rows; **Marketplace Manager** + System Manager read
all and may set `status = Fulfilled`.

### Redemption lifecycle
`Pending → Fulfilled` only. **No cancellation / no refund** in this version.
Points are deducted at redeem time and stay deducted. (Cancellation/refund is a
possible future extension; out of scope here.)

### New role: Marketplace Manager
A Frappe Role. Granted permissions on Marketplace Reward (CRUD) and Reward
Redemption (read all + write `status`/`fulfilled_on`). Assignable independently
of System Manager.

### No stored balance
Balance is **computed live** from Point Ledger and Reward Redemption on each
request. No materialized balance field, no balance-sync hooks. Rationale: scale
is small, the SQL is trivial, and a stored balance would risk drift bugs of the
kind already noted for `db_set`-in-`on_change` recursion. This mirrors the
existing report aggregation approach.

## Backend API (`vernon_project/api/mobile.py`)

All endpoints `@frappe.whitelist()`, operate on `frappe.session.user`, and
follow the existing mobile.py conventions (return plain dicts/lists).

### `get_wallet()`
Returns `{ "earned": float, "redeemed": float, "balance": float }` for the
caller. `balance = earned − redeemed`.

### `get_wallet_log()`
Returns a unified, date-descending timeline for the caller:
```
[
  { "kind": "credit", "amount": +p, "title": <todo subject>, "project": ...,
    "group": ..., "date": <credited_on> },
  { "kind": "debit",  "amount": -c, "title": <reward_name>,
    "status": <Pending|Fulfilled>, "date": <redeemed_on> },
  ...
]
```
- Credits: Point Ledger rows for the user (join Project Todo for a title).
- Debits: Reward Redemption rows for the user.
- A **running balance** is computed (oldest→newest) and attached to each row so
  the UI can show balance-after-transaction without client math.
- Returns the **latest 100** transactions (credits + debits merged). Running
  balance for the windowed rows starts from current balance and walks backward.

### `get_leaderboard(period="monthly", brand=None)`
- `period ∈ {"weekly","monthly","all"}`, default `"monthly"`.
  - `weekly` = current ISO week (Mon–Sun) by `credited_on`.
  - `monthly` = current calendar month by `credited_on`.
  - `all` = no date filter.
- `brand` optional: when set, restrict to Point Ledger rows whose
  `project.brand == brand` (join Point Ledger → Project).
- Aggregates `SUM(points_earned)` grouped by user, ordered desc.
- Returns:
  ```
  {
    "period": "monthly", "brand": null,
    "entries": [ { "user", "full_name", "image", "points", "rank" }, ... ],
    "me": { "user", "full_name", "image", "points", "rank" } | null,
    "brands": [ <brand_name>, ... ]   // for the filter dropdown
  }
  ```
- `me` is the caller's own entry (may be outside the returned top-N).
- Ties: equal points ordered by user name; rank is **sequential** `1..N`.
- **Top 50** entries returned; `me` always included even if outside top 50.

### `get_marketplace()`
Returns `{ "balance": float, "rewards": [ Marketplace Reward (active only) ] }`.
Each reward includes `name, reward_name, point_cost, image, description,
stock_quantity`. The UI marks a reward unaffordable (`point_cost > balance`) or
sold out (`stock_quantity <= 0`).

### `redeem_reward(reward)`
Instant deduct, executed in a single transaction:
1. Load the reward `for update`; assert `active` and `stock_quantity > 0`.
2. Recompute live balance; assert `point_cost <= balance`.
3. Create Reward Redemption (`status=Pending`, snapshots, `redeemed_on=now`).
4. Decrement `stock_quantity` by 1.
5. Commit. Return `{ "balance": <new balance>, "redemption": <name> }`.

On any assertion failure, raise a `frappe.ValidationError` with a clear message
(`"Insufficient balance"`, `"Out of stock"`, `"Reward unavailable"`). The
re-check inside the transaction makes concurrent redeems safe (no oversell, no
negative balance).

## Frontend (`frontend/src/`)

### Types (`lib/types.ts`)
Add `Wallet`, `WalletLogEntry`, `LeaderboardEntry`, `Leaderboard`,
`MarketplaceReward`, `MarketplaceData`.

### API client (`lib/api.ts`)
Add `mobileApi.getWallet`, `getWalletLog`, `getLeaderboard(period, brand)`,
`getMarketplace`, `redeemReward(reward)` — mapping to the endpoints above,
following the existing GET/POST `/api/method/` helper pattern.

### Hooks (`hooks/useData.ts`)
Add React-Query hooks: `useWallet`, `useWalletLog`,
`useLeaderboard(period, brand)`, `useMarketplace`, and a `useRedeemReward`
mutation that invalidates wallet + marketplace queries on success.

### Screens
- **Today.tsx** — add a spendable-balance chip/card in the hero that links to
  `/marketplace`. Uses `useWallet`.
- **Profile.tsx (Me)** — add a "Rewards" card: shows balance and three links →
  `/wallet`, `/leaderboard`, `/marketplace`.
- **`/wallet` → `WalletLogScreen`** (DetailScreen): unified credit/debit list,
  +/− amounts color-coded, running balance, empty state.
- **`/leaderboard` → `LeaderboardScreen`** (DetailScreen): segmented control
  Weekly/Monthly/All-time (default Monthly) + brand dropdown ("All" + brands
  from API). Ranked list with rank, avatar, name, points; caller's own row
  pinned/highlighted. Empty state.
- **`/marketplace` → `MarketplaceScreen`** (DetailScreen): balance header,
  reward grid/list (image, name, cost, description, stock). Redeem button
  disabled when unaffordable or sold out. Redeem → confirm in **dialog modal**
  (never native alert/confirm), then `useRedeemReward`; show success/error in
  dialog. On insufficient balance / out of stock, show dialog message.

### Routing (`App.tsx`)
Add routes `/wallet`, `/leaderboard`, `/marketplace` using the existing
`DetailScreen` layout (back button, no bottom nav). Bottom nav unchanged (still
5 tabs).

## Catalog administration — scope decision

Reward catalog CRUD and redemption fulfillment are done in **Frappe Desk** by
the Marketplace Manager role (standard list/form views), not in the mobile app.
The mobile frontend is **user-facing only** (browse + redeem + view history).
Mobile admin screens are explicitly out of scope and may be a later spec.

## Edge cases

- **Insufficient balance**: redeem blocked server-side; button disabled
  client-side; dialog explains.
- **Out of stock** (`stock_quantity <= 0`): redeem blocked server-side; button
  disabled; reward marked sold out.
- **Inactive reward**: excluded from `get_marketplace`.
- **Concurrency**: stock + balance re-checked inside the redeem transaction with
  row locking — no oversell, no negative balance.
- **Empty states**: no points yet (wallet/log), empty leaderboard, empty
  catalog — each screen renders a friendly empty state.
- **History integrity**: redemption snapshots `reward_name`/`point_cost`, so
  editing or deleting a catalog item never alters past log rows.

## Testing & deployment

- **Tests deferred** to a final phase — this is a live site with no test DB.
  Verify each change manually against `project.vernon.id`.
- **Deploy steps**: `bench migrate` (new doctypes + role), `bench restart`
  (Python API changes), `npm run build` in `frontend/` (frontend bundle).

## Out of scope (possible future work)

- Redemption cancellation / point refunds.
- Mobile admin screens for catalog + fulfillment.
- Per-brand or per-project reward catalogs (catalog is global here).
- Badges / achievements / streaks.
- Rank/earned figures on the homepage (homepage shows balance only).
