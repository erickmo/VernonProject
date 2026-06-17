# Project Detail Team & Workload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the mobile PWA Project Detail page, show every team member (owner, leader, all members) including zero-load ones, display owner/leader in the header, and let tapping a member open a bottom sheet of their workload.

**Architecture:** Backend `get_project` builds the `team` list from the union of owner+leader+Project Team users+open-todo assignees with role/membership flags and a fixed order. A new `get_member_workload` endpoint returns one member's todos. Frontend renders all members as tappable cards and a new `MemberWorkloadSheet` lists that member's todos (Open/All toggle), each routing to its work item.

**Tech Stack:** Frappe (Python) backend, React + TypeScript + @tanstack/react-query PWA, Tailwind, lucide-react icons.

## Global Constraints

- Backend file: `vernon_project/api/mobile.py`. Reuse existing helpers `_fetch_todos`, `_shape_todo`, `_user_name_map`, `_visible_projects`, `_status_key`.
- Status strings live in `STATUS_*` constants; "completed" key = `_status_key(status) == "completed"`.
- Permission guard for project-scoped endpoints: `if project not in _visible_projects(): frappe.throw("Not permitted", frappe.PermissionError)`.
- Project Team is a child table on `Project.team_members` (child doctype "Project Team", single field `user`). Project Todo is a child of `Project Detail` (parentfield `todo`); fields used: `to_do`, `assigned_to`, `status`, `deadline`.
- Backend tests run with: `bench --site project.vernon.id run-tests --module vernon_project.api.test_mobile` (only site with the app installed). Tests self-clean in `tearDown`; mirror the existing classes' setup/teardown exactly.
- Frontend has NO test runner; frontend tasks are verified by `npm run build` (typecheck) + manual check.
- Production gunicorn runs with `--preload` (no autoreload) — backend changes need `sudo supervisorctl restart` to go live; PWA changes need a rebuild + served `m.html` bundle-hash update.

---

### Task 1: Backend — expand `team` in `get_project`

**Files:**
- Modify: `vernon_project/api/mobile.py` (the `team` build inside `get_project`, ~lines 413-422)
- Test: `vernon_project/api/test_mobile.py` (add a test class)

**Interfaces:**
- Produces: `get_project(project)["team"]` is now a list of dicts, each
  `{"user": str, "name": str, "image": str|None, "open_todos": int, "is_owner": bool, "is_leader": bool, "is_member": bool}`.
  Order: owner first, leader second (if leader != owner), then remaining by `open_todos` desc, then `name` asc. One row per distinct user; if owner == leader the single row has both flags true. `is_member` is true when the user is in the Project Team child table OR is the owner/leader.

- [ ] **Step 1: Write the failing test**

Add to `vernon_project/api/test_mobile.py`:

```python
class TestMobileGetProjectTeam(unittest.TestCase):
	def setUp(self):
		if not frappe.db.exists("Customer", "Test Customer"):
			frappe.get_doc({"doctype": "Customer", "customer_name": "Test Customer",
				"customer_type": "Company"}).insert(ignore_permissions=True)
		if not frappe.db.exists("Project Group", "Test Project Group"):
			frappe.get_doc({"doctype": "Project Group",
				"project_name": "Test Project Group"}).insert(ignore_permissions=True)
		for email in ("tm_member@example.com", "tm_assignee@example.com"):
			if not frappe.db.exists("User", email):
				frappe.get_doc({"doctype": "User", "email": email,
					"first_name": email.split("@")[0], "send_welcome_email": 0}).insert(ignore_permissions=True)
		self.project = frappe.get_doc({
			"doctype": "Project", "project_name": "Team Roster Project",
			"customer": "Test Customer", "project_group": "Test Project Group",
			"project_owner": "Administrator", "project_leader": "Administrator",
			"status": "Ongoing", "start_date": nowdate(), "deadline": add_days(nowdate(), 30),
			"team_members": [{"user": "tm_member@example.com"}],
		})
		self.project.insert(ignore_permissions=True)
		self.gl = frappe.get_doc({"doctype": "Glossary", "glossary": "Roster Grouping",
			"project": self.project.name})
		self.gl.insert(ignore_permissions=True)
		self.detail = frappe.get_doc({"doctype": "Project Detail", "project": self.project.name,
			"title": "Roster Detail", "grouping": self.gl.name,
			"project_deadline": add_days(nowdate(), 20)})
		# One open todo assigned to a NON-member assignee.
		self.detail.append("todo", {"to_do": "Open task", "assigned_to": "tm_assignee@example.com",
			"status": "⚪️ Planned", "deadline": add_days(nowdate(), 5)})
		self.detail.insert(ignore_permissions=True)
		frappe.db.commit()

	def tearDown(self):
		frappe.set_user("Administrator")
		for dt, nm in (("Project Detail", self.detail.name), ("Glossary", self.gl.name),
				("Project", self.project.name)):
			if frappe.db.exists(dt, nm):
				frappe.delete_doc(dt, nm, force=True, ignore_permissions=True)
		frappe.db.commit()

	def test_team_includes_zero_load_members_and_flags(self):
		from vernon_project.api.mobile import get_project
		r = get_project(self.project.name)
		by_user = {m["user"]: m for m in r["team"]}
		# Owner/leader (Administrator) present, flagged, even though they have no load.
		self.assertIn("Administrator", by_user)
		self.assertTrue(by_user["Administrator"]["is_owner"])
		self.assertTrue(by_user["Administrator"]["is_leader"])
		self.assertTrue(by_user["Administrator"]["is_member"])
		self.assertEqual(by_user["Administrator"]["open_todos"], 0)
		# Formal Project Team member with zero todos still appears.
		self.assertIn("tm_member@example.com", by_user)
		self.assertTrue(by_user["tm_member@example.com"]["is_member"])
		self.assertEqual(by_user["tm_member@example.com"]["open_todos"], 0)
		# Assignee who is NOT a formal member appears with load but is_member False.
		self.assertIn("tm_assignee@example.com", by_user)
		self.assertEqual(by_user["tm_assignee@example.com"]["open_todos"], 1)
		self.assertFalse(by_user["tm_assignee@example.com"]["is_member"])
		# Owner is first in order.
		self.assertEqual(r["team"][0]["user"], "Administrator")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bench --site project.vernon.id run-tests --module vernon_project.api.test_mobile`
Expected: FAIL — `KeyError`/`AssertionError` (team lacks zero-load members or flags).

- [ ] **Step 3: Write minimal implementation**

In `get_project`, replace the existing `name_map`/`team` block (the lines building `name_map` from `workload` keys and the `team` list comprehension, currently ~lines 413-422) with:

```python
	# Effective roster: owner + leader + formal Project Team members, unioned
	# with anyone carrying open-todo load (an assignee need not be a formal
	# member). Everyone shows even with zero load.
	member_users = set(
		frappe.get_all(
			"Project Team", filters={"parent": project}, pluck="user", limit_page_length=0
		)
	)
	roster = set(member_users) | {doc.project_owner, doc.project_leader} | set(workload.keys())
	roster.discard(None)

	name_map = _user_name_map(roster)
	team = [
		{
			"user": email,
			"name": (name_map.get(email) or {}).get("full_name") or email,
			"image": (name_map.get(email) or {}).get("user_image"),
			"open_todos": workload.get(email, 0),
			"is_owner": email == doc.project_owner,
			"is_leader": email == doc.project_leader,
			"is_member": email in member_users or email in (doc.project_owner, doc.project_leader),
		}
		for email in roster
	]

	def _rank(m):
		# Owner first, leader second, then heaviest load, then name.
		role = 0 if m["is_owner"] else (1 if m["is_leader"] else 2)
		return (role, -m["open_todos"], (m["name"] or "").lower())

	team.sort(key=_rank)
```

(Leave the `return {...}` block's `"team": team,` line unchanged — it already references `team`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bench --site project.vernon.id run-tests --module vernon_project.api.test_mobile`
Expected: PASS (all classes, including the new one).

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/mobile.py vernon_project/api/test_mobile.py
git commit -m "feat: project team roster includes zero-load members with role flags"
```

---

### Task 2: Backend — `get_member_workload` endpoint

**Files:**
- Modify: `vernon_project/api/mobile.py` (add function after `get_project`)
- Test: `vernon_project/api/test_mobile.py` (extend `TestMobileGetProjectTeam`)

**Interfaces:**
- Produces: `get_member_workload(project, user, include_completed=0)` returns a
  list of dicts, each `{"name": str, "to_do": str, "status": str, "status_key": str, "deadline": str|None, "deadline_human": str|None, "is_overdue": bool, "work_item": str, "work_item_title": str}`, ordered by deadline asc. Open-only unless `include_completed` truthy. Throws `frappe.PermissionError` if project not visible.

- [ ] **Step 1: Write the failing test**

Add these two methods to the `TestMobileGetProjectTeam` class from Task 1:

```python
	def test_member_workload_open_only_by_default(self):
		from vernon_project.api.mobile import get_member_workload
		rows = get_member_workload(self.project.name, "tm_assignee@example.com")
		self.assertEqual(len(rows), 1)
		self.assertEqual(rows[0]["to_do"], "Open task")
		self.assertEqual(rows[0]["work_item"], self.detail.name)
		self.assertEqual(rows[0]["status_key"], "planned")
		# A member with no todos returns an empty list.
		self.assertEqual(get_member_workload(self.project.name, "tm_member@example.com"), [])

	def test_member_workload_permission(self):
		from vernon_project.api.mobile import get_member_workload
		frappe.set_user("tm_assignee@example.com")  # not on any visible project here
		try:
			with self.assertRaises(frappe.PermissionError):
				get_member_workload(self.project.name, "tm_assignee@example.com")
		finally:
			frappe.set_user("Administrator")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bench --site project.vernon.id run-tests --module vernon_project.api.test_mobile`
Expected: FAIL — `ImportError`/`AttributeError`: `get_member_workload` not defined.

- [ ] **Step 3: Write minimal implementation**

Add after `get_project` in `vernon_project/api/mobile.py`:

```python
@frappe.whitelist()
def get_member_workload(project, user, include_completed=0):
	"""One member's todos within a project. Open-only unless include_completed."""
	if project not in _visible_projects():
		frappe.throw("Not permitted", frappe.PermissionError)

	include_completed = frappe.utils.cint(include_completed)
	me = frappe.session.user
	rows = [r for r in _fetch_todos([project]) if r["assigned_to"] == user]
	name_map = _user_name_map({user})
	out = []
	for r in rows:
		skey = _status_key(r["status"])
		if not include_completed and skey == "completed":
			continue
		shaped = _shape_todo(r, me, name_map)
		out.append({
			"name": shaped["name"],
			"to_do": shaped["to_do"],
			"status": shaped["status"],
			"status_key": shaped["status_key"],
			"deadline": shaped["deadline"],
			"deadline_human": shaped["deadline_human"],
			"is_overdue": shaped["is_overdue"],
			"work_item": shaped["work_item"],
			"work_item_title": shaped["work_item_title"],
		})
	return out
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bench --site project.vernon.id run-tests --module vernon_project.api.test_mobile`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/mobile.py vernon_project/api/test_mobile.py
git commit -m "feat: add get_member_workload endpoint for per-member todos"
```

---

### Task 3: Frontend — types, api client, hook

**Files:**
- Modify: `frontend/src/lib/types.ts` (extend `TeamMember`, add `MemberTodo`)
- Modify: `frontend/src/lib/api.ts` (add `memberWorkload` to `mobileApi`)
- Modify: `frontend/src/hooks/useData.ts` (add `useMemberWorkload`)

**Interfaces:**
- Consumes: Task 1/2 backend response shapes.
- Produces:
  - `TeamMember` gains `is_owner: boolean; is_leader: boolean; is_member: boolean`.
  - `MemberTodo` interface.
  - `mobileApi.memberWorkload(project: string, user: string, includeCompleted: boolean)`.
  - `useMemberWorkload(project: string, user: string | null, includeCompleted: boolean)` React Query hook (enabled only when `user` is truthy).

- [ ] **Step 1: Extend `TeamMember` and add `MemberTodo` in `frontend/src/lib/types.ts`**

Replace the existing `TeamMember` interface (lines ~124-129) with:

```typescript
export interface TeamMember {
  user: string
  name: string
  image: string | null
  open_todos: number
  is_owner: boolean
  is_leader: boolean
  is_member: boolean
}

export interface MemberTodo {
  name: string
  to_do: string
  status: string
  status_key: string
  deadline: string | null
  deadline_human: string | null
  is_overdue: boolean
  work_item: string
  work_item_title: string
}
```

- [ ] **Step 2: Add api method in `frontend/src/lib/api.ts`**

Inside the `mobileApi` object (after the `workItem:` line ~84), add:

```typescript
  memberWorkload: (project: string, user: string, includeCompleted: boolean) =>
    api.get(M + 'get_member_workload', {
      project,
      user,
      include_completed: includeCompleted ? 1 : 0,
    }),
```

- [ ] **Step 3: Add query key + hook in `frontend/src/hooks/useData.ts`**

In the `keys` object (after `todo:` line ~26) add:

```typescript
  memberWorkload: (p: string, u: string, c: boolean) =>
    ['member-workload', p, u, c] as const,
```

Add `MemberTodo` to the type import block at the top (the `import type { ... }` list).

After `useProject` (~line 43) add:

```typescript
export const useMemberWorkload = (
  project: string,
  user: string | null,
  includeCompleted: boolean,
) =>
  useQuery({
    queryKey: keys.memberWorkload(project, user ?? '', includeCompleted),
    queryFn: () =>
      mobileApi.memberWorkload(project, user as string, includeCompleted) as Promise<MemberTodo[]>,
    enabled: !!project && !!user,
  })
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npm run build`
Expected: build succeeds (no TS errors). It is fine that nothing consumes the new hook yet.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/hooks/useData.ts
git commit -m "feat: types, api, and hook for member workload"
```

---

### Task 4: Frontend — `MemberWorkloadSheet` component

**Files:**
- Create: `frontend/src/components/MemberWorkloadSheet.tsx`

**Interfaces:**
- Consumes: `useMemberWorkload` (Task 3), `TeamMember`/`MemberTodo` (Task 3), `Avatar`/`Spinner`/`EmptyState` from `@/components/ui`.
- Produces: `export function MemberWorkloadSheet({ open, member, project, onClose }: Props)`.
  - `Props = { open: boolean; member: TeamMember | null; project: string; onClose: () => void }`.

- [ ] **Step 1: Create the component**

Create `frontend/src/components/MemberWorkloadSheet.tsx`:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, AlertCircle, CalendarDays, ChevronRight, Layers } from 'lucide-react'
import { useMemberWorkload } from '@/hooks/useData'
import { Avatar, Spinner, EmptyState } from '@/components/ui'
import type { TeamMember } from '@/lib/types'

interface Props {
  open: boolean
  member: TeamMember | null
  project: string
  onClose: () => void
}

export function MemberWorkloadSheet({ open, member, project, onClose }: Props) {
  const navigate = useNavigate()
  const [showAll, setShowAll] = useState(false)
  const { data, isLoading } = useMemberWorkload(project, open ? member?.user ?? null : null, showAll)

  if (!open || !member) return null

  const role = member.is_owner && member.is_leader
    ? 'Owner · Leader'
    : member.is_owner
      ? 'Owner'
      : member.is_leader
        ? 'Leader'
        : null

  const goto = (workItem: string) => {
    onClose()
    navigate(`/work-item/${encodeURIComponent(workItem)}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="max-h-[88vh] overflow-y-auto rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={member.name} image={member.image} size={40} />
            <div className="min-w-0">
              <p className="truncate text-base font-bold text-slate-900">{member.name}</p>
              <p className="text-xs text-slate-500">
                {role ? `${role} · ` : ''}{member.open_todos} open
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Open / All toggle */}
        <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-0.5 text-sm font-semibold">
          <button
            onClick={() => setShowAll(false)}
            className={`rounded-lg px-4 py-1.5 ${!showAll ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            Open
          </button>
          <button
            onClick={() => setShowAll(true)}
            className={`rounded-lg px-4 py-1.5 ${showAll ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            All
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner className="h-6 w-6" /></div>
        ) : data && data.length ? (
          <div className="flex flex-col gap-2">
            {data.map((t) => (
              <button
                key={t.name}
                onClick={() => goto(t.work_item)}
                className="w-full rounded-2xl border border-slate-200 p-3 text-left active:scale-[0.99]"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate font-medium text-slate-800">{t.to_do}</p>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5" /> {t.work_item_title}
                  </span>
                  {t.deadline_human && (
                    <span className={`inline-flex items-center gap-1 ${t.is_overdue ? 'font-semibold text-rose-600' : ''}`}>
                      {t.is_overdue ? <AlertCircle className="h-3.5 w-3.5" /> : <CalendarDays className="h-3.5 w-3.5" />}
                      {t.deadline_human}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState icon={Layers} title="No tasks" />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run build`
Expected: build succeeds. (Component unused so far — acceptable; build only typechecks.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/MemberWorkloadSheet.tsx
git commit -m "feat: MemberWorkloadSheet listing a member's todos"
```

---

### Task 5: Frontend — wire header, tappable team cards, fix TeamManagerSheet seeding

**Files:**
- Modify: `frontend/src/pages/ProjectDetailPage.tsx`
- Modify: `frontend/src/components/TeamManagerSheet.tsx`

**Interfaces:**
- Consumes: `MemberWorkloadSheet` (Task 4), `TeamMember` (Task 3).

- [ ] **Step 1: Add owner/leader to the hero header**

In `frontend/src/pages/ProjectDetailPage.tsx`, inside the hero meta row (the `<div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-100">` block, ~lines 63-71), add a member line before the closing `</div>`:

```tsx
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> {data.owner_name}
            {data.leader_name && data.leader_name !== data.owner_name && ` · ${data.leader_name}`}
          </span>
```

- [ ] **Step 2: Add selected-member state + import**

At the top of `ProjectDetailPage.tsx`, add the import:

```tsx
import { MemberWorkloadSheet } from '@/components/MemberWorkloadSheet'
import type { TeamMember } from '@/lib/types'
```

Add state alongside the other `useState` calls (~line 27):

```tsx
  const [workloadMember, setWorkloadMember] = useState<TeamMember | null>(null)
```

- [ ] **Step 3: Make team cards tappable + role badge**

In the Team workload section, replace the member card `<div key={m.user} ...>` (~lines 130-140) with a button carrying a role badge:

```tsx
            {data.team.map((m) => {
              const role = m.is_owner && m.is_leader ? 'Owner · Leader'
                : m.is_owner ? 'Owner' : m.is_leader ? 'Leader' : null
              return (
                <button
                  key={m.user}
                  onClick={() => setWorkloadMember(m)}
                  className="flex w-28 shrink-0 flex-col items-center gap-1.5 rounded-2xl bg-white p-3 text-center shadow-card active:scale-95"
                >
                  <Avatar name={m.name} image={m.image} size={42} />
                  <p className="w-full truncate text-xs font-medium text-slate-700">{m.name}</p>
                  {role && (
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">{role}</span>
                  )}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                    {m.open_todos} open
                  </span>
                </button>
              )
            })}
```

- [ ] **Step 4: Render the sheet**

Next to the other sheets at the bottom of the JSX (after `<TeamManagerSheet ... />`, ~line 215) add:

```tsx
      <MemberWorkloadSheet
        open={!!workloadMember}
        member={workloadMember}
        project={data.name}
        onClose={() => setWorkloadMember(null)}
      />
```

- [ ] **Step 5: Fix TeamManagerSheet seeding to formal members only**

The roster now includes non-member assignees; the manager must seed its working
copy from formal members only. In `frontend/src/components/TeamManagerSheet.tsx`,
change the seeding line inside the `useEffect` (currently
`setMembers(project.team.map((t) => t.user))`, ~line 28) to:

```tsx
      setMembers(project.team.filter((t) => t.is_member).map((t) => t.user))
```

- [ ] **Step 6: Typecheck/build**

Run: `cd frontend && npm run build`
Expected: build succeeds, no TS errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/ProjectDetailPage.tsx frontend/src/components/TeamManagerSheet.tsx
git commit -m "feat: project header owner/leader + tappable team workload cards"
```

---

### Task 6: Deploy — rebuild PWA bundle and restart backend

**Files:**
- Modify: served PWA assets / `m.html` (whatever the existing build step updates — follow the prior "build: ... PWA bundle" commits).

**Interfaces:** none (operational).

- [ ] **Step 1: Build the PWA**

Run: `cd frontend && npm run build`
Expected: build succeeds; emitted bundle hashes change.

- [ ] **Step 2: Update served bundle (mirror prior build commits)**

Follow the same step the recent `build: update served m.html to new PWA bundle hashes` commit used (copy build output to its served location / update `m.html` hashes). Inspect that commit for the exact paths: `git show 98c69f4 --stat`.

- [ ] **Step 3: Commit the build artifacts**

```bash
git add -A
git commit -m "build: rebuild PWA bundle for team workload detail"
```

- [ ] **Step 4: Restart backend so new Python loads**

This needs sudo (interactive). In the session run:
`! sudo supervisorctl restart all`
Expected: web workers restart; `get_project`/`get_member_workload` now serve new code.

- [ ] **Step 5: Manual verification**

On `project.vernon.id`, open project `⚡️ App: Vernon Project` (PRJ-2601-00002):
- Header shows owner/leader names.
- Team strip shows owner/leader (with badges) and zero-load members.
- Tap a member → sheet lists their open todos; Open/All toggle works; tapping a todo lands on its work item.

---

## Self-Review

**Spec coverage:**
- Show all team members incl zero load → Task 1.
- Header owner/leader → Task 5 Step 1.
- Clickable workload detail → Tasks 2, 3, 4, 5.
- `get_member_workload` endpoint → Task 2.
- TeamManagerSheet regression from expanded roster → Task 5 Step 5 (`is_member` filter).
- Rollout (restart + rebuild) → Task 6.

**Placeholder scan:** No TBD/TODO; all code shown in full.

**Type consistency:** `TeamMember` flags (`is_owner`/`is_leader`/`is_member`) defined in Task 3, produced by Task 1, consumed in Tasks 4-5. `MemberTodo` fields match `get_member_workload`'s return in Task 2. `useMemberWorkload(project, user|null, includeCompleted)` signature consistent between Task 3 definition and Task 4 usage.
