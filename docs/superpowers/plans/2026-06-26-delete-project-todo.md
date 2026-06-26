# Delete Project Todo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Project Owner or Project Leader permanently delete a Planned or Cancelled Project Todo from both the mobile (`/m`) and web (`/w`) task-detail screens.

**Architecture:** Backend gains a whitelisted `delete_todo` method and a loosened `on_trash` guard; the single-todo payload advertises a `can_delete` flag. The two frontends share one hook/api layer (`@` alias → `../frontend/src`), so the api fn + mutation hook are written once and each `ProjectItem` screen wires a confirm-dialog Delete button.

**Tech Stack:** Frappe (Python) backend; React + TypeScript + @tanstack/react-query frontends (two Vite apps sharing `frontend/src`).

## Global Constraints

- **Live site, code-first:** project runs on one live site (project.vernon.id), no test DB. Automated tests are deferred to a final phase — tasks below use **manual verification**, not pytest TDD cycles.
- **No native dialogs:** never use `alert`/`confirm`/`prompt`. Use the existing `useConfirm()` modal hook.
- **Permission:** delete allowed for Project Owner / Project Leader / System Manager only (NOT assignee).
- **Status gate:** deletable only when status is `⚪️ Planned` (`STATUS_PLANNED`) or `🚫 Cancelled` (`STATUS_CANCELLED`).
- **Deploy:** Python changes → `bench restart`; frontend changes → `npm run build` in each app; no schema change → no migrate.

---

### Task 1: Backend — delete endpoint, on_trash guard, and can_delete flag

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.py` (`on_trash`, ~line 332)
- Modify: `vernon_project/api/mobile.py` (new `delete_todo`; `get_project_item` payload ~line 1213)

**Interfaces:**
- Produces (HTTP, whitelisted): `vernon_project.api.mobile.delete_todo(project_item: str) -> {status: "ok"|"error", message: str}`
- Produces (payload field): `get_project_item(...)["can_delete"]: bool`

- [ ] **Step 1: Loosen `on_trash` to allow Cancelled too**

In `project_todo.py`, the current `on_trash` throws unless status is `⚪️ Planned`. Replace its guard line so both Planned and Cancelled pass. Find:

```python
	def on_trash(self):
		# Cannot delete unless status is Planned ("Scheduled").
		if self.status != "⚪️ Planned":
			frappe.throw("Cannot delete Project Todo unless its status is 'Scheduled'.")
```

Replace with:

```python
	def on_trash(self):
		# Deletable only while Planned ("Scheduled") or Cancelled — never once it has
		# progressed (Done/Checked) or earned points (Completed).
		if self.status not in ("⚪️ Planned", "🚫 Cancelled"):
			frappe.throw("Cannot delete Project Todo unless its status is 'Scheduled' or 'Cancelled'.")
```

Leave the rest of `on_trash` (block-link mirror cleanup) and `after_delete` (parent rollup recompute) unchanged.

- [ ] **Step 2: Add the `delete_todo` whitelisted method**

In `vernon_project/api/mobile.py`, add this function right after `restore_todo` (after ~line 1482). `STATUS_PLANNED` and `STATUS_CANCELLED` are already module-level constants (lines 29 & 33).

```python
@frappe.whitelist()
def delete_todo(project_item):
	"""Permanently delete a Planned or Cancelled todo. Owner/Leader/System Manager only.

	Distinct from cancel_todo (reversible status flip): this removes the row.
	The doctype's on_trash is the real enforcement of the status gate; the checks
	here add the Owner/Leader permission and return a clean error message."""
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

- [ ] **Step 3: Expose `can_delete` in the single-todo payload**

In `get_project_item` (mobile.py), find the existing `can_edit` block (~line 1212):

```python
		is_sm = "System Manager" in frappe.get_roles(user)
		shaped["can_edit"] = is_sm or user in (
			r["project_owner"], r["project_leader"], r["assigned_to"]
		)
		shaped["fields_locked"] = shaped["status_key"] in ("done", "completed")
```

Immediately after `shaped["fields_locked"] = ...`, add:

```python
		# Delete is a lead-only action and only while Planned or Cancelled.
		shaped["can_delete"] = (
			(is_sm or user in (r["project_owner"], r["project_leader"]))
			and shaped["status_key"] in ("planned", "cancelled")
		)
```

- [ ] **Step 4: Restart and smoke-test the endpoint manually**

Run:

```bash
bench --site project.vernon.id restart || bench restart
```

Then, as a Project Owner session (or via `bench --site project.vernon.id console`), verify each branch:
- Planned todo → `delete_todo` returns `{"status": "ok"}` and the row is gone.
- Cancelled todo → returns `{"status": "ok"}`.
- A Done/Checked/Completed todo → returns `{"status": "error", "message": "Only a Scheduled or Cancelled task can be deleted."}`.
- A non-lead user → returns the permission error.
- `get_project_item` for a Planned todo as owner includes `"can_delete": true`; as assignee `"can_delete": false`.

Expected: all five match.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/doctype/project_todo/project_todo.py vernon_project/api/mobile.py
git commit -m "feat(todo): backend delete_todo endpoint + can_delete flag; allow deleting Cancelled"
```

---

### Task 2: Shared frontend layer — deleteTodo api + useDeleteTodo hook

**Files:**
- Modify: `frontend/src/lib/api.ts` (near `cancelTodo`/`restoreTodo`, ~line 106-114)
- Modify: `frontend/src/hooks/useData.ts` (after `useRestoreTodo`, ~line 181)

**Interfaces:**
- Consumes: `vernon_project.api.mobile.delete_todo` (Task 1)
- Produces: `mobileApi.deleteTodo(projectItem: string) => Promise<{ status: string; message?: string }>`
- Produces: `useDeleteTodo()` → mutation whose `mutateAsync(projectItem: string)` resolves to `{ status, message? }` and throws `Error(message)` on `status === 'error'`

- [ ] **Step 1: Add `deleteTodo` to the api client**

In `frontend/src/lib/api.ts`, alongside `restoreTodo` (which posts to `M + 'restore_todo'`), add:

```ts
  deleteTodo: (projectItem: string) =>
    api.post<{ status: string; message?: string }>(M + 'delete_todo', {
      project_item: projectItem,
    }),
```

(`M` is the existing mobile-method prefix constant used by `cancelTodo`/`restoreTodo`.)

- [ ] **Step 2: Add the `useDeleteTodo` hook**

In `frontend/src/hooks/useData.ts`, immediately after the `useRestoreTodo` function (ends ~line 181), add — mirroring `useCancelTodo`'s invalidations exactly:

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

- [ ] **Step 3: Add `can_delete` to the `ProjectItemDetail` type**

In `frontend/src/lib/types.ts`, find `can_edit: boolean` in the `ProjectItemDetail` interface (~line 90) and add directly below it:

```ts
  can_delete: boolean
```

- [ ] **Step 4: Typecheck both apps**

Run:

```bash
cd frontend && npx tsc --noEmit && cd ../frontend-web && npx tsc --noEmit && cd ..
```

Expected: no errors (the new hook/field are unused so far, but must compile).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/hooks/useData.ts frontend/src/lib/types.ts
git commit -m "feat(todo): shared deleteTodo api + useDeleteTodo hook + can_delete type"
```

---

### Task 3: Mobile UI — Delete button on ProjectItemScreen

**Files:**
- Modify: `frontend/src/pages/ProjectItemScreen.tsx` (hook list ~line 672; handlers ~line 722; action region ~line 1046)

**Interfaces:**
- Consumes: `useDeleteTodo` (Task 2), `data.can_delete` (Tasks 1–2), existing `useConfirm`, `useToast`, `navigate` (`const navigate = useNavigate()` already at line 668), `Trash2` icon (already imported, line 24), `Spinner` (already imported, line 32)

- [ ] **Step 1: Import the hook**

In the `@/hooks/useData` import list (the one bringing in `useCancelTodo`, `useRestoreTodo`), add `useDeleteTodo`.

- [ ] **Step 2: Instantiate the mutation**

Next to `const restoreTodo = useRestoreTodo()` (~line 673), add:

```tsx
  const deleteTodo = useDeleteTodo()
```

- [ ] **Step 3: Add the `onDelete` handler**

After the `onRestore` handler (ends ~line 722), add:

```tsx
  const onDelete = async () => {
    const ok = await confirm({
      title: 'Delete this task?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await deleteTodo.mutateAsync(data.name)
      if (res.status === 'ok') {
        toast('success', res.message)
        navigate(-1)
      } else {
        toast('info', res.message)
      }
    } catch (e: any) {
      toast('error', e?.message || 'Delete failed')
    }
  }
```

- [ ] **Step 4: Render the Delete button**

The action container closes with `</div>` at ~line 1049, just after the cancel/advance fragment closes (`</>` at ~line 1047). Insert the Delete button between that `</>` and the closing `</div>`, so it shows for both Planned and Cancelled states:

```tsx
            {data.can_delete && (
              <button
                onClick={onDelete}
                disabled={deleteTodo.isPending}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white dark:bg-slate-800 py-2.5 text-sm font-semibold text-rose-700 ring-1 ring-rose-300 dark:ring-rose-500/40 active:bg-rose-50 disabled:opacity-60"
              >
                {deleteTodo.isPending ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                Delete task
              </button>
            )}
```

- [ ] **Step 5: Typecheck**

Run:

```bash
cd frontend && npx tsc --noEmit && cd ..
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ProjectItemScreen.tsx
git commit -m "feat(todo): mobile Delete task button with confirm dialog"
```

---

### Task 4: Web UI — Delete button on ProjectItem

**Files:**
- Modify: `frontend-web/src/pages/ProjectItem.tsx` (router import line 2; hook list ~line 37; hooks ~line 720; handlers ~line 773; action region ~line 1103)

**Interfaces:**
- Consumes: `useDeleteTodo` (Task 2), `data.can_delete`, existing `useConfirm`, `useToast`, `Trash2` (already imported, line 27), `Spinner` (already imported, line 44). `useNavigate` is NOT yet imported here — add it.

- [ ] **Step 1: Import `useNavigate` and instantiate `navigate`**

Change the router import (line 2) from:

```tsx
import { useParams, Link } from 'react-router-dom'
```

to:

```tsx
import { useParams, Link, useNavigate } from 'react-router-dom'
```

Then, next to `const confirm = useConfirm()` (~line 722), add:

```tsx
  const navigate = useNavigate()
```

- [ ] **Step 2: Import the hook**

In the `@/hooks/useData` import list (bringing in `useCancelTodo`, `useRestoreTodo`), add `useDeleteTodo`.

- [ ] **Step 3: Instantiate the mutation**

Next to `const restoreTodo = useRestoreTodo()` (~line 720), add:

```tsx
  const deleteTodo = useDeleteTodo()
```

- [ ] **Step 4: Add the `onDelete` handler**

After the `onRestore` handler (ends ~line 773), add (web uses the `instanceof Error` toast idiom):

```tsx
  const onDelete = async () => {
    const ok = await confirm({
      title: 'Delete this task?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await deleteTodo.mutateAsync(data.name)
      if (res.status === 'ok') {
        toast('success', res.message)
        navigate(-1)
      } else {
        toast('info', res.message)
      }
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Delete failed')
    }
  }
```

- [ ] **Step 5: Render the Delete button**

The action container closes with `</div>` at ~line 1104, after the cancel/advance branch closes (`</>` / `)}` at ~line 1102-1103). Insert the Delete button between that closing fragment and the container's `</div>` so it shows for both Planned and Cancelled states:

```tsx
              {data.can_delete && (
                <button
                  onClick={onDelete}
                  disabled={deleteTodo.isPending}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white dark:bg-slate-800 py-2.5 text-sm font-semibold text-rose-700 ring-1 ring-rose-300 dark:ring-rose-500/40 hover:bg-rose-50 disabled:opacity-60"
                >
                  {deleteTodo.isPending ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                  Delete task
                </button>
              )}
```

- [ ] **Step 6: Typecheck**

Run:

```bash
cd frontend-web && npx tsc --noEmit && cd ..
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend-web/src/pages/ProjectItem.tsx
git commit -m "feat(todo): web Delete task button with confirm dialog"
```

---

### Task 5: Build, deploy, and end-to-end manual verification

**Files:** none (build + manual QA).

- [ ] **Step 1: Build both frontends**

Run:

```bash
cd frontend && npm run build && cd ../frontend-web && npm run build && cd ..
```

Expected: both builds succeed; assets emitted.

- [ ] **Step 2: Restart backend (if not already from Task 1)**

```bash
bench --site project.vernon.id restart || bench restart
```

- [ ] **Step 3: Manual QA matrix on the live site**

On both `/m` and `/w`, as a Project Owner/Leader:
1. Open a **Planned** todo → "Delete task" button visible → click → confirm dialog → Delete → toast "Task deleted." → navigated back → todo absent from the project detail list; parent rollups updated.
2. Open a **Cancelled** todo → Delete button visible → deletes successfully.
3. Open a **Done / Checked / Completed** todo → no Delete button.
4. As a non-lead **assignee** → no Delete button on any todo.
5. Delete a todo that **blocks/was blocked by** another → the mirror dependency link is removed (open the other todo; no dangling reference).

Expected: every row matches.

- [ ] **Step 4: Final commit (if any build artifacts are tracked)**

If the repo tracks built assets, commit them:

```bash
git add -A
git commit -m "build(todo): assets for delete project todo" || echo "no tracked build artifacts"
```

---

## Self-Review

**Spec coverage:**
- Both frontends → Tasks 3 (mobile) + 4 (web). ✓
- Owner/Leader-only permission → Task 1 Step 2 (`delete_todo` check) + Step 3 (`can_delete`). ✓
- Planned + Cancelled status gate → Task 1 Step 1 (`on_trash`) + Step 2 (API) + Step 3 (`can_delete`). ✓
- Shared api/hook written once → Task 2. ✓
- `can_delete`-gated button → Tasks 3/4 Step 5; type added Task 2 Step 3. ✓
- Yes/no confirm via dialog (no native confirm) → `useConfirm({ destructive: true })` in Tasks 3/4. ✓
- Navigate away after delete → `navigate(-1)` in Tasks 3/4. ✓
- No ledger cleanup needed (Planned/Cancelled never credited) → noted; `_remove_ledger` untouched. ✓
- Deploy mechanics (restart + npm build, no migrate) → Task 5. ✓

**Placeholder scan:** none — all code blocks complete, all commands concrete.

**Type consistency:** `deleteTodo` / `useDeleteTodo` / `can_delete` / `onDelete` used identically across api.ts, useData.ts, types.ts, and both screens. Confirm options match the established `{ title, message?, confirmLabel?, destructive? }` shape.
