# Nested Work-Type → Difficulty Levels — Design

**Date:** 2026-06-26
**Status:** Approved (brainstorm), pending implementation plan
**Builds on:** 2026-06-25 work-type + time-based points (shipped). That made each Group "level" a work-type with ONE fixed `difficulty_percent`. This change makes each type hold MULTIPLE difficulty levels.

## Problem

A work-type currently carries a single difficulty %. We want each type to own a list
of difficulty levels (each its own %), so a todo picks **type + level**. Example:
Engineering → "Backend Development" → { Small 30%, Feature 70%, System 100% }.
Points stay derived: `point = base_rate_per_minute × estimated_minutes × (difficulty_percent / 100)`.

## Decisions (locked during brainstorm)

- Each type defines its OWN levels (not a shared/global ladder).
- Frappe can't nest child tables → keep the flat `Group Level` child table, add a
  `type_name` grouping column. One row = one level within a type.
- Migration: each existing Group Level row → a type with one default level
  (`type_name = old level_name`, `level_name = 'Standard'`, difficulty unchanged).
- Todo picker becomes two-step: Type → Level. The todo stores the chosen level's
  `level_id` (unique) as the source of truth.
- Point formula and `_compute_earned()` / Point Ledger are UNCHANGED.

## Approach (chosen)

Flat `Group Level` table + `type_name` grouping. A todo still snapshots a single
row's `difficulty_percent` via `level_id`, so the backend barely changes. Rejected:
separate "Work Type" + "Type Level" linked doctypes (Frappe can't nest child tables;
forces join queries and a rewrite of how the group form persists — high churn, no
payoff over the flat model).

## Data model

**Group Level** (child of Group) — add `type_name`:
- `type_name` (Data, reqd) — the work-type (e.g. "Backend Development"). `in_list_view`.
- `level_name` (Data, reqd) — the difficulty level within the type (e.g. "Small"). `in_list_view`.
- `difficulty_percent` (Percent, reqd, default 100). `in_list_view`.
- `level_id` (Data, read-only, hidden) — stable per-row key the todo points at. Unchanged.
- `field_order`: `["type_name", "level_name", "level_id", "difficulty_percent"]`.
- A type with N levels = N rows sharing `type_name`.

**Group** — `base_rate_per_minute` unchanged.

**Project Todo** — add `level_type` (Data, read-only) caching the chosen row's
`type_name` for unambiguous display (two types can share a level name like "Large").
`level_id` stays the truth; `level` caches the level_name; `point` still computed.

## Point computation

`snapshot_point_from_level()` (project_todo.py) resolves `level_id` → row
`(type_name, level_name, difficulty_percent)`, sets `self.level = level_name`,
`self.level_type = type_name`, and computes
`point = group.base_rate_per_minute × self.estimated × (difficulty_percent / 100)`.

Edge cases preserved: no group/type/estimate → point 0; stale `level_id`
(level deleted) → keep cached level/level_type/point, don't throw. The legacy
name-only fallback (level_name without level_id) becomes ambiguous under nesting
(a name can repeat across types) — it remains only as a last resort for pre-existing
todos; `level_id` was already backfilled for all todos in the prior feature, so this
path is effectively dead. If used and the name matches multiple rows, take the first
and do not throw.

## Migration

Patch `patches/v1_0/nest_type_levels.py` (idempotent):
- Add `type_name` (migrate adds the column).
- For each existing Group Level row WHERE `type_name` is NULL/empty: set
  `type_name = level_name`, then `level_name = 'Standard'`. (Each old single-difficulty
  type becomes a type with one default level at its current %.)
- Existing Project Todo rows keep `level_id` → points unchanged; not recomputed.
- Register in `patches.txt`.

## Consumers

- **Group desk form** (`group.json` child grid): `type_name` shows automatically via
  `in_list_view`. **Project Todo desk JS** (`project_todo.js`): the level picker lists
  combined `${type_name} · ${level_name}` options mapped to `level_id`; on select it
  sets `level_id` (+ `level`, `level_type`), letting the server compute point.
- **Shared TS types** (`frontend/src/lib/types.ts`, used by both apps via `@/`):
  `GroupLevel` adds `type_name`; `ScoringGroupPayload` levels add `type_name`.
- **GroupForm** (mobile `GroupFormScreen.tsx` + web `GroupForm.tsx`): nested editor —
  a list of types; each type has an editable name and its own list of level rows
  (level_name + difficulty% with ± steps, add/remove level), plus add/remove type. The
  flat per-row editor is replaced. Per-group `base_rate_per_minute` input stays.
- **Create/edit todo** (mobile `CreateProjectItemSheet.tsx` + `ProjectItemScreen.tsx`,
  web `CreateProjectItemDialog.tsx` + `ProjectItem.tsx`): two-step Type → Level select;
  the level option `value` is its `level_id` (not level_name); label
  `${level_name} (${difficulty%})`. Submit sends `level_id`. Live point preview uses the
  chosen level's `difficulty_percent`. Backend `update_todo` already accepts `level_id`.

## Out of scope (YAGNI)

- Shared/global difficulty ladders across types (each type owns its levels).
- Per-todo difficulty override beyond the chosen level.
- Reordering types/levels beyond what the existing Sortable affords (keep current DnD if
  trivially adaptable; otherwise plain add/remove order).

## Testing

LIVE single-site, no test DB — defer automated tests; verify via `bench console` +
manual UI. Manual: a type with 2+ levels at distinct %s; create a todo picking type+level;
confirm `point = base_rate × estimated_minutes × difficulty%` and ledger credit on
completion; confirm an existing migrated type shows one "Standard" level and its old
todos' points are unchanged.
