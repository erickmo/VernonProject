# Mobile Catalog Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Marketplace Manager / System Manager manage the reward catalog (CRUD + image upload) and fulfill redemptions from the mobile app.

**Architecture:** Reward CRUD rides the existing `/api/resource/Marketplace Reward` (admin roles already have doctype perms). Two new whitelisted endpoints in `mobile.py` — `list_redemptions` (server-resolved names, role-gated) and `upload_reward_image` (multipart file → file_url, role-gated). `bootstrap()` is extended to expose the `Marketplace Manager` role so the frontend can gate. New admin hub screen (Rewards + Redemptions via a `Segmented` switch) plus a reward form screen, reached from a Profile row.

**Tech Stack:** Frappe (Python whitelisted methods), React + TypeScript + Vite, TanStack React Query, Tailwind. Spec: `docs/superpowers/specs/2026-06-22-mobile-catalog-management-design.md`.

## Global Constraints

- **Live site, no test DB.** Verify each task manually against `project.vernon.id`. No automated tests.
- **Deploy:** no schema change → no `migrate`. Python changes (`mobile.py`) → `bench --site project.vernon.id restart` (if supervisorctl needs sudo and is unavailable, `kill -HUP <gunicorn master pid>` and confirm worker PIDs rotate). Frontend → `cd frontend && npm run build` (regenerates hashed assets under `vernon_project/public/frontend/` — commit them; also commit `vernon_project/www/m.html` if the build rewrites it).
- **No native `alert`/`confirm`/`prompt`.** Use the existing `useConfirm()` (`@/components/Confirm`) for destructive confirms and `useToast()` for feedback.
- **Access:** admin features for `Marketplace Manager` + `System Manager` only. Gate via `canManageMarketplace(boot)`; endpoints re-check the role server-side.
- **Python files use TAB indentation.** Endpoints query with `frappe.get_all`/`frappe.db.sql` and operate on `frappe.session.user`. Match existing `mobile.py` conventions.
- **Test user:** `mo@vernon.id` (site owner, has System Manager). `mo@intinusa.id` does NOT exist.
- **Reward field names** (existing doctype): `reward_name`, `point_cost` (Float), `image` (Attach Image), `description` (Small Text), `stock_quantity` (Int), `active` (Check). Redemption: `user`, `reward`, `reward_name`, `point_cost`, `status` (`Pending`/`Fulfilled`), `redeemed_on`, `fulfilled_on`, `note`.

---

## File Structure

**Backend (modify):** `vernon_project/api/mobile.py`.

**Frontend (create):**
- `frontend/src/pages/RewardFormScreen.tsx`
- `frontend/src/pages/MarketplaceAdminScreen.tsx`

**Frontend (modify):**
- `frontend/src/lib/types.ts`, `frontend/src/lib/api.ts`, `frontend/src/hooks/useData.ts`, `frontend/src/App.tsx`, `frontend/src/pages/Profile.tsx`.

---

## Task 1: Backend — role exposure + redemption list + image upload

**Files:**
- Modify: `vernon_project/api/mobile.py`

**Interfaces:**
- Produces:
  - `bootstrap()` now includes `"Marketplace Manager"` in returned `roles` when the user has it.
  - `_require_marketplace_manager()` — raises `frappe.PermissionError` unless caller has `Marketplace Manager` or `System Manager`.
  - `list_redemptions(status="all") -> [{name,user,user_name,reward_name,point_cost,status,redeemed_on,redeemed_on_human,fulfilled_on}]` (newest first; `status ∈ {pending,fulfilled,all}`).
  - `upload_reward_image() -> {file_url}` (multipart `file` field; public file).

- [ ] **Step 1: Expose the Marketplace Manager role in `bootstrap()`**

In `vernon_project/api/mobile.py`, find the `bootstrap()` role filter:
```python
	vernon_roles = [
		r
		for r in ("Project Owner", "Project Leader", "Project Admin", "Project Team", "System Manager")
		if r in roles
	]
```
Change the tuple to include `"Marketplace Manager"`:
```python
	vernon_roles = [
		r
		for r in ("Project Owner", "Project Leader", "Project Admin", "Project Team", "System Manager", "Marketplace Manager")
		if r in roles
	]
```

- [ ] **Step 2: Add the role guard + endpoints at the end of `mobile.py`**

Append (TAB indentation):
```python
# --------------------------------------------------------------------------------
# Marketplace administration — catalog CRUD rides /api/resource; these endpoints
# cover what resource access can't: server-resolved redemption listing and
# role-gated image upload. Admin = Marketplace Manager or System Manager.
# --------------------------------------------------------------------------------


def _require_marketplace_manager():
	roles = frappe.get_roles(frappe.session.user)
	if "System Manager" not in roles and "Marketplace Manager" not in roles:
		frappe.throw("Not permitted", frappe.PermissionError)


@frappe.whitelist()
def list_redemptions(status="all"):
	"""Redemptions with user full names resolved server-side, newest first.
	status in {"pending", "fulfilled", "all"}."""
	_require_marketplace_manager()

	filters = {}
	if status == "pending":
		filters["status"] = "Pending"
	elif status == "fulfilled":
		filters["status"] = "Fulfilled"

	rows = frappe.get_all(
		"Reward Redemption",
		filters=filters,
		fields=[
			"name", "user", "reward_name", "point_cost", "status",
			"redeemed_on", "fulfilled_on",
		],
		order_by="redeemed_on desc",
		limit=200,
	)
	name_map = _user_name_map([r["user"] for r in rows])
	for r in rows:
		info = name_map.get(r["user"], {})
		r["user_name"] = info.get("full_name") or r["user"]
		r["point_cost"] = float(r["point_cost"] or 0)
		r["redeemed_on_human"] = _humanize_datetime(r.get("redeemed_on"))
		r["redeemed_on"] = str(r["redeemed_on"]) if r.get("redeemed_on") else None
		r["fulfilled_on"] = str(r["fulfilled_on"]) if r.get("fulfilled_on") else None
	return rows


@frappe.whitelist()
def upload_reward_image():
	"""Save an uploaded image as a public File and return its URL. The form
	then stores the URL on the reward's `image` field like any other field."""
	_require_marketplace_manager()
	from frappe.utils.file_manager import save_file

	f = frappe.request.files.get("file")
	if not f:
		frappe.throw("No file uploaded")
	saved = save_file(f.filename, f.stream.read(), None, None, is_private=0)
	return {"file_url": saved.file_url}
```

- [ ] **Step 3: Reload Python**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id restart` (or HUP the gunicorn master and confirm worker PIDs rotate).

- [ ] **Step 4: Verify in console**

`bench --site project.vernon.id console`:
```python
import frappe, vernon_project.api.mobile as m
frappe.set_user("mo@vernon.id")
print("boot roles:", m.bootstrap()["roles"])              # System Manager present
print("all:", len(m.list_redemptions("all")))
print("pending:", len(m.list_redemptions("pending")))
print("sample:", m.list_redemptions("all")[:1])
# permission gate
frappe.set_user("Guest")
try:
    m.list_redemptions(); print("BUG: no raise")
except Exception as e:
    print("guest blocked:", type(e).__name__)
frappe.set_user("Administrator")
```
Expected: boot roles include the caller's roles; `list_redemptions("all")` ≥ `list_redemptions("pending")`; sample row (if any) carries `user_name`, `reward_name`, `point_cost`, `redeemed_on_human`; Guest is blocked. (Image upload needs an HTTP multipart request — verified via the UI in Task 3.)

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/mobile.py
git commit -m "feat(marketplace-admin): expose Marketplace Manager role + list_redemptions + upload_reward_image"
```

---

## Task 2: Frontend foundation — types, API, hooks

**Files:**
- Modify: `frontend/src/lib/types.ts`, `frontend/src/lib/api.ts`, `frontend/src/hooks/useData.ts`

**Interfaces:**
- Produces (types): `AdminReward`, `AdminRedemption`, `RewardFormPayload`.
- Produces (api): `mobileApi.listRedemptions(status)`, `uploadRewardImage(file)`.
- Produces (hooks): `canManageMarketplace(boot)`, `useRewardsAdmin()`, `useReward(name, enabled)`, `useCreateReward()`, `useUpdateReward()`, `useDeleteReward()`, `useRedemptionsAdmin(status)`, `useFulfillRedemption()`; keys `rewardsAdmin`, `rewardAdmin(name)`, `redemptionsAdmin(status)`.

- [ ] **Step 1: Add types** (append to `frontend/src/lib/types.ts`)

```typescript
export interface AdminReward {
  name: string
  reward_name: string
  point_cost: number
  stock_quantity: number
  active: 0 | 1
  image: string | null
  description?: string | null
}

export interface AdminRedemption {
  name: string
  user: string
  user_name: string
  reward_name: string
  point_cost: number
  status: 'Pending' | 'Fulfilled'
  redeemed_on: string | null
  redeemed_on_human: string | null
  fulfilled_on: string | null
}

export interface RewardFormPayload {
  reward_name: string
  point_cost: number
  stock_quantity: number
  active: 0 | 1
  description?: string
  image?: string | null
}
```

- [ ] **Step 2: Add API methods**

In `frontend/src/lib/api.ts`, add to the `mobileApi` object (after `redeemReward`):
```typescript
  listRedemptions: (status: string) => api.get(M + 'list_redemptions', { status }),
```

And add a standalone multipart upload helper (after the `mobileApi` object, near `renameDoc`). It must NOT use the JSON `request()` — it sends `FormData` with the CSRF header:
```typescript
// Multipart upload to a whitelisted method. Returns the saved file URL.
export async function uploadRewardImage(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(METHOD + 'vernon_project.api.mobile.upload_reward_image', {
    method: 'POST',
    headers: { Accept: 'application/json', 'X-Frappe-CSRF-Token': csrf() },
    body: fd,
    credentials: 'same-origin',
  })
  let data: any = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const msg = (data && (data._server_messages || data.exception || data.message)) || `Upload failed (${res.status})`
    throw new ApiError(typeof msg === 'string' ? msg : 'Upload failed', res.status)
  }
  const out = data?.message ?? data
  return out.file_url as string
}
```
(`METHOD`, `csrf`, `ApiError` already exist at the top of the file.)

- [ ] **Step 3: Add query keys** (in `keys` object in `frontend/src/hooks/useData.ts`)

```typescript
  rewardsAdmin: ['rewards-admin'] as const,
  rewardAdmin: (n: string) => ['reward-admin', n] as const,
  redemptionsAdmin: (s: string) => ['redemptions-admin', s] as const,
```

- [ ] **Step 4: Add the type imports** to the `import type { ... } from '@/lib/types'` block:

```typescript
  AdminReward,
  AdminRedemption,
  RewardFormPayload,
```

- [ ] **Step 5: Add hooks** (append to end of `frontend/src/hooks/useData.ts`)

```typescript
export function canManageMarketplace(boot: Boot | undefined): boolean {
  return !!boot && (
    boot.roles.includes('System Manager') ||
    boot.roles.includes('Marketplace Manager')
  )
}

export function useRewardsAdmin() {
  return useQuery({
    queryKey: keys.rewardsAdmin,
    queryFn: () =>
      resource.list<AdminReward[]>('Marketplace Reward', {
        fields: ['name', 'reward_name', 'point_cost', 'stock_quantity', 'active', 'image'],
        limit: 0,
      }),
  })
}

export function useReward(name: string, enabled = true) {
  return useQuery({
    queryKey: keys.rewardAdmin(name),
    queryFn: () => resource.get<AdminReward>('Marketplace Reward', name),
    enabled: !!name && enabled,
  })
}

export function useCreateReward() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: RewardFormPayload) =>
      resource.create<{ name: string }>('Marketplace Reward', payload as unknown as Record<string, unknown>),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.rewardsAdmin })
      qc.invalidateQueries({ queryKey: keys.marketplace })
    },
  })
}

export function useUpdateReward() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, payload }: { name: string; payload: RewardFormPayload }) =>
      resource.update<{ name: string }>('Marketplace Reward', name, payload as unknown as Record<string, unknown>),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: keys.rewardsAdmin })
      qc.invalidateQueries({ queryKey: keys.rewardAdmin(vars.name) })
      qc.invalidateQueries({ queryKey: keys.marketplace })
    },
  })
}

export function useDeleteReward() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => resource.remove('Marketplace Reward', name),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.rewardsAdmin })
      qc.invalidateQueries({ queryKey: keys.marketplace })
    },
  })
}

export function useRedemptionsAdmin(status: string) {
  return useQuery({
    queryKey: keys.redemptionsAdmin(status),
    queryFn: () => mobileApi.listRedemptions(status) as Promise<AdminRedemption[]>,
  })
}

export function useFulfillRedemption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      resource.update<{ name: string }>('Reward Redemption', name, { status: 'Fulfilled' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['redemptions-admin'] }),
  })
}
```

- [ ] **Step 6: Build (type-check)**

Run: `cd frontend && npm run build`
Expected: succeeds, no TS errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/hooks/useData.ts vernon_project/public/frontend vernon_project/www/m.html
git commit -m "feat(marketplace-admin): frontend types, api, and admin hooks"
```

---

## Task 3: Reward form screen + routes

**Files:**
- Create: `frontend/src/pages/RewardFormScreen.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useReward`, `useCreateReward`, `useUpdateReward`, `useDeleteReward`, `uploadRewardImage`, `useConfirm`, `useToast`, `canManageMarketplace`, `useBoot`.
- Produces: routes `/marketplace-admin/reward/new` and `/marketplace-admin/reward/:name`.

- [ ] **Step 1: Create the form screen**

```tsx
// frontend/src/pages/RewardFormScreen.tsx
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trash2, Check, ImagePlus } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { uploadRewardImage } from '@/lib/api'
import { deleteErrorMessage } from '@/lib/format'
import {
  useReward,
  useCreateReward,
  useUpdateReward,
  useDeleteReward,
  useBoot,
  canManageMarketplace,
} from '@/hooks/useData'
import type { RewardFormPayload } from '@/lib/types'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

const empty: RewardFormPayload = {
  reward_name: '',
  point_cost: 0,
  stock_quantity: 0,
  active: 1,
  description: '',
  image: null,
}

export default function RewardFormScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { name: rawName } = useParams()
  const name = rawName ? decodeURIComponent(rawName) : ''
  const isEdit = !!name
  const { data: boot } = useBoot()

  const { data: existing, isLoading } = useReward(name, isEdit)
  const create = useCreateReward()
  const update = useUpdateReward()
  const del = useDeleteReward()

  const [form, setForm] = useState<RewardFormPayload>(empty)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEdit && existing) {
      setForm({
        reward_name: existing.reward_name,
        point_cost: existing.point_cost,
        stock_quantity: existing.stock_quantity,
        active: existing.active,
        description: existing.description ?? '',
        image: existing.image ?? null,
      })
    }
  }, [isEdit, existing])

  const blocked = !boot ? false : !canManageMarketplace(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])
  if (blocked) return null

  if (isEdit && isLoading) {
    return (
      <DetailScreen title="Reward">
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setUploading(true)
    try {
      const url = await uploadRewardImage(f)
      setForm((s) => ({ ...s, image: url }))
      toast('success', 'Image uploaded')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const validate = (): string | null => {
    if (!form.reward_name.trim()) return 'Reward name is required'
    if (form.point_cost < 0) return 'Point cost must be zero or more'
    if (form.stock_quantity < 0) return 'Stock must be zero or more'
    return null
  }

  const save = () => {
    const err = validate()
    if (err) {
      toast('error', err)
      return
    }
    const payload: RewardFormPayload = {
      reward_name: form.reward_name.trim(),
      point_cost: Number(form.point_cost),
      stock_quantity: Number(form.stock_quantity),
      active: form.active,
      description: (form.description ?? '').trim(),
      image: form.image ?? null,
    }
    const opts = {
      onSuccess: () => {
        toast('success', isEdit ? 'Reward updated' : 'Reward created')
        navigate('/marketplace-admin')
      },
      onError: (e: unknown) => toast('error', (e as Error).message),
    }
    if (isEdit) update.mutate({ name, payload }, opts)
    else create.mutate(payload, opts)
  }

  const remove = async () => {
    if (!(await confirm({ title: 'Delete this reward?', confirmLabel: 'Delete', destructive: true }))) return
    del.mutate(name, {
      onSuccess: () => {
        toast('success', 'Reward deleted')
        navigate('/marketplace-admin')
      },
      onError: (e) => toast('error', deleteErrorMessage(e, 'reward')),
    })
  }

  const saving = create.isPending || update.isPending

  return (
    <DetailScreen title={isEdit ? 'Edit reward' : 'New reward'}>
      <div className="flex flex-col gap-4">
        {/* Image */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Image</label>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex h-36 w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-white text-slate-400 dark:border-slate-600 dark:bg-slate-800"
          >
            {uploading ? (
              <Spinner className="h-5 w-5" />
            ) : form.image ? (
              <img src={form.image} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-1 text-xs">
                <ImagePlus className="h-6 w-6" /> Tap to upload
              </span>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Reward name</label>
          <input
            className={field}
            value={form.reward_name}
            onChange={(e) => setForm((f) => ({ ...f, reward_name: e.target.value }))}
            placeholder="e.g. Coffee Voucher"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Point cost</label>
            <input
              type="number"
              min={0}
              className={field}
              value={form.point_cost}
              onChange={(e) => setForm((f) => ({ ...f, point_cost: Number(e.target.value) }))}
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Stock</label>
            <input
              type="number"
              min={0}
              className={field}
              value={form.stock_quantity}
              onChange={(e) => setForm((f) => ({ ...f, stock_quantity: Number(e.target.value) }))}
            />
          </div>
        </div>

        <label className="flex items-center justify-between rounded-xl bg-white px-3 py-3 shadow-card dark:bg-slate-800">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Active</span>
          <input
            type="checkbox"
            className="h-5 w-5 accent-brand-600"
            checked={form.active === 1}
            onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked ? 1 : 0 }))}
          />
        </label>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Description</label>
          <textarea
            className={field}
            rows={3}
            value={form.description ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Optional details"
          />
        </div>

        <button
          onClick={save}
          disabled={saving || uploading}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          {saving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {isEdit ? 'Save changes' : 'Create reward'}
        </button>

        {isEdit && (
          <button
            onClick={remove}
            disabled={del.isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-sm font-semibold text-rose-600 shadow-card active:bg-rose-50 disabled:opacity-60 dark:bg-slate-800 dark:active:bg-rose-500/15"
          >
            {del.isPending ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />} Delete reward
          </button>
        )}
      </div>
    </DetailScreen>
  )
}
```

- [ ] **Step 2: Register routes in `frontend/src/App.tsx`**

Add the import near other page imports:
```tsx
import RewardFormScreen from './pages/RewardFormScreen'
```
Add routes inside `<Routes>` (place near the other admin routes; gate the whole group with `canManageMarketplace`). For now, add a gated block:
```tsx
        {canManageMarketplace(boot) && (
          <>
            <Route path="/marketplace-admin/reward/new" element={<RewardFormScreen />} />
            <Route path="/marketplace-admin/reward/:name" element={<RewardFormScreen />} />
          </>
        )}
```
Add `canManageMarketplace` to the existing `import { ... } from './hooks/useData'` line in App.tsx.

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: succeeds.

- [ ] **Step 4: Verify in the app**

As `mo@vernon.id`, open `https://project.vernon.id/m/#/marketplace-admin/reward/new`. Create a reward: type a name/cost/stock, tap the image box, pick a photo → it uploads and previews, toggle Active, Save → toast + redirect (the hub route lands in Task 4; until then it may 404-redirect, which is fine). Re-open the reward via `/marketplace-admin/reward/<name>` to confirm fields + image load, edit a field, Save. Confirm Delete prompts the dialog (not native confirm).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/RewardFormScreen.tsx frontend/src/App.tsx vernon_project/public/frontend vernon_project/www/m.html
git commit -m "feat(marketplace-admin): reward create/edit form with image upload"
```

---

## Task 4: Marketplace admin hub (Rewards + Redemptions) + route

**Files:**
- Create: `frontend/src/pages/MarketplaceAdminScreen.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useRewardsAdmin`, `useRedemptionsAdmin`, `useFulfillRedemption`, `canManageMarketplace`, `useBoot`, `Segmented`, `EmptyState`, `Spinner`, `useToast`, `useConfirm`.
- Produces: route `/marketplace-admin`.

- [ ] **Step 1: Create the hub screen**

```tsx
// frontend/src/pages/MarketplaceAdminScreen.tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Store, ChevronRight, Check, Gift } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState, Segmented } from '@/components/ui'
import { useToast } from '@/components/Toast'
import {
  useBoot,
  canManageMarketplace,
  useRewardsAdmin,
  useRedemptionsAdmin,
  useFulfillRedemption,
} from '@/hooks/useData'

type Tab = 'rewards' | 'redemptions'
type RStatus = 'pending' | 'fulfilled' | 'all'

export default function MarketplaceAdminScreen() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const [tab, setTab] = useState<Tab>('rewards')

  const blocked = !boot ? false : !canManageMarketplace(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  if (bootLoading) {
    return (
      <DetailScreen title="Marketplace admin">
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }
  if (blocked) return null

  return (
    <DetailScreen
      title="Marketplace admin"
      right={
        tab === 'rewards' ? (
          <button
            onClick={() => navigate('/marketplace-admin/reward/new')}
            className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white active:scale-95"
          >
            <Plus className="h-4 w-4" /> Reward
          </button>
        ) : null
      }
    >
      <Segmented
        options={[
          { value: 'rewards', label: 'Rewards' },
          { value: 'redemptions', label: 'Redemptions' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="mt-4">{tab === 'rewards' ? <RewardsList /> : <RedemptionsList />}</div>
    </DetailScreen>
  )
}

function RewardsList() {
  const navigate = useNavigate()
  const { data: rewards, isLoading } = useRewardsAdmin()
  if (isLoading) return <Spinner className="mx-auto h-5 w-5 text-slate-400" />
  if (!(rewards ?? []).length) return <EmptyState icon={Store} title="No rewards yet" subtitle="Tap + Reward to add one." />
  return (
    <div className="flex flex-col gap-2">
      {(rewards ?? []).map((r) => (
        <button
          key={r.name}
          onClick={() => navigate(`/marketplace-admin/reward/${encodeURIComponent(r.name)}`)}
          className="flex items-center justify-between rounded-2xl bg-white p-4 text-left shadow-card active:bg-slate-50 dark:bg-slate-800 dark:active:bg-slate-700/50"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{r.reward_name}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {r.point_cost} pts · stock {r.stock_quantity}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                r.active
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
              }`}
            >
              {r.active ? 'Active' : 'Inactive'}
            </span>
            <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
          </div>
        </button>
      ))}
    </div>
  )
}

function RedemptionsList() {
  const toast = useToast()
  const [status, setStatus] = useState<RStatus>('pending')
  const { data: rows, isLoading } = useRedemptionsAdmin(status)
  const fulfill = useFulfillRedemption()

  const markFulfilled = (name: string) =>
    fulfill.mutate(name, {
      onSuccess: () => toast('success', 'Marked fulfilled'),
      onError: (e) => toast('error', e instanceof Error ? e.message : 'Could not update'),
    })

  return (
    <>
      <Segmented
        options={[
          { value: 'pending', label: 'Pending' },
          { value: 'fulfilled', label: 'Fulfilled' },
          { value: 'all', label: 'All' },
        ]}
        value={status}
        onChange={setStatus}
      />
      <div className="mt-3">
        {isLoading ? (
          <Spinner className="mx-auto h-5 w-5 text-slate-400" />
        ) : !(rows ?? []).length ? (
          <EmptyState icon={Gift} title="Nothing here" />
        ) : (
          <div className="flex flex-col gap-2">
            {(rows ?? []).map((r) => (
              <div key={r.name} className="rounded-2xl bg-white p-4 shadow-card dark:bg-slate-800">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{r.reward_name}</p>
                    <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                      {r.user_name} · {r.point_cost} pts · {r.redeemed_on_human}
                    </p>
                  </div>
                  {r.status === 'Pending' ? (
                    <button
                      onClick={() => markFulfilled(r.name)}
                      disabled={fulfill.isPending}
                      className="flex shrink-0 items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white active:scale-95 disabled:opacity-60"
                    >
                      <Check className="h-3.5 w-3.5" /> Fulfill
                    </button>
                  ) : (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                      Fulfilled
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Register the route in `frontend/src/App.tsx`**

Add the import:
```tsx
import MarketplaceAdminScreen from './pages/MarketplaceAdminScreen'
```
Add the hub route into the existing `canManageMarketplace(boot)` gated block from Task 3:
```tsx
        {canManageMarketplace(boot) && (
          <>
            <Route path="/marketplace-admin" element={<MarketplaceAdminScreen />} />
            <Route path="/marketplace-admin/reward/new" element={<RewardFormScreen />} />
            <Route path="/marketplace-admin/reward/:name" element={<RewardFormScreen />} />
          </>
        )}
```

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: succeeds.

- [ ] **Step 4: Verify in the app**

As `mo@vernon.id`, open `https://project.vernon.id/m/#/marketplace-admin`. Rewards tab lists all rewards with active/inactive badges and stock; "+ Reward" opens the form; tapping a reward edits it. Switch to Redemptions: Pending/Fulfilled/All filter works; a Pending row shows "Fulfill" → tapping it flips to Fulfilled and the list refreshes; Fulfilled rows show a badge, no button. Empty states render where appropriate.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/MarketplaceAdminScreen.tsx frontend/src/App.tsx vernon_project/public/frontend vernon_project/www/m.html
git commit -m "feat(marketplace-admin): admin hub with rewards list + redemption fulfillment"
```

---

## Task 5: Profile entry point

**Files:**
- Modify: `frontend/src/pages/Profile.tsx`

**Interfaces:**
- Consumes: `canManageMarketplace`, `useNavigate`, an icon (`Settings`).
- Produces: a "Manage Marketplace" row on the Me screen, shown to admins, linking to `/marketplace-admin`.

- [ ] **Step 1: Add the row**

In `frontend/src/pages/Profile.tsx`:
- Add `canManageMarketplace` to the existing `@/hooks/useData` import.
- Add `Settings` to the existing lucide-react import (if not present).
- In the management-rows card (the `divide-y` block that holds "Manage Groups" / "Manage Brands" / "Manage Users"), add — placed after the existing manage rows:
```tsx
            {canManageMarketplace(boot) && (
              <Row icon={Settings} label="Manage Marketplace" onClick={() => navigate('/marketplace-admin')} />
            )}
```

- [ ] **Step 2: Build**

Run: `cd frontend && npm run build`
Expected: succeeds.

- [ ] **Step 3: Verify in the app**

As an admin (`mo@vernon.id`), the Me screen shows "Manage Marketplace" → navigates to the hub. As a non-admin user, the row is absent and visiting `/marketplace-admin` redirects to `/`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Profile.tsx vernon_project/public/frontend vernon_project/www/m.html
git commit -m "feat(marketplace-admin): Manage Marketplace entry on Me screen"
```

---

## Self-Review

**Spec coverage:**
- Role exposure in bootstrap + `canManageMarketplace` gate → Task 1 + Task 2. ✓
- Reward CRUD (list/create/edit/disable/delete) → Task 2 (hooks) + Task 3 (form) + Task 4 (list). ✓
- Image upload (device → Frappe → URL on reward) → Task 1 (endpoint) + Task 2 (`uploadRewardImage`) + Task 3 (picker). ✓
- Redemption listing (server-resolved names, status filter) + fulfill → Task 1 (`list_redemptions`) + Task 2 (`useRedemptionsAdmin`/`useFulfillRedemption`) + Task 4 (UI). ✓
- Navigation: Profile row → hub with Rewards + Redemptions sections; reward form as separate route → Tasks 3, 4, 5. ✓
- Access redirect for non-admins; server-side role re-check → Task 1 (`_require_marketplace_manager`) + route gating. ✓
- No native confirm (uses `useConfirm`); empty states → Tasks 3, 4. ✓
- Pending→Fulfilled only (no un-fulfill/cancel) → Task 4 only offers Fulfill on Pending. ✓

**Type consistency:** `AdminReward` (list+get), `AdminRedemption` (list_redemptions shape), `RewardFormPayload` (create/update) defined once in Task 2 and consumed in Tasks 3–4. Hook names (`useRewardsAdmin`, `useReward`, `useCreateReward`, `useUpdateReward`, `useDeleteReward`, `useRedemptionsAdmin`, `useFulfillRedemption`) and `canManageMarketplace` match across tasks. Endpoint names (`list_redemptions`, `upload_reward_image`) match between `mobile.py` and `api.ts`.

**Placeholder scan:** No TBD/TODO; every step has complete content.

---

## Execution Notes

- Backend (Task 1) lands first; frontend (2–5) consumes it. Each task is independently committable + verifiable.
- `vernon_project/public/frontend/**` and `www/m.html` regenerate on every frontend `npm run build` — commit them with the source change that produced them (repo convention).
- Final manual pass on `project.vernon.id`: as admin, create a reward with an image, see it in the user-facing `/marketplace`, redeem it as a user, then fulfill the redemption from the admin hub.
