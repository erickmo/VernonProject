# Groups Management UI (Mobile) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manager-gated mobile UI to manage the global scoring `Group` doctype (name, description, six weight %, and a levels list) with full create/edit/delete.

**Architecture:** Frontend-only React (Vite) app under `frontend/`. New data types + React Query hooks talk to the existing generic `/api/resource/Group` helper (which carries the `levels` child table). Two new screens (`/groups` list, `/groups/:name` + `/groups/new` form) reachable from a Profile entry; both the entry and the routes are gated by a `canManageGroups(boot)` role check. The backend already enforces write permission (Group Manager / System Manager), so no server changes.

**Tech Stack:** React 18, react-router-dom, @tanstack/react-query, TypeScript, Tailwind, lucide-react, Vite.

## Global Constraints

- Frontend dir: `/home/frappe/frappe-bench/apps/vernon_project/frontend`. All paths below are relative to `frontend/`.
- CODE-FIRST / LIVE site: each task verifies with `npx tsc --noEmit` (typecheck). The FINAL task runs `npm run build`. No live deploy until the final task (controller/human handles asset copy + smoke on project.vernon.id).
- Access rule (verbatim): a "manager" is a user whose `boot.roles` includes `'System Manager'` OR `'Group Manager'`. Only managers see the entry and may reach the routes.
- The new hooks/types use a `ScoringGroup` name prefix to avoid colliding with the existing Glossary `Group`/`useGroups` (which manage the per-project grouping and are OUT OF SCOPE — do not modify them).
- `group_name` is the doc identity (field-based autoname); it is editable on create, READ-ONLY on edit.
- Weights are percentages; no clamping (negatives permitted), matching the backend. Level `point` must be a number ≥ 0; `level_name` non-empty.
- Existing idioms to match: `DetailScreen{title, children, right?}` (from `components/Layout`, has built-in back), `useToast()` → `toast('success'|'error'|'info', msg)`, `Spinner`/`EmptyState` (from `components/ui`), `resource` helper (from `lib/api`), React Query `useQuery`/`useMutation`/`useQueryClient`.

---

### Task 1: Data layer — types, access helper, hooks

**Files:**
- Modify: `src/lib/types.ts` (append `GroupLevel`, `ScoringGroup`)
- Modify: `src/hooks/useData.ts` (add `canManageGroups` + five hooks + query keys)

**Interfaces:**
- Produces:
  - `interface GroupLevel { name?: string; level_name: string; point: number }`
  - `interface ScoringGroup { name: string; group_name: string; description?: string; weight: number; late_penalty: number; early_bonus: number; leader_weight: number; leader_late_penalty: number; leader_early_bonus: number; levels: GroupLevel[] }`
  - `canManageGroups(boot: Boot | undefined): boolean`
  - `useScoringGroups(): UseQueryResult<ScoringGroup[]>`
  - `useScoringGroup(name: string, enabled?: boolean): UseQueryResult<ScoringGroup>`
  - `useCreateScoringGroup()` → mutation, `mutationFn(payload: ScoringGroupPayload)`
  - `useUpdateScoringGroup()` → mutation, `mutationFn({ name, payload })`
  - `useDeleteScoringGroup()` → mutation, `mutationFn(name: string)`
  - `type ScoringGroupPayload = { group_name: string; description?: string; weight: number; late_penalty: number; early_bonus: number; leader_weight: number; leader_late_penalty: number; leader_early_bonus: number; levels: { level_name: string; point: number }[] }`

- [ ] **Step 1: Add the types**

Append to `src/lib/types.ts`:
```ts
export interface GroupLevel {
  name?: string
  level_name: string
  point: number
}

export interface ScoringGroup {
  name: string
  group_name: string
  description?: string
  weight: number
  late_penalty: number
  early_bonus: number
  leader_weight: number
  leader_late_penalty: number
  leader_early_bonus: number
  levels: GroupLevel[]
}

export interface ScoringGroupPayload {
  group_name: string
  description?: string
  weight: number
  late_penalty: number
  early_bonus: number
  leader_weight: number
  leader_late_penalty: number
  leader_early_bonus: number
  levels: { level_name: string; point: number }[]
}
```

- [ ] **Step 2: Import the new types + add query keys in `useData.ts`**

In `src/hooks/useData.ts`, add to the existing `import type { ... } from '@/lib/types'` block these names: `ScoringGroup`, `ScoringGroupPayload`.

Then add to the `keys` object (after `memberWorkload`):
```ts
  scoringGroups: ['scoring-groups'] as const,
  scoringGroup: (n: string) => ['scoring-group', n] as const,
```

- [ ] **Step 3: Add the access helper**

Add near the other access helpers (e.g. just after `canCreateProject`) in `src/hooks/useData.ts`:
```ts
export function canManageGroups(boot: Boot | undefined): boolean {
  return !!boot && (
    boot.roles.includes('System Manager') ||
    boot.roles.includes('Group Manager')
  )
}
```

- [ ] **Step 4: Add the read hooks**

Append to `src/hooks/useData.ts`:
```ts
export function useScoringGroups() {
  return useQuery({
    queryKey: keys.scoringGroups,
    queryFn: () =>
      resource.list<ScoringGroup[]>('Group', {
        fields: ['name', 'group_name', 'description', 'weight', 'leader_weight'],
        limit: 0,
      }),
  })
}

export function useScoringGroup(name: string, enabled = true) {
  return useQuery({
    queryKey: keys.scoringGroup(name),
    queryFn: () => resource.get<ScoringGroup>('Group', name),
    enabled: !!name && enabled,
  })
}
```

- [ ] **Step 5: Add the mutation hooks**

Append to `src/hooks/useData.ts`:
```ts
export function useCreateScoringGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ScoringGroupPayload) =>
      resource.create<{ name: string }>('Group', payload),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.scoringGroups })
    },
  })
}

export function useUpdateScoringGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, payload }: { name: string; payload: ScoringGroupPayload }) =>
      resource.update<{ name: string }>('Group', name, payload),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: keys.scoringGroups })
      qc.invalidateQueries({ queryKey: keys.scoringGroup(vars.name) })
    },
  })
}

export function useDeleteScoringGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => resource.remove('Group', name),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.scoringGroups })
    },
  })
}
```

- [ ] **Step 6: Typecheck**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```
Expected: no errors. (The new symbols are exported but not yet consumed — that is fine; `tsc --noEmit` does not flag unused exports.)

- [ ] **Step 7: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/lib/types.ts frontend/src/hooks/useData.ts
git commit -m "feat(mobile): data layer for scoring Group management"
```

---

### Task 2: GroupsScreen (list)

**Files:**
- Create: `src/pages/GroupsScreen.tsx`

**Interfaces:**
- Consumes: `useScoringGroups`, `canManageGroups`, `useBoot` (Task 1); `DetailScreen` (Layout); `Spinner`, `EmptyState` (ui).
- Produces: default export `GroupsScreen` (rendered at `/groups` in Task 4).

- [ ] **Step 1: Create the screen**

`src/pages/GroupsScreen.tsx`:
```tsx
import { useNavigate } from 'react-router-dom'
import { Plus, Trophy, ChevronRight, Layers } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useScoringGroups, useBoot, canManageGroups } from '@/hooks/useData'

export default function GroupsScreen() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const { data: groups, isLoading } = useScoringGroups()

  if (!canManageGroups(boot)) return <NoAccessRedirect />

  return (
    <DetailScreen
      title="Groups"
      right={
        <button
          onClick={() => navigate('/groups/new')}
          className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white active:scale-95"
        >
          <Plus className="h-4 w-4" /> Group
        </button>
      }
    >
      {isLoading ? (
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      ) : !(groups ?? []).length ? (
        <EmptyState icon={Trophy} title="No groups yet" />
      ) : (
        <div className="flex flex-col gap-2">
          {(groups ?? []).map((g) => (
            <button
              key={g.name}
              onClick={() => navigate(`/groups/${encodeURIComponent(g.name)}`)}
              className="flex items-center justify-between rounded-2xl bg-white p-4 text-left shadow-card active:bg-slate-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">{g.group_name}</p>
                {g.description && (
                  <p className="truncate text-xs text-slate-500">{g.description}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                  <Layers className="h-3 w-3" /> {g.weight}%
                </span>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </div>
            </button>
          ))}
        </div>
      )}
    </DetailScreen>
  )
}

function NoAccessRedirect() {
  const navigate = useNavigate()
  navigate('/', { replace: true })
  return null
}
```

Note: `NoAccessRedirect` calling `navigate` during render is acceptable here as a
last-resort guard; the primary guard is the route-level gate in Task 4, so this
branch is only hit if a non-manager forces the route. If `tsc` or React warns about
navigating during render, wrap it in `useEffect(() => navigate('/', { replace: true }), [])`
and return `null`.

- [ ] **Step 2: Typecheck**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/pages/GroupsScreen.tsx
git commit -m "feat(mobile): Groups list screen"
```

---

### Task 3: GroupFormScreen (create / edit / delete)

**Files:**
- Create: `src/pages/GroupFormScreen.tsx`

**Interfaces:**
- Consumes: `useScoringGroup`, `useCreateScoringGroup`, `useUpdateScoringGroup`, `useDeleteScoringGroup`, `useBoot`, `canManageGroups` (Task 1); `DetailScreen` (Layout); `Spinner` (ui); `useToast` (Toast); `ScoringGroupPayload`, `GroupLevel` (types).
- Produces: default export `GroupFormScreen` (rendered at `/groups/new` and `/groups/:name` in Task 4).

- [ ] **Step 1: Create the form screen**

`src/pages/GroupFormScreen.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2, Check } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import {
  useScoringGroup,
  useCreateScoringGroup,
  useUpdateScoringGroup,
  useDeleteScoringGroup,
  useBoot,
  canManageGroups,
} from '@/hooks/useData'
import type { GroupLevel, ScoringGroupPayload } from '@/lib/types'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none'

const WEIGHTS: { key: keyof ScoringGroupPayload; label: string; group: 'Assignee' | 'Leader' }[] = [
  { key: 'weight', label: 'Weight %', group: 'Assignee' },
  { key: 'late_penalty', label: 'Late penalty % / day', group: 'Assignee' },
  { key: 'early_bonus', label: 'Early bonus % / day', group: 'Assignee' },
  { key: 'leader_weight', label: 'Leader weight %', group: 'Leader' },
  { key: 'leader_late_penalty', label: 'Leader late penalty % / day', group: 'Leader' },
  { key: 'leader_early_bonus', label: 'Leader early bonus % / day', group: 'Leader' },
]

export default function GroupFormScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const { name: rawName } = useParams()
  const name = rawName ? decodeURIComponent(rawName) : ''
  const isEdit = !!name
  const { data: boot } = useBoot()

  const { data: existing, isLoading } = useScoringGroup(name, isEdit)
  const create = useCreateScoringGroup()
  const update = useUpdateScoringGroup()
  const del = useDeleteScoringGroup()

  const [form, setForm] = useState<ScoringGroupPayload>({
    group_name: '',
    description: '',
    weight: 100,
    late_penalty: 0,
    early_bonus: 0,
    leader_weight: 0,
    leader_late_penalty: 0,
    leader_early_bonus: 0,
    levels: [],
  })

  useEffect(() => {
    if (isEdit && existing) {
      setForm({
        group_name: existing.group_name,
        description: existing.description ?? '',
        weight: existing.weight ?? 0,
        late_penalty: existing.late_penalty ?? 0,
        early_bonus: existing.early_bonus ?? 0,
        leader_weight: existing.leader_weight ?? 0,
        leader_late_penalty: existing.leader_late_penalty ?? 0,
        leader_early_bonus: existing.leader_early_bonus ?? 0,
        levels: (existing.levels ?? []).map((l: GroupLevel) => ({
          level_name: l.level_name,
          point: l.point,
        })),
      })
    }
  }, [isEdit, existing])

  if (!canManageGroups(boot)) {
    navigate('/', { replace: true })
    return null
  }
  if (isEdit && isLoading) {
    return (
      <DetailScreen title="Group">
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  const setNum = (key: keyof ScoringGroupPayload, v: string) =>
    setForm((f) => ({ ...f, [key]: v === '' ? 0 : Number(v) }))

  const setLevel = (i: number, patch: Partial<{ level_name: string; point: number }>) =>
    setForm((f) => ({
      ...f,
      levels: f.levels.map((l, j) => (j === i ? { ...l, ...patch } : l)),
    }))

  const addLevel = () =>
    setForm((f) => ({ ...f, levels: [...f.levels, { level_name: '', point: 0 }] }))

  const removeLevel = (i: number) =>
    setForm((f) => ({ ...f, levels: f.levels.filter((_, j) => j !== i) }))

  const validate = (): string | null => {
    if (!form.group_name.trim()) return 'Group name is required'
    for (const l of form.levels) {
      if (!l.level_name.trim()) return 'Every level needs a name'
      if (!(typeof l.point === 'number') || isNaN(l.point) || l.point < 0)
        return 'Level points must be a number ≥ 0'
    }
    return null
  }

  const save = () => {
    const err = validate()
    if (err) {
      toast('error', err)
      return
    }
    const payload: ScoringGroupPayload = {
      ...form,
      group_name: form.group_name.trim(),
      description: (form.description ?? '').trim(),
      levels: form.levels.map((l) => ({ level_name: l.level_name.trim(), point: Number(l.point) })),
    }
    const opts = {
      onSuccess: () => {
        toast('success', isEdit ? 'Group updated' : 'Group created')
        navigate('/groups')
      },
      onError: (e: unknown) => toast('error', (e as Error).message),
    }
    if (isEdit) update.mutate({ name, payload }, opts)
    else create.mutate(payload, opts)
  }

  const remove = () => {
    if (!confirm('Delete this group?')) return
    del.mutate(name, {
      onSuccess: () => {
        toast('success', 'Group deleted')
        navigate('/groups')
      },
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  const saving = create.isPending || update.isPending

  return (
    <DetailScreen title={isEdit ? 'Edit group' : 'New group'}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Group name</label>
          <input
            className={field + (isEdit ? ' bg-slate-100 text-slate-500' : '')}
            value={form.group_name}
            readOnly={isEdit}
            onChange={(e) => setForm((f) => ({ ...f, group_name: e.target.value }))}
            placeholder="e.g. Frontend"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Description</label>
          <textarea
            className={field}
            rows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>

        {(['Assignee', 'Leader'] as const).map((grp) => (
          <div key={grp} className="rounded-2xl bg-slate-50 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{grp}</p>
            <div className="flex flex-col gap-2">
              {WEIGHTS.filter((w) => w.group === grp).map((w) => (
                <div key={w.key} className="flex items-center gap-2">
                  <label className="flex-1 text-sm text-slate-600">{w.label}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    className={field + ' w-24'}
                    value={String(form[w.key] as number)}
                    onChange={(e) => setNum(w.key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="rounded-2xl bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Levels</p>
            <button
              onClick={addLevel}
              className="flex items-center gap-1 rounded-lg bg-brand-600 px-2 py-1 text-xs font-semibold text-white active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" /> Add level
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {form.levels.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className={field + ' flex-1'}
                  value={l.level_name}
                  onChange={(e) => setLevel(i, { level_name: e.target.value })}
                  placeholder="Level name"
                />
                <input
                  type="number"
                  inputMode="decimal"
                  className={field + ' w-20'}
                  value={String(l.point)}
                  onChange={(e) => setLevel(i, { point: e.target.value === '' ? 0 : Number(e.target.value) })}
                  placeholder="Point"
                />
                <button
                  onClick={() => removeLevel(i)}
                  className="rounded-lg p-1.5 text-rose-600 active:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {!form.levels.length && (
              <p className="py-2 text-center text-xs text-slate-400">No levels — add at least one to score todos.</p>
            )}
          </div>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          {saving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {isEdit ? 'Save changes' : 'Create group'}
        </button>

        {isEdit && (
          <button
            onClick={remove}
            disabled={del.isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-sm font-semibold text-rose-600 shadow-card active:bg-rose-50 disabled:opacity-60"
          >
            {del.isPending ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />} Delete group
          </button>
        )}
      </div>
    </DetailScreen>
  )
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/pages/GroupFormScreen.tsx
git commit -m "feat(mobile): Group create/edit/delete form screen"
```

---

### Task 4: Wire routes + Profile entry, build

**Files:**
- Modify: `src/App.tsx` (import screens + `canManageGroups`/`useBoot` already imported; add guarded routes)
- Modify: `src/pages/Profile.tsx` (add gated "Manage Groups" row)

**Interfaces:**
- Consumes: `GroupsScreen`, `GroupFormScreen` (Tasks 2-3); `canManageGroups` (Task 1).
- Produces: reachable `/groups`, `/groups/new`, `/groups/:name` routes (managers only) and a Profile entry.

- [ ] **Step 1: Add routes to `App.tsx`**

In `src/App.tsx`, add imports near the other page imports:
```tsx
import GroupsScreen from './pages/GroupsScreen'
import GroupFormScreen from './pages/GroupFormScreen'
import { canManageGroups } from './hooks/useData'
```
(`useBoot` is already imported.)

Inside the `<Routes>` block, immediately before the `/me` route, add (note: `/groups/new` must come before `/groups/:name` so "new" isn't captured as a name):
```tsx
        {canManageGroups(boot) && (
          <>
            <Route path="/groups" element={<GroupsScreen />} />
            <Route path="/groups/new" element={<GroupFormScreen />} />
            <Route path="/groups/:name" element={<GroupFormScreen />} />
          </>
        )}
```
A non-manager `boot` renders no `/groups*` routes, so those URLs fall through to the existing `<Route path="*" element={<Navigate to="/" replace />} />`.

- [ ] **Step 2: Add the gated entry to `Profile.tsx`**

In `src/pages/Profile.tsx`:
- Add `useNavigate` to the existing `react-router-dom` import is not present — add a new import line:
  ```tsx
  import { useNavigate } from 'react-router-dom'
  ```
- Add `Trophy` to the existing `lucide-react` import line.
- Add `canManageGroups` to the existing `'@/hooks/useData'` import (currently `import { useBoot } from '@/hooks/useData'` → `import { useBoot, canManageGroups } from '@/hooks/useData'`).
- Inside `export default function Profile(...)`, after `const toast = useToast()`, add:
  ```tsx
  const navigate = useNavigate()
  ```
- In the settings card `<div className="mt-3 divide-y ...">`, add as the first `Row` (before "Refresh data"):
  ```tsx
            {canManageGroups(boot) && (
              <Row icon={Trophy} label="Manage Groups" onClick={() => navigate('/groups')} />
            )}
  ```

- [ ] **Step 3: Typecheck**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Production build**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
```
Expected: vite build completes and `npm run copy-html` runs without error.

- [ ] **Step 5: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/App.tsx frontend/src/pages/Profile.tsx frontend/dist 2>/dev/null; git add -A frontend
git commit -m "feat(mobile): route + Profile entry for Groups management"
```
(Whether built assets under `frontend/` are tracked depends on repo convention — match how prior frontend commits handled `dist`/built output. If built output is git-ignored, the `git add -A frontend` simply stages the two source files.)

---

## Self-Review

**Spec coverage:**
- Access rule `canManageGroups` (SM || Group Manager) → Task 1 Step 3; used in Tasks 2, 3, 4. ✓
- Entry on Profile, gated → Task 4 Step 2. ✓
- `/groups` list screen → Task 2. ✓
- `/groups/new` + `/groups/:name` form, full weights + levels editor, create/edit/delete → Task 3. ✓
- `group_name` read-only on edit → Task 3 (input `readOnly={isEdit}`). ✓
- Data types + 5 hooks via `resource`, distinct `ScoringGroup` naming → Task 1. ✓
- Route guard + redirect for non-managers → Task 4 Step 1 (no routes rendered) + per-screen redirect guard (Tasks 2, 3). ✓
- Validation (name required, level name non-empty, point ≥ 0) + toasts on error → Task 3 `validate`/`save`. ✓
- Old Glossary grouping UI untouched → no task modifies `GroupManagerSheet`/`useGroups`. ✓
- Testing: tsc per task, build final → Steps in every task. ✓

**Placeholder scan:** No TBD/TODO; every code step is complete. ✓

**Type consistency:** `ScoringGroup`, `ScoringGroupPayload`, `GroupLevel`, `canManageGroups`, `useScoringGroups`, `useScoringGroup`, `useCreateScoringGroup`, `useUpdateScoringGroup`, `useDeleteScoringGroup`, query keys `scoringGroups`/`scoringGroup(n)` — used identically across Tasks 1–4. The update hook's `mutationFn` takes `{ name, payload }`; Task 3 calls `update.mutate({ name, payload }, opts)` — consistent. ✓

**Manual smoke (final, controller/human, on project.vernon.id after deploy):**
1. As `mo@vernon.id`: Profile shows "Manage Groups"; create a group with 2 levels + weights; edit weights; delete.
2. As a non-manager: no "Manage Groups" row; visiting `/groups` redirects to `/`.
3. Confirm a created group is selectable as `group` on a Project Todo with its levels driving `point`.

**Known follow-up (out of scope):** removing the legacy per-project Glossary grouping UI once detail-creation no longer needs it.
