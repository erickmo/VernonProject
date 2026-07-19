# Move Project Detail to Another Project

**Date:** 2026-07-19
**Status:** Approved for planning

## Problem

A Project Detail belongs to exactly one Project (`Project Detail.project`). Sometimes a
detail (and all the todos under it) was filed under the wrong project and needs to move to
another project. Today there is no way to do this: create/edit of a detail goes through the
native `/api/resource` endpoint and the form has no `project` field, so a detail cannot be
re-parented from the UI.

## Goal

Add a "Move to another project" action on a Project Detail (both `/m` and `/w`) that
re-parents the detail and all its child todos to a destination project, gated by a membership
rule so work only lands where the people doing it actually belong.

## Rules

### Who may perform the move
The caller must be the **`project_owner` of BOTH** the source and destination projects.
`System Manager` bypasses the gate (consistent with every other manager gate in
`mobile.py`, e.g. `_require_project_manager`). Anyone else → `frappe.PermissionError`.

### Membership gate (the core constraint)
Every **assignee** of the detail's todos must belong to the **destination** project.
A user belongs to the destination if they are one of:

- destination `project_owner`, or
- destination `project_leader`, or
- a `user` in the destination's `team_members` (Project Team rows).

`project_admin` does **not** count. Todos with no `assigned_to` pass trivially. `mentor` is
**not** checked (only the assignee is gated).

If any assignee fails this check, the move is a **hard block**: no mutation happens and the
endpoint throws, returning the offending `user → todo` pairs so the UI can show exactly who
is blocking the move.

## Data model (as-is)

- `Project`: `project_owner`, `project_leader`, `project_admin` (User links);
  `team_members` (Table → `Project Team.user`).
- `Project Detail`: `project` (Link → Project), `grouping` (Link → Glossary),
  `glossaries` (Table MultiSelect → Project Glossary). Name is `PD-.{project}.-.#####`,
  fixed at creation. Rollup fields (`todo_count`, estimates, `status`) are computed from its
  own todos.
- `Project Todo`: `project_detail` (Link — the real parent) **and** `project` (denormalized,
  kept in sync from the detail by `sync_project_from_detail()` only when the todo is saved).
  `Point Ledger` rows carry a denormalized `project` copied from the todo (`_upsert_ledger_row`).

Key consequence: changing `Project Detail.project` does **not** re-save child todos, so their
denormalized `project` and their `Point Ledger.project` rows go stale unless the move updates
them directly.

## Backend

New whitelisted endpoint in `vernon_project/api/mobile.py`:

```
move_project_detail(project_detail: str, destination_project: str) -> {ok, moved_todos}
```

Steps (single transaction):

1. Load the detail; resolve `source = detail.project`. Throw if `destination_project`
   doesn't exist or equals `source`.
2. **Who-gate:** unless `System Manager`, require
   `frappe.session.user == Project(source).project_owner == Project(dest).project_owner`.
3. Fetch child todos: `frappe.get_all("Project Todo", {"project_detail": detail}, ["name","assigned_to","to_do"])`.
4. **Membership gate:** build `dest_members = {dest.project_owner, dest.project_leader} ∪
   {row.user for row in dest.team_members}` (drop falsy). For each child with an
   `assigned_to` not in `dest_members`, collect `{user, todo, to_do}`. If any collected →
   `frappe.throw` with a readable message + the list (hard block, no writes).
5. **Move the detail:** set `detail.project = destination_project`; clear `detail.grouping`
   and `detail.glossaries` (both are source-project-scoped and would otherwise fail the
   detail's own `validate`); `detail.save()`.
6. **Re-sync children:** for each child todo `frappe.db.set_value("Project Todo", name,
   "project", destination_project, update_modified=False)`; bump its ledger rows
   `frappe.db.set_value("Point Ledger", {"todo": name}, "project", destination_project)`.
7. Return `{"ok": True, "moved_todos": len(children)}`.

No rollup recompute: the todos stay under the same detail, so the detail's rollups are
unchanged; Project has no stored todo aggregates.

## Frontend

Add a **Move to another project** action on the detail, both platforms:

- `/m` — `frontend/src/pages/ProjectScreen.tsx`, the per-detail action row (next to
  Edit/Delete). Opens a sheet with a `SearchableSelect` of destination projects.
- `/w` — `frontend-web/src/pages/ProjectDetail.tsx` `OverflowMenu` and the detail list in
  `frontend-web/src/pages/Project.tsx`. Opens a dialog with a `SearchableSelect`.

Behaviour:

- **Destination options** = projects where the caller is `project_owner`, minus the source
  project (only owner-of-both can move, so never offer a destination that will 403).
- On success → invalidate the project + detail queries so both projects refresh.
- On block → a **dialog** (never `alert`/`confirm`) listing the users who aren't in the
  destination and the todos they're on.

Wiring:

- `frontend/src/lib/api.ts` — `moveProjectDetail(project_detail, destination_project)` →
  `api.post(M + 'move_project_detail', {...})`.
- `frontend/src/hooks/useData.ts` — `useMoveProjectDetail()` mutation with query
  invalidation (mirror `useDeleteProjectDetail`).

## Accepted tradeoffs

- The detail's **name** keeps its old `PD-<oldproject>-#####` id after the move. Renaming
  would rewrite every child todo's `project_detail` FK — not worth it. The `project` field is
  the source of truth; the name is cosmetic.
- `Point Ledger` rows re-attribute to the destination, so the by-project leaderboard
  dimension shifts this detail's historic points to the destination project. Intended — the
  work now belongs to the destination.
- Cross-detail `blocked_by`/`blocking` todo dependencies are left as-is (may span projects
  after a move). Out of scope.

## Testing

Add to `vernon_project/api/test_mobile.py` (live-site conventions — mirror existing tests):

- Non-owner caller → `PermissionError`.
- Owner of source but not dest → `PermissionError`.
- Owner of both, an assignee not in dest members → throws, **no** mutation (detail still on
  source, no ledger change).
- Owner of both, all assignees in dest members → detail re-parented, every child todo's
  `project` and `Point Ledger.project` now point at dest, `grouping`/`glossaries` cleared.
- Unassigned todos don't block the move.

## Out of scope

- Moving a subset of a detail's todos (whole detail moves or nothing).
- Auto-adding blocked assignees to the destination team.
- Renaming the detail to match the new project code.
