# Merge Badge into Achievements + mobile admin — Design

**Date:** 2026-06-29
**Status:** Draft (design); awaiting user review

## Summary

Collapse the separate Badge-tier system into the unified **Avatar Achievement**
list. Achievement rows flagged `is_tier` form the rank ladder (the profile pill =
your highest met tier); *every* row (tiers included) can grant a reward when met.
The 10 existing warrior tiers migrate into achievement rows; the old
`Badge Settings` doctype + its `/w` editor are retired. Management of the unified
system is added to the **mobile** app too (an admin-gated "Gamification" row in
the Me menu), alongside the existing `/w` editor.

## Data model

### `Avatar Achievement` (child of Avatar Gamification Settings) — add 2 fields
| Field | Type | Notes |
|-------|------|-------|
| `is_tier` | Check | this row is a rank tier (drives the badge pill) |
| `color` | Data | hex for the tier pill (tiers only) |

(existing: `code`, `title`, `icon`, `condition`, `threshold`, `reward_points`, `reward_asset`)

A **tier** is an achievement with `is_tier=1` (conventionally `condition=badge_points`).
The badge **pill** = the highest-threshold tier whose threshold ≤ the user's
work-points (`_badge_points`). Non-tier rows are regular achievements.

## Backend

- **`_user_badge(user)` rewrite:** instead of reading `Badge Settings.tiers`,
  read the `is_tier` achievements from `Avatar Gamification Settings`, pick the
  highest `threshold ≤ _badge_points(user)`, return `{tier_name: title, color,
  icon}`. (Same return shape → leaderboard/comments/profile pills unchanged.)
  `_badge_tiers()`/`get_badge_settings`/`save_badge_settings` become unused
  (left defined but dead, or removed — see Retire).
- **Rewards on tiers:** `get_gamification`'s existing achievement loop already
  grants any met achievement once (idempotent via `Avatar Reward Claim` + lock).
  Tiers are achievements, so reaching a tier grants its reward (if it has one) +
  updates the pill. Tier rows may have `reward_points=0`/no asset (pill only) —
  admin's choice.
- **`get/save_gamification_settings`:** the achievements array now round-trips
  `is_tier` + `color` (they're just child fields; include them in the
  get serialization and accept them on save).
- **Migration patch:** read existing `Badge Settings.tiers` (Badge Tier rows:
  tier_name/min_points/color/icon) → for each, upsert an `Avatar Achievement`
  on Gamification Settings with `is_tier=1`, `code="tier_<min_points>"`,
  `title=tier_name`, `icon`, `color`, `condition="badge_points"`,
  `threshold=min_points`, `reward_points=0`, no asset. Idempotent (skip if a
  tier row with that code exists). Runs once via `patches.txt`.

## Retire Badge Settings

- `_user_badge` no longer references `Badge Settings` → the doctype + its data
  become irrelevant to the running app.
- **`/w`:** remove the Badge Settings page + its route; the nav/menu "Manage
  Badges" entry repoints to **Gamification Settings**.
- Keep the `Badge Settings`/`Badge Tier` doctypes defined (no destructive drop on
  the live DB) but unused; `get_badge_settings`/`save_badge_settings` left dead
  (or removed) — they no longer drive anything.

## Admin UI

### `/w` (extend existing `GamificationSettings.tsx`)
The achievements table gains an `is_tier` checkbox column + a `color` input
(shown/relevant when `is_tier`). Tier rows sort/group sensibly. Everything else
(price, level curve, daily, level rewards, non-tier achievements) unchanged.

### `/m` (new) — mobile admin screen
- New `frontend/src/pages/GamificationSettingsScreen.tsx` (Soft-Pop), mirroring
  the web editor's fields: the 5 scalar settings, the **achievements** editable
  list (title/icon/condition/threshold/reward points/reward asset + `is_tier` +
  `color`), and the **level rewards** list. Uses the same
  `get/save_gamification_settings` API.
- Route `/gamification-settings` in `frontend/src/App.tsx`, gated by
  `canManageBadges` (System Manager).
- A **"Gamification"** `Row` in the mobile `Profile.tsx` admin menu (admin-gated),
  → `/gamification-settings`. The existing mobile "Manage Badges" row is removed
  (its function is now inside Gamification Settings).

## Error handling

- Pre-migration / no tier rows → `_user_badge` returns `None` (no pill) instead of
  crashing; falls back gracefully (today's behavior when no tiers).
- Save validation (existing clamps) unchanged; `color` accepts any string (hex).
- Admin-gated endpoints reject non-admins (existing `_require_marketplace_manager`).
- No native alert/confirm — Toast/dialog.

## Testing

- Backend: `_user_badge` picks the correct tier from `is_tier` achievements at a
  threshold boundary; migration creates tier rows from Badge Tier; a tier with a
  reward grants once via `get_gamification`. Hermetic `FrappeTestCase`.
- Frontend: manual /w + /m — edit a tier (toggle is_tier, set color, threshold),
  save, confirm the pill reflects it.

## Deploy

`bench migrate` (Avatar Achievement field add + migration patch) + reload +
`npm run build` both SPAs. After deploy the warrior tiers live as
achievements; the pill is computed from them; admins manage everything in
Gamification Settings on both web and mobile.

## Risks / open items

- The migration must run before `_user_badge` has tier data, or pills briefly
  vanish — patch runs during `bench migrate`, before the app serves the new code
  fully; acceptable (pill simply absent for the migrate window).
- A `badge_points` tier and a same-threshold non-tier achievement can coexist
  (e.g. the seeded "Knight" pts300 achievement vs a 300 tier) — harmless, both
  evaluate independently; admin can dedup.
- Leaderboard/comment badge rendering already consumes `_user_badge`'s shape — no
  change needed there.
