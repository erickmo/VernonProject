# Gift Points Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any user gift some of their own spendable points to another user (zero-sum peer transfer), excluded from leaderboard rank.

**Architecture:** Reuse the Point Ledger doctype with a new `source="Gift"`. Each gift writes two rows in one transaction — a positive credit for the recipient and a negative debit for the sender. The live balance formula (`Σ points_earned − Σ redemptions`) absorbs the negative row with no change. New whitelisted API methods do the transfer and list recipients; a new mobile screen mirrors the existing Grant Points flow.

**Tech Stack:** Frappe (Python whitelisted API + doctype JSON), React + TypeScript + TanStack Query (mobile frontend in `frontend/`), Vite build → served at `/m`.

## Global Constraints

- Live site `project.vernon.id`, no test DB — **no automated test harness**. Verify with `bench --site project.vernon.id execute <dotted.path>` console calls + DB queries + manual app checks. (Project convention: defer automated tests to a final phase. This overrides the skill's pytest-TDD default.)
- Never use native `alert/confirm/prompt` — use the app's dialog/Confirm provider (`useConfirm`).
- Deploy mechanics: `bench --site project.vernon.id migrate` for doctype JSON changes; `bench restart` for Python; `npm run build` (in `frontend/`) for frontend. Frontend build also regenerates `vernon_project/www/m.html` + `vernon_sw.js`.
- Amount: whole numbers only, `> 0`, `≤ sender balance`. Recipient: enabled, not self, not in `PROTECTED_USERS = ("Guest", "Administrator")`.
- Gifts excluded from leaderboard rank AND from "earned today/yesterday", same as `source="Grant"`.
- Branch: `feat/gift-points` (already created; spec already committed there).

---

### Task 1: Allow "Gift" source + exclude gifts from rank/earned

**Files:**
- Modify: `vernon_project/vernon_project/doctype/point_ledger/point_ledger.json` (source field `options`)
- Modify: `vernon_project/api/mobile.py` (leaderboard cond `~:1515`; `_earned_on` subquery in `get_wallet` `~:1408`)

**Interfaces:**
- Produces: Point Ledger rows may carry `source="Gift"`; rank + earned queries ignore them.

- [ ] **Step 1: Add "Gift" to the Point Ledger source options**

In `point_ledger.json`, the `source` field currently has `"options": "Todo\nGrant"`. Change to:

```json
"options": "Todo\nGrant\nGift"
```

- [ ] **Step 2: Exclude gifts from leaderboard rank**

In `mobile.py`, `get_leaderboard`, change the line (currently `mobile.py:1515`):

```python
	conds.append("coalesce(pl.source, 'Todo') <> 'Grant'")
```

to:

```python
	conds.append("coalesce(pl.source, 'Todo') not in ('Grant', 'Gift')")
```

- [ ] **Step 3: Exclude gifts from today/yesterday earned**

In `mobile.py`, `get_wallet` → `_earned_on`, change the subquery condition (currently `mobile.py:1408`):

```python
			"and coalesce(source, 'Todo') <> 'Grant'",
```

to:

```python
			"and coalesce(source, 'Todo') not in ('Grant', 'Gift')",
```

- [ ] **Step 4: Apply doctype change + restart**

Run:
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate && bench restart
```
Expected: migrate completes; `Point Ledger` source now accepts `Gift`. (If `bench restart` needs sudo and fails non-interactively, ask the user to run `sudo supervisorctl restart all`.)

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/doctype/point_ledger/point_ledger.json vernon_project/api/mobile.py
git commit -m "feat(points): allow Gift ledger source, exclude gifts from rank/earned"
```

---

### Task 2: Backend gift transfer + recipient list

**Files:**
- Modify: `vernon_project/api/mobile.py` (add `gift_points`, `list_gift_recipients` — place them right after `list_grant_users`, near `mobile.py:1777`)

**Interfaces:**
- Consumes: `PROTECTED_USERS` (`mobile.py:21`), `_user_balance(user)` (`mobile.py:1383`).
- Produces:
  - `gift_points(to_user, amount, note=None) -> {"balance": float, "gifted": int, "to": str}`
  - `list_gift_recipients() -> {"users": [{"name","full_name","user_image"}]}`

- [ ] **Step 1: Add `gift_points`**

Append to `mobile.py`:

```python
@frappe.whitelist()
def gift_points(to_user, amount, note=None):
	"""Transfer points from the logged-in user to another user. Zero-sum:
	the sender is debited (negative ledger row), the recipient credited.
	Whole numbers only. Excluded from leaderboard rank."""
	sender = frappe.session.user
	to_user = (to_user or "").strip()
	if not to_user or to_user in PROTECTED_USERS or not frappe.db.exists("User", to_user):
		frappe.throw("Unknown user")
	if to_user == sender:
		frappe.throw("Cannot gift yourself")
	if not frappe.db.get_value("User", to_user, "enabled"):
		frappe.throw("User is disabled")
	try:
		amount = float(amount)
	except (TypeError, ValueError):
		frappe.throw("Amount must be a whole number greater than zero")
	if amount <= 0 or amount != int(amount):
		frappe.throw("Amount must be a whole number greater than zero")
	amount = int(amount)

	_, _, balance = _user_balance(sender)
	if balance < amount:
		frappe.throw("Not enough points")

	note = (note or "").strip() or None
	now = frappe.utils.now()
	# Recipient credit
	frappe.get_doc({
		"doctype": "Point Ledger",
		"user": to_user,
		"points_earned": amount,
		"point": amount,
		"source": "Gift",
		"granted_by": sender,
		"note": note,
		"credited_on": now,
	}).insert(ignore_permissions=True)
	# Sender debit (negative row reduces sender balance via the sum formula)
	frappe.get_doc({
		"doctype": "Point Ledger",
		"user": sender,
		"points_earned": -amount,
		"point": amount,
		"source": "Gift",
		"granted_by": to_user,
		"note": note,
		"credited_on": now,
	}).insert(ignore_permissions=True)
	frappe.db.commit()

	_, _, new_balance = _user_balance(sender)
	return {"balance": new_balance, "gifted": amount, "to": to_user}
```

- [ ] **Step 2: Add `list_gift_recipients`**

Append to `mobile.py`:

```python
@frappe.whitelist()
def list_gift_recipients():
	"""Enabled users (minus protected users and the caller) for the gift
	picker. Open to every logged-in user (unlike list_grant_users)."""
	users = frappe.get_all(
		"User",
		filters={
			"name": ["not in", list(PROTECTED_USERS) + [frappe.session.user]],
			"enabled": 1,
		},
		fields=["name", "full_name", "user_image"],
		limit_page_length=0,
		order_by="full_name asc",
	)
	return {"users": users}
```

- [ ] **Step 3: Restart + verify transfer via console**

Run:
```bash
cd /home/frappe/frappe-bench && bench restart
```

Then exercise with two real test users (replace emails with two enabled non-admin users from `list_gift_recipients`):

```bash
bench --site project.vernon.id execute vernon_project.api.mobile.list_gift_recipients
```
Expected: dict with `users` list, NOT containing Administrator/Guest.

```bash
bench --site project.vernon.id console
```
```python
import frappe
frappe.set_user("SENDER@EMAIL")          # a user with > 10 points
from vernon_project.api.mobile import gift_points, _user_balance
before_s = _user_balance("SENDER@EMAIL")[2]
before_r = _user_balance("RECIPIENT@EMAIL")[2]
print(gift_points("RECIPIENT@EMAIL", 10))
print("sender", before_s, "->", _user_balance("SENDER@EMAIL")[2])
print("recip", before_r, "->", _user_balance("RECIPIENT@EMAIL")[2])
```
Expected: sender balance −10, recipient +10, return shows new sender balance.

- [ ] **Step 4: Verify rejections**

In the same console:
```python
frappe.set_user("SENDER@EMAIL")
for bad in [("SENDER@EMAIL", 5), ("RECIPIENT@EMAIL", 0), ("RECIPIENT@EMAIL", 2.5), ("RECIPIENT@EMAIL", 10**12), ("nope@x.com", 5)]:
    try:
        gift_points(*bad); print("NO ERROR (bug):", bad)
    except Exception as e:
        print("rejected ok:", bad, "->", str(e))
```
Expected: self-gift → "Cannot gift yourself"; 0 → whole-number error; 2.5 → whole-number error; huge amount → "Not enough points"; unknown user → "Unknown user".

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/mobile.py
git commit -m "feat(points): gift_points transfer + list_gift_recipients API"
```

---

### Task 3: Wallet log shows gifts sent/received

**Files:**
- Modify: `vernon_project/api/mobile.py` → `get_wallet_log` (fields list `~:1426`; credit loop `~:1447-1460`)

**Interfaces:**
- Consumes: existing `get_wallet_log` row shape (`kind, amount, title, subtitle, status, date, date_human`).
- Produces: gift rows — sent = `kind="debit"` negative amount "Gift sent" / "to {name}"; received = `kind="credit"` positive "Gift received" / "from {name}".

- [ ] **Step 1: Include `granted_by` in the credits query**

In `get_wallet_log`, change the credits `fields` (currently `mobile.py:1426`):

```python
		fields=["points_earned as amount", "todo", "group", "role", "source", "note", "credited_on as date"],
```

to add `granted_by`:

```python
		fields=["points_earned as amount", "todo", "group", "role", "source", "note", "granted_by", "credited_on as date"],
```

- [ ] **Step 2: Resolve gift counterpart names (batched)**

Immediately after the existing todo-subject resolution block (the `subj = {}` / `for r in frappe.get_all("Project Todo", ...)` block ending around `mobile.py:1445`), add:

```python
	# Resolve gift counterpart (granted_by) display names in one query.
	gift_user_ids = list({c["granted_by"] for c in credits if c.get("source") == "Gift" and c.get("granted_by")})
	gift_names = {}
	if gift_user_ids:
		for r in frappe.get_all(
			"User", filters={"name": ["in", gift_user_ids]}, fields=["name", "full_name"]
		):
			gift_names[r["name"]] = r["full_name"]
```

- [ ] **Step 3: Branch the credit loop for gifts**

In the `for c in credits:` loop, replace the existing body (currently starts `is_grant = (c.get("source") == "Grant")` at `mobile.py:1449`) so a gift is handled first:

```python
	for c in credits:
		src = c.get("source")
		amt = float(c["amount"] or 0)
		if src == "Gift":
			counterpart = gift_names.get(c.get("granted_by")) or c.get("granted_by") or "someone"
			rows.append(
				{
					"kind": "debit" if amt < 0 else "credit",
					"amount": amt,
					"title": "Gift sent" if amt < 0 else "Gift received",
					"subtitle": (f"to {counterpart}" if amt < 0 else f"from {counterpart}"),
					"status": None,
					"date": str(c["date"]) if c.get("date") else None,
					"date_human": _humanize_datetime(c.get("date")),
				}
			)
			continue
		is_grant = (src == "Grant")
		rows.append(
			{
				"kind": "credit",
				"amount": amt,
				"title": "Points granted" if is_grant else (subj.get(c.get("todo")) or "Points earned"),
				"subtitle": (c.get("note") or "Granted") if is_grant else (c.get("group") or (c.get("role") and f"{c['role']} reward")),
				"status": None,
				"date": str(c["date"]) if c.get("date") else None,
				"date_human": _humanize_datetime(c.get("date")),
			}
		)
```

(Note: the running-balance walk below is unchanged — `running -= r["amount"]` works correctly because gift-sent rows carry a negative `amount`.)

- [ ] **Step 4: Restart + verify**

```bash
cd /home/frappe/frappe-bench && bench restart
bench --site project.vernon.id console
```
```python
import frappe
frappe.set_user("SENDER@EMAIL")
from vernon_project.api.mobile import get_wallet_log
print([r for r in get_wallet_log() if r["title"].startswith("Gift")][:3])
frappe.set_user("RECIPIENT@EMAIL")
print([r for r in get_wallet_log() if r["title"].startswith("Gift")][:3])
```
Expected: sender sees `Gift sent` / `to <name>` with negative amount; recipient sees `Gift received` / `from <name>` positive.

- [ ] **Step 5: Commit**

```bash
git add vernon_project/api/mobile.py
git commit -m "feat(points): show gifts sent/received in wallet log"
```

---

### Task 4: Frontend API client, types, hooks

**Files:**
- Modify: `frontend/src/lib/api.ts` (add to `mobileApi`, near `:180`)
- Modify: `frontend/src/lib/types.ts` (add `GiftUser`, near `:319`)
- Modify: `frontend/src/hooks/useData.ts` (add key `:48-56`, hooks near wallet hooks `:601`)

**Interfaces:**
- Consumes: backend `gift_points`, `list_gift_recipients`.
- Produces:
  - `mobileApi.giftPoints(toUser, amount, note?) -> Promise<{balance:number; gifted:number; to:string}>`
  - `mobileApi.listGiftRecipients() -> Promise<{users: GiftUser[]}>`
  - `useGiftRecipients()`, `useGiftPoints()` hooks.
  - `GiftUser` type.

- [ ] **Step 1: Add the API methods**

In `frontend/src/lib/api.ts`, inside the `mobileApi` object (after `listGrantUsers`, before the closing `}` at `:181`):

```ts
  giftPoints: (toUser: string, amount: number, note?: string) =>
    api.post<{ balance: number; gifted: number; to: string }>(M + 'gift_points', {
      to_user: toUser,
      amount,
      ...(note ? { note } : {}),
    }),
  listGiftRecipients: () =>
    api.get<{ users: import('./types').GiftUser[] }>(M + 'list_gift_recipients'),
```

- [ ] **Step 2: Add the `GiftUser` type**

In `frontend/src/lib/types.ts`, after the `GrantUser` definition (`:319`):

```ts
export type GiftUser = GrantUser
```

- [ ] **Step 3: Add the query key + hooks**

In `frontend/src/hooks/useData.ts`, add to the `keys` object (the block at `:48-56`):

```ts
  giftRecipients: ['gift-recipients'] as const,
```

Then, just after `useWalletLog` (`:604-605`), add:

```ts
export function useGiftRecipients() {
  return useQuery({
    queryKey: keys.giftRecipients,
    queryFn: () => mobileApi.listGiftRecipients(),
  })
}

export function useGiftPoints() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ toUser, amount, note }: { toUser: string; amount: number; note?: string }) =>
      mobileApi.giftPoints(toUser, amount, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.wallet })
      qc.invalidateQueries({ queryKey: keys.walletLog })
    },
  })
}
```

(`useQuery`, `useMutation`, `useQueryClient` are already imported in this file — confirm at the top; they're used by existing hooks like `useRedeemReward`.)

- [ ] **Step 4: Typecheck**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```
Expected: no errors. (If `tsc` is slow/unavailable, Step in Task 5 runs the full `npm run build` which also typechecks.)

- [ ] **Step 5: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/lib/api.ts frontend/src/lib/types.ts frontend/src/hooks/useData.ts
git commit -m "feat(points): frontend gift API client, type, hooks"
```

---

### Task 5: Gift Points screen + route + Profile entry

**Files:**
- Create: `frontend/src/pages/GiftPointsScreen.tsx`
- Modify: `frontend/src/App.tsx` (import `:29`; route near `/wallet` `:117`)
- Modify: `frontend/src/pages/Profile.tsx` (icon import `:7` area; new Row after "Change password" `:113`)

**Interfaces:**
- Consumes: `useGiftRecipients`, `useGiftPoints` (Task 4), `useWallet` (`:601`), `useConfirm` (`@/components/Confirm`), `useToast`, `GiftUser`.

- [ ] **Step 1: Create the screen**

Create `frontend/src/pages/GiftPointsScreen.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Send, Users } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState, Avatar } from '@/components/ui'
import { useGiftRecipients, useGiftPoints, useWallet } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import type { GiftUser } from '@/lib/types'

export default function GiftPointsScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { data: wallet } = useWallet()
  const { data, isLoading } = useGiftRecipients()
  const gift = useGiftPoints()

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<GiftUser | null>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const balance = wallet?.balance ?? 0
  const users = data?.users ?? []
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) => u.full_name?.toLowerCase().includes(q) || u.name.toLowerCase().includes(q),
    )
  }, [users, search])

  const submit = async () => {
    if (gift.isPending || !selected) return
    const amt = Number(amount)
    if (!Number.isInteger(amt) || amt <= 0) return toast('error', 'Enter a whole number greater than zero')
    if (amt > balance) return toast('error', 'Not enough points')
    const ok = await confirm({
      title: `Gift ${amt} points to ${selected.full_name}?`,
      confirmLabel: 'Gift points',
    })
    if (!ok) return
    try {
      const res = await gift.mutateAsync({ toUser: selected.name, amount: amt, note: note.trim() || undefined })
      toast('success', `Gifted ${res.gifted} to ${selected.full_name}. New balance ${res.balance}.`)
      setSelected(null)
      setAmount('')
      setNote('')
      setSearch('')
    } catch (e: any) {
      toast('error', e?.message || 'Gift failed')
    }
  }

  return (
    <DetailScreen title="Gift Points" right={null}>
      <p className="mb-3 rounded-2xl bg-white dark:bg-slate-800 px-4 py-3 text-sm text-slate-500 shadow-card">
        Your balance: <span className="font-semibold text-slate-900 dark:text-slate-50">{balance}</span>
      </p>
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
                step={1}
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
                placeholder="Say something nice"
                className="w-full resize-none rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2.5 text-sm text-slate-900 dark:text-slate-50 outline-none focus:border-brand-500"
              />
            </label>
          </div>

          <button
            onClick={submit}
            disabled={gift.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3.5 font-semibold text-white active:scale-[0.99] disabled:opacity-60"
          >
            {gift.isPending ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            Gift points
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
            <EmptyState icon={Users} title="No users" />
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

- [ ] **Step 2: Register the route (no role gate — all users)**

In `frontend/src/App.tsx`, add the import near `:29`:

```tsx
import GiftPointsScreen from './pages/GiftPointsScreen'
```

And add the route next to `/wallet` (the ungated routes block, after `:116`):

```tsx
        <Route path="/gift-points" element={<GiftPointsScreen />} />
```

- [ ] **Step 3: Add the Profile entry (visible to all)**

In `frontend/src/pages/Profile.tsx`, add `Send` to the `lucide-react` import (the icon import line at the top of the file). Then add a Row immediately after the "Change password" row (`:113`), ungated:

```tsx
            <Row icon={Send} label="Gift Points" onClick={() => navigate('/gift-points')} />
```

Result (context):
```tsx
            <Row icon={KeyRound} label="Change password" onClick={() => setShowChangePw(true)} />
            <Row icon={Send} label="Gift Points" onClick={() => navigate('/gift-points')} />
            {canManageGroups(boot) && (
```

- [ ] **Step 4: Build**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
```
Expected: build succeeds; `[copy-html]` lines print; new hashed bundle emitted; `m.html` regenerated.

- [ ] **Step 5: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/pages/GiftPointsScreen.tsx frontend/src/App.tsx frontend/src/pages/Profile.tsx vernon_project/public/frontend vernon_project/www/m.html vernon_project/www/vernon_sw.js
git commit -m "feat(points): Gift Points screen, route, Profile entry"
```

---

### Task 6: End-to-end verification on live

**Files:** none (verification only)

- [ ] **Step 1: Open the mobile app at `/m`**, go to Profile → "Gift Points" (visible as a non-admin user).

- [ ] **Step 2: Happy path** — pick a recipient, enter a whole-number amount ≤ your balance, optional note, tap "Gift points", confirm the dialog. Expect success toast with new balance.

- [ ] **Step 3: Check both wallets** — sender wallet log shows "Gift sent / to {name}" (negative); recipient shows "Gift received / from {name}" (positive). Sender balance dropped, recipient rose by the same amount.

- [ ] **Step 4: Check leaderboard** — neither user's rank/earned changed from the gift.

- [ ] **Step 5: Rejections in-app** — try self (not in list), amount 0, amount > balance → all blocked with clear errors.

- [ ] **Step 6 (optional): merge** — once verified, follow `superpowers:finishing-a-development-branch` to merge `feat/gift-points` into `main`.

---

## Self-Review

**Spec coverage:**
- Zero-sum transfer (two rows, negative sender) → Task 2 ✓
- No balance-fn change → confirmed, Task 2 reuses `_user_balance` ✓
- `source="Gift"` option → Task 1 ✓
- Exclude from rank + earned → Task 1 ✓
- `gift_points` validations (self/protected/disabled/whole-number/balance) → Task 2 ✓
- `list_gift_recipients` open to all → Task 2 ✓
- Wallet log sent/received display → Task 3 ✓
- Frontend api/types/hooks → Task 4 ✓
- Screen + confirm dialog + route + Profile entry (all users) → Task 5 ✓
- Whole numbers + confirm dialog (decided) → Task 2 (server) + Task 5 (client) ✓
- E2E verification (live, manual) → Task 6 ✓

**Type consistency:** `giftPoints(toUser, amount, note?)` returns `{balance, gifted, to}` — used identically in api.ts (Task 4) and the screen (Task 5). `GiftUser = GrantUser` shape (`name, full_name, user_image?`) used in screen. `useGiftPoints` mutation arg `{toUser, amount, note}` matches the screen's `mutateAsync` call. Backend `gift_points` returns `gifted` (int) + `balance` — matches frontend type.

**Placeholder scan:** none — all steps carry concrete code/commands. Verification uses console/manual checks (no test DB) per the documented project convention.
