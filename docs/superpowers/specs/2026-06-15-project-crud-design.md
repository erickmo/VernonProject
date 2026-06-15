# Project Management (CRUD) + Work Item & Task Creation — Design

**Date:** 2026-06-15
**Status:** Approved for planning

## Problem

The mobile PWA can list and view projects (`get_projects`, `get_project`) but
cannot create, edit, or delete them, nor create work items. All project
mutations require the Frappe desk. We want project leads to manage projects and
add work items + tasks from the mobile app.

## Domain facts

- `Project` mandatory fields: `project_name`, `start_date`, `deadline`,
  `customer` (Link Customer), `project_owner` (Link User), `project_leader`
  (Link User), `project_group` (Link Project Group), `status`
  (Select: Ongoing/Closed). Optional: `goal`, `project_admin` (Link User),
  `team_members` (child table `Project Team`, rows have `user`).
- A work item is a `Project Detail`. Mandatory: `project`, `title`,
  `project_deadline` (Date), `naming_series` (auto), `status`
  (default Pending); plus `ProjectDetail.validate()` requires `grouping` = a
  `Glossary` whose `project` equals the detail's project.
- `Glossary` mandatory: `glossary` (Data), `project` (Link Project).
- A task is a `Project Todo` child row under `Project Detail.todo`. Task
  creation already shipped (work-item level) — reused here, not rebuilt.
- The mobile API mutates via whitelisted methods that do explicit permission
  checks then `save(ignore_permissions=True)` (e.g. `update_todo`,
  `save_notes`). This design follows that pattern.

## Decisions (from brainstorming)

| Topic | Decision |
|-------|----------|
| Surface | Mobile PWA + backend methods |
| Backend mechanism | Whitelisted `mobile.py` methods (no resource API) |
| Create project | User holds `Project Owner` role, or System Manager |
| Edit project | Project owner or leader of that project, or SM |
| Reassign owner/leader | Owner (or SM) only — leader cannot reassign |
| Delete project | Project owner or SM; **blocked if any work item exists** |
| Create work item | Project owner or leader, or SM |
| Grouping | Combobox: pick existing project grouping or type a new name; backend creates the `Glossary` if missing |
| Create task | Existing `CreateTaskSheet`, reached by picking a work item |

## Architecture

### Backend — new whitelisted methods in `vernon_project/api/mobile.py`

All methods resolve the current user, perform explicit permission checks
(`frappe.throw(..., frappe.PermissionError)` on failure), then save with
`ignore_permissions=True`. A shared helper centralizes role/lead checks.

```python
def _is_sm(user):
    return "System Manager" in frappe.get_roles(user)

def _project_leads(project):
    """Return (owner, leader) for a project name."""
    return frappe.get_value("Project", project, ["project_owner", "project_leader"])
```

1. **`get_project_form_options()`** → `{customers, users, project_groups, statuses}`
   where each list is `[{value, label}]`. `users` = enabled Users (for
   owner/leader/admin/team pickers); `statuses` = `["Ongoing", "Closed"]`.
   Whitelisted read.

2. **`create_project(payload)`** — `payload` is a JSON string or dict with
   `project_name, customer, project_owner, project_leader, project_admin,
   project_group, start_date, deadline, goal, status, team_members` (list of
   user emails).
   - Permission: `_is_sm(user)` or `"Project Owner" in frappe.get_roles(user)`;
     else throw.
   - Insert `Project`; append `team_members` rows; `insert(ignore_permissions=True)`.
   - Returns `{name}`.

3. **`update_project(project, payload)`** — updates an existing project.
   - Permission: `_is_sm(user)` or `user in _project_leads(project)`; else throw.
   - Reassignment guard: if `payload` changes `project_owner` or
     `project_leader`, require `_is_sm(user)` or `user == owner`; a leader who
     is not the owner cannot change these (throw).
   - Apply allowed fields; replace `team_members` if provided;
     `save(ignore_permissions=True)`. Returns `{name}`.

4. **`delete_project(project)`** —
   - Permission: `_is_sm(user)` or `user == owner`; else throw.
   - Guard: if `frappe.db.exists("Project Detail", {"project": project})`,
     throw `"Cannot delete a project that has work items."`.
   - `frappe.delete_doc("Project", project, ignore_permissions=True)`.
     Returns `{status: "ok"}`.

5. **`create_work_item(project, title, project_deadline, grouping, status=None)`** —
   - Permission: `_is_sm(user)` or `user in _project_leads(project)`; else throw.
   - Grouping resolution: look for a `Glossary` with `glossary == grouping` and
     `project == project`. If none, create it
     (`Glossary{glossary: grouping, project}`.insert(ignore_permissions=True)).
     Use the resolved Glossary name as `grouping`.
   - Insert `Project Detail{project, title, project_deadline, grouping,
     status or default}` with `ignore_permissions=True`. Returns `{name}`.

6. **Extend `get_project`** return with:
   - `can_edit`: `_is_sm(user) or user in (owner, leader)`
   - `can_delete`: `_is_sm(user) or user == owner`
   - `can_reassign`: `_is_sm(user) or user == owner`
   - Raw `project_owner`, `project_leader`, `project_admin`, `project_group`,
     `team` user list (already present) — needed to prefill the edit form.

7. **Extend `bootstrap`** with `can_create_project`:
   `_is_sm(user) or "Project Owner" in frappe.get_roles(user)`.

### Frontend (PWA) — `frontend/src/`

- **`lib/types.ts`**: add `can_edit/can_delete/can_reassign` + raw owner/leader/
  admin/group fields to the project-detail type; add `can_create_project` to
  `Boot`; add `ProjectFormOptions` and `WorkItemInput`/`ProjectInput` types.
- **`lib/api.ts`** (`mobileApi`): `projectFormOptions()`, `createProject(payload)`,
  `updateProject(project, payload)`, `deleteProject(project)`,
  `createWorkItem(payload)` — all `api.post` to the new methods.
- **`hooks/useData.ts`**: `useProjectFormOptions()`, `useCreateProject()`,
  `useUpdateProject(project)`, `useDeleteProject()`, `useCreateWorkItem(project)`
  — mutations invalidate `projects`, `project`, `dashboard` as appropriate.
- **`components/ProjectFormSheet.tsx`**: bottom-sheet form used for both create
  and edit (mode prop). Fields: project_name, customer (select), project_owner
  (select), project_leader (select), project_admin (select, optional),
  project_group (select), start_date, deadline, goal (textarea), status
  (select), team_members (multi-select of users). Owner/leader selects disabled
  unless `can_reassign` (edit mode) — always editable in create mode. Client
  validation for required fields.
- **`components/WorkItemFormSheet.tsx`**: bottom sheet. Fields: title, grouping
  (combobox — datalist of existing project groupings, free text allowed),
  project_deadline, status. Existing groupings come from `get_project`
  (add a `groupings` list to its payload) or `get_project_form_options`.
- **`pages/Projects.tsx`**: add a "+ New project" button (shown when
  `boot.can_create_project`) opening `ProjectFormSheet` in create mode.
- **`pages/ProjectDetailPage.tsx`**: add Edit (if `can_edit`) and Delete (if
  `can_delete`, with confirm) actions; "Add work item" (if `can_edit`) opening
  `WorkItemFormSheet`; and "Add task" that lets the user pick a work item then
  opens the existing `CreateTaskSheet`.

## Data flow (representative)

```
Create project:
  Projects "+ New project" (visible if can_create_project)
   → ProjectFormSheet → useCreateProject.mutate(payload)
   → POST mobile.create_project (role check) → insert Project (+team)
   → invalidate projects/dashboard → list shows new project

Create work item + task:
  ProjectDetailPage "Add work item" (if can_edit)
   → WorkItemFormSheet (grouping pick-or-type) → useCreateWorkItem.mutate
   → POST mobile.create_work_item (lead check; create Glossary if needed)
   → insert Project Detail → invalidate project
   → "Add task" → pick the work item → CreateTaskSheet (existing flow)
```

## Error handling

| Case | Behavior |
|------|----------|
| Non-permitted user calls a method (UI bypass) | method throws PermissionError → ApiError → toast |
| Leader tries to reassign owner/leader | `update_project` throws → toast |
| Delete project with work items | `delete_project` throws guard message → toast |
| Missing required form field | client-side validation blocks submit |
| New grouping typed | `create_work_item` creates the Glossary, then the work item |
| Network/CSRF failure | ApiError → toast, sheet stays open |

## Testing

- **Backend unit tests** (`vernon_project/api/test_mobile_projects.py`):
  - `create_project`: Project-Owner-role user succeeds; plain user rejected; SM succeeds.
  - `update_project`: leader edits meta OK; leader reassign owner rejected; owner reassign OK.
  - `delete_project`: blocked when work items exist; allowed when none; non-owner rejected.
  - `create_work_item`: existing grouping reused; new grouping creates a Glossary; non-lead rejected.
  - `get_project`/`bootstrap`: permission flags present and correct.
  - Fixtures must satisfy mandatory schema (Project Group, Glossary grouping, title, project_deadline) — mirror the patterns in `test_mobile.py`.
- **Frontend**: `npx tsc --noEmit` + `npm run build`; manual PWA verification as
  owner, leader, and non-lead.

## Build order (phases within this plan)

1. Backend project CRUD methods + `get_project`/`bootstrap` flags + tests.
2. Frontend project create/edit/delete (types, api, hooks, ProjectFormSheet,
   wiring in Projects + ProjectDetailPage).
3. Work item create (backend `create_work_item` + grouping handling + tests;
   `WorkItemFormSheet`; wiring) and task quick-add reusing `CreateTaskSheet`.

## Out of scope (YAGNI)

- Editing or deleting work items (only create).
- Editing/deleting tasks here (existing flows cover that).
- Customer / Project Group / User management (pick from existing only).
- Bulk operations, templates, archiving.
