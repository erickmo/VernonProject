# Editable / Reorderable Group Levels — Design

Date: 2026-06-25
Status: Approved (brainstorming)

## Goal

Make a Group's levels fully editable instead of a fixed 0–10 scale:

- **Add / rename / edit point / delete** levels (full CRUD).
- **Reorder** levels by drag-and-drop.
- **Todo level picker follows the group's order** (not a numeric sort).
- Renaming, reordering, or deleting a level **must not break or orphan**
  existing todos or scoring history. Todos reference levels by a **stable id**,
  not by name.

## Current state (what exists today)

- **Group Level** (child table of `Group`): `level_name` (Data), `point` (Float).
  No explicit order field — Frappe `idx` is the row order. Child rows already
  have a stable Frappe docname (`name`) and `idx`, both returned by
  `resource.get('Group', name)`.
- **GroupForm** (web `frontend-web/src/pages/GroupForm.tsx`) and
  **GroupFormScreen** (mobile `frontend/src/pages/GroupFormScreen.tsx`):
  hardcoded `LEVEL_DEFS` (0..10). Only `point` editable; names locked. On save
  the levels array is rebuilt from `LEVEL_DEFS` (sends only `{level_name, point}`),
  so child-row identity is discarded and re-created each save.
- **Picker** (web `frontend-web/src/pages/ProjectItem.tsx:596`, mobile
  `frontend/src/pages/ProjectItemScreen.tsx:304`): sorts group levels by
  `Number(level_name)` and stores the chosen `level_name` string on the todo.
- **Scoring / linkage**, all keyed off the level **name** string:
  - `project_todo.py:48 snapshot_point_from_level` — matches
    `(parent=group, parenttype=Group, level_name=self.level)`, sets `self.point`,
    throws *"Level '{0}' does not belong to Group '{1}'"* if no match.
  - `project_todo.py:240` — Point Ledger row stores `level_name = self.level`
    (historical snapshot).
  - `project_todo.py:565` — recurring-todo clone copies `self.level`.
- **API**: `mobile.py _fetch_todos` SELECTs `t.level` (ordered by `deadline ASC`);
  Group CRUD goes through standard Frappe resource endpoints
  (`useScoringGroup` / `useCreateScoringGroup` / `useUpdateScoringGroup` in
  `frontend/src/hooks/useData.ts`).
- **Shared layer**: both apps import types/hooks from `frontend/src/{lib,hooks}`
  (`@/` → `frontend/src`, `@web/` → `frontend-web/src`).
- A prior patch (`remap_levels_neg5to5_to_0to10.py`) shifted level names; level
  names are plain strings in three tables (Group Level, Project Todo, Point Ledger).

**The breakage this design prevents:** once names are editable, a name-keyed
reference breaks. Rename a level → an existing todo's stored `level` no longer
matches any row → the picker shows blank and the next save throws. A stable id
decouples the reference from the (now mutable) name.

## Decisions (locked)

1. **Edit scope:** full CRUD — add, rename `level_name`, edit `point`, delete, reorder.
2. **Reorder UI:** drag-and-drop.
3. **Todo ordering:** the todo level picker lists levels in the **group's order**
   (Frappe `idx`), replacing the numeric sort. (Todo *list* sorting is unchanged —
   still by deadline.)
4. **Reference by stable id:** todos reference levels by a stable `level_id`, so
   rename/reorder/delete are safe.
5. **Display name (sub-decision A):** todo keeps a **cached `level` name** for
   display; `level_id` is the source of truth. Display paths stay unchanged
   (lowest regression risk). A renamed level shows its old cached name on
   not-yet-re-saved todos until the todo is next saved; it self-heals on save.
   Ledger keeps the historical name.
6. **Drag-drop (sub-decision B):** lightweight, shared, pointer-event-based
   sortable — no new dependency, works mouse + touch.

## Data model

### Group Level (`vernon_project/.../doctype/group_level/group_level.json`)
Add field `level_id`:
- `fieldtype: Data`, `read_only: 1`, `hidden: 1` (not shown in grid),
  not `in_list_view`.
- Stable identity of a level row. Assigned once, never changed by rename /
  reorder / point edit.
`level_name` becomes user-editable (already `Data`, `reqd`); `point` unchanged.
Row order remains Frappe `idx`.

### Group controller (`group.py`, currently empty)
In `validate` (or `before_save`): for each row in `self.levels` lacking
`level_id`, assign a short unique id (e.g. `frappe.generate_hash(length=10)`).
Never overwrite an existing `level_id`. This guarantees stability even if the
frontend forgets to round-trip it.

### Project Todo (`.../doctype/project_todo/project_todo.json`)
- Add `level_id` (Data) — the stable reference (truth).
- Change `level` from `Select` to `Data` — now a cached display name.

## Backend behavior

### `snapshot_point_from_level` (`project_todo.py:48`)
Rewrite resolution to key off `level_id`:
1. No `group` → `point = 0`, clear `level`/`level_id`; return.
2. Have `level_id` → look up the row by `(parent=group, parenttype=Group,
   level_id=self.level_id)`:
   - **Found** → `self.point = row.point`; `self.level = row.level_name`
     (refresh cached name).
   - **Not found** (level was deleted) → keep existing `self.point` and
     `self.level` as-is; **do not throw**. (Deleting a level cannot break
     active/historical todos.)
3. No `level_id` but legacy `level` name present → match by
   `(group, level_name)`; on match, backfill `self.level_id` and set point;
   on no match, keep existing point, do not throw.
4. No `level_id` and no `level` → `point = 0`.

Validation throw is removed in favor of graceful fallback (the picker already
constrains valid choices for new edits; deletes must not retro-break).

### Point Ledger (`project_todo.py:240`)
Unchanged — `level_name = self.level`, now always the freshly-refreshed name at
credit time. History preserved.

### Recurring clone (`project_todo.py:565`)
Copy both `level` and `level_id` to the new todo.

### API — `mobile.py _fetch_todos`
Add `t.level_id` to the SELECT and to the returned payload so the picker can
pre-select by id. `t.level` (cached name) still returned for display. Ordering
unchanged.

## Frontend

### Shared types (`frontend/src/lib/types.ts`)
- `GroupLevel`: add optional `name?: string` (Frappe child docname),
  `level_id?: string`, `idx?: number`.
- `ScoringGroupPayload.levels[]`: add optional `name?`, `level_id?` so existing
  rows round-trip identity on update.

### Shared sortable (new, e.g. `frontend/src/components/Sortable.tsx`)
A small pointer-event-based reorderable list usable by both apps:
- Renders a list of items with a drag handle.
- On `pointerdown` on the handle, tracks `pointermove` to compute the target
  index, calls `onReorder(from, to)`; `pointerup` ends.
- Works for mouse and touch; no external dependency.
- Web GroupForm and mobile GroupFormScreen both consume it. (If a single shared
  component proves awkward across the two design systems, a shared hook
  `useSortable` + per-app row markup is the fallback — the reorder logic stays
  shared.)

### GroupForm (web `frontend-web/src/pages/GroupForm.tsx`) and GroupFormScreen (mobile)
- Replace fixed-scale rendering with an editable, reorderable list. Each row:
  **drag handle · `level_name` text input · `point` input with +/- · delete button**.
- **Add level** button appends a blank row (no `level_id` → backend assigns).
- Remove `LEVEL_DEFS` hardcoding and the "Fixed scale 0 to 10" copy. Keep
  "Fill by increment" (applies to current rows in order).
- On load: map `existing.levels` preserving `name`, `level_id`, `level_name`,
  `point`, in `idx` order.
- On save: send the levels array **in display order**, including `name` and
  `level_id` for existing rows (so Frappe updates in place, preserves identity,
  and writes the new `idx`); omitted rows are deleted by Frappe.
- Validation: ≥1 level; non-empty names; names unique within the group;
  `point ≥ 0`.
- Optional nicety (not required): show a per-level "used by N todos" hint near
  delete, reusing the existing `linkedTodos` query.

### Picker (web `ProjectItem.tsx`, mobile `ProjectItemScreen.tsx`)
- Remove `.sort((a,b) => Number(a.level_name) - Number(b.level_name))`; iterate
  `groupDoc.levels` as-is (idx order = group order).
- Option `value = level_id`, `label = "<level_name> (<point> pts)"`.
- Component state holds `level_id`; initialize from `data.level_id`.
- On submit set `fields.level_id` (backend refreshes the `level` name); do not
  rely on submitting `level`.
- Header/summary display continues to use the cached `data.level` name.

## Migration (`vernon_project/patches/v1_0/<name>.py`, add to `patches.txt`)

Idempotent:
1. For every Group Level row with empty `level_id`, assign a unique id
   (`frappe.db.set_value` / direct update). Process per parent Group.
2. For every Project Todo where `level_id` is empty and `level` (name) is set:
   find the Group Level row with `(parent=group, level_name=level)`; set the
   todo's `level_id`. Log todos with no match (e.g. group/level since deleted)
   and leave `level_id` empty — they fall through to the graceful path.
3. Point Ledger left as-is (historical name snapshots).

## Out of scope

- Todo *list* ordering (remains deadline-based).
- Migrating Point Ledger to ids (history stays name-based).
- Cascade-refreshing cached `level` names on every active todo at group-save
  time (cosmetic; self-heals on next todo save). Can be added later if instant
  propagation is wanted.

## Testing / verification

Per project convention (live site, tests deferred to a final phase), verify by:
- Build both bundles; load `/w` and `/m` group editor.
- Create a group with custom-named levels, reorder them, edit a point, delete one.
- Confirm the todo picker lists them in group order and pre-selects an existing
  todo's level after a rename (no blank, no throw).
- Confirm scoring (`point`) and the wallet/ledger remain correct after a rename
  and after a delete of an in-use level.
- Run `bench migrate` and confirm the patch backfills ids without error.
