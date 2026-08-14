# Combined Group / Type / Level select

**Date:** 2026-08-13
**Status:** approved

## Problem

Adding a todo (and a meeting) makes the user pick **Group → Type → Level** through three
dependent selects: pick a group, wait for its types, pick a type, wait for its levels, pick a
level. Three clicks + two waits for one scoring choice. Slow.

## Change

Replace the three cascading selects with **one searchable select** whose options are the flat
catalog of every `Group Level` row:

```
[Engineering] Backend Development - Feature (120%)
```

Type-to-filter (`feat` → the Feature rows) is the speed win. One pick sets everything.

## Why one select is enough

Each `Group Level` row has a globally-unique `level_id` (10-char hash). The backend snapshot only
needs `group` + `level_id`; type/level names are derived server-side from the row. So a single
`level_id` fully identifies group + type + level. `Group.name == group_name` (autoname), so a
row's `parent` is the display group name.

## Design

- **Endpoint** `vernon_project.api.project_todo.get_group_levels` — `frappe.get_all("Group Level",
  fields=[level_id, type_name, level_name, difficulty_percent, parent], filters={parenttype:
  "Group"})`, joined to each Group's `group_name` + `base_rate_per_minute`. Server-side (child
  table has no client perms), cacheable, permission-clean.
- **Hook** `useGroupLevels()` in `frontend/src/hooks/useData.ts` — one cached query.
- **Component** rewrite `frontend/src/components/GroupLevelPicker.tsx` in place: keep its public
  API (`GroupLevelPicker`, `emptyGroupLevel`, `{group, typeName, levelId}` value), swap internals
  from the three-select cascade to one flat `SearchableSelect`. Keeps the points preview.
- **Consumers** — meetings (`MeetingSheet`, `CreateMeetingSheet`, `CreateMeetingDialog`) already
  use `GroupLevelPicker`, so they upgrade for free. The four todo forms
  (`CreateProjectItemSheet`, `ProjectItemScreen`, `CreateProjectItemDialog`, `ProjectItem`) inline
  the cascade today — convert them to hold one `gl` object and render `<GroupLevelPicker>`,
  deleting the per-form reset/re-seed effects, the `useScoringGroup(s)` hooks, and the inline
  points block.

Untouched: `types.ts` `GroupLevel` (child-row type) and the `GroupForm*` Group admin editor —
different concern.

## Trade-offs

- Groups with **no calibrated levels** drop off the list. Acceptable — a todo/meeting requires a
  level, so those groups were never completable anyway.
- Difficulty `%` stays in the label — live info worth the width.
- The old "prefill group from context" (opening create inside a group) no longer visually
  preselects, since the combo keys off `level_id`. Minor; the search covers it.

## Ship

Rebuild both bundles · `python3 scripts/gen_docs.py` (new endpoint) · `tj-restart` (new whitelisted
method) · What's New row (Both).
