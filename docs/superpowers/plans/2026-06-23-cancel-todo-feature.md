# Cancel Todo Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reversible `🚫 Cancelled` status to Project Todo with cancel/restore actions, an optional reason, and hide-by-default list behavior.

**Architecture:** `Cancelled` is a new off-workflow status value on the existing `status` Select. Two new whitelisted `mobile.py` methods (`cancel_todo`, `restore_todo`) flip the status (reusing `update_todo`'s edit-permission check). The shared `_fetch_todos` helper filters cancelled out by default; only `get_project_detail` (the project-detail screen list) and `get_project_item` (single-item view) can include them. Frontend adds cancel/restore UI on the item screen and a "Show cancelled" toggle on the project-detail screen.

**Tech Stack:** Frappe (Python whitelisted API + doctype JSON), React + TypeScript + TanStack Query (`frontend/`), Vite build → served at `/m`.

## Global Constraints

- Live site `project.vernon.id`, no test DB — **no automated test harness**. Verify with `bench --site project.vernon.id execute`/`console` + DB queries + manual app checks. (Project convention; overrides skill's pytest-TDD default.)
- Never use native `alert/confirm/prompt`. The app's `useConfirm` dialog returns only a boolean (no text input) — the optional cancel reason MUST use an inline reason field in the component, not the dialog.
- Deploy mechanics: `bench --site project.vernon.id migrate` for doctype JSON; `bench restart` for Python (requires sudo — will fail non-interactively; note for the human, use `console` to verify since it loads fresh code); `npm run build` (in `frontend/`) for frontend (also regenerates `vernon_project/www/m.html` + `vernon_sw.js`).
- Status strings are exact and must match verbatim: `⚪️ Planned`, `🟠 Done`, `🔷 Checked By PL`, `✅ Completed`, `🚫 Cancelled`.
- Cancel allowed only from non-completed states; Completed cannot be cancelled (no point reversal). Restore goes to `⚪️ Planned`. Reason cleared on restore.
- Access for cancel/restore = the exact edit check `update_todo` uses: `is_sm = "System Manager" in frappe.get_roles(user)`; allowed if `is_sm or user in (project.project_owner, project.project_leader, row.assigned_to)`.
- Branch: `feat/cancel-todo` (already created; spec already committed there).

---

### Task 1: Data model — Cancelled status + reason field + Python constant

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.json` (status `options`; add `cancellation_reason` field)
- Modify: `vernon_project/api/mobile.py` (status constants block `:29-39`)

**Interfaces:**
- Produces: status value `🚫 Cancelled`; `STATUS_CANCELLED` constant; `STATUS_KEY[STATUS_CANCELLED] == "cancelled"`; `Project Todo.cancellation_reason` (Small Text).

- [ ] **Step 1: Add the Cancelled status option**

In `project_todo.json`, find the `status` field's `options` (currently the 4-line string ending `✅ Completed`) and append `🚫 Cancelled`. The resulting value:

```json
"options": "⚪️ Planned\n🟠 Done\n🔷 Checked By PL\n✅ Completed\n🚫 Cancelled"
```

- [ ] **Step 2: Add the `cancellation_reason` field**

In `project_todo.json`, add this field object to the `fields` array (place it after the `status` field object). Also add `"cancellation_reason"` to the `field_order` array (right after `"status"`):

```json
{
 "fieldname": "cancellation_reason",
 "fieldtype": "Small Text",
 "label": "Cancellation Reason"
}
```

- [ ] **Step 3: Add the Python status constant**

In `mobile.py`, the constants block is at lines 29-39. Add `STATUS_CANCELLED` after `STATUS_COMPLETED` and an entry in `STATUS_KEY`. Result:

```python
STATUS_PLANNED = "⚪️ Planned"
STATUS_DONE = "\U0001f7e0 Done"
STATUS_CHECKED = "\U0001f537 Checked By PL"
STATUS_COMPLETED = "✅ Completed"
STATUS_CANCELLED = "\U0001f6ab Cancelled"

STATUS_KEY = {
	STATUS_PLANNED: "planned",
	STATUS_DONE: "done",
	STATUS_CHECKED: "checked",
	STATUS_COMPLETED: "completed",
	STATUS_CANCELLED: "cancelled",
}
```

(Do NOT add a `NEXT_STATUS`/`NEXT_LABEL` entry — Cancelled is off the linear chain. `_status_key` returns `"cancelled"` via the new `STATUS_KEY` entry.)

- [ ] **Step 4: Apply doctype change**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate
```
Expected: completes without error. Verify the field exists:
```bash
bench --site project.vernon.id execute frappe.db.get_value --kwargs "{'doctype':'DocField','filters':{'parent':'Project Todo','fieldname':'cancellation_reason'},'fieldname':'fieldname'}"
```
Expected: prints `cancellation_reason`.
(`bench restart` requires sudo — note in report that the human must run it; not needed for console verification.)

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/doctype/project_todo/project_todo.json vernon_project/api/mobile.py
git commit -m "feat(todo): add Cancelled status + cancellation_reason field"
```

---

### Task 2: List filtering — `_fetch_todos` excludes cancelled by default

**Files:**
- Modify: `vernon_project/api/mobile.py` (`_fetch_todos` `:129-154`; `get_project_detail` `:736,754`; `get_project_item` `:822`)

**Interfaces:**
- Consumes: `STATUS_CANCELLED` (Task 1).
- Produces: `_fetch_todos(project_names, include_cancelled=False)`. `get_project_detail(project_detail, include_cancelled=0)` honors the flag. `get_project_item` always includes cancelled and returns `cancellation_reason`.

- [ ] **Step 1: Add the `include_cancelled` filter to `_fetch_todos`**

Replace the whole `_fetch_todos` function (`:129-154`) with:

```python
def _fetch_todos(project_names, include_cancelled=False):
	"""All todos (with project + work-item context) for the given projects.
	Cancelled todos are excluded unless include_cancelled is True."""
	if not project_names:
		return []
	cond = "" if include_cancelled else "AND t.status != %(cancelled)s"
	return frappe.db.sql(
		f"""
		SELECT
			t.name, t.to_do, t.status, t.deadline, t.leader_deadline, t.owner_deadline,
			t.estimated, t.assigned_to,
			t.ongoing, t.notes, t.is_recurring,
			t.`group` AS `group`, t.level, t.point, t.assignee_earned, t.leader_earned,
			t.developed_by, t.developed_at, t.tested_by, t.tested_at,
			t.completed_by, t.completed_at, t.done_started_at, t.checked_started_at,
			pd.name AS project_detail, pd.title AS project_detail_title, pd.project,
			p.project_name, p.project_owner, p.project_leader, p.project_admin,
			p.brand
		FROM `tabProject Todo` t
		JOIN `tabProject Detail` pd
			ON t.project_detail = pd.name
		JOIN `tabProject` p ON pd.project = p.name
		WHERE pd.project IN %(projects)s {cond}
		ORDER BY t.deadline ASC
		""",
		{"projects": tuple(project_names), "cancelled": STATUS_CANCELLED},
		as_dict=True,
	)
```

(All other callers — `get_project_gantt:166`, `get_dashboard:385`, `get_projects:460`, `get_project:513`, `get_member_workload:631` — keep calling `_fetch_todos([...])` with the default, so they now exclude cancelled automatically. No edits needed there.)

- [ ] **Step 2: Make `get_project_detail` honor the toggle**

Change the signature (`:736`) from `def get_project_detail(project_detail):` to:

```python
def get_project_detail(project_detail, include_cancelled=0):
```

Then change the rows line (`:754`) from
`rows = [r for r in _fetch_todos([detail["project"]]) if r["project_detail"] == project_detail]`
to:

```python
	rows = [
		r
		for r in _fetch_todos([detail["project"]], include_cancelled=frappe.utils.cint(include_cancelled))
		if r["project_detail"] == project_detail
	]
```

- [ ] **Step 3: `get_project_item` always includes cancelled + returns the reason**

Change the rows line (`:822`) from
`rows = [r for r in _fetch_todos([project]) if r["name"] == project_item]`
to:

```python
	rows = [r for r in _fetch_todos([project], include_cancelled=True) if r["name"] == project_item]
```

Then add `cancellation_reason` to the `extra` get_value list (`:845-858`) and expose it on `shaped`. Add `"cancellation_reason"` to the field list passed to `frappe.get_value(... project_item, [ ... ])`, and after `extra = ... or {}` add:

```python
	shaped["cancellation_reason"] = extra.get("cancellation_reason")
```

- [ ] **Step 4: Verify filtering via console**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console
```
```python
import frappe
from vernon_project.api.mobile import _fetch_todos, STATUS_CANCELLED
# pick a project with todos:
proj = frappe.get_all("Project", limit=1, pluck="name")[0]
# pick one todo in it, mark it cancelled directly for the test:
tid = frappe.get_all("Project Todo", limit=1, pluck="name", filters={})[0]
orig = frappe.db.get_value("Project Todo", tid, "status")
frappe.db.set_value("Project Todo", tid, "status", STATUS_CANCELLED); frappe.db.commit()
project = frappe.db.get_value("Project Detail", frappe.db.get_value("Project Todo", tid, "project_detail"), "project")
default = [r["name"] for r in _fetch_todos([project])]
withc = [r["name"] for r in _fetch_todos([project], include_cancelled=True)]
print("hidden by default:", tid not in default, "| shown when included:", tid in withc)
# restore original status:
frappe.db.set_value("Project Todo", tid, "status", orig); frappe.db.commit()
print("restored to", orig)
```
Expected: `hidden by default: True | shown when included: True`, then restored.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/mobile.py
git commit -m "feat(todo): hide cancelled from lists by default, expose via detail toggle"
```

---

### Task 3: Backend `cancel_todo` / `restore_todo`

**Files:**
- Modify: `vernon_project/api/mobile.py` (append both methods after `update_todo`'s block, near `:1030`)

**Interfaces:**
- Consumes: `STATUS_CANCELLED`, `STATUS_COMPLETED`, `STATUS_PLANNED` (Task 1).
- Produces:
  - `cancel_todo(project_item, reason=None) -> {"status": str, "message": str}`
  - `restore_todo(project_item) -> {"status": str, "message": str}`

- [ ] **Step 1: Add a shared permission helper + `cancel_todo`**

Append to `mobile.py`:

```python
def _load_todo_for_edit(project_item):
	"""Resolve a todo + its project and assert the caller may edit it.
	Returns (row_doc, project_doc). Raises a frappe error message dict via
	the caller on failure — here we return (None, error_dict)."""
	user = frappe.session.user
	if not frappe.db.exists("Project Todo", project_item):
		return None, {"status": "error", "message": "Task not found."}
	row = frappe.get_doc("Project Todo", project_item)
	project_detail = row.project_detail
	detail_project = frappe.get_value("Project Detail", project_detail, "project") if project_detail else None
	if not detail_project:
		return None, {"status": "error", "message": "Task not found."}
	project = frappe.get_doc("Project", detail_project)
	is_sm = "System Manager" in frappe.get_roles(user)
	if not (is_sm or user in (project.project_owner, project.project_leader, row.assigned_to)):
		return None, {"status": "error", "message": "You don't have permission to edit this task."}
	return row, project


@frappe.whitelist()
def cancel_todo(project_item, reason=None):
	"""Cancel a non-completed todo (reversible). Stores an optional reason."""
	row, ctx = _load_todo_for_edit(project_item)
	if row is None:
		return ctx
	if row.status == STATUS_COMPLETED:
		return {"status": "error", "message": "Cannot cancel a completed task."}
	if row.status == STATUS_CANCELLED:
		return {"status": "info", "message": "Task is already cancelled."}
	row.status = STATUS_CANCELLED
	row.cancellation_reason = (reason or "").strip() or None
	row.save(ignore_permissions=True)
	return {"status": "ok", "message": "Task cancelled."}
```

- [ ] **Step 2: Add `restore_todo`**

Append to `mobile.py`:

```python
@frappe.whitelist()
def restore_todo(project_item):
	"""Restore a cancelled todo back to Planned and clear its reason."""
	row, ctx = _load_todo_for_edit(project_item)
	if row is None:
		return ctx
	if row.status != STATUS_CANCELLED:
		return {"status": "info", "message": "Task is not cancelled."}
	row.status = STATUS_PLANNED
	row.cancellation_reason = None
	row.save(ignore_permissions=True)
	return {"status": "ok", "message": "Task restored."}
```

- [ ] **Step 3: Verify via console**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console
```
```python
import frappe
frappe.set_user("Administrator")  # System Manager → passes edit check
from vernon_project.api.mobile import cancel_todo, restore_todo
# pick a NON-completed todo:
tid = frappe.get_all("Project Todo", filters={"status": ["!=", "✅ Completed"]}, limit=1, pluck="name")[0]
print(cancel_todo(tid, "test reason"))
print("status:", frappe.db.get_value("Project Todo", tid, "status"), "| reason:", frappe.db.get_value("Project Todo", tid, "cancellation_reason"))
print(cancel_todo(tid))                  # already cancelled -> info
print(restore_todo(tid))
print("status:", frappe.db.get_value("Project Todo", tid, "status"), "| reason:", frappe.db.get_value("Project Todo", tid, "cancellation_reason"))
print(restore_todo(tid))                 # not cancelled -> info
# completed cannot be cancelled:
cid = frappe.get_all("Project Todo", filters={"status": "✅ Completed"}, limit=1, pluck="name")
if cid: print(cancel_todo(cid[0]))       # -> error "Cannot cancel a completed task."
```
Expected: cancel → ok + status `🚫 Cancelled` + reason "test reason"; second cancel → info "already cancelled"; restore → ok + status `⚪️ Planned` + reason None; second restore → info "not cancelled"; completed → error "Cannot cancel a completed task." (Leaves data restored to Planned for the test todo; note this in report.)

- [ ] **Step 4: Commit**

```bash
git add vernon_project/api/mobile.py
git commit -m "feat(todo): cancel_todo + restore_todo endpoints"
```

---

### Task 4: Frontend API, types, hooks, status meta

**Files:**
- Modify: `frontend/src/lib/api.ts` (`mobileApi`: add `cancelTodo`, `restoreTodo`; add `include_cancelled` to `projectDetail`)
- Modify: `frontend/src/lib/types.ts` (`StatusKey` `:1`; `ProjectItemDetail` add `cancellation_reason`)
- Modify: `frontend/src/lib/status.ts` (add `cancelled` to `STATUS`)
- Modify: `frontend/src/hooks/useData.ts` (`useCancelTodo`, `useRestoreTodo`; `useProjectDetail` accepts `includeCancelled`)

**Interfaces:**
- Consumes: backend `cancel_todo`, `restore_todo`, `get_project_detail(..., include_cancelled)`.
- Produces:
  - `mobileApi.cancelTodo(projectItem, reason?) -> Promise<{status:string; message:string}>`
  - `mobileApi.restoreTodo(projectItem) -> Promise<{status:string; message:string}>`
  - `useCancelTodo()`, `useRestoreTodo()` mutations.
  - `StatusKey` includes `'cancelled'`; `STATUS.cancelled` meta.

- [ ] **Step 1: Find how `projectDetail` is currently defined in api.ts**

Run: `grep -n "projectDetail\|get_project_detail\|advanceStatus" /home/frappe/frappe-bench/apps/vernon_project/frontend/src/lib/api.ts`
Use the existing `advanceStatus` (POST to a `vernon_project.api.project_todo.*` or `M + ...` method) as the pattern for the two new POST methods. `M` is the mobile-method prefix constant already used in this file.

- [ ] **Step 2: Add the API methods + projectDetail flag**

In `frontend/src/lib/api.ts`, inside the `mobileApi` object add:

```ts
  cancelTodo: (projectItem: string, reason?: string) =>
    api.post<{ status: string; message: string }>(M + 'cancel_todo', {
      project_item: projectItem,
      ...(reason ? { reason } : {}),
    }),
  restoreTodo: (projectItem: string) =>
    api.post<{ status: string; message: string }>(M + 'restore_todo', {
      project_item: projectItem,
    }),
```

And update the existing `projectDetail` method to pass the flag. Find the current definition (from Step 1) — it calls `get_project_detail` with `{ project_detail }`. Change it to accept an optional flag:

```ts
  projectDetail: (projectDetail: string, includeCancelled = false) =>
    api.get(M + 'get_project_detail', {
      project_detail: projectDetail,
      ...(includeCancelled ? { include_cancelled: 1 } : {}),
    }),
```

(Keep the existing return-type generic if the current definition has one — preserve it, only add the second param + the conditional query field.)

- [ ] **Step 3: Add `'cancelled'` to `StatusKey` and `cancellation_reason`**

In `frontend/src/lib/types.ts`, change line 1:

```ts
export type StatusKey = 'planned' | 'done' | 'checked' | 'completed' | 'cancelled'
```

Find the `ProjectItemDetail` type (grep `ProjectItemDetail` in types.ts) and add a field:

```ts
  cancellation_reason?: string | null
```

- [ ] **Step 4: Add the `cancelled` status meta**

In `frontend/src/lib/status.ts`, add a `cancelled` entry to the `STATUS` record (after `completed`). Do NOT add it to `STATUS_ORDER` (it stays the 4-step chain):

```ts
  cancelled: {
    label: 'Cancelled',
    emoji: '🚫',
    pill: 'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300',
    dot: 'bg-rose-500',
    ring: 'border-rose-400',
  },
```

- [ ] **Step 5: Add the mutation hooks + projectDetail flag**

In `frontend/src/hooks/useData.ts`, find `useProjectDetail` (grep it) and add an optional `includeCancelled` arg threaded into the queryKey + queryFn. The current hook looks like `useProjectDetail(name)` calling `mobileApi.projectDetail(name)`; change to:

```ts
export function useProjectDetail(name: string, includeCancelled = false) {
  return useQuery({
    queryKey: ['project-detail', name, includeCancelled],
    queryFn: () => mobileApi.projectDetail(name, includeCancelled) as Promise<ProjectDetail>,
    enabled: !!name,
  })
}
```

(Preserve the actual existing return type cast `as Promise<...>` and any other options the current hook uses — only add the `includeCancelled` param, the queryKey entry, and pass it through.)

Then, mirroring `useAdvanceStatus` (`:114`), add:

```ts
export function useCancelTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectItem, reason }: { projectItem: string; reason?: string }) => {
      const res = await mobileApi.cancelTodo(projectItem, reason)
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

export function useRestoreTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (projectItem: string) => {
      const res = await mobileApi.restoreTodo(projectItem)
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

- [ ] **Step 6: Typecheck**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```
Expected: no errors. (Adding `'cancelled'` to `StatusKey` forces the `STATUS` record entry from Step 4 — if tsc complains about a missing `cancelled` key, that entry is missing.)

- [ ] **Step 7: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/lib/api.ts frontend/src/lib/types.ts frontend/src/lib/status.ts frontend/src/hooks/useData.ts
git commit -m "feat(todo): frontend cancel/restore api, hooks, types, status meta"
```

---

### Task 5: ProjectItemScreen cancel/restore UI + project-detail toggle

**Files:**
- Modify: `frontend/src/pages/ProjectItemScreen.tsx` (workflow card `:802-829`; imports `:4-23`)
- Modify: the project-detail screen component that renders `useProjectDetail` (find it: grep `useProjectDetail` in `frontend/src/pages`)

**Interfaces:**
- Consumes: `useCancelTodo`, `useRestoreTodo`, `useConfirm`, `useProjectDetail(name, includeCancelled)`, `STATUS`, `data.can_edit`, `data.status_key`, `data.cancellation_reason`.

- [ ] **Step 1: Import hooks + icons in ProjectItemScreen**

Add to the existing imports: `Ban` and `RotateCcw` to the `lucide-react` import block (`:4-23`); and the hooks. Near the other hook imports add `useCancelTodo, useRestoreTodo` (they live in `@/hooks/useData`) and confirm `useConfirm` is imported from `@/components/Confirm` (add if missing) and `useToast` from `@/components/Toast` (add if missing — grep to check).

- [ ] **Step 2: Wire the mutations + inline reason state**

Near the top of the `ProjectItemScreen` component body (where `const advance = useAdvanceStatus()` is, `:568`), add:

```tsx
  const cancelTodo = useCancelTodo()
  const restoreTodo = useRestoreTodo()
  const confirm = useConfirm()
  const toast = useToast()
  const [showCancel, setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const onCancel = async () => {
    try {
      const res = await cancelTodo.mutateAsync({ projectItem: data.name, reason: cancelReason.trim() || undefined })
      toast(res.status === 'ok' ? 'success' : 'info', res.message)
      setShowCancel(false)
      setCancelReason('')
    } catch (e: any) {
      toast('error', e?.message || 'Cancel failed')
    }
  }

  const onRestore = async () => {
    const ok = await confirm({ title: 'Restore this task to Planned?', confirmLabel: 'Restore' })
    if (!ok) return
    try {
      const res = await restoreTodo.mutateAsync(data.name)
      toast(res.status === 'ok' ? 'success' : 'info', res.message)
    } catch (e: any) {
      toast('error', e?.message || 'Restore failed')
    }
  }
```

(`data` is the loaded `ProjectItemDetail`; this code sits after `data` is known to be defined — place it alongside the existing `onAdvance` handler. If `useState`/`toast` patterns differ, match the existing ones in the file.)

- [ ] **Step 3: Render cancel/restore in the Workflow card**

In the Workflow card (`:802-829`), the advance button is gated by `data.status_key !== 'completed'`. Replace that block so a cancelled task shows a Restore action instead of the stepper-advance, and a non-cancelled/non-completed editable task gets a Cancel action. Replace the block from `{data.status_key !== 'completed' &&` through its closing `))}` (ending at `:828`) with:

```tsx
        {data.status_key === 'cancelled' ? (
          <div className="mt-5 space-y-3">
            {data.cancellation_reason && (
              <p className="rounded-xl bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
                Reason: {data.cancellation_reason}
              </p>
            )}
            {data.can_edit && (
              <button
                onClick={onRestore}
                disabled={restoreTodo.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-700 py-3 font-semibold text-slate-700 dark:text-slate-200 active:scale-[0.99] disabled:opacity-60"
              >
                {restoreTodo.isPending ? <Spinner className="h-5 w-5" /> : <RotateCcw className="h-4 w-4" />}
                Restore to Planned
              </button>
            )}
          </div>
        ) : (
          <>
            {data.status_key !== 'completed' &&
              (data.can_advance ? (
                <button
                  onClick={onAdvance}
                  disabled={advance.isPending}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white shadow-sm transition active:bg-brand-700 disabled:opacity-60"
                >
                  {advance.isPending ? (
                    <Spinner className="h-5 w-5" />
                  ) : (
                    <>
                      {data.next_status_label}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              ) : (
                <div className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 py-3 text-sm text-slate-400 dark:text-slate-500">
                  <Lock className="h-4 w-4" />
                  Waiting on someone else to advance this
                </div>
              ))}

            {data.can_edit && data.status_key !== 'completed' && (
              showCancel ? (
                <div className="mt-3 space-y-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 p-3">
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    rows={2}
                    placeholder="Reason (optional)"
                    className="w-full resize-none rounded-lg border border-rose-200 dark:border-rose-500/30 bg-transparent px-3 py-2 text-sm outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={onCancel}
                      disabled={cancelTodo.isPending}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-rose-600 py-2.5 text-sm font-semibold text-white active:scale-[0.99] disabled:opacity-60"
                    >
                      {cancelTodo.isPending ? <Spinner className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                      Confirm cancel
                    </button>
                    <button
                      onClick={() => { setShowCancel(false); setCancelReason('') }}
                      className="rounded-lg bg-white dark:bg-slate-700 px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-200"
                    >
                      Back
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCancel(true)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white dark:bg-slate-800 py-2.5 text-sm font-semibold text-rose-600 ring-1 ring-rose-200 dark:ring-rose-500/30 active:bg-rose-50"
                >
                  <Ban className="h-4 w-4" /> Cancel task
                </button>
              )
            )}
          </>
        )}
```

- [ ] **Step 4: Add the "Show cancelled" toggle on the project-detail screen**

Open the project-detail page component (from the grep in Files). It calls `useProjectDetail(name)`. Add toggle state and pass it through:

```tsx
  const [showCancelled, setShowCancelled] = useState(false)
  const { data, isLoading } = useProjectDetail(name, showCancelled)
```

(Match the existing destructuring of `useProjectDetail` in that file — keep the same returned fields, only add the second arg.) Then add a toggle control near the task list header:

```tsx
  <label className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
    <input
      type="checkbox"
      checked={showCancelled}
      onChange={(e) => setShowCancelled(e.target.checked)}
      className="h-4 w-4 accent-brand-600"
    />
    Show cancelled
  </label>
```

(Place it wherever the screen lists its tasks — alongside the existing list header. If the screen renders task rows with a status pill from `STATUS[t.status_key]`, cancelled rows will now style themselves via the `cancelled` meta added in Task 4.)

- [ ] **Step 5: Build**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
```
Expected: build succeeds; `[copy-html]` lines print; new hashed bundle emitted.

- [ ] **Step 6: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/pages/ProjectItemScreen.tsx frontend/src/pages vernon_project/public/frontend vernon_project/www/m.html vernon_project/www/vernon_sw.js
git commit -m "feat(todo): cancel/restore UI on item screen + show-cancelled toggle"
```

---

### Task 6: End-to-end verification on live

**Files:** none (verification only). Requires the human to run `sudo supervisorctl restart all` first so the Python changes are live.

- [ ] **Step 1:** Open a Planned/Done/Checked todo in the app → "Cancel task" → enter a reason → Confirm cancel. Status shows `🚫 Cancelled` with the reason.
- [ ] **Step 2:** That todo disappears from the dashboard, the member workload, and the project-detail list (toggle off).
- [ ] **Step 3:** On the project-detail screen, enable "Show cancelled" → the cancelled todo appears (styled rose/cancelled).
- [ ] **Step 4:** Open the cancelled todo → "Restore to Planned" → status returns to `⚪️ Planned`, reason gone, reappears in lists.
- [ ] **Step 5:** Open a Completed todo → no "Cancel task" button (status is completed).
- [ ] **Step 6:** As a user who is not SM / owner / leader / assignee, the cancel/restore actions are absent (server also rejects).
- [ ] **Step 7 (optional):** Merge via `superpowers:finishing-a-development-branch`.

---

## Self-Review

**Spec coverage:**
- `🚫 Cancelled` status value → Task 1 ✓
- `cancellation_reason` field, cleared on restore → Task 1 (field) + Task 3 (set/clear) ✓
- `STATUS_CANCELLED` constant + `status_key` "cancelled" → Task 1 ✓
- `cancel_todo` (reject completed/already-cancelled/permission; optional reason) → Task 3 ✓
- `restore_todo` (only from cancelled; → Planned; clear reason) → Task 3 ✓
- Edit-permission reuse → Task 3 `_load_todo_for_edit` ✓
- Hide by default: dashboard/workload/gantt always; project-detail toggle → Task 2 (`_fetch_todos` default + `get_project_detail` flag); single-item view always includes → Task 2 ✓
- No scoring impact → no scoring path touched (Completed can't be cancelled); documented in spec ✓
- Frontend StatusKey + meta + api + hooks → Task 4 ✓
- Item-screen cancel/restore + reason display + reason input (inline, not native prompt) → Task 5 ✓
- Project-detail "Show cancelled" toggle → Task 5 ✓
- Status badge cancelled styling → Task 4 meta + Task 5 (rows use `STATUS[...]`) ✓
- E2E verification → Task 6 ✓

**Note — spec deviation:** the spec's visibility table named `get_project` for the toggle; the actual project-detail todo *list* is served by `get_project_detail`, so the `include_cancelled` flag lives there (Task 2). `get_project` only builds rollups/team and now excludes cancelled via the shared `_fetch_todos` default — intent (project-detail screen toggle) preserved.

**Placeholder scan:** none — every code step has concrete code; verification uses console/manual per the documented no-test-DB convention. Two steps (Task 4 Step 1/Step 2 `projectDetail`, Task 5 Step 4 project-detail screen) require a grep to locate the exact current definition before editing, because those exact line shapes weren't captured in the plan; the edit content is fully specified.

**Type consistency:** `cancelTodo(projectItem, reason?)`/`restoreTodo(projectItem)` return `{status,message}` — consumed identically in api.ts (Task 4) and the hooks (Task 4) and screen (Task 5). `useCancelTodo` mutation arg `{projectItem, reason}` matches the screen's `mutateAsync` call. `StatusKey` gains `'cancelled'` (Task 4) and `STATUS.cancelled` exists (Task 4) so the `Record<StatusKey,…>` stays total. `cancellation_reason` added to `ProjectItemDetail` (Task 4) is read in Task 5.
