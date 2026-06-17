# Manage Team Members Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sheet on the project detail page that lets authorized users add/remove team members and assign project roles (owner/leader/admin).

**Architecture:** New `TeamManagerSheet.tsx` React component, wired into `ProjectDetailPage.tsx` with two entry points. It reads team + role data from the already-loaded `ProjectDetail`, picks users from `useFormOptions()`, and saves a partial PATCH via the existing `useUpdateProject` mutation (`resource.update('Project', ...)`). No backend changes — server hooks in `project.py` already enforce permissions and auto-manage role/team consistency.

**Tech Stack:** React 18 + TypeScript, TanStack React Query, Vite, Tailwind, lucide-react icons.

## Global Constraints

- **No backend changes.** All persistence goes through `resource.update('Project', name, partial)` via `useUpdateProject`. Server hooks (`validate_edit_permission`, `add_owner_and_leader_to_team`, `remove_duplicate_team_members`) handle permission + consistency.
- **No test runner exists** in `frontend/` (no vitest/jest; zero frontend tests). Verification for every task = TypeScript typecheck (`npx tsc --noEmit`) + production build (`npm run build`), run from `frontend/`. A manual smoke checklist is in Task 4.
- **User picker source:** always `useFormOptions().users` (whitelisted; the raw User doctype is SM-only). Never `resource.list('User', ...)`.
- **Permission gates (frontend):** `permFlags(project, boot)` → `can_edit` (SM/owner/leader) gates the entry points; `can_reassign` (SM/owner) gates the owner/leader dropdowns.
- **Reuse existing UI primitives:** `SearchableSelect` (`@/components/SearchableSelect`), `Avatar` + `Spinner` (`@/components/ui`), `useToast` (`@/components/Toast`). Follow the sheet markup pattern in `GroupManagerSheet.tsx`.
- All paths below are absolute from repo root `/home/frappe/frappe-bench/apps/vernon_project`.

---

### Task 1: Create the `TeamManagerSheet` component

**Files:**
- Create: `frontend/src/components/TeamManagerSheet.tsx`

**Interfaces:**
- Consumes: `useFormOptions()` → `{ users: { value: string; label: string }[] }`; `useUpdateProject(name)` → mutation accepting `Partial<ProjectInput>`; `ProjectDetail` type (has `name`, `team: TeamMember[]`, `project_owner`, `project_leader`, `project_admin`).
- Produces: `export function TeamManagerSheet(props: { open: boolean; onClose: () => void; project: ProjectDetail; canReassign: boolean }): JSX.Element | null` — consumed by Task 2.

- [ ] **Step 1: Create the component file**

Create `frontend/src/components/TeamManagerSheet.tsx` with exactly this content:

```tsx
import { useEffect, useState } from 'react'
import { X, Check, Trash2, UserPlus } from 'lucide-react'
import { useFormOptions, useUpdateProject } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Avatar, Spinner } from '@/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'
import type { ProjectDetail } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  project: ProjectDetail
  /** May the user reassign owner/leader? (permFlags().can_reassign) */
  canReassign: boolean
}

export function TeamManagerSheet({ open, onClose, project, canReassign }: Props) {
  const toast = useToast()
  const { data: opts } = useFormOptions()
  const update = useUpdateProject(project.name)

  const [members, setMembers] = useState<string[]>([])
  const [owner, setOwner] = useState('')
  const [leader, setLeader] = useState('')
  const [admin, setAdmin] = useState('')

  // Seed the working copy from the loaded project each time the sheet opens.
  useEffect(() => {
    if (open) {
      setMembers(project.team.map((t) => t.user))
      setOwner(project.project_owner)
      setLeader(project.project_leader)
      setAdmin(project.project_admin ?? '')
    }
  }, [open, project])

  if (!open) return null

  const users = opts?.users ?? []

  const nameFor = (email: string) =>
    project.team.find((t) => t.user === email)?.name ??
    users.find((u) => u.value === email)?.label ??
    email
  const imageFor = (email: string) =>
    project.team.find((t) => t.user === email)?.image ?? null

  const roleOf = (email: string): string | null => {
    if (email === owner) return 'Owner'
    if (email === leader) return 'Leader'
    if (email === admin) return 'Admin'
    return null
  }

  // Assigning a role guarantees that user is in the member list (server hook
  // re-adds them anyway; keep the UI consistent up front).
  const ensureMember = (email: string) =>
    setMembers((m) => (email && !m.includes(email) ? [...m, email] : m))

  const setOwnerRole = (v: string) => { setOwner(v); ensureMember(v) }
  const setLeaderRole = (v: string) => { setLeader(v); ensureMember(v) }
  const setAdminRole = (v: string) => { setAdmin(v); ensureMember(v) }

  const addMember = (email: string) => ensureMember(email)
  const removeMember = (email: string) =>
    setMembers((m) => m.filter((u) => u !== email))

  const save = () => {
    if (!owner || !leader) {
      toast('error', 'Owner and leader are required')
      return
    }
    update.mutate(
      {
        team_members: members.map((user) => ({ user })),
        project_owner: owner,
        project_leader: leader,
        project_admin: admin || null,
      },
      {
        onSuccess: () => { toast('success', 'Team updated'); onClose() },
        onError: (e) => toast('error', (e as Error).message),
      },
    )
  }

  const addable = users.filter((u) => !members.includes(u.value))

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Manage team</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Roles */}
        <div className="mb-4 flex flex-col gap-3 rounded-xl bg-slate-50 p-3">
          <label className="text-sm font-medium text-slate-600">
            Owner<span className="text-red-500"> *</span>
            <SearchableSelect value={owner} onChange={setOwnerRole} options={users} disabled={!canReassign} placeholder="Select…" />
          </label>
          <label className="text-sm font-medium text-slate-600">
            Leader<span className="text-red-500"> *</span>
            <SearchableSelect value={leader} onChange={setLeaderRole} options={users} disabled={!canReassign} placeholder="Select…" />
          </label>
          <label className="text-sm font-medium text-slate-600">
            Admin
            <SearchableSelect value={admin} onChange={setAdminRole} options={users} allowClear placeholder="None" />
          </label>
        </div>

        {/* Add member */}
        <div className="mb-4">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-600">
            <UserPlus className="h-4 w-4" /> Add member
          </p>
          <SearchableSelect value="" onChange={addMember} options={addable} placeholder="Select user…" />
        </div>

        {/* Member list */}
        <div className="flex flex-col gap-2">
          {members.map((email) => {
            const role = roleOf(email)
            return (
              <div key={email} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={nameFor(email)} image={imageFor(email)} size={32} />
                  <span className="truncate text-sm font-medium text-slate-700">{nameFor(email)}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {role ? (
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">{role}</span>
                  ) : (
                    <button onClick={() => removeMember(email)} className="rounded-lg p-1.5 text-rose-600 active:bg-rose-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {!members.length && <p className="py-4 text-center text-sm text-slate-400">No members</p>}
        </div>

        <button onClick={save} disabled={update.isPending}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
          {update.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Save team
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: PASS — no errors. (If `Avatar` or `Spinner` import errors, confirm both are exported from `frontend/src/components/ui.tsx`; they are used by `ProjectDetailPage.tsx` and `GroupManagerSheet.tsx` respectively.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TeamManagerSheet.tsx
git commit -m "feat: add TeamManagerSheet component for project team management"
```

---

### Task 2: Wire `TeamManagerSheet` into the project detail page

**Files:**
- Modify: `frontend/src/pages/ProjectDetailPage.tsx`

**Interfaces:**
- Consumes: `TeamManagerSheet` from Task 1; existing `flags = permFlags(data, boot)` (`can_edit`, `can_reassign`); existing `data: ProjectDetail`.
- Produces: nothing downstream (terminal wiring).

- [ ] **Step 1: Add the import**

In `frontend/src/pages/ProjectDetailPage.tsx`, after the existing `GroupManagerSheet` import (line 9), add:

```tsx
import { TeamManagerSheet } from '@/components/TeamManagerSheet'
```

- [ ] **Step 2: Add the `UserPlus` icon to the lucide import**

Change the lucide-react import (line 3) from:

```tsx
import { Target, Users, CalendarDays, AlertCircle, ChevronRight, Layers, Pencil, Trash2, Plus, ListPlus } from 'lucide-react'
```

to:

```tsx
import { Target, Users, CalendarDays, AlertCircle, ChevronRight, Layers, Pencil, Trash2, Plus, ListPlus, UserPlus } from 'lucide-react'
```

- [ ] **Step 3: Add sheet open state**

After `const [groupsOpen, setGroupsOpen] = useState(false)` (line 24), add:

```tsx
  const [teamOpen, setTeamOpen] = useState(false)
```

- [ ] **Step 4: Entry point 1 — "Team" button in the top action row**

In the top action row, replace the `can_edit` Edit button block (lines 74-79) so a Team button follows the Edit button. Change:

```tsx
          {flags.can_edit && (
            <button onClick={() => setEditOpen(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white py-2 text-sm font-semibold text-slate-700 shadow-card active:scale-95">
              <Pencil className="h-4 w-4" /> Edit
            </button>
          )}
```

to:

```tsx
          {flags.can_edit && (
            <button onClick={() => setEditOpen(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white py-2 text-sm font-semibold text-slate-700 shadow-card active:scale-95">
              <Pencil className="h-4 w-4" /> Edit
            </button>
          )}
          {flags.can_edit && (
            <button onClick={() => setTeamOpen(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white py-2 text-sm font-semibold text-slate-700 shadow-card active:scale-95">
              <Users className="h-4 w-4" /> Team
            </button>
          )}
```

- [ ] **Step 5: Entry point 2 — "Manage" button on the Team workload header**

Replace the Team workload section header (lines 110-112). Change:

```tsx
          <h3 className="mb-2 flex items-center gap-1.5 px-1 text-sm font-semibold text-slate-500">
            <Users className="h-4 w-4" /> Team workload
          </h3>
```

to:

```tsx
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-500">
              <Users className="h-4 w-4" /> Team workload
            </h3>
            {flags.can_edit && (
              <button onClick={() => setTeamOpen(true)}
                className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 active:scale-95">
                <UserPlus className="h-3.5 w-3.5" /> Manage
              </button>
            )}
          </div>
```

- [ ] **Step 6: Render the sheet**

After the `GroupManagerSheet` render line (line 193), add:

```tsx
      <TeamManagerSheet
        open={teamOpen}
        onClose={() => setTeamOpen(false)}
        project={data}
        canReassign={flags.can_reassign}
      />
```

- [ ] **Step 7: Typecheck**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: PASS — no errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/ProjectDetailPage.tsx
git commit -m "feat: wire TeamManagerSheet into project detail page (two entry points)"
```

---

### Task 3: Build the PWA bundle

**Files:**
- Modify: `vernon_project/public/frontend/**` (generated build output)

**Interfaces:**
- Consumes: Tasks 1–2 source. Produces: shipped bundle.

- [ ] **Step 1: Production build**

Run (from `frontend/`): `npm run build`
Expected: build succeeds, no TypeScript/Vite errors, output written under `../vernon_project/public/frontend` and HTML copied.

- [ ] **Step 2: Commit the rebuilt bundle**

```bash
git add vernon_project/public/frontend
git commit -m "build: rebuild PWA bundle for manage team members"
```

---

### Task 4: Manual smoke verification

No automated test harness exists, so verify behavior manually in the running app (`/m` route). Walk the checklist; all must hold.

- [ ] **Owner account:** Open a project detail page → both entry points visible ("Team" button in the top action row + "Manage" on the Team workload header).
- [ ] **Owner:** Open the sheet → roles prefilled (owner/leader/admin), member list shows all team members; owner/leader/admin rows show a role badge and have no trash icon; plain members have a trash icon.
- [ ] **Owner:** Add a user via "Add member" → appears in the list; the same user is removed from the add picker. Remove a plain member → row disappears. Save → toast "Team updated", sheet closes, Team workload section refreshes with the new roster.
- [ ] **Owner:** Reassign leader to another user → save succeeds; the new leader gains a role badge and cannot be removed.
- [ ] **Leader account:** Entry points visible; owner/leader dropdowns are disabled (greyed); admin dropdown + member add/remove work; save succeeds.
- [ ] **Plain member / non-privileged account:** Neither entry point is shown.
- [ ] **Attempt to remove owner:** No trash control present on the owner row (locked).
- [ ] Confirm no console errors during the above.

---

## Notes for the implementer

- The server `before_save` hook re-adds owner/leader/admin to `team_members` and dedupes, so the UI's "ensureMember on role change" and "no remove on role rows" rules mirror server behavior — they prevent confusing round-trips, not security gaps.
- `useUpdateProject` already invalidates `['project', name]` and `['projects']`, so the page refreshes automatically after save. No extra query wiring needed.
- A Leader who somehow changes owner/leader will get a server `PermissionError` surfaced via the error toast — the disabled dropdowns make this a safety net, not the normal path.
