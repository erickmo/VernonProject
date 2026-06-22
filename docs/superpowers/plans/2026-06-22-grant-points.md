# Grant Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authorized user (System Manager or new "Points Granter" role) manually grant points to any user; granted points add to the recipient's wallet balance but never affect leaderboard rank. Entry point is a link on the Me/Profile page.

**Architecture:** Reuse the existing `Point Ledger` DocType for grant rows, tagged `source="Grant"` (existing earned rows read as `Todo` via `coalesce`). Wallet/balance queries already sum all ledger rows, so grants count automatically; the leaderboard query gains one WHERE clause to exclude grants. A role-gated whitelisted API issues grants; a React screen reached from Profile drives it.

**Tech Stack:** Frappe (Python backend, DocType JSON, patches), React + TypeScript + TanStack Query (frontend), Tailwind.

## Global Constraints

- Single LIVE site `project.vernon.id`, no test DB — verification is manual via `bench --site project.vernon.id console` and the live UI, not pytest.
- Deploy: `bench migrate` (schema + role patch) → `bench restart` (Python) → frontend `npm run build`.
- No native `alert/confirm/prompt` in frontend — use toast/dialog.
- Granted points: positive amounts only (`> 0`); no daily cap.
- House role gate pattern mirrors `_require_marketplace_manager()` (mobile.py:1639).

---

### Task 1: Point Ledger schema + "Points Granter" role

**Files:**
- Modify: `vernon_project/vernon_project/doctype/point_ledger/point_ledger.json`
- Create: `vernon_project/patches/v1_0/add_points_granter_role.py`
- Modify: `vernon_project/patches.txt`

**Interfaces:**
- Produces: Point Ledger fields `source` (Select `Todo`/`Grant`, default `Todo`), `note` (Small Text), `granted_by` (Link User). `todo` and `role` become optional. Role `Points Granter` exists in DB.

- [ ] **Step 1: Edit point_ledger.json — field_order**

Replace the `field_order` array so the three new fields are appended:

```json
 "field_order": [
  "user", "role", "todo", "column_break_a",
  "group", "project", "level_name", "section_break_b",
  "point", "late_days", "early_days", "column_break_c",
  "points_earned", "credited_on", "source", "note", "granted_by"
 ],
```

- [ ] **Step 2: Edit point_ledger.json — relax reqd on todo and role**

Change the `role` field line to drop `"reqd": 1`:

```json
  {"fieldname": "role", "fieldtype": "Select", "label": "Role", "options": "Assignee\nLeader", "in_list_view": 1},
```

Change the `todo` field line to drop `"reqd": 1`:

```json
  {"fieldname": "todo", "fieldtype": "Link", "label": "Todo", "options": "Project Todo", "search_index": 1},
```

- [ ] **Step 3: Edit point_ledger.json — add the three new field defs**

Insert these three objects into the `fields` array, immediately after the `credited_on` field object:

```json
  {"fieldname": "source", "fieldtype": "Select", "label": "Source", "options": "Todo\nGrant", "default": "Todo", "in_list_view": 1},
  {"fieldname": "note", "fieldtype": "Small Text", "label": "Note"},
  {"fieldname": "granted_by", "fieldtype": "Link", "label": "Granted By", "options": "User"},
```

- [ ] **Step 4: Edit point_ledger.json — add Points Granter permission row**

Add this object to the `permissions` array (after the System Manager row):

```json
  {"role": "Points Granter", "create": 1, "read": 1, "report": 1, "export": 1, "print": 1},
```

- [ ] **Step 5: Create the role-seed patch**

Create `vernon_project/patches/v1_0/add_points_granter_role.py`:

```python
import frappe

GRANTER = "Points Granter"


def execute():
	"""Create the Points Granter role (mobile-only). Idempotent."""
	if not frappe.db.exists("Role", GRANTER):
		frappe.get_doc({
			"doctype": "Role",
			"role_name": GRANTER,
			"desk_access": 0,
		}).insert(ignore_permissions=True)
	frappe.db.commit()
```

- [ ] **Step 6: Register the patch**

In `vernon_project/patches.txt`, append under `[post_model_sync]` (after the `setup_groups_and_points` line):

```
vernon_project.patches.v1_0.add_points_granter_role
```

- [ ] **Step 7: Apply and verify**

Run: `cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate`
Expected: migrate completes, runs `add_points_granter_role`, no errors.

Verify role + fields:

```bash
bench --site project.vernon.id console <<'PY'
import frappe
print("role:", frappe.db.exists("Role", "Points Granter"))
meta = frappe.get_meta("Point Ledger")
print("fields:", [f.fieldname for f in meta.fields if f.fieldname in ("source","note","granted_by")])
print("todo reqd:", meta.get_field("todo").reqd, "role reqd:", meta.get_field("role").reqd)
PY
```
Expected: `role: Points Granter`, `fields: ['source', 'note', 'granted_by']`, `todo reqd: 0 role reqd: 0`.

- [ ] **Step 8: Commit**

```bash
git add vernon_project/vernon_project/doctype/point_ledger/point_ledger.json vernon_project/patches/v1_0/add_points_granter_role.py vernon_project/patches.txt
git commit -m "feat(points): Point Ledger grant fields + Points Granter role"
```

---

### Task 2: Backend grant API

**Files:**
- Modify: `vernon_project/api/mobile.py` (gate + two endpoints; `VERNON_ROLES` constant at :20)

**Interfaces:**
- Consumes: `Point Ledger` fields and role from Task 1; `_user_balance()` (mobile.py:1379); `PROTECTED_USERS` (mobile.py:21).
- Produces: `grant_points(user, amount, note=None) -> {"balance": float, "granted": float}`; `list_grant_users() -> {"users": [{"name","full_name","user_image"}]}`; gate `_require_points_granter()`.

- [ ] **Step 1: Add Points Granter to VERNON_ROLES**

Change line 20 so the role is assignable through Manage Users:

```python
VERNON_ROLES = ("Project Owner", "Project Leader", "Project Admin", "Project Team", "Points Granter")
```

- [ ] **Step 2: Add the gate + endpoints**

Append to the end of `vernon_project/api/mobile.py`:

```python
# --------------------------------------------------------------------------------
# Grant Points — manual wallet credit by an authorized grantor.
# Granted points raise the recipient's spendable balance but are excluded from
# the leaderboard (source='Grant'). Grantor = Points Granter or System Manager.
# --------------------------------------------------------------------------------


def _require_points_granter():
	roles = frappe.get_roles(frappe.session.user)
	if "System Manager" not in roles and "Points Granter" not in roles:
		frappe.throw("Not permitted", frappe.PermissionError)


@frappe.whitelist()
def grant_points(user, amount, note=None):
	"""Manually credit points to a user's wallet. Positive amounts only."""
	_require_points_granter()
	user = (user or "").strip()
	if not user or user in PROTECTED_USERS or not frappe.db.exists("User", user):
		frappe.throw("Unknown user")
	if not frappe.db.get_value("User", user, "enabled"):
		frappe.throw("User is disabled")
	try:
		amount = float(amount)
	except (TypeError, ValueError):
		frappe.throw("Amount must be a number")
	if amount <= 0:
		frappe.throw("Amount must be greater than zero")

	frappe.get_doc({
		"doctype": "Point Ledger",
		"user": user,
		"points_earned": amount,
		"point": amount,
		"source": "Grant",
		"note": (note or "").strip() or None,
		"granted_by": frappe.session.user,
		"credited_on": frappe.utils.now(),
	}).insert(ignore_permissions=True)
	frappe.db.commit()

	_, _, balance = _user_balance(user)
	return {"balance": balance, "granted": amount}


@frappe.whitelist()
def list_grant_users():
	"""Lightweight enabled-user list for the grant picker."""
	_require_points_granter()
	users = frappe.get_all(
		"User",
		filters={"name": ["not in", PROTECTED_USERS], "enabled": 1},
		fields=["name", "full_name", "user_image"],
		limit_page_length=0,
		order_by="full_name asc",
	)
	return {"users": users}
```

- [ ] **Step 3: Restart and verify**

Run: `cd /home/frappe/frappe-bench && bench restart`

```bash
bench --site project.vernon.id console <<'PY'
import frappe
frappe.set_user("Administrator")
before = frappe.db.sql("select coalesce(sum(points_earned),0) from `tabPoint Ledger` where user='mo@vernon.id'")[0][0]
from vernon_project.api.mobile import grant_points, list_grant_users
print("users sample:", list_grant_users()["users"][:2])
res = grant_points("mo@vernon.id", 5, note="test grant")
print("grant:", res)
row = frappe.get_all("Point Ledger", filters={"user":"mo@vernon.id","source":"Grant"}, fields=["points_earned","note","granted_by"], order_by="creation desc", limit=1)
print("row:", row)
# cleanup the test row
frappe.db.delete("Point Ledger", {"user":"mo@vernon.id","source":"Grant","note":"test grant"})
frappe.db.commit()
PY
```
Expected: `list_grant_users` returns user dicts; `grant` returns `{'balance': <num>, 'granted': 5.0}`; row shows `note='test grant'`, `granted_by='Administrator'`.

- [ ] **Step 4: Verify validation rejects bad input**

```bash
bench --site project.vernon.id console <<'PY'
import frappe
frappe.set_user("Administrator")
from vernon_project.api.mobile import grant_points
for u, a in [("mo@vernon.id", 0), ("mo@vernon.id", -3), ("nobody@x.id", 5), ("Administrator", 5)]:
	try:
		grant_points(u, a); print("NO ERROR (bug):", u, a)
	except Exception as e:
		print("rejected:", u, a, "->", type(e).__name__)
PY
```
Expected: all four `rejected` (amount<=0, negative, unknown user, protected user).

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/mobile.py
git commit -m "feat(points): grant_points + list_grant_users API, Points Granter gate"
```

---

### Task 3: Leaderboard exclusion + wallet-log grant rendering

**Files:**
- Modify: `vernon_project/api/mobile.py` — `get_leaderboard()` (:1498), `get_wallet_log()` (:1418-1454)

**Interfaces:**
- Consumes: `source` field from Task 1.
- Produces: leaderboard sums exclude `source='Grant'`; wallet-log credit rows render grants with title "Points granted" and subtitle = note.

- [ ] **Step 1: Exclude grants from the leaderboard**

In `get_leaderboard()`, the `conds` list is built before the `where` clause. Add the grant filter unconditionally — insert right after `conds = []` / `params = {}` / `join = ""` block, before the `if start is not None:` line:

```python
	conds.append("coalesce(pl.source, 'Todo') <> 'Grant'")
```

(With this, `conds` is never empty, so `where` always renders — correct, since existing rows coalesce to `'Todo'` and stay included.)

- [ ] **Step 2: Pull source into the wallet-log credit query**

In `get_wallet_log()`, change the `credits` query `fields` to include `source`:

```python
	credits = frappe.get_all(
		"Point Ledger",
		filters={"user": user},
		fields=["points_earned as amount", "todo", "group", "role", "source", "note", "credited_on as date"],
		order_by="credited_on desc",
		limit=100,
	)
```

- [ ] **Step 3: Render grant credit rows distinctly**

In the `for c in credits:` loop, replace the single `rows.append({...})` block with a grant-aware version:

```python
	for c in credits:
		is_grant = (c.get("source") == "Grant")
		rows.append(
			{
				"kind": "credit",
				"amount": float(c["amount"] or 0),
				"title": "Points granted" if is_grant else (subj.get(c.get("todo")) or "Points earned"),
				"subtitle": (c.get("note") or "Granted") if is_grant else (c.get("group") or (c.get("role") and f"{c['role']} reward")),
				"status": None,
				"date": str(c["date"]) if c.get("date") else None,
				"date_human": _humanize_datetime(c.get("date")),
			}
		)
```

- [ ] **Step 4: Restart and verify leaderboard ignores grants but wallet counts them**

Run: `cd /home/frappe/frappe-bench && bench restart`

```bash
bench --site project.vernon.id console <<'PY'
import frappe
frappe.set_user("Administrator")
from vernon_project.api.mobile import grant_points, get_leaderboard, get_wallet, get_wallet_log
u = "mo@vernon.id"
lb_before = next((e["points"] for e in get_leaderboard("all")["entries"] if e["user"]==u), 0)
frappe.set_user(u)
w_before = get_wallet()["balance"]
frappe.set_user("Administrator")
grant_points(u, 7, note="qa grant")
frappe.set_user(u)
w_after = get_wallet()["balance"]
log0 = get_wallet_log()[0]
frappe.set_user("Administrator")
lb_after = next((e["points"] for e in get_leaderboard("all")["entries"] if e["user"]==u), 0)
print("leaderboard before/after (must match):", lb_before, lb_after)
print("wallet before/after (must +7):", w_before, w_after)
print("log top row:", log0["title"], "|", log0["subtitle"], "|", log0["amount"])
frappe.db.delete("Point Ledger", {"user":u,"source":"Grant","note":"qa grant"})
frappe.db.commit()
PY
```
Expected: leaderboard before == after; wallet after == before + 7; log top row `Points granted | qa grant | 7.0`.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/mobile.py
git commit -m "feat(points): exclude grants from leaderboard, render grant rows in wallet log"
```

---

### Task 4: Frontend API client + role helpers

**Files:**
- Modify: `frontend/src/lib/api.ts` (`mobileApi`, near :172)
- Modify: `frontend/src/hooks/useData.ts` (`VERNON_ROLE_OPTIONS` :488, add `canGrantPoints`)

**Interfaces:**
- Consumes: `grant_points`, `list_grant_users` from Task 2.
- Produces: `mobileApi.grantPoints(user, amount, note?)`, `mobileApi.listGrantUsers()`, `canGrantPoints(boot)`; `GrantUser` type.

- [ ] **Step 1: Add API methods**

In `frontend/src/lib/api.ts`, inside the `mobileApi` object, after the `listRedemptions` line, add:

```ts
  grantPoints: (user: string, amount: number, note?: string) =>
    api.post<{ balance: number; granted: number }>(M + 'grant_points', {
      user,
      amount,
      ...(note ? { note } : {}),
    }),
  listGrantUsers: () => api.get<{ users: GrantUser[] }>(M + 'list_grant_users'),
```

- [ ] **Step 2: Add the GrantUser type**

In `frontend/src/lib/api.ts`, add near the top (after imports) — or if a shared types file is conventional, in `frontend/src/lib/types.ts` and import it:

```ts
export type GrantUser = { name: string; full_name: string; user_image?: string | null }
```

- [ ] **Step 3: Add canGrantPoints + role option**

In `frontend/src/hooks/useData.ts`, add the option to `VERNON_ROLE_OPTIONS`:

```ts
export const VERNON_ROLE_OPTIONS = [
  { value: 'Project Owner', label: 'Owner' },
  { value: 'Project Leader', label: 'Leader' },
  { value: 'Project Admin', label: 'Admin' },
  { value: 'Project Team', label: 'Team' },
  { value: 'Points Granter', label: 'Points Granter' },
]
```

Then add the helper next to `canManageMarketplace` (:627):

```ts
export function canGrantPoints(boot: Boot | undefined): boolean {
  return !!boot && (
    boot.roles.includes('System Manager') ||
    boot.roles.includes('Points Granter')
  )
}
```

- [ ] **Step 4: Type-check**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/hooks/useData.ts
git commit -m "feat(points): frontend grant API client + canGrantPoints helper"
```

---

### Task 5: Grant Points screen + Profile link + route

**Files:**
- Create: `frontend/src/pages/GrantPointsScreen.tsx`
- Modify: `frontend/src/pages/Profile.tsx` (import + Row)
- Modify: `frontend/src/App.tsx` (import + gated route)

**Interfaces:**
- Consumes: `mobileApi.grantPoints/listGrantUsers`, `canGrantPoints`, `GrantUser` from Task 4; `DetailScreen` (Layout), `useToast`, `Avatar`/`Spinner`/`EmptyState` (ui).
- Produces: route `/grant-points`; Profile row "Grant Points".

- [ ] **Step 1: Create the screen**

Create `frontend/src/pages/GrantPointsScreen.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, Gift } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState, Avatar } from '@/components/ui'
import { useBoot, canGrantPoints } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { mobileApi, type GrantUser } from '@/lib/api'

export default function GrantPointsScreen() {
  const navigate = useNavigate()
  const { data: boot, isLoading: bootLoading } = useBoot()
  const toast = useToast()

  const { data, isLoading } = useQuery({
    queryKey: ['grantUsers'],
    queryFn: () => mobileApi.listGrantUsers(),
    enabled: canGrantPoints(boot),
  })

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<GrantUser | null>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const users = data?.users ?? []
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) => u.full_name?.toLowerCase().includes(q) || u.name.toLowerCase().includes(q),
    )
  }, [users, search])

  if (bootLoading) {
    return (
      <DetailScreen title="Grant Points" right={null}>
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  if (!canGrantPoints(boot)) {
    navigate('/me', { replace: true })
    return null
  }

  const submit = async () => {
    if (submitting) return
    const amt = Number(amount)
    if (!selected) return toast('error', 'Pick a user')
    if (!Number.isFinite(amt) || amt <= 0) return toast('error', 'Enter an amount greater than zero')
    setSubmitting(true)
    try {
      const res = await mobileApi.grantPoints(selected.name, amt, note.trim() || undefined)
      toast('success', `Granted ${res.granted} to ${selected.full_name}. New balance ${res.balance}.`)
      setSelected(null)
      setAmount('')
      setNote('')
      setSearch('')
    } catch (e: any) {
      toast('error', e?.message || 'Grant failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DetailScreen title="Grant Points" right={null}>
      {selected ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-card">
            <Avatar name={selected.full_name} image={selected.user_image} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-slate-900 dark:text-slate-50">{selected.full_name}</p>
              <p className="truncate text-sm text-slate-400">{selected.name}</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-sm font-medium text-brand-600">
              Change
            </button>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-card space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Points</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2.5 text-lg font-semibold text-slate-900 dark:text-slate-50 outline-none focus:border-brand-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Note (optional)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Reason for the grant"
                className="w-full resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2.5 text-sm text-slate-900 dark:text-slate-50 outline-none focus:border-brand-500"
              />
            </label>
          </div>

          <button
            onClick={submit}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3.5 font-semibold text-white active:scale-[0.99] disabled:opacity-60"
          >
            {submitting ? <Spinner className="h-4 w-4" /> : <Gift className="h-4 w-4" />}
            Grant points
          </button>
        </div>
      ) : (
        <>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-500"
            />
          </div>
          {isLoading ? (
            <Spinner className="mx-auto h-5 w-5 text-slate-400" />
          ) : filtered.length === 0 ? (
            <EmptyState title="No users" />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-card">
              {filtered.map((u) => (
                <button
                  key={u.name}
                  onClick={() => setSelected(u)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50 dark:active:bg-slate-700/50"
                >
                  <Avatar name={u.full_name} image={u.user_image} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{u.full_name}</p>
                    <p className="truncate text-xs text-slate-400">{u.name}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </DetailScreen>
  )
}
```

- [ ] **Step 2: Add the Profile row**

In `frontend/src/pages/Profile.tsx`:

Add `Gift` to the lucide import (line 2) and `canGrantPoints` to the useData import (line 7):

```tsx
import { LogOut, Wifi, WifiOff, BookOpen, ShieldCheck, RefreshCw, ChevronRight, Trophy, Store, Users, KeyRound, Settings, Gift } from 'lucide-react'
```
```tsx
import { useBoot, canManageGroups, canManageBrands, canManageUsers, canManageMarketplace, canGrantPoints } from '@/hooks/useData'
```

Add the Row inside the admin-links card, after the `canManageMarketplace` Row (line 125):

```tsx
            {canGrantPoints(boot) && (
              <Row icon={Gift} label="Grant Points" onClick={() => navigate('/grant-points')} />
            )}
```

- [ ] **Step 3: Add the route**

In `frontend/src/App.tsx`, add the import next to the other page imports (after line 28):

```tsx
import GrantPointsScreen from './pages/GrantPointsScreen'
```

Add a gated route block — place it after the `canManageMarketplace` block (around line 112), before the `/wallet` route:

```tsx
        {canGrantPoints(boot) && (
          <Route path="/grant-points" element={<GrantPointsScreen />} />
        )}
```

Add `canGrantPoints` to the `useData` import already present at the top of App.tsx (it imports `canManageGroups`, etc.).

- [ ] **Step 4: Type-check + build**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/GrantPointsScreen.tsx frontend/src/pages/Profile.tsx frontend/src/App.tsx
git commit -m "feat(points): Grant Points screen, Profile link, route"
```

---

### Task 6: Deploy + end-to-end verification

**Files:** none (deploy + manual QA).

- [ ] **Step 1: Full deploy**

```bash
cd /home/frappe/frappe-bench
bench --site project.vernon.id migrate
bench restart
cd apps/vernon_project/frontend && npm run build
```
Expected: each step completes without error (migrate is idempotent — role/fields already applied in Task 1).

- [ ] **Step 2: Grant a test role and verify gating**

```bash
bench --site project.vernon.id console <<'PY'
import frappe
# pick a non-admin test user that exists; adjust if needed
u = "mo@vernon.id"
print("has Points Granter:", "Points Granter" in frappe.get_roles(u))
PY
```
If false and you want to test the granter (non-SM) path, assign via the Manage Users UI (the role now appears in the picker) or in console: append `{"role":"Points Granter"}` to the user's roles and save.

- [ ] **Step 3: UI smoke test (live)**

On `project.vernon.id/m` logged in as a System Manager (or Points Granter):
- Open Me tab → confirm "Grant Points" row is visible.
- Tap it → search a user → select → enter amount (e.g. 10) → optional note → "Grant points".
- Confirm success toast with new balance.
- Log in as the recipient → Wallet log shows a "Points granted" row with the note and the amount; balance increased.
- Leaderboard rank/points for the recipient unchanged by the grant.
- Log in as a plain user (no granter role) → "Grant Points" row absent; navigating `/grant-points` redirects to `/me`.

- [ ] **Step 4: Confirm no regressions in earned-points flow**

Complete (or re-check) a normal Project Todo completion still credits a `source='Todo'` (NULL→Todo) ledger row and still appears on the leaderboard. Spot-check in console:

```bash
bench --site project.vernon.id console <<'PY'
import frappe
print(frappe.db.sql("select coalesce(source,'Todo') s, count(*) from `tabPoint Ledger` group by s"))
PY
```
Expected: counts for `Todo` (existing earned rows) and `Grant` (any grants made).

- [ ] **Step 5: Final commit (if any tweaks during QA)**

```bash
git add -A
git commit -m "chore(points): grant-points QA fixes" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** role+gate (Task 1,2), schema fields incl. `note`/`granted_by` (Task 1), leaderboard exclusion (Task 3), wallet inclusion + log rendering (Task 3), `grant_points`/`list_grant_users` (Task 2), frontend api/helper (Task 4), screen+Profile row+route (Task 5), deploy (Task 6). All covered.
- **Types:** `GrantUser` defined in Task 4, consumed in Task 5. `grantPoints`/`listGrantUsers`/`canGrantPoints` names consistent across tasks. API return `{balance, granted}` consistent backend↔frontend.
- **No placeholders:** all steps carry concrete code/commands.
- **Testing:** manual verification (live site, no test DB) per project convention.
