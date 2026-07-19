# Delete todo-less Projects & Project Details — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a project's owner / leader / admin (and System Manager) delete a Project or a Project Detail — but only when it has no Project Todo — in both the mobile (`/m`) and web (`/w`) apps; deleting a project cascades its details, glossaries and meetings.

**Architecture:** Two new whitelisted endpoints in `api/mobile.py` do the gated, guarded, cascading delete server-side. The two existing shared React hooks (`useDeleteProject` / `useDeleteProjectDetail`, in `frontend/src/` — imported by both apps via the `@` alias) are repointed from generic REST `DELETE` to these endpoints. The Delete buttons already exist in both UIs; we only fix their gate (add leader/admin) and their guard (disable when todos exist).

**Tech Stack:** Frappe (Python) backend; React + TanStack Query + TypeScript frontends (Vite). Shared code lives in `frontend/src/{lib,hooks}`; web UI in `frontend-web/src`, mobile UI in `frontend/src/pages`.

## Global Constraints

- **One LIVE site**, `project.vernon.id`; no separate test DB — backend tests create/clean their own rows (see existing `test_mobile.py` pattern) and run against the live site.
- **Permission set for delete:** project `project_owner`, `project_leader`, `project_admin`, or role `System Manager`. Enforced server-side; UI hiding is UX only.
- **Guard:** deletable only when **zero Project Todo** reference it. A Project is additionally blocked if any **Point Ledger** row references it (never destroy point history).
- **Cascade (project delete only):** its `Project Detail` (each carries child `Project Glossary` rows), `Meeting`, and `Glossary` (group) rows — in that order — then the `Project`.
- Shared frontend files (`frontend/src/lib/*`, `frontend/src/hooks/*`) serve **both** apps via `@`. `@web` = `frontend-web/src`.
- No `alert/confirm/prompt` — use the existing `useConfirm` dialog (already in place at every call site).
- Never `git checkout` other branches; `git add` only files this plan touches (user works in parallel).
- After it is LIVE, add an `App Release` row (What's New) per project `CLAUDE.md` — Bahasa, `platform="Both"`, `published=1`, semver bump.

---

## Task 1: Backend — gate helper + `delete_project_detail`

**Files:**
- Modify: `vernon_project/api/mobile.py` (add helper + endpoint near the other project endpoints, e.g. just after `duplicate_project`)
- Test: `vernon_project/api/test_mobile.py` (append a new `TestDeleteProjectAndDetail` class)

**Interfaces:**
- Produces: `_require_project_manager(project_doc)` → raises `frappe.PermissionError` if the session user is not owner/leader/admin/System Manager; `delete_project_detail(project_detail: str) -> {"ok": True}`.
- Consumes: nothing from other tasks.

Note: `Project Detail.on_trash` already throws `"Cannot delete a project detail that has tasks."` when todos exist — our explicit count-guard just gives a clearer message and runs before the delete.

- [ ] **Step 1: Write the failing test**

Append to `vernon_project/api/test_mobile.py`:

```python
class TestDeleteProjectAndDetail(unittest.TestCase):
	def setUp(self):
		from vernon_project.api.mobile import delete_project, delete_project_detail
		self.delete_project = delete_project
		self.delete_project_detail = delete_project_detail
		if not frappe.db.exists("Brand", "Test Customer"):
			frappe.get_doc({"doctype": "Brand", "brand_name": "Test Customer"}).insert(ignore_permissions=True)
		# A non-manager user for the permission test.
		if not frappe.db.exists("User", "del_outsider@example.com"):
			frappe.get_doc({"doctype": "User", "email": "del_outsider@example.com",
				"first_name": "Del Outsider", "send_welcome_email": 0}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Delete Test Project",
			"brand": "Test Customer", "project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
		})
		self.project.insert(ignore_permissions=True)
		self.grouping = frappe.get_doc({"doctype": "Glossary", "glossary": "Delete Grouping",
			"project": self.project.name}).insert(ignore_permissions=True).name
		self.detail = frappe.get_doc({
			"doctype": "Project Detail", "project": self.project.name, "title": "Delete Detail",
			"grouping": self.grouping, "project_deadline": add_days(nowdate(), 30), "estimated": 10,
		}).insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.delete("Project Todo", {"project": self.project.name})
		for dt, name in (("Project Detail", self.detail.name), ("Glossary", self.grouping),
				("Project", self.project.name)):
			if frappe.db.exists(dt, name):
				frappe.delete_doc(dt, name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def _add_todo(self):
		t = frappe.get_doc({"doctype": "Project Todo", "project": self.project.name,
			"project_detail": self.detail.name, "to_do": "blocker", "status": "⚪️ Planned"})
		t.flags.ignore_validate = True
		t.insert(ignore_permissions=True, ignore_mandatory=True)
		frappe.db.commit()
		return t.name

	def test_delete_detail_blocked_when_todo_exists(self):
		self._add_todo()
		with self.assertRaises(frappe.ValidationError):
			self.delete_project_detail(self.detail.name)
		self.assertTrue(frappe.db.exists("Project Detail", self.detail.name))

	def test_delete_detail_succeeds_when_empty(self):
		self.delete_project_detail(self.detail.name)
		self.assertFalse(frappe.db.exists("Project Detail", self.detail.name))

	def test_delete_detail_permission_denied_for_outsider(self):
		frappe.set_user("del_outsider@example.com")
		with self.assertRaises(frappe.PermissionError):
			self.delete_project_detail(self.detail.name)
		frappe.set_user("Administrator")
		self.assertTrue(frappe.db.exists("Project Detail", self.detail.name))
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_mobile --test test_delete_detail_succeeds_when_empty`
Expected: FAIL / ERROR — `cannot import name 'delete_project_detail'`.

- [ ] **Step 3: Write the helper + endpoint**

In `vernon_project/api/mobile.py`, add (place after the `duplicate_project` endpoint):

```python
def _require_project_manager(project_doc):
	"""Delete gate: owner / leader / admin of the project, or a System Manager."""
	user = frappe.session.user
	if "System Manager" in frappe.get_roles(user):
		return
	managers = {
		project_doc.get("project_owner"),
		project_doc.get("project_leader"),
		project_doc.get("project_admin"),
	}
	if user not in managers:
		frappe.throw("Not permitted", frappe.PermissionError)


@frappe.whitelist()
def delete_project_detail(project_detail):
	"""Delete a Project Detail that has no Project Todo. Its child glossary rows
	cascade with it. Gated to the parent project's owner/leader/admin (or SM)."""
	doc = frappe.get_doc("Project Detail", project_detail)
	_require_project_manager(frappe.get_doc("Project", doc.project))
	n = frappe.db.count("Project Todo", {"project_detail": project_detail})
	if n:
		frappe.throw(f"Cannot delete: {n} todo(s) still belong to this detail. Remove them first.")
	frappe.delete_doc("Project Detail", project_detail, ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_mobile --test test_delete_detail_succeeds_when_empty && bench --site project.vernon.id run-tests --module vernon_project.api.test_mobile --test test_delete_detail_blocked_when_todo_exists && bench --site project.vernon.id run-tests --module vernon_project.api.test_mobile --test test_delete_detail_permission_denied_for_outsider`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/mobile.py vernon_project/api/test_mobile.py
git commit -m "feat(project): whitelisted delete_project_detail with no-todos guard + gate"
```

---

## Task 2: Backend — `delete_project` (cascade)

**Files:**
- Modify: `vernon_project/api/mobile.py` (add endpoint next to `delete_project_detail`)
- Test: `vernon_project/api/test_mobile.py` (extend `TestDeleteProjectAndDetail`)

**Interfaces:**
- Consumes: `_require_project_manager` (Task 1).
- Produces: `delete_project(project: str) -> {"ok": True}`.

- [ ] **Step 1: Write the failing tests**

Add these methods to `TestDeleteProjectAndDetail`:

```python
	def test_delete_project_blocked_when_todo_exists(self):
		self._add_todo()
		with self.assertRaises(frappe.ValidationError):
			self.delete_project(self.project.name)
		self.assertTrue(frappe.db.exists("Project", self.project.name))

	def test_delete_project_blocked_when_point_ledger_exists(self):
		pl = frappe.get_doc({"doctype": "Point Ledger", "user": "Administrator",
			"project": self.project.name, "points": 5})
		pl.flags.ignore_validate = True
		pl.insert(ignore_permissions=True, ignore_mandatory=True)
		frappe.db.commit()
		try:
			with self.assertRaises(frappe.ValidationError):
				self.delete_project(self.project.name)
			self.assertTrue(frappe.db.exists("Project", self.project.name))
		finally:
			frappe.delete_doc("Point Ledger", pl.name, force=True, ignore_permissions=True)
			frappe.db.commit()

	def test_delete_project_cascades_detail_glossary_meeting(self):
		meeting = frappe.get_doc({"doctype": "Meeting", "project": self.project.name,
			"title": "Del Meeting", "meeting_date": nowdate()})
		meeting.flags.ignore_validate = True
		meeting.insert(ignore_permissions=True, ignore_mandatory=True)
		frappe.db.commit()
		detail_name, grouping_name, meeting_name = self.detail.name, self.grouping, meeting.name
		self.delete_project(self.project.name)
		self.assertFalse(frappe.db.exists("Project", self.project.name))
		self.assertFalse(frappe.db.exists("Project Detail", detail_name))
		self.assertFalse(frappe.db.exists("Glossary", grouping_name))
		self.assertFalse(frappe.db.exists("Meeting", meeting_name))
```

(If the `Meeting` doctype requires other mandatory fields, `ignore_mandatory=True` covers it; adjust the title/date field names only if insert raises on an unknown field.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_mobile --test test_delete_project_cascades_detail_glossary_meeting`
Expected: FAIL — `cannot import name 'delete_project'` / `AttributeError`.

- [ ] **Step 3: Write the endpoint**

In `vernon_project/api/mobile.py`, next to `delete_project_detail`:

```python
@frappe.whitelist()
def delete_project(project):
	"""Delete a Project that has no Project Todo, cascading its details (with
	their child glossaries), meetings and glossary groups. Blocked if any Point
	Ledger row references it — point history is never destroyed. Gated to the
	project's owner/leader/admin (or a System Manager)."""
	doc = frappe.get_doc("Project", project)
	_require_project_manager(doc)

	n_todos = frappe.db.count("Project Todo", {"project": project})
	if n_todos:
		frappe.throw(f"Cannot delete: {n_todos} todo(s) still belong to this project. Remove them first.")
	n_points = frappe.db.count("Point Ledger", {"project": project})
	if n_points:
		frappe.throw(f"Cannot delete: {n_points} point-history record(s) reference this project.")

	# Order matters: details link their grouping Glossary, so details go first.
	for doctype in ("Project Detail", "Meeting", "Glossary"):
		for name in frappe.get_all(doctype, filters={"project": project}, pluck="name"):
			frappe.delete_doc(doctype, name, ignore_permissions=True, force=True)
	frappe.delete_doc("Project", project, ignore_permissions=True, force=True)
	frappe.db.commit()
	return {"ok": True}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_mobile`
Expected: the whole module PASSES (all `TestDeleteProjectAndDetail` tests green, no regressions).

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/mobile.py vernon_project/api/test_mobile.py
git commit -m "feat(project): whitelisted delete_project with cascade + todo/point guards"
```

---

## Task 3: Backend — expose `can_delete` on `get_project_detail`

Needed so the standalone web detail pane (`ProjectDetail.tsx`) can show Delete to an admin (its gate uses the detail response's own flag, not `permFlags`).

**Files:**
- Modify: `vernon_project/api/mobile.py:1315-1320`
- Test: `vernon_project/api/test_mobile.py` (extend `TestDeleteProjectAndDetail`)

**Interfaces:**
- Produces: `get_project_detail(...)` response now includes `can_delete: bool` (`is_sm or user in (owner, leader, admin)`).

- [ ] **Step 1: Write the failing test**

Add to `TestDeleteProjectAndDetail`:

```python
	def test_get_project_detail_exposes_can_delete(self):
		from vernon_project.api.mobile import get_project_detail
		r = get_project_detail(self.detail.name)
		self.assertIn("can_delete", r)
		self.assertTrue(r["can_delete"])  # Administrator is owner/leader + SM
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_mobile --test test_get_project_detail_exposes_can_delete`
Expected: FAIL — `KeyError: 'can_delete'` / assertIn fails.

- [ ] **Step 3: Implement**

In `vernon_project/api/mobile.py`, change lines 1315-1320 from:

```python
	owner, leader = frappe.get_value(
		"Project", detail["project"], ["project_owner", "project_leader"]
	)
	is_sm = "System Manager" in frappe.get_roles(user)
	detail["can_create"] = is_sm or user in (owner, leader)
	detail["can_edit"] = is_sm or user in (owner, leader)
```

to:

```python
	owner, leader, admin = frappe.get_value(
		"Project", detail["project"], ["project_owner", "project_leader", "project_admin"]
	)
	is_sm = "System Manager" in frappe.get_roles(user)
	detail["can_create"] = is_sm or user in (owner, leader)
	detail["can_edit"] = is_sm or user in (owner, leader)
	detail["can_delete"] = is_sm or user in (owner, leader, admin)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_mobile --test test_get_project_detail_exposes_can_delete`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/mobile.py vernon_project/api/test_mobile.py
git commit -m "feat(project): get_project_detail returns can_delete (owner/leader/admin/SM)"
```

---

## Task 4: Frontend shared — API methods, hooks, permFlags, type

**Files:**
- Modify: `frontend/src/lib/api.ts` (add two methods to the `mobileApi` object, near `duplicateProject` ~line 214)
- Modify: `frontend/src/hooks/useData.ts` (`useDeleteProject` ~621, `useDeleteProjectDetail` ~665, `permFlags` ~562-571)
- Modify: `frontend/src/lib/types.ts:356` (add `can_delete` to the `ProjectDetail` interface)

**Interfaces:**
- Consumes: `delete_project` / `delete_project_detail` endpoints (Tasks 1-2), `can_delete` field (Task 3).
- Produces: `mobileApi.deleteProject(project)`, `mobileApi.deleteProjectDetail(project_detail)`; `permFlags(...).can_delete` now includes leader+admin; `ProjectDetail.can_delete: boolean`.

- [ ] **Step 1: Add the API methods**

In `frontend/src/lib/api.ts`, inside the `mobileApi` object right after the `duplicateProject` method:

```ts
  deleteProject: (project: string) =>
    api.post<{ ok: boolean }>(M + 'delete_project', { project }),
  deleteProjectDetail: (project_detail: string) =>
    api.post<{ ok: boolean }>(M + 'delete_project_detail', { project_detail }),
```

- [ ] **Step 2: Repoint the hooks**

In `frontend/src/hooks/useData.ts`, change the `mutationFn` of `useDeleteProject`:

```ts
    mutationFn: (project: string) => mobileApi.deleteProject(project),
```

and of `useDeleteProjectDetail`:

```ts
    mutationFn: (name: string) => mobileApi.deleteProjectDetail(name),
```

(`mobileApi` is already imported in this file — it backs `duplicateProject` etc. If not, add it to the existing import from `@/lib/api`. Leave the `onSettled` invalidations untouched.)

- [ ] **Step 3: Broaden `permFlags.can_delete`**

In `frontend/src/hooks/useData.ts`, in `permFlags`, add an `isAdmin` line and widen `can_delete`:

```ts
  const isOwner = !!me && me === project.project_owner
  const isLeader = !!me && me === project.project_leader
  const isAdmin = !!me && me === project.project_admin
  return {
    can_edit: isSM || isOwner || isLeader,
    can_delete: isSM || isOwner || isLeader || isAdmin,
    can_reassign: isSM || isOwner,
  }
```

- [ ] **Step 4: Add the type field**

In `frontend/src/lib/types.ts`, in the `ProjectDetail` interface (the one at line ~356 with `can_edit: boolean`), add beneath `can_edit`:

```ts
  can_delete: boolean
```

- [ ] **Step 5: Type-check both apps**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit && cd ../frontend-web && npx tsc --noEmit`
Expected: no errors. (Consuming UI edits land in Tasks 5-6; these shared changes must at minimum still type-check — if `can_delete` is referenced nowhere yet that is fine.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/hooks/useData.ts frontend/src/lib/types.ts
git commit -m "feat(project): delete endpoints wired; permFlags.can_delete adds leader/admin"
```

---

## Task 5: Mobile UI — `ProjectScreen.tsx` guards & gates

**Files:**
- Modify: `frontend/src/pages/ProjectScreen.tsx` (project-delete block ~158-173; detail action cluster ~355-388)

**Interfaces:**
- Consumes: `flags.can_delete` (Task 4), `data.project_details[].total`.

- [ ] **Step 1: Fix the project-delete guard (todos, not details)**

In `frontend/src/pages/ProjectScreen.tsx`, in the `{flags.can_delete && (` block, replace the `disabled`/`title` of the Delete-project `<button>`:

```tsx
              disabled={data.project_details.some((d) => d.total > 0)}
              title={data.project_details.some((d) => d.total > 0) ? 'Remove all todos before deleting this project' : undefined}
```

(Everything else in that button — confirm dialog, `del.mutate`, styling — stays as is.)

- [ ] **Step 2: Let admin reach the detail delete**

The per-detail action cluster is wrapped in `{flags.can_edit ? ( … ) : <ChevronRight … />}` (~line 355). Change the condition to include delete-capable users:

```tsx
                  {(flags.can_edit || flags.can_delete) ? (
```

Inside that cluster, gate the **Postpone** and **Edit** buttons on `flags.can_edit` (they were implicitly gated by the wrapper) by wrapping each in `{flags.can_edit && ( … )}`, and gate the **Delete** button on `flags.can_delete`:

```tsx
                    <div className="flex shrink-0 items-center gap-1">
                      {flags.can_edit && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setPostpone({ type: 'Project Detail', name: w.name, label: w.title, anchor: '' }) }}
                          className="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 active:bg-slate-100 dark:active:bg-slate-700"
                        >
                          <CalendarClock className="h-4 w-4" />
                        </button>
                      )}
                      {flags.can_edit && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditDetail(w.name) }}
                          className="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 active:bg-slate-100 dark:active:bg-slate-700"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      {flags.can_delete && (
                        <button
                          disabled={w.total > 0}
                          title={w.total > 0 ? 'Remove all todos before deleting this detail' : undefined}
                          onClick={async (e) => {
                            e.stopPropagation()
                            if (w.total > 0) return
                            if (!(await confirm({ title: 'Delete this detail?', message: `"${w.title}" will be removed.`, confirmLabel: 'Delete', destructive: true }))) return
                            delDetail.mutate(w.name, {
                              onSuccess: () => toast('success', 'Project detail deleted'),
                              onError: (err) => toast('error', (err as Error).message),
                            })
                          }}
                          className="rounded-lg p-1.5 text-rose-600 active:bg-rose-50 dark:active:bg-rose-500/15 disabled:cursor-not-allowed disabled:text-slate-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
```

- [ ] **Step 2b: Verify no unused `del`/`Trash2` etc.** — they were already imported and used; no import changes expected.

- [ ] **Step 3: Type-check**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ProjectScreen.tsx
git commit -m "feat(project,/m): delete gated on no-todos + owner/leader/admin"
```

---

## Task 6: Web UI — `Project.tsx` & `ProjectDetail.tsx` guards & gates

**Files:**
- Modify: `frontend-web/src/pages/Project.tsx` (detail actions column ~238-255; project Delete button ~300-310)
- Modify: `frontend-web/src/pages/ProjectDetail.tsx` (delete handler + overflow menu ~99-122)

**Interfaces:**
- Consumes: `perms.can_delete` (Task 4), `p.project_details[].total`, `d.can_delete` + `items` (Tasks 3-4).

- [ ] **Step 1: Fix the project-delete guard in `Project.tsx`**

Replace the Delete-project `<Button>`'s `disabled`/`title` (~304-305):

```tsx
                    disabled={p.project_details.some((w) => w.total > 0)}
                    title={p.project_details.some((w) => w.total > 0) ? 'Remove all todos before deleting this project' : undefined}
```

- [ ] **Step 2: Let admin reach the detail delete in `Project.tsx`**

The detail actions column is added only when `perms.can_edit` (~238). Change to `perms.can_edit || perms.can_delete`, and make the menu items conditional:

```tsx
    ...((perms.can_edit || perms.can_delete) ? [{
      key: 'actions',
      header: '',
      width: 'w-10',
      render: (r: ProjectDetailSummary) => (
        <span onClick={(e) => e.stopPropagation()}>
          <OverflowMenu
            size="sm"
            items={[
              ...(perms.can_edit ? [
                { label: 'Edit', icon: Pencil, onClick: () => setEditDetail(r.name) },
                { label: 'Postpone', icon: CalendarClock, onClick: () => setPostpone({ type: 'Project Detail', name: r.name, label: r.title, anchor: '' }) },
              ] : []),
              ...(perms.can_delete ? [
                { divider: true },
                { label: 'Delete', icon: Trash2, danger: true, disabled: r.total > 0, onClick: () => doDeleteDetail(r) },
              ] : []),
            ]}
          />
        </span>
      ),
    } as Column<ProjectDetailSummary>] : []),
```

(`doDeleteDetail` already early-returns when `w.total > 0` — keep it. If `OverflowMenu`'s `items` type rejects the spread, cast the array `as MenuItem[]` matching its existing item type.)

- [ ] **Step 3: Guard + gate the standalone detail pane `ProjectDetail.tsx`**

The overflow menu (~112-122) gates every item on `d.can_edit`. Gate Delete on `d.can_delete` and disable it when the detail still has todos (`items` is the detail's todo list already in scope). Also fix the now-inaccurate confirm copy.

Replace the `handleDelete` message and the Delete menu item:

```tsx
  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete project detail?',
      message: `"${d.title}" will be removed.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    deleteMutation.mutate(d.name, {
      onSuccess: () => nav(`/project/${encodeURIComponent(d.project)}`),
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  const overflowItems: MenuItem[] = [
    ...(d.can_edit
      ? [{ label: 'Edit', icon: Pencil, onClick: () => setEditOpen(true) }]
      : []),
    ...(d.can_edit
      ? [{ label: 'Postpone', icon: CalendarClock, onClick: () => setPostponeOpen(true) }]
      : []),
    ...(d.can_delete
      ? [{ label: 'Delete', icon: Trash2, danger: true, disabled: items.length > 0, onClick: handleDelete }]
      : []),
  ]
```

(If `toast` is not already imported/instantiated in this file, add it from the app's `Toast` provider as the other pages do; if `disabled` is not a supported `MenuItem` field, mirror the pattern used in `Project.tsx`'s `OverflowMenu`, which already passes `disabled`.)

- [ ] **Step 4: Type-check**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/Project.tsx frontend-web/src/pages/ProjectDetail.tsx
git commit -m "feat(project,/w): delete gated on no-todos + owner/leader/admin"
```

---

## Task 7: Build, deploy, verify, What's New

**Files:**
- Build outputs: `vernon_project/public/frontend{,_web}/*`, `www/m.html`, `www/w.html` (regenerated).
- Data: one `App Release` row on the live site.

- [ ] **Step 1: Build both bundles**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build
```
Expected: both builds succeed; new hashed assets appear under `vernon_project/public/frontend{,_web}/assets/`, and `index.html` + `www/{m,w}.html` are updated.

- [ ] **Step 2: Restart the bench (loads the new Python endpoints)**

```bash
sudo /usr/local/bin/tj-restart
```

- [ ] **Step 3: Verify the endpoints end-to-end (owner path + guard)**

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
import frappe
frappe.set_user("Administrator")
p = frappe.get_doc({"doctype":"Project","project_name":"WNVerify Del","brand":frappe.db.get_value("Brand",{},"name"),"project_owner":"Administrator","project_leader":"Administrator","status":"Ongoing","start_date":frappe.utils.nowdate(),"deadline":frappe.utils.add_days(frappe.utils.nowdate(),10)}).insert(ignore_permissions=True)
d = frappe.get_doc({"doctype":"Project Detail","project":p.name,"title":"WN Detail","project_deadline":frappe.utils.add_days(frappe.utils.nowdate(),10)}).insert(ignore_permissions=True)
print("detail delete:", frappe.call("vernon_project.api.mobile.delete_project_detail", project_detail=d.name))
print("project delete:", frappe.call("vernon_project.api.mobile.delete_project", project=p.name))
print("gone:", not frappe.db.exists("Project", p.name))
EOF
```
Expected: both calls return `{'ok': True}`; `gone: True`.

- [ ] **Step 4: Browser smoke test (operator)**

On `/w` and `/m`, open a project with **no** todos → Delete works and navigates back; open one **with** todos → Delete button disabled with the "Remove all todos" hint. Confirm as owner, leader, and admin. (If the app shows a blank screen after asset swap, purge Cloudflare `/assets` per the Cloudflare-asset-cache memory.)

- [ ] **Step 5: Add the What's New (`App Release`) entry**

Only after Step 3/4 confirm it is live. Write `/tmp/claude-1000/.../scratchpad/releases.json` with one row (Bahasa; biggest item first), then insert per `CLAUDE.md`:

```json
[{"version":"<semver bump from newest row>","release_date":"2026-07-19","platform":"Both","title":"Hapus proyek & detail yang masih kosong","notes":"Pemilik, leader, atau admin proyek kini bisa menghapus proyek atau bagian detail yang belum punya todo (/m & /w)\nSaat proyek dihapus, kelompok/glossary dan jadwal meeting-nya ikut terhapus\nTombol Hapus otomatis nonaktif selama masih ada todo di dalamnya"}]
```

```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([frappe.get_doc(dict(doctype="App Release", published=1, **r)).insert(ignore_permissions=True).name for r in __import__("json").load(open("/abs/path/releases.json"))])
frappe.db.commit()
EOF
```
Then verify: `frappe.call("vernon_project.api.app_release.get_app_releases", platform="Mobile")` shows the new row. (Check the newest existing `App Release` version first to pick the correct semver bump — feature ⇒ minor bump.)

- [ ] **Step 6: Commit the rebuilt bundles**

```bash
git add vernon_project/public/frontend vernon_project/public/frontend_web vernon_project/www/m.html vernon_project/www/w.html
git commit -m "build(project): ship delete-todoless-project bundles"
```

---

## Ponytail ceiling notes

- **Cancelled-only detail edge case:** UI todo counts (`total`, `items`) exclude Cancelled todos, but the backend guard counts *all* Project Todo. A detail/project whose only todos are Cancelled shows as deletable in the UI yet the server refuses with a clear "N todo(s)" message. Safe (never deletes something with a live todo); upgrade path if it annoys users: exclude Cancelled in the backend `count` **and** cascade-delete the cancelled todos on delete.
- **`force=True` on sub-entity deletes** bypasses link-integrity checks — acceptable because the whole project subtree is being torn down and the todo/point guards already ran; do not copy this pattern into partial deletes.

## Self-Review

- **Spec coverage:** gate (owner/leader/admin/SM) → Task 1 helper + Task 4 permFlags + Task 3 `can_delete`; no-todos guard → Tasks 1-2 backend + Tasks 5-6 UI disable; Point Ledger block → Task 2; cascade details/glossary/meeting → Task 2; both platforms → Tasks 5 (/m) + 6 (/w); tests → Tasks 1-3; What's New → Task 7. All spec sections mapped.
- **Placeholder scan:** the only intentional `<...>` is the semver value in Task 7 Step 5 (must read the live newest row) — flagged inline, not a code placeholder.
- **Type consistency:** `can_delete` defined on the `ProjectDetail` type (Task 4) and produced by `get_project_detail` (Task 3), consumed in Task 6; `mobileApi.deleteProject`/`deleteProjectDetail` defined in Task 4, consumed by the repointed hooks same task; `permFlags.can_delete` defined Task 4, consumed Tasks 5-6.
