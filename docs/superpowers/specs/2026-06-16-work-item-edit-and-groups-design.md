# Work Item Edit/Delete + Work Item Group (Glossary) CRUD — Design

**Date:** 2026-06-16
**Status:** Approved for planning

## Problem

Work items (`Project Detail`) can be created from the mobile PWA but not edited
or deleted. Their "groups" (the `grouping` field → a `Glossary`) can only be
created implicitly (type-a-new in the work-item form); there is no way to list,
rename, describe, or delete a project's groups. We want full work-item
edit/delete and group CRUD, scoped to project leads.

## Domain facts

- A work item is a `Project Detail`. Editable user fields: `title` (Data, reqd),
  `status` (Select Pending/Ongoing/Completed), `grouping` (Link Glossary, must
  belong to the same project — enforced by `ProjectDetail.validate`),
  `current_condition` (Text Editor), `expected_outcome` (Text Editor).
  `project_deadline` is `read_only` (computed) → excluded from editing.
- `Project Detail` role perms: SM/Owner/Leader = CRWD, Admin = CRW, Team = R.
  Its `has_permission` hook returns True for owner/leader/admin/team (any ptype).
  Net: write = owner/leader/admin; delete = owner/leader/SM (role-gated, Admin
  lacks delete).
- `Project Detail` is also saved by todo flows (`ProjectTodo.on_change` →
  `parent.save()`), and `before_validate` auto-sets `status` via
  `recalculate_totals`. Those internal saves use `ignore_permissions=True`, so
  permission scoping must stay in `has_permission` (skipped under
  ignore_permissions), NOT in `validate`.
- A group is a `Glossary`: fields `glossary` (Data, reqd), `project` (Link Project,
  reqd), `description` (Text Editor). `autoname: format:{project}-{glossary}`.
  Perms: SM/Owner/Leader = CRWD, Team = R. Controller is currently empty.
- The grouping reference from a work item is `Project Detail.grouping` (Link to
  Glossary name). A multi-select child `Project Glossary` (field `glossary`) may
  also reference glossaries.

## Decisions (from brainstorming)

| Topic | Decision |
|-------|----------|
| WI editable fields | title, status, grouping, current_condition, expected_outcome |
| WI delete | Yes; blocked if the work item has any tasks (todos) |
| Group CRUD | Create / rename+describe / delete |
| Group delete | Blocked if in use (any Project Detail.grouping or Project Glossary child) |
| Permissions | owner/leader/SM (UI-gated; backend role gate + guards) |
| Mechanism | Native resource API + controller guards (no new endpoints) |

## Architecture

### Backend

**1. `mobile.get_work_item`** — extend the returned dict with:
- `grouping`: the raw `grouping` value (add to the `frappe.get_value` field list).
- `can_edit`: `is_sm or user in (owner, leader)` (owner/leader already resolved
  for `can_create`).
- `groupings`: `frappe.get_all("Glossary", filters={"project": detail["project"]},
  pluck="glossary", limit_page_length=0)` — for the edit form's group picker.

**2. `ProjectDetail.on_trash`** (`project_detail.py`) — replace the existing
todo-status check with a has-tasks guard:
```python
	def on_trash(self):
		if self.todo:
			frappe.throw("Cannot delete a work item that has tasks.")
```
Delete permission itself is enforced by the role gate + `has_permission`
(owner/leader/SM). No edit guard is added to `validate` (todo flows save the
parent and must not be blocked).

**3. `Glossary` controller** (`glossary.py`) — add guards; register hooks.
- `has_permission(doc, ptype, user)`:
  - SM → True.
  - resolve `owner, leader` from `doc.project`'s Project.
  - read → owner/leader, or a member of the project team; create/write/delete →
    owner/leader only; else False.
- `on_trash(self)`: block if in use:
  ```python
	def on_trash(self):
		if frappe.db.exists("Project Detail", {"grouping": self.name}) or \
		   frappe.db.exists("Project Glossary", {"glossary": self.name}):
			frappe.throw("Cannot delete a group that is in use by a work item.")
  ```
- `get_permission_query_conditions(user)`: restrict Glossary lists to projects
  where the user is owner/leader/admin or a team member (mirror the
  `Project Detail` query-conditions pattern); SM/Guest handled as there.
- Register both in `hooks.py` (`has_permission["Glossary"]`,
  `permission_query_conditions["Glossary"]`).

### Frontend (`frontend/src/`)

- **`lib/types.ts`**: extend `WorkItem` with `grouping: string`,
  `can_edit: boolean`, `groupings: string[]`. Add a `Group` type
  (`{ name; glossary; description }`).
- **`lib/api.ts`**: reuse the existing `resource` client (no additions needed).
- **`hooks/useData.ts`**:
  - `useUpdateWorkItem(name)` → `resource.update("Project Detail", name, fields)`;
    invalidate `work-item`, `project`.
  - `useDeleteWorkItem()` → `resource.remove("Project Detail", name)`; invalidate
    `project`, `dashboard`.
  - `useGroups(project)` → `resource.list("Glossary", {filters:[["project","=",
    project]], fields:["name","glossary","description"]})`.
  - `useCreateGroup(project)` → `resource.create("Glossary", {glossary, project,
    description})`; invalidate the groups list + `project`.
  - `useUpdateGroup(project)` → `resource.update("Glossary", name, {glossary,
    description})`; invalidate groups + `project`.
  - `useDeleteGroup(project)` → `resource.remove("Glossary", name)`; invalidate
    groups + `project`.
- **`components/WorkItemFormSheet.tsx`**: add an optional `workItem` prop
  (`{ name, title, status, grouping, current_condition, expected_outcome }`).
  - Edit mode (prop present): fields = title, status, grouping (SearchableSelect,
    allowCreate), current_condition (textarea), expected_outcome (textarea);
    submit → `useUpdateWorkItem`. No deadline field (read-only).
  - Create mode (no prop): unchanged (title, grouping, deadline, status).
- **`pages/WorkItemPage.tsx`**: when `data.can_edit`, show Edit and Delete
  buttons. Edit opens `WorkItemFormSheet` in edit mode (prefilled from `data`,
  `groupings={data.groupings}`). Delete confirms → `useDeleteWorkItem` → on
  success toast + navigate to `/project/<data.project>`; on error toast (the
  has-tasks guard message).
- **`components/GroupManagerSheet.tsx`** (new): a bottom sheet listing the
  project's groups (`useGroups`). Each row: name + description, with Edit and
  Delete. An "Add group" inline form (name + optional description) → create.
  Edit row → rename/description → update. Delete → remove; in-use error → toast.
- **`pages/ProjectDetailPage.tsx`**: add a "Manage groups" button (when
  `flags.can_edit`) that opens `GroupManagerSheet` for `data.name`.

## Data flow

```
Edit work item:
  WorkItemPage "Edit" (can_edit) → WorkItemFormSheet (edit, prefilled)
   → PUT /api/resource/Project Detail/<name> (role gate write + has_permission)
   → ProjectDetail.validate (grouping belongs to project) → invalidate work-item

Delete work item:
  WorkItemPage "Delete" → confirm → DELETE /api/resource/Project Detail/<name>
   → role gate (Owner/Leader/SM) → on_trash (block if has tasks) → navigate back

Group CRUD:
  ProjectDetailPage "Manage groups" → GroupManagerSheet
   → list: GET /api/resource/Glossary?filters=[["project","=",p]]
   → add: POST /api/resource/Glossary {glossary, project, description}
   → rename: PUT /api/resource/Glossary/<name> {glossary, description}
   → delete: DELETE /api/resource/Glossary/<name> (on_trash blocks if in use)
```

## Error handling

| Case | Behavior |
|------|----------|
| Non-lead edits/deletes (UI bypass) | role gate / has_permission → 403 → toast |
| Delete work item with tasks | `ProjectDetail.on_trash` throws → toast |
| Delete group in use | `Glossary.on_trash` throws → toast |
| Edit grouping to a non-project glossary | `ProjectDetail.validate` throws → toast |
| Missing required field | client-side validation blocks submit |
| Renaming a group | changes the `glossary` label/description; the doc `name`
  (autoname) is unchanged, so existing `grouping` links stay valid |

## Testing

- **Backend** (`project_detail/test_project_detail.py`, `glossary/test_glossary.py`):
  - `ProjectDetail.on_trash`: delete blocked when a todo exists; allowed when none.
  - `Glossary.on_trash`: blocked when referenced by a Project Detail grouping;
    allowed otherwise.
  - `Glossary.has_permission`: owner/leader allowed create/write/delete; a plain
    team member denied write; read allowed for team.
  - `get_work_item`: returns `can_edit`, `grouping`, `groupings`.
  - Fixtures mirror `test_mobile.py`/`test_project.py` (Project Group, Glossary,
    title, project_deadline).
- **Frontend**: `npx tsc --noEmit` + `npm run build`; manual PWA verification.
- Tests run in fresh processes; **a `bench restart` is required for the live
  worker to serve these backend changes** (Python isn't reloaded by
  migrate/clear-cache).

## Build order (phases)

1. Backend: `get_work_item` extension, `ProjectDetail.on_trash`, `Glossary`
   guards + hook registration + tests.
2. Frontend work item edit/delete: types, hooks, `WorkItemFormSheet` edit mode,
   `WorkItemPage` buttons.
3. Frontend group CRUD: `GroupManagerSheet`, group hooks, `ProjectDetailPage`
   wiring; build.

## Out of scope (YAGNI)

- Editing work-item financials (price/discount) or `project_deadline`.
- Reassigning a task's work item; merging groups.
- The pending "manage project member" feature (tracked separately).
