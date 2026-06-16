# Work Item Edit/Delete + Group CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let project leads edit/delete work items and fully manage work-item groups (Glossary) from the mobile PWA, via the native resource API with controller guards.

**Architecture:** Reuse the `resource` API client + role-gate; scope edit/delete in `has_permission` (internal todo-flow saves use `ignore_permissions` and are unaffected). `ProjectDetail.on_trash` blocks deleting a work item with tasks; `Glossary` gets permission + in-use-delete guards.

**Tech Stack:** Frappe (Python), React + TypeScript + TanStack Query + Tailwind (Vite PWA).

**Site:** `project.vernon.id` · **Bench:** `/home/frappe/frappe-bench` · **App:** `/home/frappe/frappe-bench/apps/vernon_project`

> **Deploy note:** backend (Python) changes need `bench restart` to go live; tests run in fresh processes and pass without it.

---

## File Structure

- `vernon_project/api/mobile.py` — extend `get_work_item`.
- `vernon_project/vernon_project/doctype/project_detail/project_detail.py` — `on_trash`.
- `vernon_project/vernon_project/doctype/project_detail/test_project_detail.py` (create) — on_trash test.
- `vernon_project/vernon_project/doctype/glossary/glossary.py` — guards + perms.
- `vernon_project/vernon_project/doctype/glossary/test_glossary.py` (create) — tests.
- `vernon_project/hooks.py` — register Glossary permission hooks.
- `vernon_project/api/test_mobile.py` — get_work_item test.
- `frontend/src/lib/types.ts` — WorkItem extras + Group type.
- `frontend/src/hooks/useData.ts` — work-item + group hooks.
- `frontend/src/components/WorkItemEditSheet.tsx` (create) — edit form.
- `frontend/src/components/GroupManagerSheet.tsx` (create) — group CRUD.
- `frontend/src/pages/WorkItemPage.tsx` — edit/delete buttons.
- `frontend/src/pages/ProjectDetailPage.tsx` — Manage groups button.

---

## Task 1: get_work_item returns can_edit + grouping + groupings

**Files:** `vernon_project/api/mobile.py`; test `vernon_project/api/test_mobile.py`

- [ ] **Step 1: Write the failing test**

Append to `vernon_project/api/test_mobile.py` a test inside a new class (reuse module imports `frappe, unittest, nowdate, add_days`):

```python
class TestMobileGetWorkItemExtras(unittest.TestCase):
	def setUp(self):
		if not frappe.db.exists("Customer", "Test Customer"):
			frappe.get_doc({"doctype": "Customer", "customer_name": "Test Customer",
				"customer_type": "Company"}).insert(ignore_permissions=True)
		if not frappe.db.exists("Project Group", "Test Project Group"):
			frappe.get_doc({"doctype": "Project Group",
				"project_name": "Test Project Group"}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "WI Extras Project",
			"customer": "Test Customer", "project_group": "Test Project Group",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
		})
		self.project.insert(ignore_permissions=True)
		self.gl = frappe.get_doc({"doctype": "Glossary", "glossary": "WIX Grouping",
			"project": self.project.name})
		self.gl.insert(ignore_permissions=True)
		self.detail = frappe.get_doc({"doctype": "Project Detail", "project": self.project.name,
			"title": "WIX Detail", "grouping": self.gl.name,
			"project_deadline": add_days(nowdate(), 20)})
		self.detail.insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("Project Detail", self.detail.name):
			frappe.delete_doc("Project Detail", self.detail.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Glossary", self.gl.name):
			frappe.delete_doc("Glossary", self.gl.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_get_work_item_has_edit_fields(self):
		from vernon_project.api.mobile import get_work_item
		r = get_work_item(self.detail.name)
		self.assertTrue(r["can_edit"])  # Administrator is SM + owner/leader
		self.assertEqual(r["grouping"], self.gl.name)
		self.assertIn("WIX Grouping", r["groupings"])
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_mobile
```
(If "tests disabled": `bench --site project.vernon.id set-config allow_tests true`.)
Expected: FAIL with `KeyError: 'can_edit'`.

- [ ] **Step 3: Implement**

In `vernon_project/api/mobile.py`, `get_work_item`:
- Add `"grouping"` to the `frappe.get_value("Project Detail", work_item, [...])` field list (so `detail["grouping"]` exists).
- The function already computes `owner, leader` and `is_sm` for `can_create`. After `detail["can_create"] = ...`, add:
```python
	detail["can_edit"] = is_sm or user in (owner, leader)
	detail["groupings"] = frappe.get_all(
		"Glossary", filters={"project": detail["project"]}, pluck="glossary", limit_page_length=0
	)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_mobile
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/api/mobile.py vernon_project/api/test_mobile.py
git commit -m "feat: get_work_item returns can_edit, grouping, groupings"
```

---

## Task 2: ProjectDetail.on_trash blocks delete with tasks

**Files:** `vernon_project/vernon_project/doctype/project_detail/project_detail.py`; test `.../project_detail/test_project_detail.py` (create)

- [ ] **Step 1: Write the failing test**

Create `vernon_project/vernon_project/doctype/project_detail/test_project_detail.py`:

```python
# Copyright (c) 2026, Vernon and Contributors
# See license.txt

import frappe
import unittest
from frappe.utils import nowdate, add_days


def _ensure(doctype, name, doc):
	if not frappe.db.exists(doctype, name):
		frappe.get_doc(doc).insert(ignore_permissions=True)


class TestProjectDetailOnTrash(unittest.TestCase):
	def setUp(self):
		_ensure("Customer", "Test Customer", {"doctype": "Customer",
			"customer_name": "Test Customer", "customer_type": "Company"})
		_ensure("Project Group", "Test Project Group", {"doctype": "Project Group",
			"project_name": "Test Project Group"})
		self.project = frappe.get_doc({"doctype": "Project", "project_name": "PD Trash Project",
			"customer": "Test Customer", "project_group": "Test Project Group",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30)})
		self.project.insert(ignore_permissions=True)
		self.gl = frappe.get_doc({"doctype": "Glossary", "glossary": "PDT Grouping",
			"project": self.project.name})
		self.gl.insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for pd in frappe.get_all("Project Detail", filters={"project": self.project.name}, pluck="name"):
			# clear todos so it can be force-deleted
			d = frappe.get_doc("Project Detail", pd)
			d.todo = []
			d.save(ignore_permissions=True)
			frappe.delete_doc("Project Detail", pd, force=True, ignore_permissions=True)
		if frappe.db.exists("Glossary", self.gl.name):
			frappe.delete_doc("Glossary", self.gl.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def _make_detail(self, with_task):
		todos = []
		if with_task:
			todos = [{"to_do": "T1", "assigned_to": "Administrator",
				"deadline": add_days(nowdate(), 3), "status": "⚪️ Planned"}]
		d = frappe.get_doc({"doctype": "Project Detail", "project": self.project.name,
			"title": "Trash WI", "grouping": self.gl.name,
			"project_deadline": add_days(nowdate(), 20), "todo": todos})
		d.insert(ignore_permissions=True)
		frappe.db.commit()
		return d

	def test_delete_blocked_with_tasks(self):
		d = self._make_detail(with_task=True)
		with self.assertRaises(frappe.ValidationError):
			frappe.delete_doc("Project Detail", d.name, ignore_permissions=True)

	def test_delete_allowed_without_tasks(self):
		d = self._make_detail(with_task=False)
		frappe.delete_doc("Project Detail", d.name, ignore_permissions=True)
		self.assertFalse(frappe.db.exists("Project Detail", d.name))
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.vernon_project.doctype.project_detail.test_project_detail
```
Expected: `test_delete_blocked_with_tasks` FAILS (current `on_trash` only blocks non-Planned todos; a Planned todo is allowed → no raise).

- [ ] **Step 3: Implement**

In `project_detail.py`, replace the `on_trash` method with:

```python
	def on_trash(self):
		# Cannot delete a work item that still has tasks.
		if self.todo:
			frappe.throw("Cannot delete a work item that has tasks.")
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.vernon_project.doctype.project_detail.test_project_detail
```
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/vernon_project/doctype/project_detail/project_detail.py vernon_project/vernon_project/doctype/project_detail/test_project_detail.py
git commit -m "feat: block work item delete when it has tasks"
```

---

## Task 3: Glossary permission + in-use-delete guards

**Files:** `vernon_project/vernon_project/doctype/glossary/glossary.py`; `vernon_project/hooks.py`; test `.../glossary/test_glossary.py` (create)

- [ ] **Step 1: Write the failing test**

Create `vernon_project/vernon_project/doctype/glossary/test_glossary.py`:

```python
# Copyright (c) 2026, Vernon and Contributors
# See license.txt

import frappe
import unittest
from frappe.utils import nowdate, add_days
from vernon_project.vernon_project.doctype.glossary.glossary import has_permission


def _ensure(doctype, name, doc):
	if not frappe.db.exists(doctype, name):
		frappe.get_doc(doc).insert(ignore_permissions=True)


class TestGlossaryGuards(unittest.TestCase):
	def setUp(self):
		_ensure("Customer", "Test Customer", {"doctype": "Customer",
			"customer_name": "Test Customer", "customer_type": "Company"})
		_ensure("Project Group", "Test Project Group", {"doctype": "Project Group",
			"project_name": "Test Project Group"})
		for u in ("g_owner@example.com", "g_team@example.com"):
			if not frappe.db.exists("User", u):
				frappe.get_doc({"doctype": "User", "email": u, "first_name": u.split("@")[0],
					"send_welcome_email": 0}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({"doctype": "Project", "project_name": "Glossary Test Project",
			"customer": "Test Customer", "project_group": "Test Project Group",
			"project_owner": "g_owner@example.com", "project_leader": "g_owner@example.com",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": "g_team@example.com"}]})
		self.project.insert(ignore_permissions=True)
		self.gl = frappe.get_doc({"doctype": "Glossary", "glossary": "Guard Grouping",
			"project": self.project.name})
		self.gl.insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for pd in frappe.get_all("Project Detail", filters={"project": self.project.name}, pluck="name"):
			frappe.delete_doc("Project Detail", pd, force=True, ignore_permissions=True)
		for g in frappe.get_all("Glossary", filters={"project": self.project.name}, pluck="name"):
			frappe.delete_doc("Glossary", g, force=True, ignore_permissions=True)
		if frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_has_permission_lead_vs_team(self):
		doc = frappe.get_doc("Glossary", self.gl.name)
		self.assertTrue(has_permission(doc, "write", "g_owner@example.com"))
		self.assertTrue(has_permission(doc, "delete", "g_owner@example.com"))
		self.assertTrue(has_permission(doc, "read", "g_team@example.com"))
		self.assertFalse(has_permission(doc, "write", "g_team@example.com"))

	def test_on_trash_blocked_when_in_use(self):
		pd = frappe.get_doc({"doctype": "Project Detail", "project": self.project.name,
			"title": "Uses Grouping", "grouping": self.gl.name,
			"project_deadline": add_days(nowdate(), 10)})
		pd.insert(ignore_permissions=True)
		frappe.db.commit()
		with self.assertRaises(frappe.ValidationError):
			frappe.delete_doc("Glossary", self.gl.name, ignore_permissions=True)

	def test_on_trash_allowed_when_unused(self):
		g2 = frappe.get_doc({"doctype": "Glossary", "glossary": "Unused Grouping",
			"project": self.project.name})
		g2.insert(ignore_permissions=True)
		frappe.db.commit()
		frappe.delete_doc("Glossary", g2.name, ignore_permissions=True)
		self.assertFalse(frappe.db.exists("Glossary", g2.name))
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.vernon_project.doctype.glossary.test_glossary
```
Expected: FAIL — `has_permission` not importable / `test_on_trash_blocked_when_in_use` doesn't raise (no guard yet).

- [ ] **Step 3: Implement glossary.py**

Replace `vernon_project/vernon_project/doctype/glossary/glossary.py` with:

```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Glossary(Document):
	def on_trash(self):
		if frappe.db.exists("Project Detail", {"grouping": self.name}) or frappe.db.exists(
			"Project Glossary", {"glossary": self.name}
		):
			frappe.throw("Cannot delete a group that is in use by a work item.")


def has_permission(doc, ptype, user):
	if "System Manager" in frappe.get_roles(user):
		return True
	if not doc.project:
		return False
	owner, leader = frappe.get_value("Project", doc.project, ["project_owner", "project_leader"])
	is_lead = user in (owner, leader)
	if ptype in ("create", "write", "delete"):
		return is_lead
	# read
	if is_lead:
		return True
	project = frappe.get_doc("Project", doc.project)
	if user == project.project_admin:
		return True
	return any(t.user == user for t in project.team_members)


def get_permission_query_conditions(user):
	if not user or user == "Guest":
		return ""
	if "System Manager" in frappe.get_roles(user):
		return ""
	user_esc = frappe.db.escape(user)
	return f"""
		EXISTS (
			SELECT 1 FROM `tabProject` p
			WHERE p.name = `tabGlossary`.project
				AND (
					p.project_owner = {user_esc}
					OR p.project_leader = {user_esc}
					OR p.project_admin = {user_esc}
					OR EXISTS (
						SELECT 1 FROM `tabProject Team` pt
						WHERE pt.parent = p.name AND pt.user = {user_esc}
					)
				)
		)
	"""
```

- [ ] **Step 4: Register the hooks**

In `vernon_project/hooks.py`, add the Glossary entries to the existing dicts:

```python
permission_query_conditions = {
	"Project": "vernon_project.vernon_project.doctype.project.project.get_permission_query_conditions",
	"Project Detail": "vernon_project.vernon_project.doctype.project_detail.project_detail.get_permission_query_conditions",
	"Glossary": "vernon_project.vernon_project.doctype.glossary.glossary.get_permission_query_conditions",
}
has_permission = {
	"Project": "vernon_project.vernon_project.doctype.project.project.has_permission",
	"Project Detail": "vernon_project.vernon_project.doctype.project_detail.project_detail.has_permission",
	"Project Todo": "vernon_project.vernon_project.doctype.project_todo.project_todo.has_permission",
	"Glossary": "vernon_project.vernon_project.doctype.glossary.glossary.has_permission",
}
```
(Keep the existing entries; just add the `"Glossary"` line to each. Match the dict literal already present in the file.)

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.vernon_project.doctype.glossary.test_glossary
```
Expected: all three PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/vernon_project/doctype/glossary/glossary.py vernon_project/vernon_project/doctype/glossary/test_glossary.py vernon_project/hooks.py
git commit -m "feat: Glossary permission scoping + block delete when in use"
```

---

## Task 4: Frontend types + work-item/group hooks

**Files:** `frontend/src/lib/types.ts`, `frontend/src/hooks/useData.ts`

- [ ] **Step 1: Extend types.ts**

Add to the `WorkItem` interface:
```typescript
  grouping: string
  can_edit: boolean
  groupings: string[]
```
Append a `Group` type:
```typescript
export interface Group {
  name: string
  glossary: string
  description: string | null
}
```

- [ ] **Step 2: Add hooks to useData.ts**

Ensure `Group` is added to the `@/lib/types` type import. Append:

```typescript
export function useUpdateWorkItem(name: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (fields: Record<string, unknown>) =>
      resource.update<{ name: string }>('Project Detail', name, fields),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.workItem(name) })
      qc.invalidateQueries({ queryKey: ['project'] })
    },
  })
}

export function useDeleteWorkItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => resource.remove('Project Detail', name),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['project'] })
      qc.invalidateQueries({ queryKey: keys.dashboard })
    },
  })
}

export function useGroups(project: string, enabled = true) {
  return useQuery({
    queryKey: ['groups', project],
    queryFn: () =>
      resource.list<import('@/lib/types').Group[]>('Glossary', {
        filters: [['project', '=', project]],
        fields: ['name', 'glossary', 'description'],
      }),
    enabled: !!project && enabled,
  })
}

export function useCreateGroup(project: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { glossary: string; description?: string }) =>
      resource.create<{ name: string }>('Glossary', { ...input, project }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['groups', project] })
      qc.invalidateQueries({ queryKey: ['project'] })
    },
  })
}

export function useUpdateGroup(project: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, ...fields }: { name: string; glossary?: string; description?: string }) =>
      resource.update<{ name: string }>('Glossary', name, fields),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['groups', project] })
      qc.invalidateQueries({ queryKey: ['project'] })
    },
  })
}

export function useDeleteGroup(project: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => resource.remove('Glossary', name),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['groups', project] })
      qc.invalidateQueries({ queryKey: ['project'] })
    },
  })
}
```

- [ ] **Step 3: Type-check**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/lib/types.ts frontend/src/hooks/useData.ts
git commit -m "feat: work-item edit/delete + group CRUD hooks"
```

---

## Task 5: WorkItemEditSheet + WorkItemPage edit/delete

**Files:** Create `frontend/src/components/WorkItemEditSheet.tsx`; modify `frontend/src/pages/WorkItemPage.tsx`

- [ ] **Step 1: Create WorkItemEditSheet.tsx**

```tsx
import { useEffect, useState } from 'react'
import { X, Check } from 'lucide-react'
import { useUpdateWorkItem, useGroups } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Spinner } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import { stripHtml } from '@/lib/format'
import type { WorkItem } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  workItem: WorkItem
}

const STATUSES = ['Pending', 'Ongoing', 'Completed']

export function WorkItemEditSheet({ open, onClose, workItem }: Props) {
  const toast = useToast()
  const update = useUpdateWorkItem(workItem.name)
  const { data: groups } = useGroups(workItem.project, open)

  const [title, setTitle] = useState('')
  const [status, setStatus] = useState('Pending')
  const [grouping, setGrouping] = useState('')
  const [condition, setCondition] = useState('')
  const [outcome, setOutcome] = useState('')

  useEffect(() => {
    if (open) {
      setTitle(workItem.title)
      setStatus(workItem.status)
      setGrouping(workItem.grouping)
      setCondition(stripHtml(workItem.current_condition || ''))
      setOutcome(stripHtml(workItem.expected_outcome || ''))
    }
  }, [open, workItem])

  if (!open) return null

  const field =
    'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none'

  const submit = () => {
    if (!title.trim() || !grouping) {
      toast('error', 'Title and group are required')
      return
    }
    update.mutate(
      {
        title: title.trim(),
        status,
        grouping,
        current_condition: condition,
        expected_outcome: outcome,
      },
      {
        onSuccess: () => { toast('success', 'Work item updated'); onClose() },
        onError: (e) => toast('error', (e as Error).message),
      },
    )
  }

  const groupOpts = (groups ?? []).map((g) => ({ value: g.name, label: g.glossary }))

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Edit work item</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-slate-600">
            Title<span className="text-red-500"> *</span>
            <input className={field + ' mt-1'} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <label className="text-sm font-medium text-slate-600">
            Group<span className="text-red-500"> *</span>
            <SearchableSelect value={grouping} onChange={setGrouping} options={groupOpts} placeholder="Select a group…" />
          </label>

          <label className="text-sm font-medium text-slate-600">
            Status
            <SearchableSelect value={status} onChange={setStatus} options={STATUSES.map((s) => ({ value: s, label: s }))} />
          </label>

          <label className="text-sm font-medium text-slate-600">
            Current condition
            <textarea className={field + ' mt-1'} rows={2} value={condition} onChange={(e) => setCondition(e.target.value)} />
          </label>

          <label className="text-sm font-medium text-slate-600">
            Expected outcome
            <textarea className={field + ' mt-1'} rows={2} value={outcome} onChange={(e) => setOutcome(e.target.value)} />
          </label>

          <button onClick={submit} disabled={update.isPending}
            className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {update.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            Save changes
          </button>
        </div>
      </div>
    </div>
  )
}
```
Note: the group picker uses Glossary `name` as value (matches `Project Detail.grouping`) and the `glossary` label for display, sourced from `useGroups`.

- [ ] **Step 2: Wire WorkItemPage.tsx**

Update imports:
```tsx
import { Pencil, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { WorkItemEditSheet } from '@/components/WorkItemEditSheet'
import { useWorkItem, useDeleteWorkItem } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
```
(Merge `Pencil, Trash2` into the existing lucide import; merge `useDeleteWorkItem` into the existing `@/hooks/useData` import; add `useNavigate`, `useToast`, and the edit sheet.)

Add state/handlers after `const { data, isLoading } = useWorkItem(id)`:
```tsx
  const navigate = useNavigate()
  const toast = useToast()
  const del = useDeleteWorkItem()
  const [editOpen, setEditOpen] = useState(false)
```

In the info card (after the status `<span>`), add an actions row shown when `data.can_edit`:
```tsx
        {data.can_edit && (
          <div className="mt-3 flex gap-2">
            <button onClick={() => setEditOpen(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-700 active:scale-95">
              <Pencil className="h-4 w-4" /> Edit
            </button>
            <button
              onClick={() => {
                if (!confirm('Delete this work item?')) return
                del.mutate(data.name, {
                  onSuccess: () => { toast('success', 'Work item deleted'); navigate(`/project/${encodeURIComponent(data.project)}`) },
                  onError: (e) => toast('error', (e as Error).message),
                })
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-rose-600 active:scale-95">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        )}
```

Before `</DetailScreen>`, add:
```tsx
      <WorkItemEditSheet open={editOpen} onClose={() => setEditOpen(false)} workItem={data} />
```

- [ ] **Step 3: Type-check**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/components/WorkItemEditSheet.tsx frontend/src/pages/WorkItemPage.tsx
git commit -m "feat: edit/delete work item from WorkItemPage"
```

---

## Task 6: GroupManagerSheet + ProjectDetailPage wiring

**Files:** Create `frontend/src/components/GroupManagerSheet.tsx`; modify `frontend/src/pages/ProjectDetailPage.tsx`

- [ ] **Step 1: Create GroupManagerSheet.tsx**

```tsx
import { useState } from 'react'
import { X, Plus, Pencil, Trash2, Check } from 'lucide-react'
import { useGroups, useCreateGroup, useUpdateGroup, useDeleteGroup } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Spinner } from '@/components/ui'
import { stripHtml } from '@/lib/format'

interface Props {
  open: boolean
  onClose: () => void
  project: string
}

export function GroupManagerSheet({ open, onClose, project }: Props) {
  const toast = useToast()
  const { data: groups, isLoading } = useGroups(project, open)
  const create = useCreateGroup(project)
  const update = useUpdateGroup(project)
  const del = useDeleteGroup(project)

  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')

  if (!open) return null

  const field =
    'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none'

  const addGroup = () => {
    if (!newName.trim()) {
      toast('error', 'Group name is required')
      return
    }
    create.mutate(
      { glossary: newName.trim(), description: newDesc.trim() },
      {
        onSuccess: () => { toast('success', 'Group added'); setNewName(''); setNewDesc('') },
        onError: (e) => toast('error', (e as Error).message),
      },
    )
  }

  const saveEdit = (name: string) => {
    if (!editName.trim()) {
      toast('error', 'Group name is required')
      return
    }
    update.mutate(
      { name, glossary: editName.trim(), description: editDesc.trim() },
      {
        onSuccess: () => { toast('success', 'Group updated'); setEditId(null) },
        onError: (e) => toast('error', (e as Error).message),
      },
    )
  }

  const removeGroup = (name: string) => {
    if (!confirm('Delete this group?')) return
    del.mutate(name, {
      onSuccess: () => toast('success', 'Group deleted'),
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Manage groups</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Add */}
        <div className="mb-4 rounded-xl bg-slate-50 p-3">
          <input className={field} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New group name" />
          <input className={field + ' mt-2'} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description (optional)" />
          <button onClick={addGroup} disabled={create.isPending}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {create.isPending ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />} Add group
          </button>
        </div>

        {/* List */}
        {isLoading ? (
          <Spinner className="mx-auto h-5 w-5 text-slate-400" />
        ) : (
          <div className="flex flex-col gap-2">
            {(groups ?? []).map((g) =>
              editId === g.name ? (
                <div key={g.name} className="rounded-xl border border-brand-200 p-3">
                  <input className={field} value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <input className={field + ' mt-2'} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Description" />
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => saveEdit(g.name)} disabled={update.isPending}
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-brand-600 py-1.5 text-xs font-semibold text-white">
                      <Check className="h-3.5 w-3.5" /> Save
                    </button>
                    <button onClick={() => setEditId(null)}
                      className="flex-1 rounded-lg bg-slate-100 py-1.5 text-xs font-semibold text-slate-600">Cancel</button>
                  </div>
                </div>
              ) : (
                <div key={g.name} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{g.glossary}</p>
                    {g.description && <p className="truncate text-xs text-slate-500">{stripHtml(g.description)}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => { setEditId(g.name); setEditName(g.glossary); setEditDesc(stripHtml(g.description || '')) }}
                      className="rounded-lg p-1.5 text-slate-500 active:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => removeGroup(g.name)}
                      className="rounded-lg p-1.5 text-rose-600 active:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ),
            )}
            {!(groups ?? []).length && <p className="py-4 text-center text-sm text-slate-400">No groups yet</p>}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire ProjectDetailPage.tsx**

Add to imports: `import { GroupManagerSheet } from '@/components/GroupManagerSheet'` and the `Layers` icon is already imported; add a `FolderTree` icon to the lucide import for the button (or reuse `Layers`). Add state near the other sheet state:
```tsx
  const [groupsOpen, setGroupsOpen] = useState(false)
```
In the Work items section header actions (the `{flags.can_edit && (<div className="flex gap-2">...` block), add a Groups button before the Work item button:
```tsx
              <button onClick={() => setGroupsOpen(true)}
                className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 active:scale-95">
                <Layers className="h-3.5 w-3.5" /> Groups
              </button>
```
Before `</DetailScreen>`, add:
```tsx
      <GroupManagerSheet open={groupsOpen} onClose={() => setGroupsOpen(false)} project={data.name} />
```

- [ ] **Step 3: Type-check**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/components/GroupManagerSheet.tsx frontend/src/pages/ProjectDetailPage.tsx
git commit -m "feat: group manager sheet + wire into project page"
```

---

## Task 7: Build + verify

**Files:** rebuilt bundle + `www/m.html` + `www/vernon_sw.js`

- [ ] **Step 1: Type-check + build**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit && npm run build
```
Expected: tsc clean; build succeeds (new hashed bundle; `www/m.html` updated).

- [ ] **Step 2: Commit the bundle**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/public/frontend vernon_project/www/m.html vernon_project/www/vernon_sw.js
git commit -m "build: rebuild PWA bundle for work item edit + groups"
```

- [ ] **Step 3: Restart + clear cache (backend changes go live)**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id clear-cache
```
Then a web restart is required so the new Python (get_work_item, ProjectDetail.on_trash, Glossary hooks) is served — run `bench restart` (or restart the web process). Note this in the handoff for the user to run if not permitted here.

- [ ] **Step 4: Manual verification**

As an owner/leader: open a work item → Edit (change title/status/group/condition/outcome) → saves; Delete a work item with no tasks → succeeds; Delete one with tasks → blocked toast. On the project page → Groups → add/rename/delete a group; deleting an in-use group → blocked toast.

---

## Notes / risks

- Backend Python needs `bench restart` to go live (migrate/clear-cache don't reload modules).
- Editing a group's name changes the `glossary` label only; the doc `name` (autoname) is unchanged, so `Project Detail.grouping` links stay valid.
- `WorkItemEditSheet` group picker uses Glossary `name` as the value (matches `grouping`), sourced from `useGroups` — not the label-based `groupings` list used by the create sheet.
- `useGroups(project, open)` is gated on the sheet being open to avoid fetching for closed sheets.
