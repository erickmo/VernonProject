# Homepage Points Card + Points Hub — Design

**Date:** 2026-06-22
**Status:** Approved (design); implementation pending
**Builds on:** points feature (`2026-06-21-...`) + catalog admin (`2026-06-22-mobile-catalog-management-...`)

## Summary

Make points more prominent on the homepage and consolidate the points
sub-screens behind a single hub. Frontend-only; no backend changes.

1. **Homepage** — remove the small balance chip in the Today hero and add a
   **dedicated points card** below the hero showing the spendable balance; tap →
   Points hub.
2. **Points hub** (`/points`) — a screen (back-button DetailScreen, **not** a
   bottom-nav tab) with a balance header and links to Points log, Leaderboard,
   Marketplace, and — for admins — Manage Marketplace.
3. **Me screen** — remove the duplicate "Rewards" card (balance + 3 links). The
   admin **"Manage Marketplace"** row stays under Me's management rows.
4. **Bottom nav** — unchanged (5 tabs). Points is reached via the homepage card,
   not a tab.

## Components

### Homepage (`Today.tsx`)
- **Remove** the balance chip currently in the hero chip-row (the
  `navigate('/marketplace')` "pts" button).
- **Add** a dedicated points card directly below the hero: a tappable card
  (gradient or `shadow-card`, consistent with existing cards) showing
  `wallet.balance` as a prominent number with a "Points" / "spendable" label and
  a chevron; `onClick` → `navigate('/points')`. Uses the existing `useWallet()`
  hook (already imported in Today). Balance falls back to `0` before load.

### Points hub (`PointsScreen.tsx`, route `/points`)
- `DetailScreen` titled "Points".
- Balance header (gradient card) from `useWallet()` — spendable balance.
- A `divide-y` rows card (same pattern as the Profile management card) with:
  - **Points log** (`Wallet` icon) → `/wallet`
  - **Leaderboard** (`Trophy` icon) → `/leaderboard`
  - **Marketplace** (`Store` icon) → `/marketplace`
  - **Manage Marketplace** (`Settings` icon) → `/marketplace-admin`, shown only
    when `canManageMarketplace(boot)`.
- No access gate on the hub itself (the user-facing rows are open to all; the
  admin row is gated and `/marketplace-admin` re-checks server-side).

### Me screen (`Profile.tsx`)
- **Remove** the "Rewards" card block (the gradient balance header + Points log
  / Leaderboard / Marketplace rows) added previously.
- **Keep** the "Manage Marketplace" row in the management-rows card (alongside
  Manage Groups / Brands / Users), gated by `canManageMarketplace`. (Intentional
  small duplication with the hub's admin row — two valid entry points for
  admins.)
- Drop any imports left unused after removing the card (e.g. `Coins`, `Wallet`,
  `Trophy`, `Store` if no longer referenced; keep `Settings`/`Users` etc. still
  used). `useWallet` import in Profile is removed if the card was its only use.

### Routing (`App.tsx`)
- Add `import PointsScreen from './pages/PointsScreen'` and
  `<Route path="/points" element={<PointsScreen />} />` (ungated, like
  `/wallet`).

## Data flow

- `useWallet()` (existing) feeds both the homepage card and the hub balance
  header. No new endpoints, types, or hooks.
- `canManageMarketplace(boot)` (existing) gates the hub's admin row.

## Error handling / edge cases

- Balance undefined on first render → display `0` via `?? 0` (existing pattern).
- No native dialogs introduced. No new permissions.

## Out of scope

- Any bottom-nav change (explicitly cancelled).
- Backend changes.
- Changing the wallet/leaderboard/marketplace/admin screens themselves.

## Testing & deployment

- **Tests deferred** — live site, no test DB. Verify manually: homepage shows a
  points card with the balance and opens `/points`; the hub lists the 4 rows
  (Manage Marketplace only for an admin); Me no longer shows the Rewards card but
  still shows Manage Marketplace for admins; the old hero chip is gone.
- **Deploy:** frontend only → `cd frontend && npm run build`; commit regenerated
  `vernon_project/public/frontend/**` and `vernon_project/www/m.html`. No
  `migrate`, no `restart`.

## File structure

- Create: `frontend/src/pages/PointsScreen.tsx`
- Modify: `frontend/src/pages/Today.tsx` (remove chip, add card),
  `frontend/src/pages/Profile.tsx` (remove Rewards card, prune imports),
  `frontend/src/App.tsx` (add `/points` route).
