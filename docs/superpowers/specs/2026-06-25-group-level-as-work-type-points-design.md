# Group Level → Work-Type + Time-Based Points — Design

**Date:** 2026-06-25
**Status:** Approved (brainstorm), pending implementation plan

## Problem

Today a Group's `levels` are numeric difficulty tiers (0–10), each carrying a
hand-set `point` value. A Project Todo picks one level and snapshots that fixed
`point`. Hand-set points are not fair across groups and don't reflect how much
work a todo actually is.

We want levels to become **named work-types** (e.g. Engineering → "Software
Design", "Backend Development", "Mobile App Development"), and we want the points
a user earns to be **derived** from how long the work takes and how hard the type
is — so scoring is fair and automatic instead of manually assigned.

## Decisions (locked during brainstorm)

- Each work-**type** carries a difficulty, expressed as a **percentage**, **fixed
  on the type** (not chosen per todo).
- Difficulty % is **free entry per type** (guideline: ~5 tiers, e.g.
  20/40/60/80/100, but not enforced).
- Point formula: **`point = base_rate_per_minute × estimated_minutes ×
  (difficulty_percent / 100)`**.
- `base_rate_per_minute` lives **per-Group**.
- Estimated time is in **minutes** (the existing `estimated` field already is).
- Approach: **repurpose existing doctypes/fieldnames in place**; relabel UI only.
- Backfill existing types' `difficulty_percent` to **100%**.

## Approach (chosen)

Repurpose the existing `Group Level` child doctype as the work-type. Keep
fieldnames (`level_name`, `level_id`, `level`) to avoid churn across todos, the
point ledger, and web/mobile endpoints; relabel them "Type" in the UI. Swap the
type's static `point` field for `difficulty_percent`. Add `base_rate_per_minute`
to Group. Compute the todo's `point` at validate instead of reading a static
value. Historical todos keep their already-snapshotted points untouched.

Rejected: a brand-new "Work Type" doctype (breaks every existing reference, full
data migration, cosmetic gain) and keeping the old static `point` alongside a new
difficulty field (dead field — points are derived now).

## Data model

**Group** (`doctype/group/group.json`)
- ADD `base_rate_per_minute` (Float, default `1`).
- Unchanged: `late_penalty`, `early_bonus`, `leader_weight`,
  `leader_late_penalty`, `leader_early_bonus`.

**Group Level** = the work-type (`doctype/group_level/group_level.json`)
- `level_name` (Data) — the type name (UI label → "Type"). Unchanged fieldname.
- REPLACE `point` (Float) with `difficulty_percent` (Percent).
- `level_id` (Data, read-only) — unchanged; remains the stable key.

**Project Todo** (`doctype/project_todo/project_todo.json`)
- No schema change. `point` becomes computed, not user-picked.
- `estimated` (already minutes) is the time input.

## Point computation

`snapshot_point_from_level()` (project_todo.py:48) changes: read the type's
`difficulty_percent` (instead of static `point`) and compute

```
point = group.base_rate_per_minute × self.estimated × (difficulty_percent / 100)
```

- Runs at validate on every save until the todo is locked. `estimated` is already
  frozen once status is Done/Completed (`validate_done_todo_fields`,
  project_todo.py:198), so `point` freezes at the same point.
- `_compute_earned()` (project_todo.py:214) is **unchanged** — it still layers
  late/early/leader weighting on top of the computed `point`. The point ledger
  upsert (project_todo.py:248) is unchanged.

### Edge cases (preserve current behavior)
- No group, no type, or no estimate → `point = 0`.
- Type's `level_id` no longer resolves (type deleted after snapshot) → keep the
  cached `point`/`level` untouched (do not throw), exactly as today.
- Legacy todo with a `level` name but no `level_id` → match by name, backfill
  `level_id`, then compute, as today.

## Migration

Add a patch under `patches/v1_0/`:
- Group: set `base_rate_per_minute = 1` where null.
- Group Level: ensure `difficulty_percent` exists; backfill to `100` for all
  existing rows. (Old static `point` does not map cleanly to a %; it is dropped.)
- Existing Project Todo rows: **untouched** — their `point` is already
  snapshotted. Only an explicit re-save recomputes under the new formula.

Register the patch in `patches.txt`.

## Consumers to update

Surfaces that currently pick a "level" or display its points must move to the
type + computed-point model. Exact list is a discovery step in the plan
(grep `level_id`, `level_name`, `\bpoint\b` across `api/` and the web/mobile
frontend source):
- `api/mobile.py` — endpoints that list a group's levels and create todos; any
  point preview.
- Web app todo-create UI — "level" picker → "Type" picker; show live computed
  points (`base_rate × estimated × difficulty%`).
- Group form (desk) — levels child table relabel + new `base_rate_per_minute` and
  `difficulty_percent` fields.

## Out of scope (YAGNI)

- Per-todo difficulty override (difficulty is fixed on the type).
- Global/per-type base rates (per-Group only).
- Enforced 5-tier preset (free % entry; 5 tiers is guidance).
- Reverse-engineering old `point` values into difficulty %.

## Testing

Live site, no test DB — defer automated tests to the final phase per project
convention. Manual validation after deploy: create a type with a known
difficulty%, set a Group base rate, create a todo with a known `estimated`, and
confirm `point` = base × minutes × difficulty%, and that completion credits the
expected ledger amount after late/early/leader weighting.
