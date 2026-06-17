# Group Points & Gamification — Design

Date: 2026-06-17
Status: Approved (pending spec review)

## Goal

Introduce a global **Group** concept that carries point-scoring rules, and credit
**points** to the todo assignee and the project leader when a todo is completed.
Points are weighted by group, scaled by a per-todo **level**, and adjusted by
late penalty / early-finish bonus.

## Scope

- New doctype `Group` (global) with point-scaling weights + a child table of levels.
- New child doctype `Group Level` (level name + direct point value).
- New doctype `Point Ledger` (one row per beneficiary per completed todo).
- New role `Group Manager`, assigned to `mo@vernon.id`.
- `Project Todo` gains `group`, `level`, `point`, `assignee_earned`, `leader_earned`.
- Credit logic on todo completion; reversal on un-completion.
- Migration patch: seed Groups from existing Glossary groupings, backfill todos,
  create role + assignment.

Out of scope: changing the existing Glossary term-dictionary; UI dashboards/leaderboards
beyond the Point Ledger list view (can follow later).

## Confirmed decisions

1. **Group** is a brand-new doctype, separate from Glossary. Glossary is left untouched.
2. **Base point** comes from a **level** chosen on the todo, not a manual number.
   Each Group defines **its own** levels. A level row holds the **point value directly**
   (no separate base value, no multiplier).
3. **Leader** = the todo's `project.project_leader`.
4. **Late/early days** measured at completion: `completed_date − deadline`
   (late if positive, early if negative). Both clamped ≥ 0; never both nonzero.
5. **Credit** happens when the todo status transitions to `✅ Completed`
   (owner approval, already gated by the existing status flow). Stored in a
   **Point Ledger** doctype (two rows per todo: assignee + leader).
6. **Leader earning** = flat multiplier of assignee earned (see formula).
7. All weights are **percentages**.

## Data model

### Doctype: `Group` (global, not a tree)

| Field | Type | Notes |
|---|---|---|
| `group_name` | Data | reqd, **unique** |
| `description` | Small Text | optional |
| `weight` | Percent | assignee point multiplier, default `100` |
| `late_penalty` | Percent | assignee penalty per late day, default `0` |
| `early_bonus` | Percent | assignee bonus per early day, default `0` |
| `leader_weight` | Percent | leader multiplier of assignee earned, default `0` |
| `leader_late_penalty` | Percent | leader penalty per late day, default `0` |
| `leader_early_bonus` | Percent | leader bonus per early day, default `0` |
| `levels` | Table → `Group Level` | the group's own levels |

Permissions:
- `System Manager`, `Group Manager`: create/read/write/delete.
- `Project Owner`, `Project Leader`, `Project Team`: read + select only.

### Child doctype: `Group Level` (`istable: 1`)

| Field | Type | Notes |
|---|---|---|
| `level_name` | Data | reqd (e.g. "L1", "Easy") |
| `point` | Float | reqd, ≥ 0 — direct base point for this level |

### Doctype: `Point Ledger`

| Field | Type | Notes |
|---|---|---|
| `user` | Link → User | reqd, search_index |
| `role` | Select | `Assignee` / `Leader` |
| `todo` | Link → Project Todo | reqd, search_index |
| `group` | Link → Group | snapshot |
| `project` | Link → Project | snapshot |
| `level_name` | Data | snapshot of chosen level |
| `point` | Float | snapshot base point |
| `late_days` | Int | |
| `early_days` | Int | |
| `points_earned` | Float | final credited points |
| `credited_on` | Datetime | |

- Naming: `hash` (random). Uniqueness of (todo, role) enforced in code (idempotent credit).
- Permissions: read for Project Owner/Leader/Team (visibility of own/team points);
  write/delete restricted to System Manager + Group Manager (and the credit code itself,
  which runs server-side).

### `Project Todo` additions

| Field | Type | Notes |
|---|---|---|
| `group` | Link → Group | **reqd** |
| `level` | Select | options populated client-side from `group.levels[].level_name` |
| `point` | Float | read-only; snapshotted from chosen level on save |
| `assignee_earned` | Float | read-only snapshot |
| `leader_earned` | Float | read-only snapshot |

Placed in a new "Points" section on the todo form.

## Formula

Weights are stored as percentages; divide by 100 to get a fraction.

```
late_days  = max(0, completed_date − deadline)
early_days = max(0, deadline − completed_date)
point      = chosen level's point value

assignee_earned =
      point * (weight/100)
    − late_days  * (late_penalty/100) * point
    + early_days * (early_bonus/100)  * point

leader_earned =
      assignee_earned * (leader_weight/100)
    − late_days  * (leader_late_penalty/100) * assignee_earned
    + early_days * (leader_early_bonus/100)  * assignee_earned
```

`completed_date` is the date of `completed_at` (set when status reaches Completed).
`deadline` is the todo's existing `deadline` field. **No flooring**: earned values may
go below 0 — a very late todo yields negative points, recorded as-is.

## Behavior / data flow

### On Project Todo save (`validate`)
- Require `group`.
- If `level` set, look up the matching row in `group.levels` and snapshot its `point`
  onto the todo. If `level` not in the group's levels, raise a validation error.

### On status transition → `✅ Completed`
Trigger point: server-side `on_update` of Project Todo, detecting the status changed
to Completed (compare against DB value / `has_value_changed`).

1. Compute `late_days` / `early_days` from `completed_at` and `deadline`.
2. Compute `assignee_earned` and `leader_earned`.
3. Snapshot `assignee_earned` / `leader_earned` onto the todo.
4. Upsert Point Ledger rows (idempotent on `(todo, role)`):
   - Assignee row: `user = assigned_to`, `role = Assignee`, `points_earned = assignee_earned`.
   - Leader row: `user = project.project_leader`, `role = Leader`,
     `points_earned = leader_earned`. Skip if no project leader resolvable.

### On reversal (status moves away from Completed)
- Delete the todo's Point Ledger rows; clear `assignee_earned` / `leader_earned`.

### Idempotency
- Re-saving a Completed todo updates existing ledger rows in place (matched by
  `(todo, role)`), never creating duplicates.

## Client script (Project Todo form)

- On `group` change: fetch the group's `levels`, set the `level` field's Select options,
  clear `level`/`point` if the old level is no longer valid.
- On `level` change: set `point` from the chosen level (display only; authoritative
  value is recomputed server-side on save).

## Role: `Group Manager`

- New Role record `Group Manager`.
- Granted full rights on `Group`, `Group Level` (via parent), and `Point Ledger`.
- Assigned to user `mo@vernon.id` (Has Role).

## Migration patch

Patch module under `vernon_project/patches/` (registered in `patches.txt`):

1. Create the `Group Manager` role if absent; add Has Role for `mo@vernon.id`
   (skip if user missing).
2. Collect **distinct** `grouping` (Glossary) names referenced by Project Details.
   For each distinct name, create a global `Group` (`weight=100`, others `0`, no levels yet).
   Dedupe by name so duplicated-per-project groupings merge into one.
3. Backfill `Project Todo.group`: for each existing todo, set `group` from its
   Project Detail's `grouping` (mapped to the new Group). Todos whose detail has no
   grouping are left null and must be set before next save (reqd applies going forward).
4. No levels are auto-created; Group Manager defines levels (and thus points) afterward.
   Existing todos keep `point = 0` until a level is chosen.

Run order: must run after the new doctypes are installed (migrate creates doctypes from
JSON before running patches.txt entries).

## Edge cases

- **Todo with group but no level**: `point = 0`, earns 0. Allowed.
- **No project leader** on the project: only the assignee ledger row is written.
- **Group/level edited after credit**: ledger rows keep their snapshot; not retroactively
  recomputed unless the todo is re-saved while Completed.
- **Reqd `group` on legacy todos**: backfilled by patch; any unmapped legacy todo must
  receive a group on its next edit.
- **Negative earned**: permitted — no flooring; below-zero points recorded as-is.

## Testing

Per project convention (live site, code-first), automated tests deferred to the final
phase. Manual verification checklist:
1. Create a Group with levels; confirm only Group Manager / System Manager can edit.
2. Create a todo, pick group + level, confirm `point` populates.
3. Complete on time / late / early; verify ledger rows + earned values match the formula.
4. Revert from Completed; verify ledger rows removed.
5. Confirm leader row uses the project's Project Leader.
6. Run the patch on a copy; verify groups merged and todos backfilled.
