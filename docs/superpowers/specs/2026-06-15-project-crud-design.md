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
| Surface | Mobile PWA + backend |
| Backend mechanism | Frappe **native resource API** (`/api/resource`) for all CRUD; business rules enforced by `Project` controller guards; `Project` role perms broadened so the resource API role gate passes |
| Create project | User holds `Project Owner` role, or System Manager |
| Edit project | Project owner or leader of that project, or SM |
| Reassign owner/leader | Owner (or SM) only — leader cannot reassign |
| Delete project | Project owner or SM; **blocked if any work item exists** |
| Create work item | Project owner or leader, or SM |
| Grouping | Combobox: pick existing project grouping or type a new name; backend creates the `Glossary` if missing |
| Create task | Existing `CreateTaskSheet`, reached by picking a work item |

## Architecture

### Backend — native resource API + controller guards

No custom CRUD endpoints. The frontend calls Frappe's REST resource API
(`/api/resource/<Doctype>`) directly. The resource API runs the full
permission stack: **doctype role gate first** (a `has_permission` hook can only
further restrict, never grant past the role gate), then the doctype's
controller `validate`/`on_trash`. Business rules that depend on doc fields
(this project's owner/leader, reassignment, delete-with-work-items) live in the
`Project` controller, because role permissions cannot express them.

Current role perms (relevant): Project = SM`[CRWD]`, Project Owner`[CRW]`,
Project Leader`[R]`. Project Detail & Glossary already grant Owner/Leader
`[CRWD]`.

**1. Broaden `Project` role permissions** (`project/project.json`) so the
resource-API role gate passes for the intended actors:
- `Project Leader`: add `write` (needed for leader edit).
- `Project Owner`: add `delete` (needed for owner delete).
The controller guards below then narrow these to the *specific* project.

**2. `Project` controller guards** (`project/project.py`):
- `validate()` — on update (`not self.is_new()`), unless
  `"System Manager" in frappe.get_roles(user)`:
  - **Edit scope:** require the acting `frappe.session.user` to be the project's
    `project_owner` or `project_leader`; else `frappe.throw(..., PermissionError)`.
    (Role gate lets any Project Owner/Leader *role* holder write; this restricts
    to *this* project's leads.)
  - **Owner-only reassign:** compare against `self.get_doc_before_save()`; if
    `project_owner` or `project_leader` changed and the user is not the existing
    owner (nor SM), throw.
- `on_trash()` — unless SM: require user == `project_owner`; and if
  `frappe.db.exists("Project Detail", {"project": self.name})`, throw
  `"Cannot delete a project that has work items."`.
- `has_permission(doc, ptype, user)` (existing hook) — leave granting read to
  owner/leader/admin/team; it already returns True for owner/leader for all
  ptypes, which is fine because the role gate + the guards above do the real
  enforcement for write/delete.

**3. CRUD via resource API (frontend):**
- **Create project:** `POST /api/resource/Project` with the full doc, including
  `team_members` as embedded child rows. Role gate: Project Owner role or SM.
- **Edit prefill:** `GET /api/resource/Project/<name>` returns all raw fields
  for the form.
- **Update project:** `PUT /api/resource/Project/<name>` with changed fields
  (PUT merges provided fields; sending `team_members` replaces the table).
  Role gate: Owner/Leader role (after broadening); `validate` scopes it.
- **Delete project:** `DELETE /api/resource/Project/<name>`. Role gate:
  Owner/SM (after broadening); `on_trash` guards.
- **Create work item:** two steps — resolve grouping then create the detail:
  1. `GET /api/resource/Glossary?filters=[["glossary","=",g],["project","=",p]]`.
     If empty, `POST /api/resource/Glossary {glossary:g, project:p}`.
  2. `POST /api/resource/Project Detail {project, title, project_deadline,
     grouping:<glossary name>, status}`.
  Glossary & Project Detail role perms already permit Owner/Leader.
- **Create task:** unchanged (existing `CreateTaskSheet` → `frappe.client.insert`
  of `Project Todo`, already permitted via its role perms + validate guard).

**4. Option lists via resource API:** `GET /api/resource/Customer`,
`/api/resource/User?filters=[["enabled","=",1]]`, `/api/resource/Project Group`
with `fields`/`limit_page_length=0`. Project status options are a static
frontend constant (`["Ongoing","Closed"]`). No `get_project_form_options`
endpoint.

**5. Permission flags computed client-side** (no backend flag endpoints):
- `can_create_project` = `boot.roles` includes `Project Owner`, or
  `System Manager`.
- `can_edit` = user is project owner/leader, or SM.
- `can_delete` = user is project owner, or SM.
- `can_reassign` = user is project owner, or SM.
`get_project` is extended (read only) to also return the raw `project_owner`,
`project_leader`, `project_admin`, `project_group` emails and the project's
existing `groupings` (Glossary names) so the forms can prefill and the flags can
be computed. `bootstrap` already returns `roles`.

### Frontend (PWA) — `frontend/src/`

- **`lib/api.ts`**: add a small **resource-API client** alongside the existing
  method client — `resource.get(doctype, name)`, `resource.list(doctype, {filters,
  fields})`, `resource.create(doctype, doc)`, `resource.update(doctype, name,
  doc)`, `resource.remove(doctype, name)` hitting `/api/resource/...` with the
  `X-Frappe-CSRF-Token` header on mutations (reuse the existing `csrf()` +
  `request` plumbing; resource responses wrap payload in `{data: ...}`).
- **`lib/types.ts`**: add raw `project_owner/project_leader/project_admin/
  project_group` + `groupings` to the project-detail type; `ProjectInput`,
  `WorkItemInput`, and option types. Permission flags are derived, not typed on
  the payload.
- **`hooks/useData.ts`**: `useFormOptions()` (customers/users/groups via
  `resource.list`), `useCreateProject()`, `useUpdateProject(project)`,
  `useDeleteProject()`, `useCreateWorkItem(project)` — mutations call the
  `resource.*` client and invalidate `projects`, `project`, `dashboard`. A
  `permFlags(project, boot)` helper computes `can_edit/can_delete/can_reassign`.
- **`components/ProjectFormSheet.tsx`**: bottom-sheet form used for both create
  and edit (mode prop). Fields: project_name, customer (select), project_owner
  (select), project_leader (select), project_admin (select, optional),
  project_group (select), start_date, deadline, goal (textarea), status
  (select), team_members (multi-select of users). Owner/leader selects disabled
  unless `can_reassign` (edit mode) — always editable in create mode. Client
  validation for required fields.
- **`components/WorkItemFormSheet.tsx`**: bottom sheet. Fields: title, grouping
  (combobox — datalist of existing project groupings, free text allowed),
  project_deadline, status. Existing groupings come from the `groupings` list
  added to the `get_project` payload (or `resource.list("Glossary", {filters})`).
- **`pages/Projects.tsx`**: add a "+ New project" button (shown when
  `can_create_project` is derived from `boot.roles`) opening `ProjectFormSheet`
  in create mode.
- **`pages/ProjectDetailPage.tsx`**: add Edit (if `can_edit`) and Delete (if
  `can_delete`, with confirm) actions; "Add work item" (if `can_edit`) opening
  `WorkItemFormSheet`; and "Add task" that lets the user pick a work item then
  opens the existing `CreateTaskSheet`.

## Data flow (representative)

```
Create project:
  Projects "+ New project" (visible if can_create_project)
   → ProjectFormSheet → useCreateProject.mutate(doc)
   → POST /api/resource/Project (role gate: Owner/SM) → Project.validate
   → invalidate projects/dashboard → list shows new project

Update project:
  ProjectDetailPage "Edit" (if can_edit) → ProjectFormSheet prefilled
   → PUT /api/resource/Project/<name> (role gate write: Owner/Leader)
   → Project.validate scopes to this project's leads + owner-only reassign

Create work item + task:
  ProjectDetailPage "Add work item" (if can_edit)
   → WorkItemFormSheet (grouping pick-or-type)
   → GET Glossary?filters=... ; POST Glossary if missing
   → POST /api/resource/Project Detail → invalidate project
   → "Add task" → pick the work item → CreateTaskSheet (existing flow)
```

## Error handling

| Case | Behavior |
|------|----------|
| Non-permitted user (UI bypass) | role gate / controller guard → resource API returns 403 → ApiError → toast |
| Leader tries to reassign owner/leader | `Project.validate` throws PermissionError → toast |
| Delete project with work items | `Project.on_trash` throws guard message → toast |
| Missing required form field | client-side validation blocks submit |
| New grouping typed | frontend POSTs a Glossary, then the Project Detail |
| Network/CSRF failure | ApiError → toast, sheet stays open |

## Testing

- **Backend unit tests** (`vernon_project/doctype/project/test_project.py`):
  enforce the controller guards directly with `frappe.set_user` (guards run even
  under `ignore_permissions`, since they check `frappe.session.user`):
  - `validate` edit scope: a non-lead user saving the project is rejected; the
    leader is allowed.
  - reassign guard: the leader (not owner) changing `project_owner`/
    `project_leader` is rejected; the owner changing them is allowed; SM allowed.
  - `on_trash`: delete blocked when a work item exists; allowed when none;
    non-owner rejected.
  - role-perm presence: assert `project.json` grants Leader `write` and Owner
    `delete` (so the resource gate passes).
  - Fixtures must satisfy mandatory schema (Project Group, Glossary grouping,
    title, project_deadline) — mirror the patterns in `test_mobile.py`.
- **Resource-API smoke** (`bench execute` script, like last feature): as a
  Project-Leader-role user who is the project's leader, PUT-edit succeeds and
  DELETE is blocked by the work-item guard; a role-holder who is not this
  project's lead is rejected — exercising the real role-gate + guard stack.
- **Frontend**: `npx tsc --noEmit` + `npm run build`; manual PWA verification as
  owner, leader, and non-lead.

## Build order (phases within this plan)

1. Backend: broaden `Project` role perms (Leader `write`, Owner `delete`) +
   `Project` controller guards (`validate` edit/reassign, `on_trash` delete) +
   extend `get_project` read with raw lead emails + `groupings` + tests
   (run `bench migrate` to apply the permission change).
2. Frontend: `resource.*` API client + project create/edit/delete (types, hooks,
   `permFlags`, `ProjectFormSheet`, wiring in Projects + ProjectDetailPage).
3. Work item create (resource-API grouping resolve-or-create + `Project Detail`
   create; `WorkItemFormSheet`; wiring) and task quick-add reusing
   `CreateTaskSheet`.

> **Security-model note:** Broadening `Project` role perms means any holder of
> the `Project Leader` role can *write* (and `Project Owner` role can *delete*)
> at the role-gate level for **any** project; the `Project.validate`/`on_trash`
> guards are what restrict the action to the specific project's leads. This is
> the trade-off of using the native resource API instead of whitelisted methods.

## Out of scope (YAGNI)

- Editing or deleting work items (only create).
- Editing/deleting tasks here (existing flows cover that).
- Customer / Project Group / User management (pick from existing only).
- Bulk operations, templates, archiving.
