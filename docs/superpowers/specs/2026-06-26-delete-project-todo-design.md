# Delete Project Todo — Design

**Date:** 2026-06-26
**Branch context:** adds hard-delete for Project Todo across both frontends.

## Goal

Let a Project Owner or Project Leader permanently delete a Project Todo that is
in **Planned** or **Cancelled** status, from both the mobile (`/m`) and web (`/w`)
task-detail screens. Distinct from the existing **cancel** (soft, reversible
status flip) — this removes the row.

## Decisions

- **Frontends:** both. They share one hook/api layer (`@` alias → `../frontend/src`),
  so backend + shared layer are written once; each `ProjectItem` screen wires a button.
- **Permission:** Project Owner / Project Leader / System Manager only. Assignee
  cannot delete (stricter than edit/cancel, which allow the assignee).
- **Status gate:** `⚪️ Planned` or `🚫 Cancelled` only. Done / Checked / Completed
  are not deletable.
- **Confirm UX:** simple yes/no dialog (no typed confirmation, no reason field),
  using the existing modal/sheet pattern (project rule: never native confirm).

## Out of scope

Bulk delete; deleting Done/Checked/Completed; undo / trash bin; soft-delete changes.

## Backend

### 1. `vernon_project/vernon_project/doctype/project_todo/project_todo.py` — loosen `on_trash`

Today `on_trash` throws unless status is `⚪️ Planned`. Extend to allow Cancelled too:

```python
def on_trash(self):
    # Deletable only while Planned or Cancelled (never once it has progressed/earned points).
    if self.status not in ("⚪️ Planned", "🚫 Cancelled"):
        frappe.throw("Cannot delete Project Todo unless its status is 'Scheduled' or 'Cancelled'.")
    # Drop mirror references from the other side so no dangling links remain.
    for r in self.blocking:
        self._remove_block_link(r.todo, "blocked_by")
    for r in self.blocked_by:
        self._remove_block_link(r.todo, "blocking")
```

- This `on_trash` guard is the real enforcement (covers desk + API + any path).
- `after_delete` already recomputes parent-detail rollups — no change.
- No Point Ledger cleanup needed: only `✅ Completed` ever credits points, and those
  are not deletable. (`_remove_ledger` stays for the un-complete path; untouched.)

### 2. `vernon_project/api/mobile.py` — new whitelisted `delete_todo`

Mirrors `cancel_todo`/`restore_todo` shape. Inline permission (Owner/Leader/SM only —
cannot reuse `_load_todo_for_edit`, which also admits the assignee).

```python
@frappe.whitelist()
def delete_todo(project_item):
    """Permanently delete a Planned or Cancelled todo. Owner/Leader/System Manager only."""
    user = frappe.session.user
    if not frappe.db.exists("Project Todo", project_item):
        return {"status": "error", "message": "Task not found."}
    row = frappe.get_doc("Project Todo", project_item)
    detail_project = (
        frappe.get_value("Project Detail", row.project_detail, "project")
        if row.project_detail else None
    )
    if not detail_project:
        return {"status": "error", "message": "Task not found."}
    project = frappe.get_doc("Project", detail_project)
    is_sm = "System Manager" in frappe.get_roles(user)
    if not (is_sm or user in (project.project_owner, project.project_leader)):
        return {"status": "error", "message": "Only the Project Owner or Project Leader can delete a task."}
    if row.status not in (STATUS_PLANNED, STATUS_CANCELLED):
        return {"status": "error", "message": "Only a Scheduled or Cancelled task can be deleted."}
    frappe.delete_doc("Project Todo", project_item, ignore_permissions=True)
    return {"status": "ok", "message": "Task deleted."}
```

### 3. `vernon_project/api/mobile.py` — expose `can_delete` in `get_project_item`

Next to the existing `can_edit` (~line 1213) so the UI shows the button only when the
action will succeed:

```python
shaped["can_delete"] = (
    (is_sm or user in (r["project_owner"], r["project_leader"]))
    and shaped["status_key"] in ("planned", "cancelled")
)
```

## Shared frontend layer (`frontend/src`, consumed by both apps)

### 4. `lib/api.ts` — `deleteTodo`

```ts
deleteTodo: (projectItem: string) =>
  api.post<{ status: string; message?: string }>(M + 'delete_todo', {
    project_item: projectItem,
  }),
```

### 5. `hooks/useData.ts` — `useDeleteTodo`

Mirror `useCancelTodo`: same query invalidations (`dashboard`, `projects`, `project`,
`project-detail`, `project-item`); throw on `status === 'error'`.

```ts
export function useDeleteTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (projectItem: string) => {
      const res = await mobileApi.deleteTodo(projectItem)
      if (res.status === 'error') throw new Error(res.message)
      return res
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.dashboard })
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: ['project-detail'] })
      qc.invalidateQueries({ queryKey: ['project-item'] })
    },
  })
}
```

## UI — both task-detail screens

`frontend/src/pages/ProjectItemScreen.tsx` (mobile) and
`frontend-web/src/pages/ProjectItem.tsx` (web), following each file's existing
cancel-flow + modal conventions:

- Render a **Delete** button only when `data.can_delete`.
- On click → yes/no confirm dialog: *"Delete this task? This cannot be undone."*
  Confirm / Cancel, using the same modal/sheet pattern as the cancel-reason flow.
- On confirm → `useDeleteTodo().mutateAsync(data.name)`.
- On success → success toast, then navigate back to the project-detail screen
  (the todo no longer exists, so don't stay on its detail route).
- On error → error toast with the returned message.

## Testing (deferred per project convention — live site, no test DB)

Manual after deploy:
1. Owner deletes a Planned todo → row gone, project rollups refresh.
2. Owner deletes a Cancelled todo → succeeds.
3. Assignee (non-lead) → no Delete button; direct API call → permission error.
4. Done/Checked/Completed todo → no button; API → status error; desk delete → `on_trash` throws.
5. Delete a todo that blocks/blocked another → mirror link removed, no dangling reference.

## Deploy

- `project_todo.py` + `mobile.py` are Python → `bench restart`.
- Frontend changes → rebuild both apps (`npm build`).
- No schema change → no migrate.
