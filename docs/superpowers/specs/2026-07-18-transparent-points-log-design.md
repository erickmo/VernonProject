# Transparent Points Log — design

**Date:** 2026-07-18
**Status:** Approved

## Goal

Any logged-in user can view any other user's **earned-points log** by tapping their
row on the leaderboard, on both frontends (`/m` and `/w`). "Transparent" = no
admin gate.

## What the public log shows

Point Ledger credits for the target user where `source NOT IN ('Grant', 'Gift')`,
newest first, plus a `total_earned` sum. Rationale: grants and gifts are points
*given* to a user, not *earned*; the transparent view shows what the person earned
through their own activity (Todo, Recognition, Mentoring, Learning, Meeting,
Attendance, Daily, Reward, Achievement, Feedback).

**Not shown** (stays private, self-wallet only): reward redemptions, avatar/event
spends, running balance. No mutation, ever.

## Backend — `vernon_project/api/mobile.py`

Extract the earned-credit row builder out of `get_wallet_log` so the wallet and the
public log render identically:

- `_earned_credit_rows(user, limit=100)` — query Point Ledger for `user`,
  `source NOT IN ('Grant','Gift')`, `order_by credited_on desc`, `limit`; resolve
  todo subjects; build rows reusing `_credit_category` / `_credit_reason` /
  `_humanize_datetime` (same shape as today's non-grant/non-gift credit rows: `kind`,
  `amount`, `category`, `title`, `subtitle`, `date`, `date_human`). No `balance`.
- `get_wallet_log` keeps its current output (earnings + spends + balance, self-only);
  refactor its non-grant/non-gift credit branch to call the new helper where it fits
  cleanly — otherwise leave it and only share the row-mapping logic. Behavior of
  `get_wallet_log` must not change.

New whitelisted endpoint:

```
@frappe.whitelist()
def get_user_points_log(user, limit=100):
    # login required (no Guest); no admin gate — transparent
    # 404 if user doesn't exist
    # returns { user, full_name, image, avatar_config, total_earned, rows: [...] }
```

- Reject Guest (`frappe.session.user == "Guest"` → PermissionError).
- `total_earned` = SUM(points_earned) for the target where source ∉ {Grant, Gift}.
- Header fields (full_name, image, avatar_config) resolved for the target so the
  view can show who it belongs to without a second call.

## Frontend — shared (`frontend/src`, imported by both via `@/`)

- `getUserPointsLog(user)` in `lib/api.ts`; `useUserPointsLog(user)` in
  `hooks/useData.ts`. Types in `lib/types.ts` (reuse the existing wallet row type;
  add `UserPointsLog` for the envelope).

## Frontend — mobile (`frontend/src`)

- New `UserPointsLogScreen` at route `/u/:user/points`. Header = target
  avatar/name + total earned. Body reuses `WalletLogScreen`'s credit-row rendering
  (extract the row component if needed). Read-only.
- `LeaderboardScreen` rows become tappable → navigate to `/u/:user/points`.
  Tapping your own row → existing wallet (`/wallet` equivalent).

## Frontend — web (`frontend-web/src`)

- New route `/points-log/:user` rendering the same view (reuse `WalletLog`'s
  credit-row rendering). Header identical.
- `Leaderboard` rows become tappable → `/points-log/:user`; own row → existing
  wallet.

## Security / privacy

- Endpoint login-gated, read-only, credits-only minus Grant/Gift. No balance, no
  spends, no writes. Guest rejected.

## Tests (`vernon_project/api/test_mobile.py` or nearest)

- A non-admin logged-in user reads another user's earned log (no PermissionError).
- Grant and Gift rows are excluded; a Todo credit is present.
- `total_earned` excludes Grant/Gift.
- Guest is rejected.

## Deliberately skipped (YAGNI)

- Period/dimension filters on the log (shows all-time earnings).
- Pagination beyond `limit` (100 default).
- Any spend/balance exposure.
