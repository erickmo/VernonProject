# Gift Points — Peer-to-Peer Point Transfer

**Date:** 2026-06-22
**Status:** Approved design

## Summary

Let any user gift some of their own spendable points to another user. The
transfer is zero-sum: the sender's balance drops by the gifted amount and the
recipient's balance rises by the same amount. Gifts do **not** affect leaderboard
rank (rank stays merit/earned-based), mirroring how manual grants are excluded.

## Decisions

| Decision | Choice |
|---|---|
| Source of points | Transfer from sender's own balance (zero-sum) |
| Leaderboard impact | Excluded from rank (both sender and recipient rows) |
| Who can gift | Any enabled user → any other enabled user |
| Forbidden recipients | Self, protected/system users, disabled users |
| Amount granularity | Whole numbers only (`amount > 0`, integer) |
| Confirmation | Confirm dialog before sending (transfer is irreversible) |
| Recipient acceptance | None — transfer is instant |

## Data Model

Reuse the existing **Point Ledger** doctype. Add `"Gift"` to the `source`
Select options (currently `Todo`, `Grant`).

A single gift creates **two** Point Ledger rows in one transaction:

| Field | Recipient row | Sender row |
|---|---|---|
| `user` | recipient | sender |
| `points_earned` | `+amount` | `-amount` |
| `point` | `amount` | `amount` |
| `source` | `"Gift"` | `"Gift"` |
| `granted_by` | sender (counterpart) | recipient (counterpart) |
| `note` | optional | optional |
| `group` | null | null |

`granted_by` doubles as "the other party" for display. `group` is left null —
gifts are not tied to a work group.

### Why a negative ledger row works

Balance is computed live as `Σ Point Ledger.points_earned − Σ Reward
Redemption.point_cost` (`_user_balance`, `mobile.py:1383`). The sender's negative
`points_earned` row reduces their balance automatically — **no change to the
balance function is required**, and balance never drifts because nothing is
materialized.

## Backend (`vernon_project/api/mobile.py`)

### `gift_points(to_user, amount, note=None)` — new whitelisted method

1. `sender = frappe.session.user`.
2. Normalize `to_user`; reject if: empty, equals sender, in `PROTECTED_USERS`,
   not an existing `User`, or `User.enabled == 0`.
3. Coerce `amount` to a number; reject if not numeric, `<= 0`, or not a whole
   number. Store as `int`.
4. Compute sender balance via `_user_balance(sender)`; reject if
   `balance < amount` ("Not enough points").
5. Insert the recipient row and the sender row (both `source="Gift"`,
   `credited_on=now`), then `frappe.db.commit()`.
6. Return `{"balance": <new sender balance>, "gifted": amount, "to": to_user}`.

Note on concurrency: validate-then-insert has a small race window for rapid
concurrent gifts from the same sender. Acceptable for this app's scale; no row
lock added. (Documented so it isn't mistaken for an oversight.)

### `list_gift_recipients()` — new whitelisted method

Returns enabled users excluding `PROTECTED_USERS` and the session user:
`name`, `full_name`, `user_image`. Open to all logged-in users (unlike
`list_grant_users`, which is gated to Points Granter).

### Leaderboard + "earned today" exclusions

Gifts must not change rank or count as earned activity:

- **Leaderboard rank query** (`mobile.py:1515`): the existing condition excludes
  `source = 'Grant'`. Extend it to also exclude `'Gift'`
  (`coalesce(pl.source,'Todo') not in ('Grant','Gift')`).
- **Today/yesterday earned** (`get_wallet`, `mobile.py:1408`): the `_earned_on`
  subquery already excludes `'Grant'`. Extend to also exclude `'Gift'`.

### Wallet log (`get_wallet_log`)

The credit loop reads Point Ledger rows including `source`, `granted_by`,
`points_earned`. Add a `source == "Gift"` branch that resolves the counterpart
(`granted_by`) full name and renders:

- **Received** (`points_earned > 0`): `kind="credit"`, title
  `"Gift received"`, subtitle `"from {counterpart name}"`, amount positive.
- **Sent** (`points_earned < 0`): `kind="debit"`, title `"Gift sent"`,
  subtitle `"to {counterpart name}"`, amount negative.

Counterpart full names are resolved in one batched query (same pattern as the
existing todo-subject resolution).

## Frontend

### `GiftPointsScreen.tsx` (mirrors `GrantPointsScreen.tsx`)

- Loads the gift recipient list and the live wallet balance.
- Recipient picker (search/select from `list_gift_recipients`).
- Whole-number amount input; inline-validated to `1..balance`.
- Optional note field.
- "Gift points" button → confirm dialog (`"Gift {amount} points to {name}?"`,
  per the no-`alert()` rule, use the dialog/Confirm provider) → calls
  `giftPoints`.
- Success toast, navigate back; error toast on failure (insufficient balance,
  etc.).

### Wiring

- `api.ts`: `giftPoints(toUser, amount, note?)`, `listGiftRecipients()`.
- `hooks/useData.ts`: query hook for recipients, mutation hook for gifting
  (invalidates wallet + wallet-log queries on success).
- `lib/types.ts`: types for recipient + gift response.
- `App.tsx`: route for the gift screen.
- `Profile.tsx`: "Gift points" entry action, visible to **all** users (the
  existing grant action stays gated to Points Granter).

## Error Handling

| Condition | Result |
|---|---|
| Recipient unknown / disabled | `frappe.throw("Unknown user")` |
| Recipient is self | `frappe.throw("Cannot gift yourself")` |
| Recipient protected/system | `frappe.throw("Unknown user")` |
| Amount not a positive whole number | `frappe.throw("Amount must be a whole number greater than zero")` |
| Sender balance < amount | `frappe.throw("Not enough points")` |

Client mirrors the amount/balance checks for fast feedback; the server is the
authority.

## Testing / Verification

Live, code-first site (project.vernon.id) with no test DB — manual verification
after deploy, per project convention (defer automated tests to a final phase):

1. Gift from user A → B; confirm A balance −N, B balance +N.
2. Wallet log shows "Gift sent" (A) and "Gift received" (B) with correct names.
3. Leaderboard rank unchanged for both A and B.
4. Reject: self-gift, amount 0 / negative / decimal, amount > balance,
   disabled/unknown recipient.

## Out of Scope (YAGNI)

- Recipient acceptance / pending-gift flow.
- Gift reversal / refund.
- Gift limits, cooldowns, or fees.
- Group attribution for gifts.
