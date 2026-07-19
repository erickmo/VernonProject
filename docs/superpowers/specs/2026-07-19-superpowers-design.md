# Superpowers — Design

**Date:** 2026-07-19
**Status:** Approved (brainstorming), pending implementation

## Problem

Give every user a set of **superpowers** (workspace/company traits) surfaced two ways:

1. **My Superpowers** — the user self-selects the traits they claim (multi-select).
2. **Peer-Voted Superpowers** — other users score a user 0–10 on **any** trait
   (independent of self-claims). Each trait gets a **confidence-weighted level**
   from those votes.

Plus: configurable **leveling settings**, **badges** (per-trait level badge + a
top-level achievement badge), and a **per-person screen** on both frontends.
Votes optionally **mint recognition points** to the rated user.

## Data model (5 DocTypes)

### `Superpower` (catalog)
| Field | Type | Notes |
|---|---|---|
| `superpower_name` | Data, unique, reqd | e.g. "Leadership" |
| `category` | Select | `Leadership`, `Sales & Growth`, `Strategy`, `Execution`, `Interpersonal`, `Craft` |
| `icon` | Data | emoji or lucide name |
| `color` | Data | hex/token for the chip |
| `description` | Small Text | one-line explainer |
| `enabled` | Check, default 1 | hides from pickers when 0 |

Autoname `field:superpower_name`. Admin-managed; **seeded** by a patch with:
Visionary, Problem Solving, Sales, Marketing, Strategic Thinking, Negotiation,
Leadership, Communication, Execution & Ownership, Creativity, Analytical Thinking,
Coaching & Mentoring, Adaptability, Customer Focus, Financial Acumen, Product Sense,
Operational Excellence, Storytelling, Teamwork, Decision Making.

### `User Superpower` (My Superpowers)
`{user: Link User, superpower: Link Superpower}`. One row per (user, superpower).
Autoname hash. The `set_my_superpowers` endpoint replaces the user's full set.

### `Superpower Vote` (Peer-Voted)
`{ratee: Link User, voter: Link User, superpower: Link Superpower, score: Int}`.
`score` 0–10. One editable row per (ratee, voter, superpower) — upsert. Autoname hash.
Constraints enforced in the endpoint: `voter != ratee`, `0 ≤ score ≤ 10`.

### `Superpower Settings` (Single) + `Superpower Level` (child table)
Single fields: `prior_mean` (Float, default 5), `confidence_k` (Int, default 3),
`vote_points` (Int, default 0), `levels` (Table → Superpower Level).
`Superpower Level` (istable): `{level_name: Data, min_score: Float, color: Data, icon: Data}`.
Seeded bands: Emerging 0 / Capable 4 / Strong 6 / Expert 8 / Master 9.

## Leveling — confidence-weighted

For a (ratee, superpower) with `n` votes summing to `S` (avg = S/n):

```
W = (S + prior_mean * K) / (n + K)          # K = confidence_k
```

- Few votes ⇒ `W` shrinks toward `prior_mean` (neutral); many votes ⇒ `W → avg`.
  A single lucky 10 with K=3, prior=5 gives W=(10+15)/4=6.25, not 10.
- **Level** = the highest `Superpower Level` band whose `min_score ≤ W`
  (none if `W` below the lowest band ⇒ unranked).
- `prior_mean` and `confidence_k` are Settings knobs — real vote distributions
  need tuning; do not hardcode.

Aggregate shape returned per voted superpower:
`{superpower, name, icon, color, category, avg, count (n), weighted (W), level: {level_name,color,icon}|null, my_vote|null}`.

## Badges

- **Per-superpower level badge** — derived: the band's `color`+`icon`+`level_name`
  rendered on each voted trait. No storage.
- **Signature superpower** — the user's voted trait with the highest `W`
  (requires `n ≥ 1`), shown as a headline badge on the profile.
- **Achievement badge "Superpowered"** — derived boolean: true when any voted
  superpower reaches the **top** band. Shown on the superpower screen and as a
  small marker on the user profile.

## Recognition points

`cast_vote` mints `vote_points` (Settings, default 0) to the **ratee** as a
`Point Ledger` row `source='Recognition'` (off the productivity leaderboard,
feeds the Character board — same as reactions). Mirrors `mobile.py::_recognition_credit`:
- **Idempotent** per (voter, ratee, superpower) — re-voting/updating the score
  does not farm additional points (one credit per triple, keyed via `note`/ref).
- Shares the existing `recognition_weekly_cap` per giver.
- **Default 0 ⇒ inert.** No points until an admin sets `vote_points`.

## API — `vernon_project/api/superpowers.py`

All `@frappe.whitelist()`. Session user = `frappe.session.user`.

| Endpoint | Args | Auth | Behavior |
|---|---|---|---|
| `list_superpowers` | — | any | Enabled catalog `[{name, category, icon, color, description}]`. |
| `get_my_superpowers` | `user` | any | The user's self-claimed superpowers. |
| `set_my_superpowers` | `user`, `superpowers[]` | the user themselves or admin | Replace the user's `User Superpower` set (dedup, valid catalog only). |
| `get_user_superpowers` | `user` | any logged-in | Profile view: `{mine:[…], voted:[aggregate…], signature, achievement}` with `my_vote` per voted trait for the caller. |
| `cast_vote` | `ratee`, `superpower`, `score` | any logged-in, `ratee != voter` | Upsert the caller's vote (0–10); mint recognition points; return the trait's updated aggregate. |
| `remove_vote` | `ratee`, `superpower` | the voter | Delete the caller's vote for that trait. |
| `save_superpower` | fields | admin | Create/update a catalog entry. |
| `delete_superpower` | `name` | admin | Soft: set `enabled=0` (keep vote history intact). |
| `get_superpower_settings` / `save_superpower_settings` | — / fields+levels | any read / admin write | Read/edit levels + tuning knobs + vote points. |

## Frontend (both `/m` and `/w`)

Shared types in `frontend/src/lib/types.ts`, api in `frontend/src/lib/api.ts`,
hooks in `frontend/src/hooks/useData.ts` (under `@`, consumed by both).

**Per-person Superpower screen** (route on each frontend; reached from the user
profile / users list):
- Header: avatar, signature superpower badge, "Superpowered" achievement badge if earned.
- Toggle **My Superpowers** ↔ **Peer-Voted**.
  - *My Superpowers*: chips of self-claimed traits. On the viewer's **own**
    profile, an editor (`MultiSelectSearch` over the catalog) → `set_my_superpowers`.
  - *Peer-Voted*: each voted trait as a card — level badge (color/icon), average,
    vote count, and the viewer's **0–10 control** (slider/segmented) to cast/update
    their vote → `cast_vote`; plus an "add a trait to vote on" picker from the catalog.
- Bahasa labels; soft-pop styling; `SearchableSelect`/`MultiSelectSearch`, no native select.

**Admin Superpower Settings screen** (in the existing admin/settings area, /w
primary, /m if trivial): edit level bands (name/min_score/color/icon), `prior_mean`,
`confidence_k`, `vote_points`; manage the catalog (add/edit/disable traits).

## Testing

`test_superpowers.py`:
- `set_my_superpowers` replace/dedup/self-or-admin gate.
- `cast_vote`: clamp 0–10, `voter != ratee`, upsert (second vote updates not dupes).
- Leveling: `W` formula for n=1 vs n=many (shrink toward prior), band selection,
  unranked below lowest band.
- `get_user_superpowers`: mine vs voted independent; signature = max W; achievement
  = top band reached.
- Recognition minting: default 0 ⇒ no ledger row; >0 ⇒ one row per triple,
  re-vote does not double-mint; weekly cap respected.

Live site, no test DB — rows self-clean (mirror `test_leader_notes.py`).

## Deploy

- New DocTypes ⇒ `bench migrate`; seed patch runs on migrate.
- Python ⇒ `sudo /usr/local/bin/tj-restart`.
- Frontend ⇒ rebuild both bundles.
- App-shape change ⇒ `python3 scripts/gen_docs.py` (add the 5 DocTypes to CLUSTERS),
  commit `data.js`.
- User-visible ⇒ App Release row (Bahasa What's New). The points aspect is inert
  by default — announce the feature, not the (off) points.
