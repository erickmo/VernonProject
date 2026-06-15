# Project CRUD + Work Item / Task Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let project leads create/edit/delete projects, create work items, and add tasks from the mobile PWA, using Frappe's native resource API with permission scoping in the `Project` controller.

**Architecture:** Frontend calls `/api/resource/<Doctype>` directly. `Project` role perms are broadened (Leader `write`, Owner `delete`) so the resource role gate passes; `Project.has_permission`/`validate`/`on_trash` then scope each action to the specific project's owner/leader and enforce reassignment + delete-with-work-items rules. Permission flags are computed client-side from `boot.roles`. Task creation reuses the already-shipped `CreateTaskSheet`.

**Tech Stack:** Frappe (Python), React + TypeScript + TanStack Query + Tailwind (Vite PWA).

**Site:** `project.vernon.id` · **Bench root:** `/home/frappe/frappe-bench` · **App root:** `/home/frappe/frappe-bench/apps/vernon_project`

---

## File Structure

- `vernon_project/vernon_project/doctype/project/project.json` — broaden role perms.
- `vernon_project/vernon_project/doctype/project/project.py` — rewrite `has_permission`; add `validate` edit/reassign guards + `on_trash` delete guard.
- `vernon_project/vernon_project/doctype/project/test_project.py` (create) — guard tests.
- `vernon_project/api/mobile.py` — extend `get_project` read with raw leads + groupings.
- `frontend/src/lib/api.ts` — add `resource.*` client.
- `frontend/src/lib/types.ts` — extend project-detail type + new input types.
- `frontend/src/hooks/useData.ts` — `useFormOptions`, `useCreateProject`, `useUpdateProject`, `useDeleteProject`, `useCreateWorkItem`, `permFlags`.
- `frontend/src/components/ProjectFormSheet.tsx` (create) — project create/edit form.
- `frontend/src/components/WorkItemFormSheet.tsx` (create) — work item create form.
- `frontend/src/pages/Projects.tsx` — "+ New project".
- `frontend/src/pages/ProjectDetailPage.tsx` — Edit/Delete, Add work item, Add task.

---

## Task 1: Project role perms + controller guards

**Files:**
- Modify: `vernon_project/vernon_project/doctype/project/project.json`
- Modify: `vernon_project/vernon_project/doctype/project/project.py`
- Test: `vernon_project/vernon_project/doctype/project/test_project.py` (create)

- [ ] **Step 1: Write failing tests**

Create `vernon_project/vernon_project/doctype/project/test_project.py`:

```python
# Copyright (c) 2026, Vernon and Contributors
# See license.txt

import frappe
import unittest
from frappe.utils import nowdate, add_days


def _ensure(doctype, name, doc):
	if not frappe.db.exists(doctype, name):
		frappe.get_doc(doc).insert(ignore_permissions=True)


class TestProjectGuards(unittest.TestCase):
	def setUp(self):
		_ensure("Customer", "Test Customer", {
			"doctype": "Customer", "customer_name": "Test Customer", "customer_type": "Company"})
		_ensure("Project Group", "Test Project Group", {
			"doctype": "Project Group", "project_name": "Test Project Group"})
		for u in ("owner_u@example.com", "leader_u@example.com", "other_u@example.com"):
			if not frappe.db.exists("User", u):
				frappe.get_doc({"doctype": "User", "email": u, "first_name": u.split("@")[0],
					"send_welcome_email": 0}).insert(ignore_permissions=True)

		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Guard Test Project",
			"customer": "Test Customer", "project_group": "Test Project Group",
			"project_owner": "owner_u@example.com", "project_leader": "leader_u@example.com",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
		})
		self.project.insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		# remove any work items first so the project can be deleted
		for pd in frappe.get_all("Project Detail", filters={"project": self.project.name}, pluck="name"):
			frappe.delete_doc("Project Detail", pd, force=True, ignore_permissions=True)
		if frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_role_perms_broadened(self):
		"""project.json grants Leader write and Owner delete."""
		meta = frappe.get_meta("Project")
		perms = {p.role: p for p in meta.permissions}
		self.assertTrue(perms["Project Leader"].write, "Project Leader needs write")
		self.assertTrue(perms["Project Owner"].delete, "Project Owner needs delete")

	def test_non_lead_cannot_edit(self):
		frappe.set_user("other_u@example.com")
		p = frappe.get_doc("Project", self.project.name)
		p.goal = "hijack"
		with self.assertRaises(frappe.PermissionError):
			p.save(ignore_permissions=True)
		frappe.set_user("Administrator")

	def test_leader_can_edit_meta(self):
		frappe.set_user("leader_u@example.com")
		p = frappe.get_doc("Project", self.project.name)
		p.goal = "leader edit ok"
		p.save(ignore_permissions=True)
		frappe.set_user("Administrator")
		self.assertEqual(frappe.db.get_value("Project", self.project.name, "goal"), "leader edit ok")

	def test_leader_cannot_reassign(self):
		frappe.set_user("leader_u@example.com")
		p = frappe.get_doc("Project", self.project.name)
		p.project_owner = "leader_u@example.com"
		with self.assertRaises(frappe.PermissionError):
			p.save(ignore_permissions=True)
		frappe.set_user("Administrator")

	def test_owner_can_reassign(self):
		frappe.set_user("owner_u@example.com")
		p = frappe.get_doc("Project", self.project.name)
		p.project_leader = "other_u@example.com"
		p.save(ignore_permissions=True)
		frappe.set_user("Administrator")
		self.assertEqual(
			frappe.db.get_value("Project", self.project.name, "project_leader"), "other_u@example.com")

	def test_delete_blocked_with_work_items(self):
		grouping = frappe.get_doc({"doctype": "Glossary", "glossary": "G1", "project": self.project.name})
		grouping.insert(ignore_permissions=True)
		frappe.get_doc({"doctype": "Project Detail", "project": self.project.name,
			"title": "WI", "grouping": grouping.name, "project_deadline": add_days(nowdate(), 10),
		}).insert(ignore_permissions=True)
		frappe.db.commit()
		frappe.set_user("owner_u@example.com")
		with self.assertRaises(frappe.ValidationError):
			frappe.delete_doc("Project", self.project.name, ignore_permissions=True)
		frappe.set_user("Administrator")

	def test_non_owner_cannot_delete(self):
		frappe.set_user("leader_u@example.com")
		with self.assertRaises(frappe.PermissionError):
			frappe.delete_doc("Project", self.project.name, ignore_permissions=True)
		frappe.set_user("Administrator")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.vernon_project.doctype.project.test_project
```
(If "tests disabled": `bench --site project.vernon.id set-config allow_tests true`.)
Expected: `test_role_perms_broadened` FAILS, guard tests FAIL (no guards yet).

- [ ] **Step 3: Broaden role perms in project.json**

In `vernon_project/vernon_project/doctype/project/project.json`, find the `permissions` array. The `Project Leader` entry currently has only `read` (and report/export/etc.); add `"write": 1`. The `Project Owner` entry has create/read/write; add `"delete": 1`. Concretely, ensure these two objects contain the new flags:

```json
      {
         "create": 1,
         "delete": 1,
         "email": 1,
         "export": 1,
         "print": 1,
         "read": 1,
         "report": 1,
         "role": "Project Owner",
         "share": 1,
         "write": 1
      },
```
and the `Project Leader` permission object gains `"write": 1`:
```json
      {
         "email": 1,
         "export": 1,
         "print": 1,
         "read": 1,
         "report": 1,
         "role": "Project Leader",
         "share": 1,
         "write": 1
      },
```
Edit only those two role objects; leave every other permission row unchanged.

- [ ] **Step 4: Rewrite has_permission + add guards in project.py**

In `vernon_project/vernon_project/doctype/project/project.py`:

Add guard methods to the `Project` class. Update `validate` to call the new guard (keep the existing start/deadline check):

```python
	def validate(self):
		# Start Date < Deadline
		if self.start_date and self.deadline:
			if getdate(self.start_date) > getdate(self.deadline):
				frappe.throw("Start Date cannot be after Deadline.")

		# Edit scope + owner-only reassignment (updates only)
		self.validate_edit_permission()

	def validate_edit_permission(self):
		if self.is_new():
			return
		user = frappe.session.user
		if "System Manager" in frappe.get_roles(user):
			return
		# Only this project's owner or leader may edit.
		if user not in (self.project_owner, self.project_leader):
			frappe.throw(
				"Only the Project Owner or Project Leader can edit this project.",
				frappe.PermissionError,
			)
		# Only the owner may reassign owner/leader.
		old = self.get_doc_before_save()
		if old and (old.project_owner != self.project_owner or old.project_leader != self.project_leader):
			if user != old.project_owner:
				frappe.throw(
					"Only the Project Owner can change the owner or leader.",
					frappe.PermissionError,
				)

	def on_trash(self):
		user = frappe.session.user
		if "System Manager" not in frappe.get_roles(user):
			if user != self.project_owner:
				frappe.throw(
					"Only the Project Owner can delete this project.",
					frappe.PermissionError,
				)
		if frappe.db.exists("Project Detail", {"project": self.name}):
			frappe.throw("Cannot delete a project that has work items.")
```

Replace the module-level `has_permission` function with one that recognizes owner/leader/admin/team via the project fields:

```python
def has_permission(doc, ptype, user):
	if "System Manager" in frappe.get_roles(user):
		return True

	roles = frappe.get_roles(user)

	if ptype == "create":
		# Role gate already limits create to roles with the create perm;
		# allow lead-role holders through the doc-level check.
		return any(r in roles for r in ("Project Owner", "Project Leader"))

	# read / write / delete: must be associated with THIS project.
	if user in (doc.project_owner, doc.project_leader, doc.project_admin):
		return True

	if any(t.user == user for t in doc.team_members):
		return True

	return False
```

Leave `get_permission_query_conditions` unchanged.

- [ ] **Step 5: Apply perms + run tests**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate 2>&1 | tail -3
bench --site project.vernon.id run-tests --module vernon_project.vernon_project.doctype.project.test_project
```
Expected: all 7 tests PASS. (`migrate` is required so the JSON permission change reaches the DB / meta.)

- [ ] **Step 6: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/vernon_project/doctype/project/project.json vernon_project/vernon_project/doctype/project/project.py vernon_project/vernon_project/doctype/project/test_project.py
git commit -m "feat: scope Project edit/delete via controller guards + broaden role perms"
```

---

## Task 2: Extend get_project with raw leads + groupings

**Files:**
- Modify: `vernon_project/api/mobile.py` (function `get_project`)
- Test: `vernon_project/api/test_mobile.py` (add a test)

- [ ] **Step 1: Write the failing test**

Append to `vernon_project/api/test_mobile.py` a new test class (the file already imports `frappe`, `unittest`, `nowdate`, `add_days`):

```python
class TestMobileGetProjectExtras(unittest.TestCase):
	def setUp(self):
		if not frappe.db.exists("Customer", "Test Customer"):
			frappe.get_doc({"doctype": "Customer", "customer_name": "Test Customer",
				"customer_type": "Company"}).insert(ignore_permissions=True)
		if not frappe.db.exists("Project Group", "Test Project Group"):
			frappe.get_doc({"doctype": "Project Group",
				"project_name": "Test Project Group"}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Extras Test Project",
			"customer": "Test Customer", "project_group": "Test Project Group",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
		})
		self.project.insert(ignore_permissions=True)
		self.gl = frappe.get_doc({"doctype": "Glossary", "glossary": "Extras Grouping",
			"project": self.project.name})
		self.gl.insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("Glossary", self.gl.name):
			frappe.delete_doc("Glossary", self.gl.name, force=True, ignore_permissions=True)
		if frappe.db.exists("Project", self.project.name):
			frappe.delete_doc("Project", self.project.name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_get_project_has_raw_leads_and_groupings(self):
		from vernon_project.api.mobile import get_project
		r = get_project(self.project.name)
		self.assertEqual(r["project_owner"], "Administrator")
		self.assertEqual(r["project_leader"], "Administrator")
		self.assertIn("project_group", r)
		self.assertIn("Extras Grouping", r["groupings"])
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_mobile
```
Expected: `test_get_project_has_raw_leads_and_groupings` FAILS (`KeyError: 'project_owner'`).

- [ ] **Step 3: Implement**

In `vernon_project/api/mobile.py`, in `get_project`, the function ends with a `return {...}` dict. Add these keys to that returned dict (alongside `owner_name`/`leader_name`):

```python
		"project_owner": doc.project_owner,
		"project_leader": doc.project_leader,
		"project_admin": doc.project_admin,
		"project_group": doc.project_group,
		"groupings": frappe.get_all(
			"Glossary", filters={"project": doc.name}, pluck="glossary", limit_page_length=0
		),
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
git commit -m "feat: return raw leads + groupings from get_project"
```

---

## Task 3: Resource-API client + types

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/types.ts`

- [ ] **Step 1: Add the resource client to api.ts**

Append to `frontend/src/lib/api.ts` (after the existing `api` export; it reuses `csrf`, `ApiError` already defined above in the file):

```typescript
// --- Native resource API (/api/resource) ----------------------------------
const RESOURCE = '/api/resource/'

async function resourceRequest<T>(
  path: string,
  opts: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
    params?: Record<string, unknown>
    body?: unknown
  } = {},
): Promise<T> {
  const { method = 'GET', params, body } = opts
  let url = RESOURCE + path
  const headers: Record<string, string> = { Accept: 'application/json' }
  let payload: string | undefined

  if (method === 'GET') {
    if (params) {
      const qs = new URLSearchParams()
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue
        qs.set(k, typeof v === 'string' ? v : JSON.stringify(v))
      }
      const s = qs.toString()
      if (s) url += '?' + s
    }
  } else {
    headers['Content-Type'] = 'application/json'
    headers['X-Frappe-CSRF-Token'] = csrf()
    if (body !== undefined) payload = JSON.stringify(body)
  }

  const res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin' })

  // Only 401 means "not logged in" (drives the in-app login). A 403 here is a
  // real permission denial we want to surface with its message.
  if (res.status === 401) throw new ApiError('Not authenticated', 401)

  let data: any = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON */
  }

  if (!res.ok) {
    const msg =
      (data && (data._server_messages || data.exception || data.message)) ||
      `Request failed (${res.status})`
    throw new ApiError(typeof msg === 'string' ? msg : 'Request failed', res.status)
  }

  return (data?.data ?? data?.message ?? data) as T
}

const enc = (s: string) => encodeURIComponent(s)

export const resource = {
  get: <T>(doctype: string, name: string) =>
    resourceRequest<T>(`${enc(doctype)}/${enc(name)}`),
  list: <T>(
    doctype: string,
    opts: { filters?: unknown; fields?: string[]; limit?: number } = {},
  ) =>
    resourceRequest<T>(enc(doctype), {
      params: {
        filters: opts.filters,
        fields: opts.fields,
        limit_page_length: opts.limit ?? 0,
      },
    }),
  create: <T>(doctype: string, doc: Record<string, unknown>) =>
    resourceRequest<T>(enc(doctype), { method: 'POST', body: doc }),
  update: <T>(doctype: string, name: string, doc: Record<string, unknown>) =>
    resourceRequest<T>(`${enc(doctype)}/${enc(name)}`, { method: 'PUT', body: doc }),
  remove: (doctype: string, name: string) =>
    resourceRequest<{ name?: string }>(`${enc(doctype)}/${enc(name)}`, { method: 'DELETE' }),
}
```

- [ ] **Step 2: Extend types.ts**

In `frontend/src/lib/types.ts`, add the raw fields to the `ProjectDetail` interface (the type returned by `get_project`) — add these members:

```typescript
  project_owner: string
  project_leader: string
  project_admin: string | null
  project_group: string
  groupings: string[]
```

And append these new types at the end of the file:

```typescript
export interface Opt2 {
  value: string
  label: string
}

export interface FormOptions {
  customers: Opt2[]
  users: Opt2[]
  project_groups: Opt2[]
}

export interface ProjectInput {
  project_name: string
  customer: string
  project_owner: string
  project_leader: string
  project_admin?: string | null
  project_group: string
  start_date: string
  deadline: string
  goal?: string
  status: string
  team_members?: { user: string }[]
}

export interface WorkItemInput {
  project: string
  title: string
  project_deadline: string
  grouping: string
  status?: string
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
git add frontend/src/lib/api.ts frontend/src/lib/types.ts
git commit -m "feat: add resource-API client + project input types"
```

---

## Task 4: Data hooks + permission flags

**Files:**
- Modify: `frontend/src/hooks/useData.ts`

- [ ] **Step 1: Add hooks + permFlags**

In `frontend/src/hooks/useData.ts`, add `resource` to the import from `@/lib/api` (it currently imports `mobileApi`), and import the new types. Then append:

```typescript
import { resource } from '@/lib/api'
import type { Boot, FormOptions, Opt2, ProjectDetail, ProjectInput, WorkItemInput } from '@/lib/types'

export function permFlags(project: ProjectDetail, boot: Boot | undefined) {
  const me = boot?.user
  const isSM = !!boot?.roles.includes('System Manager')
  const isOwner = !!me && me === project.project_owner
  const isLeader = !!me && me === project.project_leader
  return {
    can_edit: isSM || isOwner || isLeader,
    can_delete: isSM || isOwner,
    can_reassign: isSM || isOwner,
  }
}

export function canCreateProject(boot: Boot | undefined): boolean {
  return !!boot && (boot.roles.includes('System Manager') || boot.roles.includes('Project Owner'))
}

const mapOpts = (rows: { name: string }[], label: (r: any) => string): Opt2[] =>
  rows.map((r) => ({ value: r.name, label: label(r) || r.name }))

export function useFormOptions() {
  return useQuery({
    queryKey: ['form-options'],
    queryFn: async (): Promise<FormOptions> => {
      const [customers, users, groups] = await Promise.all([
        resource.list<any[]>('Customer', { fields: ['name', 'customer_name'] }),
        resource.list<any[]>('User', {
          filters: [['enabled', '=', 1]],
          fields: ['name', 'full_name'],
        }),
        resource.list<any[]>('Project Group', { fields: ['name'] }),
      ])
      return {
        customers: mapOpts(customers, (c) => c.customer_name),
        users: mapOpts(users, (u) => u.full_name),
        project_groups: mapOpts(groups, (g) => g.name),
      }
    },
    staleTime: 1000 * 60 * 10,
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ProjectInput) =>
      resource.create<{ name: string }>('Project', input as unknown as Record<string, unknown>),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: keys.dashboard })
    },
  })
}

export function useUpdateProject(project: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<ProjectInput>) =>
      resource.update<{ name: string }>('Project', project, input as Record<string, unknown>),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.project(project) })
      qc.invalidateQueries({ queryKey: keys.projects })
    },
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (project: string) => resource.remove('Project', project),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: keys.dashboard })
    },
  })
}

export function useCreateWorkItem(project: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<WorkItemInput, 'project'>) => {
      // Resolve grouping: reuse an existing project Glossary, else create one.
      const existing = await resource.list<{ name: string }[]>('Glossary', {
        filters: [
          ['glossary', '=', input.grouping],
          ['project', '=', project],
        ],
        fields: ['name'],
        limit: 1,
      })
      let groupingName = existing[0]?.name
      if (!groupingName) {
        const created = await resource.create<{ name: string }>('Glossary', {
          glossary: input.grouping,
          project,
        })
        groupingName = created.name
      }
      return resource.create<{ name: string }>('Project Detail', {
        project,
        title: input.title,
        project_deadline: input.project_deadline,
        grouping: groupingName,
        ...(input.status ? { status: input.status } : {}),
      })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.project(project) })
    },
  })
}
```

Note: the existing file already imports `useMutation`, `useQuery`, `useQueryClient` and defines `keys`. Do NOT duplicate those imports — merge the new type/`resource` imports with the existing import block at the top of the file (move the appended `import` lines up to join the others; ESLint/tsc will error on imports after statements).

- [ ] **Step 2: Type-check**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/hooks/useData.ts
git commit -m "feat: project/work-item mutation hooks + permission flags"
```

---

## Task 5: ProjectFormSheet (create + edit)

**Files:**
- Create: `frontend/src/components/ProjectFormSheet.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/ProjectFormSheet.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { X, Check } from 'lucide-react'
import { useFormOptions, useCreateProject, useUpdateProject } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Spinner } from '@/components/ui'
import type { ProjectDetail, ProjectInput } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  /** Present = edit mode (prefilled); absent = create mode. */
  project?: ProjectDetail
  /** Edit mode: may the user reassign owner/leader? */
  canReassign?: boolean
  onSaved?: (name: string) => void
}

const STATUSES = ['Ongoing', 'Closed']

export function ProjectFormSheet({ open, onClose, project, canReassign = true, onSaved }: Props) {
  const toast = useToast()
  const isEdit = !!project
  const { data: opts } = useFormOptions()
  const create = useCreateProject()
  const update = useUpdateProject(project?.name ?? '')
  const saving = create.isPending || update.isPending

  const [f, setF] = useState<ProjectInput>({
    project_name: '', customer: '', project_owner: '', project_leader: '',
    project_admin: '', project_group: '', start_date: '', deadline: '',
    goal: '', status: 'Ongoing', team_members: [],
  })

  useEffect(() => {
    if (project) {
      setF({
        project_name: project.project_name,
        customer: project.customer,
        project_owner: project.project_owner,
        project_leader: project.project_leader,
        project_admin: project.project_admin ?? '',
        project_group: project.project_group,
        start_date: project.start_date ?? '',
        deadline: project.deadline ?? '',
        goal: project.goal ?? '',
        status: project.status,
        team_members: project.team.map((t) => ({ user: t.user })),
      })
    }
  }, [project])

  if (!open) return null

  const set = <K extends keyof ProjectInput>(k: K, v: ProjectInput[K]) =>
    setF((s) => ({ ...s, [k]: v }))

  const field =
    'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400'

  const submit = () => {
    if (!f.project_name.trim() || !f.customer || !f.project_owner || !f.project_leader ||
        !f.project_group || !f.start_date || !f.deadline) {
      toast('error', 'Name, customer, owner, leader, group, start date and deadline are required')
      return
    }
    const onDone = (r: { name: string }) => {
      toast('success', isEdit ? 'Project updated' : 'Project created')
      onSaved?.(r.name)
      onClose()
    }
    const onErr = (err: unknown) => toast('error', (err as Error).message)
    if (isEdit) update.mutate(f, { onSuccess: onDone, onError: onErr })
    else create.mutate(f, { onSuccess: onDone, onError: onErr })
  }

  const users = opts?.users ?? []
  const lockLeads = isEdit && !canReassign

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">{isEdit ? 'Edit project' : 'New project'}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-slate-600">
            Project name<span className="text-red-500"> *</span>
            <input className={field + ' mt-1'} value={f.project_name} onChange={(e) => set('project_name', e.target.value)} />
          </label>

          <label className="text-sm font-medium text-slate-600">
            Customer<span className="text-red-500"> *</span>
            <select className={field + ' mt-1'} value={f.customer} onChange={(e) => set('customer', e.target.value)}>
              <option value="">Select…</option>
              {(opts?.customers ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-600">
            Project group<span className="text-red-500"> *</span>
            <select className={field + ' mt-1'} value={f.project_group} onChange={(e) => set('project_group', e.target.value)}>
              <option value="">Select…</option>
              {(opts?.project_groups ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-600">
            Owner<span className="text-red-500"> *</span>
            <select className={field + ' mt-1'} value={f.project_owner} disabled={lockLeads} onChange={(e) => set('project_owner', e.target.value)}>
              <option value="">Select…</option>
              {users.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-600">
            Leader<span className="text-red-500"> *</span>
            <select className={field + ' mt-1'} value={f.project_leader} disabled={lockLeads} onChange={(e) => set('project_leader', e.target.value)}>
              <option value="">Select…</option>
              {users.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-600">
            Admin
            <select className={field + ' mt-1'} value={f.project_admin ?? ''} onChange={(e) => set('project_admin', e.target.value)}>
              <option value="">None</option>
              {users.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          <div className="flex gap-3">
            <label className="flex-1 text-sm font-medium text-slate-600">
              Start<span className="text-red-500"> *</span>
              <input type="date" className={field + ' mt-1'} value={f.start_date} onChange={(e) => set('start_date', e.target.value)} />
            </label>
            <label className="flex-1 text-sm font-medium text-slate-600">
              Deadline<span className="text-red-500"> *</span>
              <input type="date" className={field + ' mt-1'} value={f.deadline} onChange={(e) => set('deadline', e.target.value)} />
            </label>
          </div>

          <label className="text-sm font-medium text-slate-600">
            Status
            <select className={field + ' mt-1'} value={f.status} onChange={(e) => set('status', e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-600">
            Goal
            <textarea className={field + ' mt-1'} rows={2} value={f.goal} onChange={(e) => set('goal', e.target.value)} />
          </label>

          <button onClick={submit} disabled={saving}
            className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {saving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {isEdit ? 'Save changes' : 'Create project'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

Note: owner/leader/admin are auto-added to `team_members` by the `Project.before_save` controller, so the form does not manage the team table explicitly; in edit mode it passes the existing team through unchanged.

- [ ] **Step 2: Type-check**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/components/ProjectFormSheet.tsx
git commit -m "feat: add ProjectFormSheet (create + edit)"
```

---

## Task 6: Wire project create/edit/delete into pages

**Files:**
- Modify: `frontend/src/pages/Projects.tsx`
- Modify: `frontend/src/pages/ProjectDetailPage.tsx`

- [ ] **Step 1: Projects.tsx — "+ New project"**

In `frontend/src/pages/Projects.tsx`:
- Add to imports: `import { Plus } from 'lucide-react'`, `import { ProjectFormSheet } from '@/components/ProjectFormSheet'`, and update the data-hooks import to also pull boot + flag: `import { useProjects, useBoot, canCreateProject } from '@/hooks/useData'`.
- Inside the component add: `const { data: boot } = useBoot()` and `const [formOpen, setFormOpen] = useState(false)`.
- In the JSX, put a create button just inside `<TabScreen ...>` before the loading branch — render it when `canCreateProject(boot)`:

```tsx
      {canCreateProject(boot) && (
        <div className="mb-3">
          <button
            onClick={() => setFormOpen(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-brand-600 py-2.5 text-sm font-semibold text-white active:scale-95"
          >
            <Plus className="h-4 w-4" /> New project
          </button>
        </div>
      )}
```

- Before the final closing `</TabScreen>`, add the sheet:

```tsx
      <ProjectFormSheet open={formOpen} onClose={() => setFormOpen(false)} />
```

- [ ] **Step 2: ProjectDetailPage.tsx — Edit / Delete / Add work item / Add task**

In `frontend/src/pages/ProjectDetailPage.tsx`:
- Add imports:

```tsx
import { useState } from 'react'
import { Pencil, Trash2, Plus, ListPlus } from 'lucide-react'
import { ProjectFormSheet } from '@/components/ProjectFormSheet'
import { WorkItemFormSheet } from '@/components/WorkItemFormSheet'
import { CreateTaskSheet } from '@/components/CreateTaskSheet'
import { useProject, useBoot, useDeleteProject, permFlags } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
```
(Merge `useProject` with the existing data import; keep `useNavigate` etc.)

- In the component body add:

```tsx
  const { data: boot } = useBoot()
  const toast = useToast()
  const del = useDeleteProject()
  const [editOpen, setEditOpen] = useState(false)
  const [wiOpen, setWiOpen] = useState(false)
  const [taskFor, setTaskFor] = useState<string | null>(null)
```

- After `const { data, isLoading } = useProject(id)` and the early returns, compute flags:

```tsx
  const flags = permFlags(data, boot)
```

- Add an actions row right after the hero summary `</div>` (the gradient card), rendering buttons by flag:

```tsx
      {(flags.can_edit || flags.can_delete) && (
        <div className="mt-3 flex gap-2">
          {flags.can_edit && (
            <button onClick={() => setEditOpen(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white py-2 text-sm font-semibold text-slate-700 shadow-card active:scale-95">
              <Pencil className="h-4 w-4" /> Edit
            </button>
          )}
          {flags.can_delete && (
            <button
              onClick={() => {
                if (!confirm('Delete this project?')) return
                del.mutate(data.name, {
                  onSuccess: () => { toast('success', 'Project deleted'); navigate('/projects') },
                  onError: (e) => toast('error', (e as Error).message),
                })
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white py-2 text-sm font-semibold text-rose-600 shadow-card active:scale-95">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          )}
        </div>
      )}
```

- In the Work items `<section>` header, when `flags.can_edit`, add an "Add work item" button (mirror the WorkItemPage pattern):

```tsx
        <div className="mb-2 flex items-center justify-between px-1">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-500">
            <Layers className="h-4 w-4" /> Work items
          </h3>
          {flags.can_edit && (
            <div className="flex gap-2">
              <button onClick={() => setWiOpen(true)}
                className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white active:scale-95">
                <Plus className="h-3.5 w-3.5" /> Work item
              </button>
              {data.work_items.length > 0 && (
                <button onClick={() => setTaskFor(data.work_items[0].name)}
                  className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 active:scale-95">
                  <ListPlus className="h-3.5 w-3.5" /> Task
                </button>
              )}
            </div>
          )}
        </div>
```
(Replace the existing plain `<h3>…Work items</h3>` line with this block; keep the list/empty-state below it unchanged.)

- Before the closing `</DetailScreen>`, add the sheets:

```tsx
      <ProjectFormSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        project={data}
        canReassign={flags.can_reassign}
      />
      <WorkItemFormSheet open={wiOpen} onClose={() => setWiOpen(false)} project={data.name} groupings={data.groupings} />
      {taskFor && (
        <CreateTaskSheet open={!!taskFor} onClose={() => setTaskFor(null)} workItem={taskFor} team={data.team} />
      )}
```

Note: the "Task" quick-add uses the first work item for simplicity (YAGNI); choosing among multiple work items is out of scope per the spec.

- [ ] **Step 3: Type-check and build**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit && npm run build
```
Expected: tsc clean; build succeeds (Task 7 must be done first if `WorkItemFormSheet` is imported — if building this task alone, temporarily expect an unresolved import until Task 7; otherwise reorder so Task 7 lands before this build). To avoid a broken build, **do Task 7 before running this build step.**

- [ ] **Step 4: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/pages/Projects.tsx frontend/src/pages/ProjectDetailPage.tsx
git commit -m "feat: wire project create/edit/delete + work-item/task entry points"
```

---

## Task 7: WorkItemFormSheet

**Files:**
- Create: `frontend/src/components/WorkItemFormSheet.tsx`

> Implement this BEFORE running Task 6's build step (ProjectDetailPage imports it).

- [ ] **Step 1: Create the component**

Create `frontend/src/components/WorkItemFormSheet.tsx`:

```tsx
import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { useCreateWorkItem } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Spinner } from '@/components/ui'

interface Props {
  open: boolean
  onClose: () => void
  project: string
  groupings: string[]
}

const STATUSES = ['Pending', 'Ongoing', 'Completed']

export function WorkItemFormSheet({ open, onClose, project, groupings }: Props) {
  const toast = useToast()
  const create = useCreateWorkItem(project)
  const [title, setTitle] = useState('')
  const [grouping, setGrouping] = useState('')
  const [deadline, setDeadline] = useState('')
  const [status, setStatus] = useState('Pending')

  const reset = () => { setTitle(''); setGrouping(''); setDeadline(''); setStatus('Pending') }
  const close = () => { reset(); onClose() }

  if (!open) return null

  const field =
    'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none'

  const submit = () => {
    if (!title.trim() || !grouping.trim() || !deadline) {
      toast('error', 'Title, grouping and deadline are required')
      return
    }
    create.mutate(
      { title: title.trim(), grouping: grouping.trim(), project_deadline: deadline, status },
      {
        onSuccess: () => { toast('success', 'Work item created'); close() },
        onError: (e) => toast('error', (e as Error).message),
      },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={close}>
      <div className="max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">New work item</h3>
          <button onClick={close} className="rounded-full p-1 text-slate-400 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-slate-600">
            Title<span className="text-red-500"> *</span>
            <input className={field + ' mt-1'} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <label className="text-sm font-medium text-slate-600">
            Grouping<span className="text-red-500"> *</span>
            <input className={field + ' mt-1'} list="wi-groupings" value={grouping}
              onChange={(e) => setGrouping(e.target.value)} placeholder="Pick or type a new grouping" />
            <datalist id="wi-groupings">
              {groupings.map((g) => <option key={g} value={g} />)}
            </datalist>
          </label>

          <label className="text-sm font-medium text-slate-600">
            Deadline<span className="text-red-500"> *</span>
            <input type="date" className={field + ' mt-1'} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </label>

          <label className="text-sm font-medium text-slate-600">
            Status
            <select className={field + ' mt-1'} value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          <button onClick={submit} disabled={create.isPending}
            className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
            {create.isPending ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            Create work item
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check + build (covers Task 6 wiring too)**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit && npm run build
```
Expected: tsc clean; build succeeds (emits to `vernon_project/public/frontend/` and updates `www/m.html`).

- [ ] **Step 3: Commit (component + rebuilt assets + the build html)**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/components/WorkItemFormSheet.tsx vernon_project/public/frontend vernon_project/www/m.html vernon_project/www/vernon_sw.js
git commit -m "feat: add WorkItemFormSheet + rebuild PWA bundle"
```

---

## Task 8: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Clear cache (route rules / assets)**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id clear-cache
```

- [ ] **Step 2: Resource-API smoke test**

Create `vernon_project/_smoke_project.py` with a `run()` that, as Administrator, sets up a Project (owner=`smoke_o@example.com`, leader=`smoke_l@example.com`, both given the `Project Leader` role; owner also `Project Owner` role), then:
- as the leader, `PUT`-style edit (`frappe.get_doc` + `.save()`) succeeds;
- as the leader, `frappe.delete_doc` raises (delete is owner-only);
- as a role-holder who is NOT this project's lead, `.save()` raises `PermissionError`;
- with a work item present, owner delete raises the work-item guard;
- after removing the work item, owner delete succeeds.
Print PASS/FAIL per check. Run:

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id execute vernon_project._smoke_project.run
rm -f apps/vernon_project/vernon_project/_smoke_project.py
```
Expected: all checks PASS. (This mirrors the smoke pattern used for the create-task feature; reference an existing test fixture for mandatory fields.)

- [ ] **Step 3: Manual PWA verification**

In the PWA: as a Project Owner — see "+ New project", create a project, edit it, add a work item (new grouping), add a task; delete an empty project (and confirm delete is blocked when work items exist). As a leader — can edit but owner/leader selects are disabled and delete is hidden. As a non-lead — no edit/delete/add buttons.

---

## Notes / risks

- **Permission change needs `bench migrate`** (Task 1) and the live workers re-read cached route/permission data on `clear-cache`/restart.
- **403 vs message:** PermissionError surfaces as HTTP 403 → the resource client shows the server message when present; guard `frappe.throw` without an exception type is a `ValidationError` (HTTP 417) and shows its message.
- **`before_save` auto-team:** owner/leader/admin are auto-added to `team_members`; the form needn't manage them.
- **Task quick-add** targets the first work item only (YAGNI); a work-item picker is out of scope.
