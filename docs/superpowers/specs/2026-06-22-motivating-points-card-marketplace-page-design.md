# Motivating Points Card + Marketplace-as-Points-Page — Design

**Date:** 2026-06-22
**Status:** Approved (design); implementation pending
**Builds on:** points feature + catalog admin + `2026-06-22-points-home-card-and-hub-design.md`

## Summary

Two changes:

1. **Motivating homepage points card** — show spendable balance plus **today**
   and **yesterday** points earned, a trend indicator, and an encouraging line.
   Tap → marketplace.
2. **Marketplace is the points page** — opening points lands directly on the
   marketplace (rewards grid + balance), with a compact top menu giving access
   to Points log, Leaderboard, and (admins) Manage Marketplace. The separate
   `/points` menu hub from the prior iteration is removed.

Backend change is limited to extending `get_wallet`. Everything else is
frontend.

## Backend

### `get_wallet()` (`vernon_project/api/mobile.py`)
Extend the return to include period earnings:
```
{ "earned", "redeemed", "balance", "today_earned", "yesterday_earned" }
```
- `today_earned` = `Σ Point Ledger.points_earned` where `date(credited_on)` ==
  today (server date).
- `yesterday_earned` = same for yesterday.
- Computed with a single grouped query or two scalar sums; floats. Reuse the
  existing `getdate`/`nowdate` imports; yesterday via `add_days(nowdate(), -1)`.

No other endpoint changes. `_user_balance` is unchanged (balance still
`earned − redeemed`).

## Frontend

### Types (`lib/types.ts`)
`Wallet` gains `today_earned: number` and `yesterday_earned: number`.

### Homepage points card (`Today.tsx`)
Replace the current simple points card with a motivating one (still a single
tappable card below the hero, `shadow-card`, dark-mode aware), `onClick` →
`navigate('/marketplace')`:
- **Balance** — the spendable number, prominent, labelled (e.g. "Spendable
  points").
- **Today** `+{today_earned}` with an up-arrow accent (green) when `> 0`.
- **Yesterday** `+{yesterday_earned}` shown more muted, for comparison.
- **Trend + copy** — derived from today vs yesterday:
  - `today_earned === 0` → `Earn your first points today →` (neutral/amber).
  - `today_earned >= yesterday_earned` (and `> 0`) → up-trend icon +
    `🔥 Beating yesterday!`
  - else (`0 < today < yesterday`) → down/flat icon + `Keep it up →`.
- All numbers fall back to `0` before load (`wallet?.x ?? 0`). Uses the existing
  `useWallet()` already imported in Today.

### Marketplace = points page (`MarketplaceScreen.tsx`)
Add a compact **menu row** at the top of the screen (above the balance header or
just under it), with small icon+label buttons:
- **Log** → `/wallet` (Wallet icon)
- **Leaderboard** → `/leaderboard` (Trophy icon)
- **Manage** → `/marketplace-admin` (Settings icon) — only when
  `canManageMarketplace(boot)` (import `useBoot` + `canManageMarketplace`).

The rest of the screen (balance header, reward grid, redeem sheet, empty/loading
states) is unchanged.

### Routing + cleanup (`App.tsx`, `Today.tsx`)
- Homepage points card → `/marketplace` (was `/points`).
- **Delete** `frontend/src/pages/PointsScreen.tsx` and its
  `<Route path="/points" .../>` + import in `App.tsx`. Marketplace is the points
  page now; nothing else links to `/points` (the prior iteration only reached it
  from the home card).

### Me screen
Unchanged — the "Manage Marketplace" admin row stays.

## Data flow

- `useWallet()` feeds the homepage card (balance + today/yesterday) and the
  marketplace balance header. The two new fields ride the existing query — no new
  hook.
- `canManageMarketplace(boot)` gates the marketplace menu's Manage button.

## Edge cases / error handling

- First render before wallet loads → `0` everywhere via `?? 0`; trend copy shows
  the "earn your first points" neutral state, which is acceptable pre-load.
- No native dialogs, no new permissions, no schema change.

## Out of scope

- Streaks, next-reward progress bars (considered, not chosen).
- Any bottom-nav change.
- Changes to wallet/leaderboard/admin screens themselves.

## Testing & deployment

- **Tests deferred** — live site, no test DB. Verify manually: homepage card
  shows balance + today/yesterday with sensible trend copy; tapping it opens the
  marketplace; the marketplace top menu reaches Log/Leaderboard and (as admin)
  Manage; `/points` no longer resolves (redirects to `/` via catch-all).
- **Deploy:** `bench --site project.vernon.id restart` (get_wallet change; HUP
  the gunicorn master if supervisorctl needs sudo) + `cd frontend && npm run
  build`; commit regenerated `vernon_project/public/frontend/**` +
  `vernon_project/www/m.html`.

## File structure

- Modify: `vernon_project/api/mobile.py` (`get_wallet`)
- Modify: `frontend/src/lib/types.ts` (`Wallet`)
- Modify: `frontend/src/pages/Today.tsx` (motivating card)
- Modify: `frontend/src/pages/MarketplaceScreen.tsx` (top menu row)
- Modify: `frontend/src/App.tsx` (drop `/points`, route + import)
- Delete: `frontend/src/pages/PointsScreen.tsx`
