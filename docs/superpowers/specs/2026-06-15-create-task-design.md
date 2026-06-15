# Create New Task — Design

**Date:** 2026-06-15
**Status:** Approved for planning

## Problem

The mobile PWA can read and advance/edit tasks (Project Todo rows) but cannot
**create** them. Adding a task today requires the Frappe desk. We want
project leads to add a task to a work item directly from the mobile app.

## Domain facts

- A "task" is a `Project Todo` row. It is a **child table** (`istable: 1`).
- Tasks belong to a work item: `Project Detail.todo` (Table → Project Todo).
- A work item belongs to a `Project`, which has `project_owner` / `project_leader`.
- New tasks default to status `⚪️ Planned`; `track_phase_changes()` stamps
  `planned_started_at` on insert.

## Decisions (from brainstorming)

| Topic | Decision |
|-------|----------|
| Surface | Mobile PWA UI (`WorkItemPage`) + backend |
| Backend mechanism | `frappe.client.insert` of a single child row (no custom endpoint) |
| Who can create | Project Owner + Project Leader only (System Manager bypass) |
| Form fields | Core 5 (`to_do`, `assigned_to`, `deadline`, `estimated`, `notes`) + recurring (`is_recurring`, `recurring_frequency`, `recurring_until`) |

## Architecture

### 1. Backend permission guard (`project_todo.py`)

`has_permission` currently allows **any** team member to write, which is too
open. Add a `before_insert` guard on `ProjectTodo`:

```
def before_insert(self):
    user = frappe.session.user
    if "System Manager" in frappe.get_roles(user):
        return
    if not self.parent:
        frappe.throw(_("Task must belong to a work item"), frappe.PermissionError)
    project_name = frappe.get_value("Project Detail", self.parent, "project")
    owner, leader = frappe.get_value(
        "Project", project_name, ["project_owner", "project_leader"]
    )
    if user not in (owner, leader):
        frappe.throw(
            _("Only the Project Owner or Project Leader can create tasks."),
            frappe.PermissionError,
        )
```

- Applies only to genuinely new rows (`before_insert`), so existing-row saves
  and `validate_done_todo_fields`/status flows are untouched.
- Recurring next-occurrence (`create_next_occurrence`) is triggered by the
  owner completing a task → owner passes. The daily scheduler runs as
  Administrator (System Manager) → passes. So automation is unaffected.

### 2. Backend read extension (`mobile.py: get_work_item`)

Extend the existing `get_work_item` response (a read, no new endpoint) with:

- `can_create: bool` — `user in (project_owner, project_leader)` or System Manager.
- `team: [{user, name, image}]` — project team members, to populate the
  assignee picker (reuse `_user_name_map`).

### 3. Create call (frontend → built-in API)

`frontend/src/lib/api.ts` adds:

```
createTask: (doc: Record<string, unknown>) =>
  api.post('frappe.client.insert', { doc: JSON.stringify({
    doctype: 'Project Todo',
    parenttype: 'Project Detail',
    parentfield: 'todo',
    ...doc,            // parent (work item), to_do, assigned_to, deadline, estimated, notes, recurring fields
    status: '⚪️ Planned',
  })}),
```

`frappe.client.insert` runs `has_permission('create')` + `before_insert` +
`validate`, then returns the inserted doc. Errors arrive as non-2xx with
`_server_messages` and surface via the existing `ApiError` path.

### 4. Data hook (`hooks/useData.ts`)

`useCreateTask(workItemName)` — `useMutation` calling `mobileApi.createTask`,
invalidating `work-item`, `project`, and `dashboard` queries on settle
(same pattern as `useUpdateTodo`).

### 5. UI (`WorkItemPage.tsx` + new `CreateTaskSheet.tsx`)

- In the Tasks section header, show a **"+ Add task"** button only when
  `data.can_create`.
- `CreateTaskSheet` = bottom-sheet form built from existing `ui.tsx` primitives:
  - `to_do` (text, required)
  - `assigned_to` (select from `data.team`, required)
  - `deadline` (date, required)
  - `estimated` (number, minutes, optional, ≥ 0)
  - `notes` (textarea, optional)
  - `is_recurring` (toggle) → reveals `recurring_frequency`
    (Daily/Weekly/Monthly) + `recurring_until` (date)
- Client-side validation for the three required fields before submit.
- On success: close sheet, toast "Task created", list refreshes via invalidation.
- On error: toast the server message, keep sheet open.

### 6. Types (`lib/types.ts`)

Add `can_create: boolean` and `team: { user; name; image }[]` to `WorkItem`.

## Data flow

```
User taps "+ Add task" (visible only if can_create)
  → CreateTaskSheet form → useCreateTask.mutate(doc)
  → POST /api/method/frappe.client.insert {doc: Project Todo + parent links}
  → has_permission(create) → before_insert (owner/leader gate) → validate (stamps planned_started_at)
  → row inserted under Project Detail.todo
  → invalidate work-item/project/dashboard → list re-renders with new task
```

## Error handling

| Case | Behavior |
|------|----------|
| Non-owner/leader submits (e.g. bypassed UI) | `before_insert` throws PermissionError → toast |
| Missing required field | Client-side validation blocks submit |
| Recurring until < deadline | Allowed (no occurrence spawned until completion); no special handling |
| Network/CSRF failure | `ApiError` → toast, sheet stays open |

## Testing

- **Backend unit test** (`test_project_todo.py`): owner/leader can insert a
  child task; a plain team member is rejected with PermissionError; System
  Manager bypass works.
- **Manual PWA verification**: as leader, add a task (with and without
  recurring) on a work item; confirm it appears and defaults to Planned.
  Confirm the button is hidden for a non-lead user.

## Out of scope (YAGNI)

- Per-phase estimate fields on the create form (set later via edit).
- Bulk task creation / templates.
- Editing tasks from this sheet (existing edit flow covers that).
- `idx` ordering tuning — verify insertion order in implementation; only
  address if new tasks land in the wrong position.
