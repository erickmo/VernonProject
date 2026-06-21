# Mobile User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give System Managers a mobile screen to create/invite, edit, role-assign, enable/disable users and trigger password resets.

**Architecture:** Four dedicated whitelisted endpoints in `vernon_project/api/mobile.py` (each guarded by a System-Manager check) drive a full-screen list (`UsersScreen`) and a full-screen create/edit form (`UserFormScreen`), reached from a gated row on the Profile page — mirroring the existing Groups and Brands admin areas. React Query hooks in `useData.ts` wrap thin `mobileApi` client calls.

**Tech Stack:** Frappe (Python) backend, React + TypeScript + React Query + Tailwind frontend, Vite build, react-router-dom (basename `/m`).

## Global Constraints

- **Access gate:** System Manager role ONLY. Every backend endpoint re-checks `"System Manager" in frappe.get_roles(frappe.session.user)` and throws `frappe.PermissionError` otherwise. Frontend gating is convenience only.
- **Assignable roles:** exactly the 4 Vernon roles — `Project Owner`, `Project Leader`, `Project Admin`, `Project Team`. Never add/remove `System Manager` (or any non-Vernon role) via these endpoints.
- **Protected accounts:** `Guest` and `Administrator` are excluded from all listings and rejected as mutation targets.
- **No self-disable:** an endpoint must reject `enabled=0` when the target equals `frappe.session.user`.
- **No native dialogs:** confirmations use the existing `useConfirm()` dialog (`Confirm.tsx`), never `window.confirm/alert/prompt`.
- **Live site, no test DB:** per project convention, automated tests are deferred to a final phase. Each task ends with manual verification steps instead of a pytest cycle.
- **Deploy mechanics:** Python changes → `bench restart`; frontend changes → `npm run build` in `frontend/` (output served at `/m`). Schema unchanged here, so no `bench migrate`.

---

### Task 1: Backend endpoints

**Files:**
- Modify: `vernon_project/api/mobile.py` (append new endpoints near the end, after `get_form_options`)

**Interfaces:**
- Produces (dotted method paths consumed by Task 2):
  - `vernon_project.api.mobile.list_users()` → `{ users: ManagedUser[] }` where `ManagedUser = { name, full_name, enabled (0|1), user_image, last_active, roles: string[] }` (`roles` is the subset of the 4 Vernon roles the user holds).
  - `vernon_project.api.mobile.create_user(email, full_name, roles, send_welcome=1)` → `{ name }` (roles is a JSON-encoded string list).
  - `vernon_project.api.mobile.update_user(user, full_name, roles, enabled)` → `{ name }` (roles JSON-encoded string list, enabled `0|1`).
  - `vernon_project.api.mobile.reset_user_password(user)` → `{ ok: true }`

- [ ] **Step 1: Add the role constant and guard helper**

At the top of `vernon_project/api/mobile.py` (module level, near other constants), add:

```python
VERNON_ROLES = ("Project Owner", "Project Leader", "Project Admin", "Project Team")
PROTECTED_USERS = ("Guest", "Administrator")


def _require_system_manager():
	if "System Manager" not in frappe.get_roles(frappe.session.user):
		frappe.throw("Not permitted", frappe.PermissionError)
```

- [ ] **Step 2: Implement `list_users`**

Append to `vernon_project/api/mobile.py`:

```python
@frappe.whitelist()
def list_users():
	"""All manageable users with their Vernon roles (System Manager only)."""
	_require_system_manager()
	users = frappe.get_all(
		"User",
		filters={"name": ["not in", PROTECTED_USERS]},
		fields=["name", "full_name", "enabled", "user_image", "last_active"],
		limit_page_length=0,
		order_by="full_name asc",
	)
	# Map user -> their Vernon roles in one query.
	role_rows = frappe.get_all(
		"Has Role",
		filters={"parenttype": "User", "role": ["in", VERNON_ROLES]},
		fields=["parent", "role"],
		limit_page_length=0,
	)
	roles_by_user = {}
	for r in role_rows:
		roles_by_user.setdefault(r["parent"], []).append(r["role"])
	for u in users:
		u["roles"] = sorted(roles_by_user.get(u["name"], []))
	return {"users": users}
```

- [ ] **Step 3: Implement `create_user`**

```python
@frappe.whitelist()
def create_user(email, full_name=None, roles=None, send_welcome=1):
	"""Create a User and assign Vernon roles (System Manager only)."""
	_require_system_manager()
	email = (email or "").strip().lower()
	if not email:
		frappe.throw("Email is required")
	if frappe.db.exists("User", email):
		frappe.throw("A user with this email already exists")

	wanted = _clean_roles(roles)
	doc = frappe.get_doc({
		"doctype": "User",
		"email": email,
		"first_name": (full_name or email).strip(),
		"enabled": 1,
		"send_welcome_email": 1 if frappe.utils.cint(send_welcome) else 0,
	})
	doc.insert(ignore_permissions=True)
	if wanted:
		doc.add_roles(*wanted)
	return {"name": doc.name}
```

- [ ] **Step 4: Implement `update_user` and the `_clean_roles` helper**

```python
def _clean_roles(roles):
	"""Parse the incoming roles list and keep only valid Vernon roles."""
	if isinstance(roles, str):
		roles = frappe.parse_json(roles) if roles else []
	return [r for r in (roles or []) if r in VERNON_ROLES]


@frappe.whitelist()
def update_user(user, full_name=None, roles=None, enabled=1):
	"""Edit name/enabled and sync the Vernon-role set (System Manager only)."""
	_require_system_manager()
	if user in PROTECTED_USERS:
		frappe.throw("This account cannot be modified here")
	enabled = 1 if frappe.utils.cint(enabled) else 0
	if enabled == 0 and user == frappe.session.user:
		frappe.throw("You cannot disable your own account")

	doc = frappe.get_doc("User", user)
	if full_name is not None:
		doc.full_name = full_name.strip()
		# first_name drives full_name for single-field names.
		doc.first_name = full_name.strip()
	doc.enabled = enabled
	doc.save(ignore_permissions=True)

	# Sync only the Vernon-role subset; leave System Manager etc. untouched.
	wanted = set(_clean_roles(roles))
	current = {
		r.role for r in doc.get("roles") if r.role in VERNON_ROLES
	}
	to_add = wanted - current
	to_remove = current - wanted
	if to_add:
		doc.add_roles(*to_add)
	if to_remove:
		doc.remove_roles(*to_remove)
	return {"name": doc.name}
```

- [ ] **Step 5: Implement `reset_user_password`**

```python
@frappe.whitelist()
def reset_user_password(user):
	"""Send Frappe's reset-password email (System Manager only)."""
	_require_system_manager()
	if user in PROTECTED_USERS:
		frappe.throw("This account cannot be reset here")
	from frappe.core.doctype.user.user import reset_password
	reset_password(user)
	return {"ok": True}
```

- [ ] **Step 6: Restart and manually verify backend**

Run:
```bash
cd /home/frappe/frappe-bench && bench restart
```
Then, logged in as a System Manager in the desk, open the browser console on the live site and run:
```js
fetch('/api/method/vernon_project.api.mobile.list_users', {headers:{Accept:'application/json'}}).then(r=>r.json()).then(console.log)
```
Expected: JSON `{ message: { users: [...] } }` listing users with `roles` arrays, no Guest/Administrator.

Verify the gate: confirm a non-System-Manager session gets HTTP 403 for the same call. (Skip live disruptive create/reset tests until Task 5 end-to-end verification.)

- [ ] **Step 7: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/api/mobile.py
git commit -m "feat(mobile): user management backend endpoints"
```

---

### Task 2: Frontend data layer (types, API client, hooks)

**Files:**
- Modify: `frontend/src/lib/types.ts` (add user types)
- Modify: `frontend/src/lib/api.ts` (add `mobileApi` methods)
- Modify: `frontend/src/hooks/useData.ts` (add `canManageUsers`, query keys, hooks)

**Interfaces:**
- Consumes: Task 1 endpoints.
- Produces (consumed by Tasks 3 & 4):
  - Types: `ManagedUser`, `UserFormPayload`, `VERNON_ROLE_OPTIONS`.
  - `canManageUsers(boot): boolean`
  - Hooks: `useUsers()`, `useCreateUser()`, `useUpdateUser()`, `useResetUserPassword()`.

- [ ] **Step 1: Add types**

Append to `frontend/src/lib/types.ts`:

```ts
export interface ManagedUser {
  name: string
  full_name: string | null
  enabled: 0 | 1
  user_image: string | null
  last_active: string | null
  roles: string[]
}

export interface UserFormPayload {
  full_name: string
  roles: string[]
  enabled: 0 | 1
}
```

- [ ] **Step 2: Add the API client methods**

In `frontend/src/lib/api.ts`, inside the `mobileApi` object (after `formOptions`), add:

```ts
  listUsers: () => api.get<{ users: import('./types').ManagedUser[] }>(M + 'list_users'),
  createUser: (payload: {
    email: string
    full_name: string
    roles: string[]
    send_welcome: boolean
  }) =>
    api.post<{ name: string }>(M + 'create_user', {
      email: payload.email,
      full_name: payload.full_name,
      roles: JSON.stringify(payload.roles),
      send_welcome: payload.send_welcome ? 1 : 0,
    }),
  updateUser: (user: string, payload: import('./types').UserFormPayload) =>
    api.post<{ name: string }>(M + 'update_user', {
      user,
      full_name: payload.full_name,
      roles: JSON.stringify(payload.roles),
      enabled: payload.enabled,
    }),
  resetUserPassword: (user: string) =>
    api.post<{ ok: boolean }>(M + 'reset_user_password', { user }),
```

- [ ] **Step 3: Add the role-options constant, query key, and `canManageUsers`**

In `frontend/src/hooks/useData.ts`:

Add `ManagedUser` and `UserFormPayload` to the `import type { ... } from '@/lib/types'` block.

Add to the `keys` object:
```ts
  users: ['users'] as const,
```

Add (near the other `canManage*` helpers):
```ts
export function canManageUsers(boot: Boot | undefined): boolean {
  return !!boot && boot.roles.includes('System Manager')
}

// The Vernon roles assignable from the mobile user-management screen.
export const VERNON_ROLE_OPTIONS = [
  { value: 'Project Owner', label: 'Owner' },
  { value: 'Project Leader', label: 'Leader' },
  { value: 'Project Admin', label: 'Admin' },
  { value: 'Project Team', label: 'Team' },
]
```

- [ ] **Step 4: Add the hooks**

Append to `frontend/src/hooks/useData.ts`:

```ts
export function useUsers() {
  return useQuery({
    queryKey: keys.users,
    queryFn: async () => (await mobileApi.listUsers()).users as ManagedUser[],
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: {
      email: string
      full_name: string
      roles: string[]
      send_welcome: boolean
    }) => mobileApi.createUser(payload),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.users }),
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ user, payload }: { user: string; payload: UserFormPayload }) =>
      mobileApi.updateUser(user, payload),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.users }),
  })
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: (user: string) => mobileApi.resetUserPassword(user),
  })
}
```

- [ ] **Step 5: Typecheck**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```
Expected: no errors. (Unused-export warnings for the new symbols are fine — they're consumed in Tasks 3–4.)

- [ ] **Step 6: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/hooks/useData.ts
git commit -m "feat(mobile): user-management data layer (types, api, hooks)"
```

---

### Task 3: Users list screen + navigation

**Files:**
- Create: `frontend/src/pages/UsersScreen.tsx`
- Modify: `frontend/src/App.tsx` (add gated route)
- Modify: `frontend/src/pages/Profile.tsx` (add gated row)

**Interfaces:**
- Consumes: `useUsers`, `useBoot`, `canManageUsers` (Task 2).
- Produces: route `/users`; navigates to `/users/new` and `/users/:name` (form screen built in Task 4).

- [ ] **Step 1: Create `UsersScreen.tsx`**

Mirror `GroupsScreen.tsx`. Create `frontend/src/pages/UsersScreen.tsx`:

```tsx
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Users, ChevronRight } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState, Avatar } from '@/components/ui'
import { useUsers, useBoot, canManageUsers, VERNON_ROLE_OPTIONS } from '@/hooks/useData'

const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  VERNON_ROLE_OPTIONS.map((o) => [o.value, o.label]),
)

export default function UsersScreen() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const { data: users, isLoading } = useUsers()

  if (bootLoading) {
    return (
      <DetailScreen title="Users" right={null}>
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  if (!canManageUsers(boot)) return <NoAccessRedirect />

  return (
    <DetailScreen
      title="Users"
      right={
        <button
          onClick={() => navigate('/users/new')}
          className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white active:scale-95"
        >
          <Plus className="h-4 w-4" /> User
        </button>
      }
    >
      {isLoading ? (
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      ) : !(users ?? []).length ? (
        <EmptyState icon={Users} title="No users yet" />
      ) : (
        <div className="flex flex-col gap-2">
          {(users ?? []).map((u) => (
            <button
              key={u.name}
              onClick={() => navigate(`/users/${encodeURIComponent(u.name)}`)}
              className="flex items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-card active:bg-slate-50"
            >
              <Avatar name={u.full_name || u.name} src={u.user_image} className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {u.full_name || u.name}
                </p>
                <p className="truncate text-xs text-slate-500">{u.name}</p>
                {u.roles.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <span
                        key={r}
                        className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700"
                      >
                        {ROLE_LABEL[r] ?? r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {!u.enabled && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                  Disabled
                </span>
              )}
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
            </button>
          ))}
        </div>
      )}
    </DetailScreen>
  )
}

function NoAccessRedirect() {
  const navigate = useNavigate()
  useEffect(() => {
    navigate('/', { replace: true })
  }, [navigate])
  return null
}
```

Note: verify `Avatar` is exported from `@/components/ui` and accepts `name`/`src`/`className` (it is used in `TeamManagerSheet.tsx`). If its prop names differ, match the existing usage.

- [ ] **Step 2: Add the gated route in `App.tsx`**

In `frontend/src/App.tsx`, add the import near the other page imports:
```tsx
import UsersScreen from './pages/UsersScreen'
```
Add `canManageUsers` to the existing import from `./hooks/useData`:
```tsx
import { canManageGroups, canManageBrands, canManageUsers } from './hooks/useData'
```
Add the gated route block (alongside the Groups/Brands blocks, before the `/me` route):
```tsx
        {canManageUsers(boot) && (
          <>
            <Route path="/users" element={<UsersScreen />} />
            <Route path="/users/new" element={<UserFormScreen />} />
            <Route path="/users/:name" element={<UserFormScreen />} />
          </>
        )}
```
Also add the import for the form screen (created in Task 4):
```tsx
import UserFormScreen from './pages/UserFormScreen'
```
> If executing strictly task-by-task, this import will fail typecheck until Task 4 creates the file. Either create Task 4's file first, or add this import as the first step of Task 4. The `/users` list route works independently.

- [ ] **Step 3: Add the Profile row**

In `frontend/src/pages/Profile.tsx`:

Add `Users` to the `lucide-react` import. Add `canManageUsers` to the `@/hooks/useData` import. Next to the existing Manage Groups / Manage Brands rows, add:
```tsx
{canManageUsers(boot) && (
  <Row icon={Users} label="Manage Users" onClick={() => navigate('/users')} />
)}
```

- [ ] **Step 4: Build and manually verify**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
```
Expected: build succeeds. On the live site `/m`, as a System Manager: open Profile (Me tab) → tap "Manage Users" → the Users list renders with avatars, roles, and Disabled badges. Tapping a user navigates to `/users/:name` (blank/form — completed in Task 4).

- [ ] **Step 5: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/pages/UsersScreen.tsx frontend/src/App.tsx frontend/src/pages/Profile.tsx
git commit -m "feat(mobile): users list screen + profile nav entry"
```

---

### Task 4: User create/edit form screen

**Files:**
- Create: `frontend/src/pages/UserFormScreen.tsx`

**Interfaces:**
- Consumes: `useUsers`, `useCreateUser`, `useUpdateUser`, `useResetUserPassword`, `VERNON_ROLE_OPTIONS` (Task 2); `MultiSelectChips`; `useConfirm`; `useToast`; route param `:name`.
- Produces: full CRUD UI at `/users/new` and `/users/:name`.

- [ ] **Step 1: Create `UserFormScreen.tsx`**

Create `frontend/src/pages/UserFormScreen.tsx`. The screen is "new" when there is no `:name` param. In edit mode it seeds from the cached users list (avoids a second endpoint).

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { MultiSelectChips } from '@/components/MultiSelectChips'
import { useConfirm } from '@/components/Confirm'
import { useToast } from '@/components/Toast'
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useResetUserPassword,
  VERNON_ROLE_OPTIONS,
} from '@/hooks/useData'

export default function UserFormScreen() {
  const { name } = useParams<{ name: string }>()
  const isEdit = !!name
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()

  const { data: users, isLoading } = useUsers()
  const existing = useMemo(
    () => (name ? users?.find((u) => u.name === name) : undefined),
    [users, name],
  )

  const create = useCreateUser()
  const update = useUpdateUser()
  const resetPw = useResetUserPassword()

  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [roles, setRoles] = useState<string[]>([])
  const [enabled, setEnabled] = useState(true)
  const [sendWelcome, setSendWelcome] = useState(true)

  useEffect(() => {
    if (existing) {
      setFullName(existing.full_name || '')
      setRoles(existing.roles)
      setEnabled(!!existing.enabled)
    }
  }, [existing])

  const saving = create.isPending || update.isPending

  async function onSave() {
    try {
      if (isEdit) {
        await update.mutateAsync({
          user: name as string,
          payload: { full_name: fullName, roles, enabled: enabled ? 1 : 0 },
        })
        toast.show('User updated')
      } else {
        if (!email.trim()) {
          toast.show('Email is required')
          return
        }
        await create.mutateAsync({
          email: email.trim(),
          full_name: fullName.trim() || email.trim(),
          roles,
          send_welcome: sendWelcome,
        })
        toast.show('User created')
      }
      navigate('/users', { replace: true })
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Save failed')
    }
  }

  async function onResetPassword() {
    const ok = await confirm({
      title: 'Send password reset?',
      message: `A reset-password email will be sent to ${name}.`,
      confirmLabel: 'Send',
    })
    if (!ok) return
    try {
      await resetPw.mutateAsync(name as string)
      toast.show('Reset email sent')
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Failed to send')
    }
  }

  if (isEdit && isLoading) {
    return (
      <DetailScreen title="Edit User" right={null}>
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  return (
    <DetailScreen
      title={isEdit ? 'Edit User' : 'New User'}
      right={
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-full bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="block">
          <span className="text-xs font-medium text-slate-500">Email</span>
          <input
            type="email"
            value={isEdit ? (name as string) : email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isEdit}
            placeholder="name@company.com"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-500">Full name</span>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </label>

        <div>
          <span className="text-xs font-medium text-slate-500">Roles</span>
          <MultiSelectChips
            options={VERNON_ROLE_OPTIONS}
            value={roles}
            onChange={setRoles}
            emptyText="No roles"
          />
        </div>

        {!isEdit && (
          <label className="flex items-center justify-between rounded-xl bg-white p-3 shadow-card">
            <span className="text-sm text-slate-700">Send welcome email</span>
            <input
              type="checkbox"
              checked={sendWelcome}
              onChange={(e) => setSendWelcome(e.target.checked)}
              className="h-5 w-5 accent-brand-600"
            />
          </label>
        )}

        {isEdit && (
          <>
            <label className="flex items-center justify-between rounded-xl bg-white p-3 shadow-card">
              <span className="text-sm text-slate-700">Account enabled</span>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-5 w-5 accent-brand-600"
              />
            </label>
            <button
              onClick={onResetPassword}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 active:bg-slate-50"
            >
              Send password reset email
            </button>
          </>
        )}
      </div>
    </DetailScreen>
  )
}
```

Note: confirm the `useToast` API shape (`toast.show(...)`) against an existing caller such as `TeamManagerSheet.tsx`; if it exposes a different method name, match it. Likewise confirm `useConfirm` returns `Promise<boolean>` (it does — see `Confirm.tsx`).

- [ ] **Step 2: Ensure the route import resolves**

Confirm `import UserFormScreen from './pages/UserFormScreen'` and the three `/users*` routes from Task 3 are present in `App.tsx`. If Task 3's import was deferred, add it now.

- [ ] **Step 3: Typecheck and build**

Run:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit && npm run build
```
Expected: no type errors, build succeeds.

- [ ] **Step 4: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/pages/UserFormScreen.tsx frontend/src/App.tsx
git commit -m "feat(mobile): user create/edit form screen"
```

---

### Task 5: End-to-end verification + deploy

**Files:** none (verification only)

- [ ] **Step 1: Rebuild frontend and restart backend**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
cd /home/frappe/frappe-bench && bench restart
```

- [ ] **Step 2: Manual end-to-end check (as System Manager on `/m`)**

Walk the full flow and confirm each:
1. Profile → "Manage Users" visible; list loads (no Guest/Administrator).
2. Create a real test user with role "Team" + send-welcome on → welcome email arrives; user appears in the list with the Team badge.
3. Edit that user: add "Leader", remove "Team", save → badges update on the list.
4. Toggle the test user disabled → "Disabled" badge shows; re-enable.
5. Open your own account, try to disable → save returns "You cannot disable your own account".
6. "Send password reset email" → reset email arrives.
7. Confirm the System Manager role is untouched on a user that has it after a role edit (check in desk: User → Roles).

- [ ] **Step 3: Negative-access check**

In a non-System-Manager session (e.g. a Project Team user), confirm:
- "Manage Users" row is hidden on Profile.
- Direct navigation to `/m/users` redirects to `/`.
- A raw `fetch('/api/method/vernon_project.api.mobile.list_users')` returns 403.

- [ ] **Step 4: Clean up test data**

Remove or disable any throwaway test user created in Step 2 (do this in the desk to keep the live directory clean).

- [ ] **Step 5: Final commit (if any build artifacts changed)**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add vernon_project/public/frontend
git commit -m "build(mobile): user management frontend bundle" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- Access gate (System Manager only, backend re-check) → Task 1 Step 1 + Global Constraints. ✓
- Roles model (4 Vernon roles, never touch System Manager) → Task 1 Steps 3–4 (`_clean_roles`, sync logic). ✓
- `list_users` / `create_user` / `update_user` / `reset_user_password` → Task 1. ✓
- Frontend list screen, form (create+edit), role multiselect, enabled toggle, reset button → Tasks 3–4. ✓
- Hooks + api + types → Task 2. ✓
- Nav entry gated → Task 3 Steps 2–3. ✓
- Dialog confirms (no native) → Task 4 (`useConfirm`). ✓
- Guest/Administrator excluded, no self-disable → Task 1 Steps 2,4 + Global Constraints. ✓
- Tests deferred to final phase → manual verification in every task + Task 5. ✓
- Out of scope (brands/groups, bulk, SM-role editing) honored. ✓

**Deviation from spec (intentional):** the spec described a bottom-sheet (`UserFormSheet`); this plan uses a full-screen `UserFormScreen` to match the established Groups/Brands admin pattern in this codebase. Functionally equivalent; better consistency.

**Placeholder scan:** no TBD/TODO; every code step has complete code. ✓

**Type consistency:** `ManagedUser`, `UserFormPayload`, `VERNON_ROLE_OPTIONS`, `canManageUsers`, and the four hook names are defined in Task 2 and used with matching signatures in Tasks 3–4. The `roles` wire format (JSON string) is encoded in `api.ts` and parsed by `_clean_roles`. ✓
