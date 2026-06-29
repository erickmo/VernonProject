# Avatar Gamification (levels, achievements, daily/streak, all configurable) — Design

**Date:** 2026-06-29
**Status:** Draft (design); awaiting user review

## Summary

Make the avatar economy actually engaging: every parameter (prices, level curve,
achievement rules, daily reward) lives in **one admin-editable settings
doctype**, and three earning loops feed it — an **avatar level/XP** (from points
you already earn), **achievements** (free cosmetics for doing things), and a
**daily reward + streak**. Rewards = points (credited to the wallet, so unlocks
become affordable) + free cosmetic unlocks (reusing `Avatar Unlock` at cost 0).

**Why:** today premium = a hardcoded 5000 pts while the only users with points
have balances of 15/44/1 — nothing is buyable, the whole freemium/collectibles
system is dead. Putting price in settings + adding earning loops fixes that.

Built as one spec in **5 phases**, each its own plan + deploy.

## Configuration — `Avatar Gamification Settings` (single doctype, admin-editable)

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `premium_price` | Float | 50 | DiceBear variant unlock price (replaces hardcoded 5000) |
| `points_per_level` | Float | 100 | XP per level; `level = lifetime_points // points_per_level + 1` |
| `daily_reward_points` | Float | 10 | base daily claim |
| `streak_bonus_points` | Float | 5 | added per consecutive day |
| `streak_cap` | Int | 7 | max streak days counted toward bonus |
| `level_rewards` | Table `Avatar Level Reward` | — | per-level grants |
| `achievements` | Table `Avatar Achievement` | — | achievement defs |

Child `Avatar Level Reward`: `level` (Int), `reward_points` (Float), `reward_asset` (Link → Avatar Asset).
Child `Avatar Achievement`: `code` (Data, unique-in-table), `title` (Data), `icon` (Data, emoji), `condition` (Select: `todos_completed` / `badge_points` / `streak_days`), `threshold` (Float), `reward_points` (Float), `reward_asset` (Link → Avatar Asset).

Asset rarity (optional): add `rarity` (Select: Common/Rare/Epic/Legendary) to
`Avatar Asset` for a colored tag; per-asset `price` already exists (admin-tuned).

`_settings()` reads the single doc (cached); `_premium_price()` returns
`premium_price`. `buy_avatar_option` + `get_avatar_catalog` use it instead of the
5000 constant.

## Avatar Level / XP

- **XP = lifetime earned points** (`Σ Point Ledger.points_earned`, all sources —
  so daily/achievement credits also raise level).
- `level = int(lifetime // points_per_level) + 1`; `xp_into = lifetime %
  points_per_level`; `xp_to_next = points_per_level − xp_into`.
- **Level rewards:** on `get_gamification()`, for each `Avatar Level Reward` whose
  `level ≤ current level` and not yet claimed by the user → grant
  (`reward_points` via Point Ledger source "Reward" + `reward_asset` via
  `Avatar Unlock` cost 0) and record the claim. Newly-granted rewards are
  returned so the UI can celebrate.
- UI: a **Level N** chip + XP progress bar on Profile/Me + the customizer header.

## Achievements

- Conditions (evaluated server-side):
  - `todos_completed` — count of the user's completed Project Todos ≥ threshold.
  - `badge_points` — lifetime todo-source points ≥ threshold (mirrors badge tiers).
  - `streak_days` — current daily streak ≥ threshold.
- On `get_gamification()`: for each achievement, compute `progress` and `met`;
  if `met` and not claimed → grant (`reward_points` + `reward_asset`) once + record.
- UI: an **Achievements** screen (grid: icon, title, progress bar, locked/unlocked,
  reward). Linked from the avatar/profile menu.

## Daily reward + streak

- `Avatar Daily` doctype (one per user: `user` unique, `last_claim` Date, `streak` Int).
- `claim_daily()`: if `last_claim == today` → already claimed (no grant). If
  `last_claim == yesterday` → `streak += 1` else `streak = 1`. Grant =
  `daily_reward_points + streak_bonus_points × (min(streak, streak_cap) − 1)` via
  Point Ledger (source "Daily"). Update `last_claim=today`. Returns granted +
  new streak.
- UI: a **daily claim card** (on the avatar/profile screen): shows streak, the
  claimable amount, a Claim button (disabled once claimed today).

## Rewards mechanism (reused infra)

- **Points:** insert a `Point Ledger` row (`user`, `points_earned`, `role`
  "Assignee", `source` in {"Daily","Reward","Achievement"}). Raises `earned` →
  `_user_balance` → affordable unlocks. (These sources are excluded from the
  leaderboard/badge like Grant/Gift — confirm in `_user_badge`/leaderboard
  filters; add the new sources to the exclusion list so earned cosmetics-points
  don't inflate work rankings.)
- **Cosmetics:** `Avatar Unlock` (`style="_asset"`, `slot=asset_type.lower()`,
  `option_value=asset_name`, `cost=0`). Already owned → skip.
- **Once-only claims:** `Avatar Reward Claim` doctype (`user`, `claim_type` in
  {level, achievement}, `claim_ref` = level number or achievement code). Unique
  per (user, type, ref).

## API (`api/mobile.py`)

- `_settings()`, `_premium_price()` — read/caches the single doc.
- `get_gamification()` → `{level, lifetime, points_per_level, xp_into,
  xp_to_next, balance, newly_granted:[...], achievements:[{code,title,icon,
  condition,threshold,progress,met,claimed,reward_points,reward_asset}],
  daily:{streak, can_claim, claimable, last_claim}}`. Grants pending
  level/achievement rewards as a side effect (idempotent via claims).
- `claim_daily()` → `{streak, granted, balance, last_claim}`.
- `get_gamification_settings()` / `save_gamification_settings(...)` — admin
  (System Manager / Marketplace Manager), for the settings UI.
- `buy_avatar_option`/`get_avatar_catalog` read `_premium_price()` (not 5000).
- `seed_gamification_settings()` — create the single doc with sane defaults +
  a starter set of level rewards + achievements (run via migrate patch).

## Admin settings UI

A `/w` page (mirror the existing `BadgeSettings.tsx`): edit `premium_price`,
`points_per_level`, daily fields, the `level_rewards` table, and the
`achievements` table (each row: condition + threshold + reward asset + points +
icon). Gated to System Manager / Marketplace Manager.

## User-facing UI

- **Level chip + XP bar** on Profile/Me hero + customizer header.
- **Daily claim card** on the profile/avatar screen.
- **Achievements screen** (route `/achievements`), linked from the Me menu.
- Newly-granted level/achievement rewards → a celebratory Toast on load.

## Phasing

0. **Settings + price-from-settings** — `Avatar Gamification Settings` (+ child
   tables) + seed + `_premium_price()` wired into buy/catalog. (Economy
   immediately fixable.)
1. **Level/XP** — compute + level rewards + `get_gamification` level fields + UI bar.
2. **Achievements** — conditions + grant + `Avatar Reward Claim` + UI screen.
3. **Daily/streak** — `Avatar Daily` + `claim_daily` + UI card.
4. **Admin settings UI** (`/w`).

Each phase = its own plan + review + deploy.

## Error handling

- Missing/blank settings → fall back to defaults (`premium_price` 50 etc.) so
  nothing crashes pre-seed.
- Grants are idempotent (claim records / already-owned checks); double `get`
  won't double-grant.
- `claim_daily` rejects a second claim same day; never native alert (Toast/dialog).
- A reward_asset that's missing/deactivated → grant the points, skip the cosmetic.

## Testing

- Backend (`FrappeTestCase`): level math at thresholds; level reward granted
  once (idempotent); achievement met→grant→claimed; daily claim + streak
  increment/reset + same-day reject; `_premium_price` from settings; reward
  points raise balance + are leaderboard-excluded.
- Frontend: headless-render level bar from a config; manual /m /w check.

## Deploy

`bench migrate` (new doctypes + patch seeds settings) + reload + `npm run build`
both SPAs. Admin opens settings, sets reachable prices → economy live.

## Risks / open items

- Level rewards/achievements reference `Avatar Asset` rows that must exist
  (seed before referencing).
- Reward-point sources MUST be excluded from leaderboard/badge math, or daily
  grinding would distort work rankings — explicit exclusion list.
- Evaluating achievements on every `get_gamification` is cheap at this user count
  (3); if it grows, move grants to event hooks.
