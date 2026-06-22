# Grant Points — Design

**Date:** 2026-06-22
**Status:** Approved

## Goal

Allow an authorized user to manually grant points to any user. Granted points
add to the recipient's wallet balance (spendable in the marketplace) but do NOT
count toward leaderboard rank. Entry point lives as a link on the Me/Profile
page, visible only to authorized grantors.

## 1. Role & Permission

A new role **"Points Granter"** controls access.

- Add `"Points Granter"` to `VERNON_ROLES` (api/mobile.py) so it is assignable
  through the existing Manage Users UI.
- Seed the role via a patch (idempotent `create`-if-missing).
- Backend gate `_require_points_granter()` — allow `System Manager` OR
  `Points Granter`. Mirrors `_require_marketplace_manager()` (mobile.py:1639).
- Frontend helper `canGrantPoints(boot)` in `frontend/src/hooks/useData.ts`
  (true for `System Manager` or `Points Granter`).

## 2. Point Ledger Schema Changes

File: `vernon_project/vernon_project/doctype/point_ledger/point_ledger.json`

Manual grants reuse the Point Ledger so wallet logic needs no rework, but two
existing required fields don't apply to a grant:

- `todo`: `reqd` 1 → 0 (grants have no todo).
- `role`: `reqd` 1 → 0 (grants have no Assignee/Leader role).

New fields:

- `source` — Select `Todo\nGrant`, default `Todo`. Existing rows (no value) are
  treated as `Todo` via `coalesce`.
- `note` — Small Text. Grant reason / message.
- `granted_by` — Link User. Audit: who issued the grant.

Permissions: add a row for `Points Granter` with `create` + `read`.

## 3. Leaderboard Exclusion

File: `get_leaderboard()` (mobile.py:1498)

Add to the WHERE clause unconditionally:

```sql
coalesce(pl.source, 'Todo') <> 'Grant'
```

Granted points never affect rank. Existing earned rows (source NULL → 'Todo')
are unaffected.

## 4. Wallet Inclusion (automatic)

`_user_balance()`, `get_wallet()`, and `get_wallet_log()` sum all Point Ledger
rows, so grants automatically add to balance/wallet with no code change.

In `get_wallet_log()`, render Grant rows distinctly:
- `title`: "Points granted"
- `subtitle`: the row's `note` (fallback "Granted")

## 5. Backend API (api/mobile.py)

### `grant_points(user, amount, note=None)` — `@frappe.whitelist()`
- `_require_points_granter()`.
- Validate: `user` exists, is enabled, not in `PROTECTED_USERS`.
- `amount` = float; must be `> 0` (positive-only; reject `<= 0` / non-numeric).
- Insert Point Ledger row:
  `user`, `points_earned=amount`, `point=amount`, `source="Grant"`, `note`,
  `granted_by=frappe.session.user`, `credited_on=now()`.
- Return `{ "balance": <new balance>, "granted": amount }`.

### `list_grant_users()` — `@frappe.whitelist()`
- `_require_points_granter()`.
- Return lightweight list `{name, full_name, user_image}` of enabled users,
  excluding `PROTECTED_USERS`, ordered by `full_name`.

## 6. Frontend

- `frontend/src/lib/api.ts` — add `grantPoints(user, amount, note)` and
  `listGrantUsers()` to `mobileApi`.
- `frontend/src/hooks/useData.ts` — add `canGrantPoints(boot)`.
- `frontend/src/pages/Profile.tsx` — new `Row` (icon `Gift`), label
  "Grant Points", gated by `canGrantPoints(boot)`, navigates `/grant-points`.
- `frontend/src/pages/GrantPointsScreen.tsx` (new) — searchable user picker
  (from `listGrantUsers`), amount input, optional note, submit button.
  Success feedback via toast; errors via toast. No native `alert/confirm`
  (house rule — use dialog/toast).
- `frontend/src/App.tsx` — add route `/grant-points`.

## 7. Deploy

1. `bench migrate` — apply Point Ledger schema + role-seed patch.
2. `bench restart` — reload Python (new API methods, gate).
3. `npm run build` (frontend) — ship UI.

## Scope Notes (YAGNI)

- Positive-only grants; no deduct/negative path.
- No daily cap or per-grant max.
- Both are simple follow-ups if needed later.

## Testing

Deferred to the final phase per project convention (single live site, no test DB).
