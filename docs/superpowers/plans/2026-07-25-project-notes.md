# Project Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attach multiple freeform notes to a Project — a shared per-project noticeboard any team member can add to and read.

**Architecture:** New standalone `Project Note` doctype (project, author, note_date, body). Whitelisted API `project_notes.py` with one trust-boundary guard `_can_access` (owner/leader/admin/team-member/SysMgr). Shared FE (types + api client + react-query hooks) in `frontend/src`, presented by a per-frontend `ProjectNotesSection` component mounted in the mobile `ProjectScreen` and web `Project` pages.

**Tech Stack:** Frappe (Python doctype + whitelisted API), React + react-query + TypeScript (two Vite frontends: `/m` mobile, `/w` web), Tailwind.

## Global Constraints

- **Two frontends, both required.** Every UI change ships to `/m` (`frontend/`) and `/w` (`frontend-web/`). Shared logic (types/api/hooks) lives in `frontend/src`, imported as `@` from web; presentation is per-frontend. Rebuild both bundles before done.
- **author + note_date are server-set** from `frappe.session.user` / `nowdate()` — never trusted from the client. Trust boundary; do not simplify away.
- **`_can_access` gates read AND add** — reading the list implies membership, so the client shows the add form whenever the list loads (no separate `can_add` flag).
- **No native `alert/confirm/prompt`** — use the shared `useConfirm` dialog + `useToast`.
- **Desk perms: System Manager only** on the doctype (mirror `Leader Note`). All real access via the whitelisted API.
- **Docs data:** after the doctype + endpoints exist, run `python3 scripts/gen_docs.py` and commit `docs/assets/data.js` (generator exits non-zero if `Project Note` is unmapped).
- **What's New:** after it ships live, insert one `App Release` row (Bahasa, one bullet/line, `published=1`, `platform=Both`, semver bump from newest row).
- **Deploy host:** live site `project.vernon.id`, one shared bench at `/home/frappe/frappe-bench`. New doctype needs `bench --site project.vernon.id migrate`; new Python module needs `sudo /usr/local/bin/tj-restart`.
- Live site is code-first (no test DB) — the backend unit test runs at the end against the live DB.

---

### Task 1: `Project Note` doctype

**Files:**
- Create: `vernon_project/vernon_project/doctype/project_note/__init__.py` (empty)
- Create: `vernon_project/vernon_project/doctype/project_note/project_note.json`
- Create: `vernon_project/vernon_project/doctype/project_note/project_note.py`

**Produces:** DocType `Project Note` with fields `project` (Link Project, reqd), `author` (Link User, reqd), `note_date` (Date), `body` (Small Text, reqd). Empty controller (no side effects on insert).

- [ ] **Step 1: Create the empty package init**

`vernon_project/vernon_project/doctype/project_note/__init__.py`:
```python
```
(empty file)

- [ ] **Step 2: Create the doctype JSON** (mirrors `Leader Note`: autoname hash, SysMgr-only)

`vernon_project/vernon_project/doctype/project_note/project_note.json`:
```json
{
 "actions": [],
 "allow_rename": 0,
 "autoname": "hash",
 "creation": "2026-07-25 00:00:00.000000",
 "doctype": "DocType",
 "editable_grid": 1,
 "engine": "InnoDB",
 "field_order": ["project", "author", "note_date", "body"],
 "fields": [
  {"fieldname": "project", "fieldtype": "Link", "in_standard_filter": 1, "label": "Project", "options": "Project", "reqd": 1},
  {"fieldname": "author", "fieldtype": "Link", "in_standard_filter": 1, "label": "Author", "options": "User", "reqd": 1},
  {"fieldname": "note_date", "fieldtype": "Date", "in_list_view": 1, "label": "Note Date"},
  {"fieldname": "body", "fieldtype": "Small Text", "in_list_view": 1, "label": "Body", "reqd": 1}
 ],
 "index_web_pages_for_search": 0,
 "links": [],
 "modified": "2026-07-25 00:00:00.000000",
 "modified_by": "Administrator",
 "module": "Vernon Project",
 "name": "Project Note",
 "owner": "Administrator",
 "permissions": [
  {"create": 1, "delete": 1, "email": 1, "print": 1, "read": 1, "role": "System Manager", "share": 1, "write": 1}
 ],
 "row_format": "Dynamic",
 "sort_field": "modified",
 "sort_order": "DESC",
 "states": [],
 "track_changes": 0
}
```

- [ ] **Step 3: Create the empty controller**

`vernon_project/vernon_project/doctype/project_note/project_note.py`:
```python
# Copyright (c) 2026, Vernon and Contributors
# See license.txt

from frappe.model.document import Document


class ProjectNote(Document):
	pass
```

- [ ] **Step 4: Migrate to create the table**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate`
Expected: completes; `Project Note` table created.

- [ ] **Step 5: Verify the doctype exists**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print(frappe.db.exists("DocType", "Project Note"), frappe.get_meta("Project Note").get_field("body").reqd)
EOF`
Expected: prints `Project Note 1`

- [ ] **Step 6: Commit**

```bash
git add vernon_project/vernon_project/doctype/project_note
git commit -m "feat(project-notes): add Project Note doctype"
```

---

### Task 2: Whitelisted API + backend test (TDD)

**Files:**
- Create: `vernon_project/api/project_notes.py`
- Test: `vernon_project/api/test_project_notes.py`

**Interfaces:**
- Consumes: `Project Note` doctype (Task 1); `Project` fields `project_owner/project_leader/project_admin`; `Project Team` child rows.
- Produces (the FE relies on these exact signatures/shapes):
  - `get_project_notes(project) -> list[{name, body, author, author_name, author_image, note_date, can_delete}]` newest-first
  - `add_project_note(project, body) -> {same shape, one item}`
  - `delete_project_note(name) -> {name}`
  - Non-member read/add raises `frappe.PermissionError`.

- [ ] **Step 1: Write the failing test**

`vernon_project/api/test_project_notes.py`:
```python
# Copyright (c) 2026, Vernon and Contributors
# See license.txt
#
# Project Notes = a shared per-project noticeboard. Any team member (owner/leader/
# admin, Project Team member, or SysMgr) may add + read; author or owner/leader/
# admin/SysMgr may delete. These tests build real Project + Project Team rows and
# assert the access gate, server-set author/date, and delete rules.

import frappe
import unittest
from vernon_project.api.project_notes import (
	_can_access,
	get_project_notes,
	add_project_note,
	delete_project_note,
)

OWNER = "pn_owner@example.com"
LEADER = "pn_leader@example.com"
MEMBER = "pn_member@example.com"
STRANGER = "pn_stranger@example.com"
USERS = ((OWNER, "Owner"), (LEADER, "Leader"), (MEMBER, "Member"), (STRANGER, "Stranger"))


class TestProjectNotes(unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		for email, name in USERS:
			if not frappe.db.exists("User", email):
				frappe.get_doc({
					"doctype": "User", "email": email, "first_name": name,
					"send_welcome_email": 0, "enabled": 1,
				}).insert(ignore_permissions=True)
		brand = frappe.get_all("Brand", pluck="name", limit=1)[0]
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "PN Test", "status": "Ongoing",
			"brand": brand, "project_owner": OWNER, "project_leader": LEADER,
			"team_members": [{"user": MEMBER}, {"user": LEADER}, {"user": OWNER}],
		}).insert(ignore_permissions=True).name

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.delete("Project Note", {"project": self.project})
		frappe.delete_doc("Project", self.project, force=1, ignore_permissions=True)
		frappe.db.commit()

	def test_member_can_add_and_read(self):
		frappe.set_user(MEMBER)
		note = add_project_note(self.project, "  hello  ")
		self.assertEqual(note["body"], "hello")          # trimmed
		self.assertEqual(note["author"], MEMBER)         # server-set
		self.assertTrue(note["note_date"])               # server-set today
		self.assertTrue(note["can_delete"])              # author
		rows = get_project_notes(self.project)
		self.assertEqual([r["name"] for r in rows], [note["name"]])

	def test_stranger_cannot_read_or_add(self):
		frappe.set_user(STRANGER)
		with self.assertRaises(frappe.PermissionError):
			get_project_notes(self.project)
		with self.assertRaises(frappe.PermissionError):
			add_project_note(self.project, "nope")

	def test_empty_body_rejected(self):
		frappe.set_user(MEMBER)
		with self.assertRaises(frappe.ValidationError):
			add_project_note(self.project, "   ")

	def test_author_deletes_own_leader_deletes_any_member_cannot_delete_others(self):
		frappe.set_user(MEMBER)
		mine = add_project_note(self.project, "member note")
		frappe.set_user(LEADER)
		leaders = add_project_note(self.project, "leader note")
		# member cannot delete the leader's note
		frappe.set_user(MEMBER)
		with self.assertRaises(frappe.PermissionError):
			delete_project_note(leaders["name"])
		# author deletes own
		delete_project_note(mine["name"])
		# leader deletes any (the member's is gone; delete their own)
		frappe.set_user(LEADER)
		delete_project_note(leaders["name"])
		self.assertEqual(get_project_notes(self.project), [])

	def test_can_access_gate(self):
		self.assertTrue(_can_access(self.project, OWNER))
		self.assertTrue(_can_access(self.project, MEMBER))
		self.assertFalse(_can_access(self.project, STRANGER))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_project_notes`
Expected: FAIL — `ImportError`/`ModuleNotFoundError` (project_notes.py not created yet).

- [ ] **Step 3: Write the implementation**

`vernon_project/api/project_notes.py`:
```python
# Copyright (c) 2026, Vernon and Contributors
# See license.txt
#
# Project Notes — a shared per-project noticeboard. Any team member of a project
# (its owner/leader/admin, anyone in Project Team, or a System Manager) may add
# short freeform notes and read all of the project's notes. A note's author, or a
# project owner/leader/admin/SysMgr, may delete it. All access is through these
# whitelisted endpoints (Project Note is System-Manager-only in the desk).
# See docs/superpowers/specs/2026-07-25-project-notes-design.md.

import frappe
from frappe.utils import nowdate


def _is_admin():
	return "System Manager" in frappe.get_roles()


def _project_roles(project):
	"""owner/leader/admin emails for a project, in one query. Raises if missing."""
	row = frappe.db.get_value(
		"Project", project,
		["project_owner", "project_leader", "project_admin"],
		as_dict=True,
	)
	if not row:
		frappe.throw(f"Project {project} not found", frappe.DoesNotExistError)
	return row


def _elevated(project, user):
	"""True if user is a SysMgr or the project's owner/leader/admin."""
	if _is_admin():
		return True
	roles = _project_roles(project)
	return user in (roles.project_owner, roles.project_leader, roles.project_admin)


def _can_access(project, user=None):
	"""May `user` read/add notes on `project`? owner/leader/admin, team member, or
	SysMgr. Status-agnostic (notes stay reachable on Closed/Inbox projects)."""
	user = user or frappe.session.user
	if _elevated(project, user):
		return True
	return bool(frappe.db.exists("Project Team", {"parent": project, "user": user}))


def _user_meta_map(emails):
	emails = {e for e in emails if e}
	if not emails:
		return {}
	rows = frappe.get_all(
		"User", filters={"name": ["in", list(emails)]},
		fields=["name", "full_name", "user_image"],
	)
	return {r["name"]: r for r in rows}


@frappe.whitelist()
def get_project_notes(project):
	if not _can_access(project):
		raise frappe.PermissionError("Not a member of this project")
	user = frappe.session.user
	elevated = _elevated(project, user)
	notes = frappe.get_all(
		"Project Note",
		filters={"project": project},
		fields=["name", "body", "author", "note_date"],
		order_by="creation desc",
	)
	meta = _user_meta_map(n["author"] for n in notes)
	out = []
	for n in notes:
		m = meta.get(n["author"], {})
		out.append({
			"name": n["name"],
			"body": n["body"],
			"author": n["author"],
			"author_name": m.get("full_name") or n["author"],
			"author_image": m.get("user_image"),
			"note_date": n["note_date"],
			"can_delete": elevated or n["author"] == user,
		})
	return out


@frappe.whitelist()
def add_project_note(project, body):
	if not _can_access(project):
		raise frappe.PermissionError("Not a member of this project")
	body = (body or "").strip()
	if not body:
		frappe.throw("Note body is required")  # raises frappe.ValidationError
	user = frappe.session.user
	doc = frappe.get_doc({
		"doctype": "Project Note",
		"project": project,
		"author": user,
		"note_date": nowdate(),
		"body": body,
	}).insert(ignore_permissions=True)
	m = _user_meta_map([user]).get(user, {})
	return {
		"name": doc.name,
		"body": doc.body,
		"author": user,
		"author_name": m.get("full_name") or user,
		"author_image": m.get("user_image"),
		"note_date": doc.note_date,
		"can_delete": True,
	}


@frappe.whitelist()
def delete_project_note(name):
	note = frappe.db.get_value("Project Note", name, ["project", "author"], as_dict=True)
	if not note:
		return {"name": name}
	user = frappe.session.user
	if not (note.author == user or _elevated(note.project, user)):
		raise frappe.PermissionError("Cannot delete this note")
	frappe.delete_doc("Project Note", name, ignore_permissions=True)
	return {"name": name}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id run-tests --module vernon_project.api.test_project_notes`
Expected: PASS (5 tests). If `frappe.throw` maps to a different exception class, adjust `test_empty_body_rejected` to `frappe.ValidationError` (default for `frappe.throw`).

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/project_notes.py vernon_project/api/test_project_notes.py
git commit -m "feat(project-notes): whitelisted API + access-gate tests"
```

---

### Task 3: Shared frontend wiring (types + api client + hooks)

**Files:**
- Modify: `frontend/src/lib/types.ts` (add `ProjectNote`)
- Modify: `frontend/src/lib/api.ts` (add `PN` const + 3 methods; import `ProjectNote`)
- Modify: `frontend/src/hooks/useData.ts` (add `keys.projectNotes` + 3 hooks)

**Interfaces:**
- Consumes: `get_project_notes` / `add_project_note` / `delete_project_note` from Task 2.
- Produces: `useProjectNotes(project)`, `useAddProjectNote()`, `useDeleteProjectNote()`, and the `ProjectNote` type — consumed by Tasks 4 & 5.

- [ ] **Step 1: Add the `ProjectNote` type** — append to `frontend/src/lib/types.ts` (near `LeaderNote`, ~line 1272):

```ts
export interface ProjectNote {
  name: string
  body: string
  author: string
  author_name: string
  author_image: string | null
  note_date: string | null
  can_delete: boolean
}
```

- [ ] **Step 2: Add the api client methods** — in `frontend/src/lib/api.ts`.

Add the method-path constant next to the others (after `const LN = ...`, ~line 84):
```ts
const PN = 'vernon_project.api.project_notes.'
```
Add `ProjectNote` to the existing type import from `./types` at the top of the file (the same import that already brings in `LeaderNote`).
Add these three methods inside the `mobileApi` object, next to the `addUserNote/listUserNotes/deleteUserNote` block (~line 668):
```ts
  listProjectNotes: (project: string) => api.get<ProjectNote[]>(PN + 'get_project_notes', { project }),
  addProjectNote: (project: string, body: string) => api.post<ProjectNote>(PN + 'add_project_note', { project, body }),
  deleteProjectNote: (name: string) => api.post<{ name: string }>(PN + 'delete_project_note', { name }),
```

- [ ] **Step 3: Add the query key** — in `frontend/src/hooks/useData.ts`, in the `keys` object next to `userNotes` (~line 147):

```ts
  projectNotes: (project: string) => ['project-notes', project] as const,
```

- [ ] **Step 4: Add the hooks** — in `frontend/src/hooks/useData.ts`, after the `useDeleteUserNote` block (~line 2465):

```ts
export const useProjectNotes = (project: string) =>
  useQuery({
    queryKey: keys.projectNotes(project),
    queryFn: () => mobileApi.listProjectNotes(project),
    enabled: !!project,
  })

export function useAddProjectNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { project: string; body: string }) => mobileApi.addProjectNote(args.project, args.body),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: keys.projectNotes(v.project) }),
  })
}

export function useDeleteProjectNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { name: string; project: string }) => mobileApi.deleteProjectNote(args.name),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: keys.projectNotes(v.project) }),
  })
}
```

- [ ] **Step 5: Typecheck** (shared — from the mobile app which owns these files)

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: no errors referencing `ProjectNote`, `projectNotes`, `listProjectNotes`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/hooks/useData.ts
git commit -m "feat(project-notes): shared type + api client + react-query hooks"
```

---

### Task 4: Mobile `/m` — ProjectNotesSection + mount

**Files:**
- Create: `frontend/src/components/ProjectNotesSection.tsx`
- Modify: `frontend/src/pages/ProjectScreen.tsx` (import + render)

**Interfaces:**
- Consumes: `useProjectNotes/useAddProjectNote/useDeleteProjectNote` + `ProjectNote` (Task 3); `useConfirm`, `useToast`, `Avatar` (existing shared components — same imports `LeaderNotesSection.tsx` uses).

- [ ] **Step 1: Create the mobile component** (Soft-Pop; modeled on `LeaderNotesSection.tsx` but flat/newest-first, no shared/date inputs)

`frontend/src/components/ProjectNotesSection.tsx`:
```tsx
import { useState } from 'react'
import { StickyNote, Trash2, Plus } from 'lucide-react'
import { Avatar } from '@/components/ui'
import { useConfirm } from '@/components/Confirm'
import { useToast } from '@/components/Toast'
import { useProjectNotes, useAddProjectNote, useDeleteProjectNote } from '@/hooks/useData'
import type { ProjectNote } from '@/lib/types'

const card =
  'rounded-xl border border-slate-200 bg-white p-3 dark:bg-slate-800 dark:border-slate-700'
const heading =
  'mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'

// note_date is 'YYYY-MM-DD'. Append time so it parses at local midnight, not UTC.
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

// Reading the list requires membership (server-gated); undefined data ⇒ not loaded
// or not permitted ⇒ render nothing. When it loads, the caller may also add.
export function ProjectNotesSection({ project }: { project: string }) {
  const { data: notes } = useProjectNotes(project)
  if (!notes) return null
  return (
    <div className="flex flex-col gap-4">
      <div className={card}>
        <p className={heading}>
          <StickyNote className="h-3.5 w-3.5" /> Catatan Proyek
        </p>
        {notes.length === 0 ? (
          <p className="text-sm italic text-slate-400 dark:text-slate-500">Belum ada catatan</p>
        ) : (
          <div className="flex flex-col gap-2">
            {notes.map((n) => <NoteCard key={n.name} note={n} project={project} />)}
          </div>
        )}
      </div>
      <AddNoteForm project={project} />
    </div>
  )
}

function NoteCard({ note, project }: { note: ProjectNote; project: string }) {
  const confirm = useConfirm()
  const toast = useToast()
  const del = useDeleteProjectNote()
  async function onDelete() {
    const ok = await confirm({
      title: 'Hapus catatan?',
      message: 'Catatan ini akan dihapus permanen.',
      confirmLabel: 'Hapus',
      destructive: true,
    })
    if (!ok) return
    del.mutate(
      { name: note.name, project },
      {
        onSuccess: () => toast('success', 'Catatan dihapus'),
        onError: (e) => toast('error', e instanceof Error ? e.message : 'Gagal menghapus'),
      },
    )
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-paper p-3 dark:border-slate-700 dark:bg-slate-900">
      <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{note.body}</p>
      <div className="mt-2 flex items-center gap-2">
        <Avatar name={note.author_name} image={note.author_image} size={22} />
        <span className="flex-1 truncate text-xs text-slate-500 dark:text-slate-400">{note.author_name}</span>
        {note.note_date && (
          <span className="text-[11px] text-slate-400 dark:text-slate-500">{fmtDate(note.note_date)}</span>
        )}
        {note.can_delete && (
          <button
            onClick={onDelete}
            disabled={del.isPending}
            aria-label="Hapus catatan"
            className="rounded-full p-1 text-rose-500 active:bg-rose-50 disabled:opacity-50 dark:active:bg-rose-500/15"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

function AddNoteForm({ project }: { project: string }) {
  const toast = useToast()
  const add = useAddProjectNote()
  const [body, setBody] = useState('')
  function submit() {
    const b = body.trim()
    if (!b) return
    add.mutate(
      { project, body: b },
      {
        onSuccess: () => { setBody(''); toast('success', 'Catatan ditambahkan') },
        onError: (e) => toast('error', e instanceof Error ? e.message : 'Gagal menambah catatan'),
      },
    )
  }
  return (
    <div className={card}>
      <p className={heading}>
        <Plus className="h-3.5 w-3.5" /> Tambah Catatan
      </p>
      <div className="flex flex-col gap-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Tulis catatan…"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
        />
        <button
          onClick={submit}
          disabled={add.isPending || !body.trim()}
          className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-50"
        >
          {add.isPending ? 'Menyimpan…' : 'Tambah Catatan'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Mount in `ProjectScreen.tsx`**

Add the import with the other page imports (top of file):
```tsx
import { ProjectNotesSection } from '@/components/ProjectNotesSection'
```
Render it after the Team / group-photo block. Locate the second `{data.team.length > 0 && (` block (the `ProjectGroupPhoto`, ~line 270–283) and insert immediately after its closing `)}`, before the details/gantt section (~line 285):
```tsx
      <div className="mt-4">
        <ProjectNotesSection project={id} />
      </div>
```
(`id` is the route param already bound at the top via `useProject(id)`.)

- [ ] **Step 3: Typecheck + build the mobile bundle**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit && npm run build`
Expected: build succeeds; a new hashed `index-*.js` written under `vernon_project/public/frontend/assets/` and referenced by `vernon_project/public/frontend/index.html`.

- [ ] **Step 4: Verify the feature is in the built bundle**

Run: `grep -l "Catatan Proyek" vernon_project/public/frontend/assets/index-*.js`
Expected: matches the current bundle named in `vernon_project/public/frontend/index.html`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ProjectNotesSection.tsx frontend/src/pages/ProjectScreen.tsx vernon_project/public/frontend
git commit -m "feat(project-notes): mobile /m Notes section on project screen"
```

---

### Task 5: Web `/w` — ProjectNotesSection + mount

**Files:**
- Create: `frontend-web/src/components/ProjectNotesSection.tsx`
- Modify: `frontend-web/src/pages/Project.tsx` (import + render)

**Interfaces:**
- Consumes: shared hooks/type via `@` (Task 3); `Section` from `@web/components/Page`, `Button` from `@web/components/ui`, `useConfirm`/`useToast` from `@/components/*` (same imports `Project.tsx` already uses).

- [ ] **Step 1: Create the web component** (bento `<Section>`; web density — author as text, no avatar)

`frontend-web/src/components/ProjectNotesSection.tsx`:
```tsx
import { useState } from 'react'
import { StickyNote, Trash2, Plus } from 'lucide-react'
import { Section } from '@web/components/Page'
import { Button } from '@web/components/ui'
import { useConfirm } from '@/components/Confirm'
import { useToast } from '@/components/Toast'
import { useProjectNotes, useAddProjectNote, useDeleteProjectNote } from '@/hooks/useData'

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

export function ProjectNotesSection({ project }: { project: string }) {
  const { data: notes } = useProjectNotes(project)
  const toast = useToast()
  const confirm = useConfirm()
  const add = useAddProjectNote()
  const del = useDeleteProjectNote()
  const [body, setBody] = useState('')
  if (!notes) return null

  function submit() {
    const b = body.trim()
    if (!b) return
    add.mutate(
      { project, body: b },
      {
        onSuccess: () => { setBody(''); toast('success', 'Catatan ditambahkan') },
        onError: (e) => toast('error', e instanceof Error ? e.message : 'Gagal menambah catatan'),
      },
    )
  }
  async function onDelete(name: string) {
    const ok = await confirm({
      title: 'Hapus catatan?',
      message: 'Catatan ini akan dihapus permanen.',
      confirmLabel: 'Hapus',
      destructive: true,
    })
    if (!ok) return
    del.mutate(
      { name, project },
      {
        onSuccess: () => toast('success', 'Catatan dihapus'),
        onError: (e) => toast('error', e instanceof Error ? e.message : 'Gagal menghapus'),
      },
    )
  }

  return (
    <Section
      divider={false}
      className="!py-0"
      title={<span className="inline-flex items-center gap-1.5"><StickyNote className="h-3.5 w-3.5" /> Notes</span>}
    >
      <div className="flex flex-col gap-2">
        {notes.length === 0 && <p className="text-sm italic text-muted">Belum ada catatan</p>}
        {notes.map((n) => (
          <div key={n.name} className="rounded-lg border border-line bg-canvas p-3">
            <p className="whitespace-pre-wrap text-sm text-ink">{n.body}</p>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted">
              <span className="flex-1 truncate">
                {n.author_name}{n.note_date ? ` · ${fmtDate(n.note_date)}` : ''}
              </span>
              {n.can_delete && (
                <button
                  onClick={() => onDelete(n.name)}
                  disabled={del.isPending}
                  aria-label="Hapus catatan"
                  className="rounded p-1 text-rose-500 hover:bg-rose-50 disabled:opacity-50 dark:hover:bg-rose-500/15"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
        <div className="mt-1 flex flex-col gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Tulis catatan…"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
          <div>
            <Button onClick={submit} disabled={add.isPending || !body.trim()}>
              <Plus className="h-3.5 w-3.5" /> {add.isPending ? 'Menyimpan…' : 'Tambah'}
            </Button>
          </div>
        </div>
      </div>
    </Section>
  )
}
```
Note: `text-muted/text-ink/border-line/bg-canvas/bg-surface` and `<Button>` are the tokens/primitive already used in `Project.tsx`; if `tsc` flags the `Button` children/props, match its actual signature in `@web/components/ui`.

- [ ] **Step 2: Mount in `Project.tsx`**

Add the import with the other `@web/components/*` imports (top of file):
```tsx
import { ProjectNotesSection } from '@web/components/ProjectNotesSection'
```
Render it just after the Goal/Team context block closes. Locate the end of the `{(p.goal || p.team.length > 0 || ...) && ( ... )}` block (the `</div>` closing the `space-y-5 border-t` wrapper, ~line 420–422) and insert immediately after it:
```tsx
          <div className="border-t border-line pt-5">
            <ProjectNotesSection project={p.name} />
          </div>
```

- [ ] **Step 3: Typecheck + build the web bundle**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit && npm run build`
Expected: build succeeds; new hashed `index-*.js` under `vernon_project/public/frontend_web/assets/`, referenced by `vernon_project/public/frontend_web/index.html`.

- [ ] **Step 4: Verify the feature is in the built bundle**

Run: `grep -l "Belum ada catatan" vernon_project/public/frontend_web/assets/index-*.js`
Expected: matches the current bundle named in `vernon_project/public/frontend_web/index.html`.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/components/ProjectNotesSection.tsx frontend-web/src/pages/Project.tsx vernon_project/public/frontend_web
git commit -m "feat(project-notes): web /w Notes section on project page"
```

---

### Task 6: Ship — docs data, deploy, live-verify, What's New

**Files:**
- Modify: `scripts/gen_docs.py` (add `Project Note` to CLUSTERS)
- Modify: `docs/assets/data.js` (regenerated)
- Create (scratch): `/tmp/.../releases.json` for the App Release insert

- [ ] **Step 1: Register the doctype in the docs generator** — `scripts/gen_docs.py`, the `"notes"` cluster (~line 79):

```python
    "notes": ("Catatan", "Notes", "1x1", {
        "Personal Note", "Personal Note Item", "Personal Note Share",
        "Leader Note", "Project Note",
    }),
```

- [ ] **Step 2: Regenerate + staleness check**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project && python3 scripts/gen_docs.py && git diff --stat docs/assets/data.js`
Expected: exits 0; `data.js` changed (new doctype + 3 endpoints counted).

- [ ] **Step 3: Commit docs**

```bash
git add scripts/gen_docs.py docs/assets/data.js
git commit -m "docs(project-notes): register Project Note + regen data.js"
```

- [ ] **Step 4: Deploy (migrate already done in Task 1; restart for the new Python module)**

Run: `sudo /usr/local/bin/tj-restart`
Expected: bench restarts; `project_notes` endpoints live.

- [ ] **Step 5: Live-verify the endpoint** (as a real project member)

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
import frappe
p = frappe.get_all("Project", filters={"status": "Ongoing"}, pluck="name", limit=1)[0]
owner = frappe.db.get_value("Project", p, "project_owner")
frappe.set_user(owner)
n = frappe.call("vernon_project.api.project_notes.add_project_note", project=p, body="smoke test note")
print("added", n["name"], "by", n["author"])
print("list", [r["name"] for r in frappe.call("vernon_project.api.project_notes.get_project_notes", project=p)])
frappe.call("vernon_project.api.project_notes.delete_project_note", name=n["name"])
frappe.db.commit()
EOF`
Expected: prints the added note name + author = owner, list includes it, delete succeeds.

- [ ] **Step 6: Insert the What's New App Release** (Bahasa, platform Both). Write the row to a JSON file, then insert one-line (per CLAUDE.md):

`/tmp/claude-.../releases.json`:
```json
[{"version": "<bump-from-newest>", "release_date": "2026-07-25", "title": "Catatan di Proyek", "notes": "Sekarang setiap proyek punya kolom Catatan (/m & /w)\nSemua anggota tim bisa menambah dan membaca catatan proyek\nPenulis catatan (atau pemimpin/pemilik proyek) bisa menghapusnya", "platform": "Both"}]
```
(Resolve `<bump-from-newest>` first: `bench --site project.vernon.id console` → `print(frappe.get_all("App Release", fields=["version"], order_by="creation desc", limit=1))`, then patch-bump it.)

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([frappe.get_doc(dict(doctype="App Release", published=1, **r)).insert(ignore_permissions=True).name for r in __import__("json").load(open("/tmp/claude-.../releases.json"))])
frappe.db.commit()
EOF`

- [ ] **Step 7: Verify What's New reaches both platforms**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id console <<'EOF'
print([r["title"] for r in frappe.call("vernon_project.api.app_release.get_app_releases", platform="Mobile")][:2])
print([r["title"] for r in frappe.call("vernon_project.api.app_release.get_app_releases", platform="Web")][:2])
EOF`
Expected: "Catatan di Proyek" appears in both.

---

## Self-Review

**Spec coverage:**
- Storage (new `Project Note` doctype) → Task 1. ✓
- API `_can_access` + 3 endpoints, server-set author/date, status-agnostic → Task 2. ✓
- Shared FE type + hooks → Task 3. ✓
- UI both frontends → Tasks 4 (/m) + 5 (/w). ✓
- Docs regen + What's New → Task 6. ✓
- Tests (member add/read, non-member denied, delete rules, server-set fields) → Task 2. ✓

**Placeholder scan:** No TBD/TODO in code. The only deferred literals are `<bump-from-newest>` (App Release version, must be resolved live from the newest row) and the scratch JSON path — both explicitly instructed, not code placeholders.

**Type consistency:** `ProjectNote` shape (Task 3) matches the API return (Task 2) and both components (Tasks 4/5). Hook names `useProjectNotes/useAddProjectNote/useDeleteProjectNote` and key `projectNotes` are identical across hooks def and both consumers. Mutation args `{project, body}` / `{name, project}` match the api client method signatures.

**Scope:** Single plan, one subsystem. No decomposition needed.
