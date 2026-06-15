# Create New Task Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Project Owners/Leaders create a new task (Project Todo) on a work item directly from the mobile PWA.

**Architecture:** Frontend submits a single child row through Frappe's built-in `frappe.client.insert` (no custom endpoint). A `before_insert` guard on `ProjectTodo` enforces owner/leader-only creation. `get_work_item` is extended (read-only) with a `can_create` flag and the project `team` so the UI can gate the button and populate the assignee picker. A new `CreateTaskSheet` bottom-sheet drives the form.

**Tech Stack:** Frappe (Python), React + TypeScript + TanStack Query + Tailwind (Vite PWA).

**Site for tests/build:** `project.vernon.id` · **Bench root:** `/home/frappe/frappe-bench` · **App root:** `/home/frappe/frappe-bench/apps/vernon_project`

---

## File Structure

- Modify `vernon_project/vernon_project/doctype/project_todo/project_todo.py` — add `before_insert` permission guard.
- Modify `vernon_project/vernon_project/doctype/project_todo/test_project_todo.py` — guard tests.
- Modify `vernon_project/api/mobile.py` — extend `get_work_item` with `can_create` + `team`.
- Create `vernon_project/api/test_mobile.py` — test for the read extension.
- Modify `frontend/src/lib/types.ts` — extend `WorkItem`.
- Modify `frontend/src/lib/api.ts` — add `createTask`.
- Modify `frontend/src/hooks/useData.ts` — add `useCreateTask`.
- Create `frontend/src/components/CreateTaskSheet.tsx` — the form.
- Modify `frontend/src/pages/WorkItemPage.tsx` — add gated "+ Add task" button + sheet.

---

## Task 1: Backend permission guard

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project_todo/project_todo.py`
- Test: `vernon_project/vernon_project/doctype/project_todo/test_project_todo.py`

- [ ] **Step 1: Write failing tests**

Append these methods inside `class TestProjectTodo` in `test_project_todo.py`:

```python
	def test_non_lead_cannot_create_task(self):
		"""A non owner/leader user cannot add a task to a work item."""
		frappe.set_user("test_user2@example.com")
		detail = frappe.get_doc("Project Detail", self.project_detail.name)
		detail.append("todo", {
			"to_do": "Sneaky task",
			"assigned_to": "test_user2@example.com",
			"deadline": add_days(nowdate(), 5),
			"status": "⚪️ Planned",
		})
		with self.assertRaises(frappe.PermissionError):
			detail.save(ignore_permissions=True)
		frappe.set_user("Administrator")
		detail.reload()

	def test_lead_can_create_task(self):
		"""A non-System-Manager project leader can add a task (owner/leader branch)."""
		proj = frappe.get_doc({
			"doctype": "Project",
			"project_name": "Lead Create Test",
			"customer": "Test Customer",
			"project_owner": "test_user@example.com",
			"project_leader": "test_user@example.com",
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 30),
		})
		proj.insert(ignore_permissions=True)
		pd = frappe.get_doc({
			"doctype": "Project Detail",
			"project": proj.name,
			"detail_name": "Lead Detail",
			"estimated": 10,
		})
		pd.insert(ignore_permissions=True)
		frappe.db.commit()

		frappe.set_user("test_user@example.com")
		pd.reload()
		pd.append("todo", {
			"to_do": "Legit task",
			"assigned_to": "test_user@example.com",
			"deadline": add_days(nowdate(), 5),
			"status": "⚪️ Planned",
		})
		pd.save(ignore_permissions=True)
		frappe.set_user("Administrator")

		pd.reload()
		self.assertEqual(len(pd.todo), 1)
		frappe.delete_doc("Project Detail", pd.name, force=True, ignore_permissions=True)
		frappe.delete_doc("Project", proj.name, force=True, ignore_permissions=True)
		frappe.db.commit()
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests \
  --module vernon_project.vernon_project.doctype.project_todo.test_project_todo
```
Expected: `test_non_lead_cannot_create_task` FAILS (no PermissionError raised — guard absent).

- [ ] **Step 3: Implement the guard**

In `project_todo.py`, add `_` to the imports and add a `before_insert` method to `class ProjectTodo` (place it right after `validate`). The file already imports `frappe`; add the translation helper:

```python
from frappe import _
```

```python
	def before_insert(self):
		"""Only the Project Owner or Project Leader may create a task."""
		user = frappe.session.user
		if "System Manager" in frappe.get_roles(user):
			return
		if not self.parent:
			frappe.throw(_("Task must belong to a work item"), frappe.PermissionError)
		project_name = frappe.get_value("Project Detail", self.parent, "project")
		if not project_name:
			frappe.throw(_("Work item has no project"), frappe.PermissionError)
		owner, leader = frappe.get_value(
			"Project", project_name, ["project_owner", "project_leader"]
		)
		if user not in (owner, leader):
			frappe.throw(
				_("Only the Project Owner or Project Leader can create tasks."),
				frappe.PermissionError,
			)
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests \
  --module vernon_project.vernon_project.doctype.project_todo.test_project_todo
```
Expected: all tests PASS (including the two new ones).

- [ ] **Step 5: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/vernon_project/doctype/project_todo/project_todo.py \
        vernon_project/vernon_project/doctype/project_todo/test_project_todo.py
git commit -m "feat: restrict task creation to project owner/leader"
```

---

## Task 2: Extend get_work_item with can_create + team

**Files:**
- Modify: `vernon_project/api/mobile.py` (function `get_work_item`, ~line 424)
- Test: `vernon_project/api/test_mobile.py` (create)

- [ ] **Step 1: Write the failing test**

Create `vernon_project/api/test_mobile.py`:

```python
# Copyright (c) 2026, Vernon and Contributors
# See license.txt

import frappe
import unittest
from frappe.utils import nowdate, add_days
from vernon_project.api.mobile import get_work_item


class TestMobileGetWorkItem(unittest.TestCase):
	def setUp(self):
		if not frappe.db.exists("Customer", "Test Customer"):
			frappe.get_doc({
				"doctype": "Customer",
				"customer_name": "Test Customer",
				"customer_type": "Company",
			}).insert(ignore_permissions=True)

		self.project = frappe.get_doc({
			"doctype": "Project",
			"project_name": "Mobile WorkItem Test",
			"customer": "Test Customer",
			"project_owner": "Administrator",
			"project_leader": "Administrator",
			"start_date": nowdate(),
			"deadline": add_days(nowdate(), 30),
		})
		self.project.insert(ignore_permissions=True)

		self.detail = frappe.get_doc({
			"doctype": "Project Detail",
			"project": self.project.name,
			"detail_name": "Mobile Detail",
			"estimated": 10,
		})
		self.detail.insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("Project Detail", self.detail.name):
			frappe.delete_doc("Project Detail", self.detail.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_can_create_and_team_present(self):
		result = get_work_item(self.detail.name)
		self.assertIn("can_create", result)
		self.assertIn("team", result)
		self.assertIsInstance(result["team"], list)
		# Administrator is owner/leader + System Manager -> can create
		self.assertTrue(result["can_create"])
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests \
  --module vernon_project.api.test_mobile
```
Expected: FAIL on `assertIn("can_create", result)` — key absent.

- [ ] **Step 3: Implement the extension**

In `mobile.py`, replace the body of `get_work_item` from the `detail["todos"] = ...` line through `return detail` with:

```python
	rows = [r for r in _fetch_todos([detail["project"]]) if r["work_item"] == work_item]
	emails = {r["assigned_to"] for r in rows}
	name_map = _user_name_map(emails)
	detail["project_name"] = frappe.get_value("Project", detail["project"], "project_name")
	detail["todos"] = [_shape_todo(r, user, name_map) for r in rows]

	# Lead-only "create task" gate + team list for the assignee picker.
	owner, leader = frappe.get_value(
		"Project", detail["project"], ["project_owner", "project_leader"]
	)
	is_sm = "System Manager" in frappe.get_roles(user)
	detail["can_create"] = is_sm or user in (owner, leader)

	team_rows = frappe.get_all(
		"Project Team", filters={"parent": detail["project"]}, fields=["user"],
		limit_page_length=0,
	)
	team_map = _user_name_map({tr["user"] for tr in team_rows})
	detail["team"] = [
		{
			"user": tr["user"],
			"name": (team_map.get(tr["user"]) or {}).get("full_name") or tr["user"],
			"image": (team_map.get(tr["user"]) or {}).get("user_image"),
		}
		for tr in team_rows
	]
	return detail
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests \
  --module vernon_project.api.test_mobile
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/api/mobile.py vernon_project/api/test_mobile.py
git commit -m "feat: expose can_create + team in get_work_item"
```

---

## Task 3: Frontend types, API client, and data hook

**Files:**
- Modify: `frontend/src/lib/types.ts` (`WorkItem` interface)
- Modify: `frontend/src/lib/api.ts` (`mobileApi`)
- Modify: `frontend/src/hooks/useData.ts`

- [ ] **Step 1: Extend the WorkItem type**

In `types.ts`, replace the `WorkItem` interface with:

```typescript
export interface WorkItem {
  name: string
  title: string
  project: string
  project_name: string
  status: string
  current_condition: string | null
  expected_outcome: string | null
  todos: Todo[]
  can_create: boolean
  team: { user: string; name: string; image: string | null }[]
}
```

- [ ] **Step 2: Add the createTask client method**

In `api.ts`, add this entry to the `mobileApi` object (after `updateTodo`):

```typescript
  createTask: (fields: Record<string, unknown>) =>
    api.post('frappe.client.insert', {
      doc: JSON.stringify({
        doctype: 'Project Todo',
        parenttype: 'Project Detail',
        parentfield: 'todo',
        status: '⚪️ Planned',
        ...fields,
      }),
    }),
```

- [ ] **Step 3: Add the useCreateTask hook**

In `useData.ts`, add after `useUpdateTodo`:

```typescript
export function useCreateTask(workItem: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (fields: Record<string, unknown>) =>
      mobileApi.createTask({ parent: workItem, ...fields }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.workItem(workItem) })
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: keys.dashboard })
    },
  })
}
```

- [ ] **Step 4: Type-check**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/hooks/useData.ts
git commit -m "feat: add createTask api client + useCreateTask hook"
```

---

## Task 4: CreateTaskSheet component

**Files:**
- Create: `frontend/src/components/CreateTaskSheet.tsx`

- [ ] **Step 1: Write the component**

Create `frontend/src/components/CreateTaskSheet.tsx`:

```tsx
import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { useCreateTask } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Spinner } from '@/components/ui'

interface CreateTaskSheetProps {
  open: boolean
  onClose: () => void
  workItem: string
  team: { user: string; name: string }[]
}

export function CreateTaskSheet({ open, onClose, workItem, team }: CreateTaskSheetProps) {
  const toast = useToast()
  const create = useCreateTask(workItem)

  const [toDo, setToDo] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [deadline, setDeadline] = useState('')
  const [estimated, setEstimated] = useState('')
  const [notes, setNotes] = useState('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [frequency, setFrequency] = useState('Daily')
  const [until, setUntil] = useState('')

  const reset = () => {
    setToDo(''); setAssignedTo(''); setDeadline(''); setEstimated('')
    setNotes(''); setIsRecurring(false); setFrequency('Daily'); setUntil('')
  }

  const close = () => { reset(); onClose() }

  const submit = () => {
    if (!toDo.trim() || !assignedTo || !deadline) {
      toast('error', 'Task name, assignee, and deadline are required')
      return
    }
    const fields: Record<string, unknown> = {
      to_do: toDo.trim(),
      assigned_to: assignedTo,
      deadline,
      notes,
    }
    if (estimated) fields.estimated = Number(estimated)
    if (isRecurring) {
      fields.is_recurring = 1
      fields.recurring_frequency = frequency
      if (until) fields.recurring_until = until
    }
    create.mutate(fields, {
      onSuccess: () => { toast('success', 'Task created'); close() },
      onError: (err) => toast('error', (err as Error).message),
    })
  }

  if (!open) return null

  const field = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none'

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={close}>
      <div
        className="max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">New task</h3>
          <button onClick={close} className="rounded-full p-1 text-slate-400 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-slate-600">
            Task<span className="text-red-500"> *</span>
            <input className={field + ' mt-1'} value={toDo} onChange={(e) => setToDo(e.target.value)} placeholder="What needs doing?" />
          </label>

          <label className="text-sm font-medium text-slate-600">
            Assigned to<span className="text-red-500"> *</span>
            <select className={field + ' mt-1'} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">Select a team member…</option>
              {team.map((m) => (
                <option key={m.user} value={m.user}>{m.name}</option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-600">
            Deadline<span className="text-red-500"> *</span>
            <input type="date" className={field + ' mt-1'} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </label>

          <label className="text-sm font-medium text-slate-600">
            Estimated (minutes)
            <input type="number" min={0} className={field + ' mt-1'} value={estimated} onChange={(e) => setEstimated(e.target.value)} />
          </label>

          <label className="text-sm font-medium text-slate-600">
            Notes
            <textarea className={field + ' mt-1'} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
            Recurring
          </label>

          {isRecurring && (
            <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-3">
              <label className="text-sm font-medium text-slate-600">
                Frequency
                <select className={field + ' mt-1'} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                  <option value="Daily">Daily</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Monthly">Monthly</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-600">
                Until
                <input type="date" className={field + ' mt-1'} value={until} onChange={(e) => setUntil(e.target.value)} />
              </label>
            </div>
          )}

          <button
            onClick={submit}
            disabled={create.isPending}
            className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
          >
            {create.isPending ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            Create task
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/components/CreateTaskSheet.tsx
git commit -m "feat: add CreateTaskSheet form component"
```

---

## Task 5: Wire the sheet into WorkItemPage

**Files:**
- Modify: `frontend/src/pages/WorkItemPage.tsx`

- [ ] **Step 1: Add imports and sheet state**

In `WorkItemPage.tsx`, update the imports at the top:

```tsx
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { ListChecks, AlertCircle, Plus } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { TodoCard } from '@/components/TodoCard'
import { CreateTaskSheet } from '@/components/CreateTaskSheet'
import { EmptyState, FullScreenLoader } from '@/components/ui'
import { useWorkItem } from '@/hooks/useData'
import { stripHtml } from '@/lib/format'
```

Add sheet state right after the `useWorkItem` call:

```tsx
  const { data, isLoading } = useWorkItem(id)
  const [sheetOpen, setSheetOpen] = useState(false)
```

- [ ] **Step 2: Replace the Tasks section header and add the sheet**

Replace the `<section className="mt-5">…</section>` block with:

```tsx
      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between px-1">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-500">
            <ListChecks className="h-4 w-4" /> Tasks ({data.todos.length})
          </h3>
          {data.can_create && (
            <button
              onClick={() => setSheetOpen(true)}
              className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" /> Add task
            </button>
          )}
        </div>
        {data.todos.length ? (
          <div className="flex flex-col gap-2.5">
            {data.todos.map((t) => (
              <TodoCard key={t.name} todo={t} showProject={false} showAssignee />
            ))}
          </div>
        ) : (
          <EmptyState icon={ListChecks} title="No tasks in this work item" />
        )}
      </section>

      <CreateTaskSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        workItem={data.name}
        team={data.team}
      />
```

- [ ] **Step 3: Type-check and build**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit && npm run build
```
Expected: type-check clean, build succeeds (emits to `vernon_project/public/frontend/`).

- [ ] **Step 4: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/pages/WorkItemPage.tsx vernon_project/public/frontend
git commit -m "feat: add create-task button + sheet to work item page"
```

---

## Task 6: Manual verification

- [ ] **Step 1: Deploy assets / clear cache**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id clear-cache
```

- [ ] **Step 2: Verify as a lead**

Open the PWA at `/m`, log in as a Project Owner or Leader, open a project → work item. Confirm:
- "+ Add task" button is visible.
- Creating a task (with required fields) adds it to the list, defaulting to `⚪️ Planned`.
- Creating a recurring task (toggle on, pick frequency) succeeds.
- Submitting with a missing required field shows the validation toast.

- [ ] **Step 3: Verify as a non-lead**

Log in as a plain team member (not owner/leader). Confirm the "+ Add task" button is **hidden**. (Server guard also blocks direct API calls.)

---

## Notes / risks to watch during implementation

- **idx ordering:** `frappe.client.insert` of a single child should assign `idx` automatically; if a new task appears out of order in the list, set `idx` in `before_insert` (`self.idx = (frappe.db.count("Project Todo", {"parent": self.parent}) or 0) + 1`). Only do this if observed.
- **CSRF:** `api.post` already attaches `X-Frappe-CSRF-Token`; `frappe.client.insert` needs it (mutation). No extra work.
- **Permissions on insert:** `before_insert` fires regardless of `ignore_permissions`, so the guard holds even for code paths that skip permission checks — recurring occurrences (created by the owner) and the scheduler (Administrator/System Manager) still pass.
