# Events Management (in-app) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In-app events management (CRUD + registration roster with cancel / mark-attended) for organizers and System Managers, across `/m` and `/w`.

**Architecture:** A new organizer-gated whitelisted module `api/events_admin.py` (NOT `/api/resource`) where every endpoint enforces `_can_manage(event) = organizer==user OR System Manager`. Adds one `attended` Check field to `Vernon Event Registration`. Cancel sets status `Cancelled` — points auto-refund and seat auto-free fall out of the existing wallet/capacity math (both ignore Cancelled rows). Frontend mirrors the app's existing admin CRUD (Reward/Brand forms on `/m`, Groups on `/w`), reusing the `uploadRewardImage` helper for `cover_image`.

**Tech Stack:** Frappe whitelisted RPC (Python); React + Vite + TanStack Query (both apps); Tailwind (Soft-Pop `/m`, flat-Notion `/w`).

## Global Constraints

- **App root:** `/home/frappe/frappe-bench/apps/vernon_project`. LIVE site. Schema → `bench --site project.vernon.id migrate`; Python → `bench restart` (needs sudo here — validate via `bench console`); frontend → `npm run build` (output is git-tracked under `vernon_project/public/frontend{,_web}`, served statically).
- **Doctype names:** `Vernon Event`, `Vernon Event Registration` (NEVER `Event` — Frappe core collision).
- **User works in parallel:** re-check `git status` before each commit; `git add` ONLY this task's exact files (never `-A`). ~28 unrelated dirty files (avatar WIP) must stay untouched.
- **No native `alert/confirm/prompt`:** use `useConfirm` (`@/components/Confirm`); errors via `useToast` (`@/components/Toast`).
- **Design systems per app:** `/m` Soft-Pop (`paper-*`/`brand-*`, lucide icons, `dark:` variants); `/w` flat-Notion (semantic `ink/muted/line/canvas/brand-*`, NO `paper-*`).
- **Frappe API house style:** `@frappe.whitelist()`; `user = frappe.session.user`; guest-guard; return bare dict/list; errors `frappe.throw(msg, frappe.PermissionError|ValidationError|DoesNotExistError)`.
- **Access model:** any authenticated user may create (create stamps `organizer = session user`); edit/delete/roster/cancel/attend require `_can_manage`. Never reassign `organizer` from a client payload.
- **Shared frontend files** (`frontend/src/lib/{types,api}.ts`, `hooks/useData.ts`, `App.tsx`, `frontend-web/src/App.tsx`, `lib/nav.ts`) may carry the user's authorized WIP — commit the whole file, but `git add` only that exact file.

---

## File map

**Backend:**
- Modify: `vernon_project/vernon_project/doctype/vernon_event_registration/vernon_event_registration.json` — add `attended` Check.
- Create: `vernon_project/api/events_admin.py` — `_can_manage`, `manage_list_events`, `save_event`, `delete_event`, `event_roster`, `cancel_registration`, `mark_attended`.
- Create: `vernon_project/api/test_events_admin.py`.

**Shared frontend (`frontend/src`):**
- Modify: `lib/types.ts` (`ManagedEvent`, `RosterEntry`, `EventFormPayload`), `lib/api.ts` (`eventsAdminApi`), `hooks/useData.ts` (keys + hooks + `canManageEvents`).

**Mobile `/m`:** Create `pages/EventManageScreen.tsx`, `pages/EventFormScreen.tsx`, `pages/EventRosterScreen.tsx`; modify `App.tsx`, `pages/Profile.tsx`.

**Web `/w`:** Create `pages/EventManage.tsx`, `pages/EventForm.tsx`, `pages/EventRoster.tsx`; modify `App.tsx`, `lib/nav.ts`.

---

## Phase A — Backend

### Task A1: `attended` field on Vernon Event Registration

**Files:** Modify `vernon_project/vernon_project/doctype/vernon_event_registration/vernon_event_registration.json`

**Interfaces:** Produces an `attended` (Check) field on `Vernon Event Registration`.

- [ ] **Step 1: Add the field.** Insert `"attended"` into `field_order` immediately after `"amount"`. Add to the `fields` array:
```json
{"fieldname": "attended", "fieldtype": "Check", "label": "Attended", "default": "0"}
```

- [ ] **Step 2: Migrate + verify**
```bash
cd /home/frappe/frappe-bench && bench --site project.vernon.id migrate
bench --site project.vernon.id console <<'PY'
import frappe
print("attended" in [f.fieldname for f in frappe.get_meta("Vernon Event Registration").fields])
PY
```
Expected: `True`.

- [ ] **Step 3: Commit**
```bash
git add vernon_project/vernon_project/doctype/vernon_event_registration/vernon_event_registration.json
git commit -m "feat(events-mgmt): attended field on Vernon Event Registration"
```

---

### Task A2: `events_admin.py` — event CRUD

**Files:** Create `vernon_project/api/events_admin.py`

**Interfaces:**
- Consumes: `_require_user`, `_active_count` from `vernon_project.api.events`.
- Produces: `_is_sm(user=None)`, `_can_manage(event)`, `manage_list_events()`, `get_managed_event(name) -> dict`, `save_event(payload, name=None) -> {name}`, `delete_event(name) -> {ok}`.

- [ ] **Step 1: Write `events_admin.py`**
```python
# Copyright (c) 2026, Vernon and contributors
# For license information, please see license.txt

import json

import frappe

from vernon_project.api.events import _active_count, _require_user

MANAGE_FIELDS = ["name", "title", "start_datetime", "status", "pricing", "capacity"]
EDITABLE = [
	"title", "description", "cover_image", "start_datetime", "end_datetime",
	"location", "capacity", "pricing", "points_cost", "price", "status",
]  # NOTE: 'organizer' deliberately excluded — never set from client payload.


def _is_sm(user=None):
	return "System Manager" in frappe.get_roles(user or frappe.session.user)


def _can_manage(event):
	"""Throw unless the session user is the event's organizer or a System Manager."""
	organizer = frappe.db.get_value("Vernon Event", event, "organizer")
	if organizer is None:
		frappe.throw("Event not found", frappe.DoesNotExistError)
	if organizer != frappe.session.user and not _is_sm():
		frappe.throw("Not permitted", frappe.PermissionError)


@frappe.whitelist()
def manage_list_events():
	user = _require_user()
	filters = {} if _is_sm(user) else {"organizer": user}
	rows = frappe.get_all(
		"Vernon Event", filters=filters, fields=MANAGE_FIELDS, order_by="start_datetime desc"
	)
	for r in rows:
		r["registered_count"] = _active_count(r["name"])
	return rows


@frappe.whitelist()
def get_managed_event(name):
	"""Full editable fields for one event, gated by _can_manage (so a non-SM
	organizer can load their own Draft — the doctype itself is SM-only-read)."""
	_require_user()
	_can_manage(name)
	return frappe.db.get_value("Vernon Event", name, ["name"] + EDITABLE, as_dict=True)


@frappe.whitelist()
def save_event(payload, name=None):
	user = _require_user()
	data = json.loads(payload) if isinstance(payload, str) else payload
	if name:
		_can_manage(name)
		doc = frappe.get_doc("Vernon Event", name)
	else:
		doc = frappe.new_doc("Vernon Event")
		doc.organizer = user
	for f in EDITABLE:
		if f in data:
			doc.set(f, data[f])
	doc.save(ignore_permissions=True)  # controller validate() enforces pricing/cost rules
	return {"name": doc.name}


@frappe.whitelist()
def delete_event(name):
	_require_user()
	_can_manage(name)
	# Frappe raises LinkExistsError if registrations reference the event — surfaced
	# to the client, which shows "cancel registrations / set status Cancelled first".
	frappe.delete_doc("Vernon Event", name, ignore_permissions=True)
	return {"ok": True}
```

- [ ] **Step 2: Restart + verify (console; SM path + organizer stamp + permission gate)**
```bash
cd /home/frappe/frappe-bench && bench restart
bench --site project.vernon.id console <<'PY'
import frappe
frappe.set_user("Administrator")
from vernon_project.api import events_admin as ea
r = ea.save_event('{"title":"Mgmt Verify","start_datetime":"2026-08-01 10:00:00","pricing":"Free","status":"Draft"}')
ev = frappe.get_doc("Vernon Event", r["name"])
print("organizer stamped:", ev.organizer == "Administrator")
print("in manage list:", any(x["name"] == ev.name for x in ea.manage_list_events()))
# non-manager rejected
u = frappe.db.get_value("User", {"user_type":"System User","enabled":1,"name":["not in",["Administrator"]]}, "name")
frappe.set_user(u)
try:
    ea._can_manage(ev.name); print("gate FAIL (should have thrown)")
except frappe.PermissionError:
    print("gate ok: non-organizer blocked")
frappe.db.rollback()
PY
```
Expected: `organizer stamped: True`, `in manage list: True`, `gate ok: non-organizer blocked`.

- [ ] **Step 3: Commit**
```bash
git add vernon_project/api/events_admin.py
git commit -m "feat(events-mgmt): organizer-gated event CRUD API"
```

---

### Task A3: `events_admin.py` — roster + registration actions

**Files:** Modify `vernon_project/api/events_admin.py`

**Interfaces:**
- Consumes: `_can_manage`, `_require_user`.
- Produces: `event_roster(event) -> list`, `cancel_registration(name) -> {ok}`, `mark_attended(name, attended) -> {ok}`.

- [ ] **Step 1: Append to `events_admin.py`**
```python
ROSTER_FIELDS = ["name", "user", "status", "method", "amount", "attended", "registered_on"]


@frappe.whitelist()
def event_roster(event):
	_require_user()
	_can_manage(event)
	rows = frappe.get_all(
		"Vernon Event Registration", filters={"event": event},
		fields=ROSTER_FIELDS, order_by="registered_on desc",
	)
	for r in rows:
		r["full_name"] = frappe.db.get_value("User", r["user"], "full_name") or r["user"]
	return rows


def _reg_event(name):
	event = frappe.db.get_value("Vernon Event Registration", name, "event")
	if not event:
		frappe.throw("Registration not found", frappe.DoesNotExistError)
	return event


@frappe.whitelist()
def cancel_registration(name):
	_require_user()
	_can_manage(_reg_event(name))
	# Sets Cancelled. Points auto-refund (_user_balance sums only non-Cancelled
	# Points regs) and the seat auto-frees (_active_count ignores Cancelled).
	# Rupiah money refunds are out of scope (manual). Idempotent.
	frappe.db.set_value("Vernon Event Registration", name, "status", "Cancelled")
	return {"ok": True}


@frappe.whitelist()
def mark_attended(name, attended):
	_require_user()
	_can_manage(_reg_event(name))
	frappe.db.set_value(
		"Vernon Event Registration", name, "attended", 1 if int(attended) else 0
	)
	return {"ok": True}
```

- [ ] **Step 2: Restart + verify (roster gate + cancel refunds points + attended toggle)**
```bash
cd /home/frappe/frappe-bench && bench restart
bench --site project.vernon.id console <<'PY'
import frappe
from vernon_project.api import events_admin as ea
from vernon_project.api.mobile import _user_balance
frappe.set_user("Administrator")
ev = frappe.get_doc({"doctype":"Vernon Event","title":"Roster Verify","start_datetime":"2026-08-01 10:00:00","pricing":"Points","points_cost":5,"status":"Published","organizer":"Administrator"}).insert(ignore_permissions=True)
reg = frappe.get_doc({"doctype":"Vernon Event Registration","event":ev.name,"user":"Administrator","method":"Points","amount":5,"status":"Confirmed","registered_on":frappe.utils.now_datetime()}).insert(ignore_permissions=True)
b_before = _user_balance("Administrator")[2]
print("roster has 1:", len(ea.event_roster(ev.name)) == 1)
ea.mark_attended(reg.name, 1); print("attended set:", frappe.db.get_value("Vernon Event Registration", reg.name, "attended") == 1)
ea.cancel_registration(reg.name)
b_after = _user_balance("Administrator")[2]
print("cancelled:", frappe.db.get_value("Vernon Event Registration", reg.name, "status") == "Cancelled")
print("points refunded (+5):", round(b_after - b_before, 2) == 5.0)
frappe.db.rollback()
PY
```
Expected: `roster has 1: True`, `attended set: True`, `cancelled: True`, `points refunded (+5): True`.

- [ ] **Step 3: Commit**
```bash
git add vernon_project/api/events_admin.py
git commit -m "feat(events-mgmt): roster + cancel (auto-refund) + mark-attended"
```

---

## Phase B — Shared frontend layer (`frontend/src`, touches both apps)

### Task B1: types + `eventsAdminApi` + hooks + `canManageEvents`

**Files:** Modify `frontend/src/lib/types.ts`, `frontend/src/lib/api.ts`, `frontend/src/hooks/useData.ts`

**Interfaces:**
- Produces types `ManagedEvent`, `RosterEntry`, `EventFormPayload`; `eventsAdminApi.{list,save,remove,roster,cancelReg,markAttended}`; hooks `useManagedEvents`, `useSaveEvent`, `useDeleteEvent`, `useEventRoster`, `useCancelRegistration`, `useMarkAttended`; `canManageEvents(boot)`.

- [ ] **Step 1: Add types to `types.ts`**
```typescript
export interface ManagedEvent {
  name: string
  title: string
  start_datetime: string
  status: string
  pricing: 'Free' | 'Points' | 'Rupiah'
  capacity?: number
  registered_count: number
}

export interface RosterEntry {
  name: string
  user: string
  full_name: string
  status: 'Pending' | 'Confirmed' | 'Cancelled'
  method: 'Free' | 'Points' | 'Rupiah'
  amount?: number
  attended: number
  registered_on?: string
}

export interface EventFormPayload {
  title: string
  description?: string
  cover_image?: string | null
  start_datetime: string
  end_datetime?: string | null
  location?: string
  capacity: number
  pricing: 'Free' | 'Points' | 'Rupiah'
  points_cost?: number
  price?: number
  status: string
}
```

- [ ] **Step 2: Add `eventsAdminApi` to `api.ts`** (near `eventsApi`)
```typescript
import type { ManagedEvent, RosterEntry, EventFormPayload } from './types'

const EA = 'vernon_project.api.events_admin.'

export const eventsAdminApi = {
  list: () => api.get<ManagedEvent[]>(EA + 'manage_list_events'),
  get: (name: string) => api.get<Record<string, unknown>>(EA + 'get_managed_event', { name }),
  save: (payload: EventFormPayload, name?: string) =>
    api.post<{ name: string }>(EA + 'save_event', {
      payload: JSON.stringify(payload),
      ...(name ? { name } : {}),
    }),
  remove: (name: string) => api.post<{ ok: boolean }>(EA + 'delete_event', { name }),
  roster: (event: string) => api.get<RosterEntry[]>(EA + 'event_roster', { event }),
  cancelReg: (name: string) => api.post<{ ok: boolean }>(EA + 'cancel_registration', { name }),
  markAttended: (name: string, attended: number) =>
    api.post<{ ok: boolean }>(EA + 'mark_attended', { name, attended }),
}
```

- [ ] **Step 3: Add keys + hooks + gate to `useData.ts`** (import `eventsAdminApi`, `EventFormPayload` from `@/lib/...`; match the existing `Boot` type used by other `canManage*`)
```typescript
// in `keys`:
  managedEvents: ['managedEvents'] as const,
  managedEvent: (n: string) => ['managedEvent', n] as const,
  eventRoster: (e: string) => ['eventRoster', e] as const,

// any authenticated user may manage (create makes them organizer);
// per-event edit/roster/cancel is enforced server-side.
export function canManageEvents(boot: Boot | undefined): boolean {
  return !!boot
}

export const useManagedEvents = () =>
  useQuery({ queryKey: keys.managedEvents, queryFn: () => eventsAdminApi.list() })

export const useManagedEvent = (name: string, enabled = true) =>
  useQuery({ queryKey: keys.managedEvent(name), queryFn: () => eventsAdminApi.get(name), enabled: !!name && enabled })

export function useSaveEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ payload, name }: { payload: EventFormPayload; name?: string }) =>
      eventsAdminApi.save(payload, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.managedEvents })
      qc.invalidateQueries({ queryKey: keys.events })
    },
  })
}

export function useDeleteEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => eventsAdminApi.remove(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.managedEvents })
      qc.invalidateQueries({ queryKey: keys.events })
    },
  })
}

export const useEventRoster = (event: string, enabled = true) =>
  useQuery({
    queryKey: keys.eventRoster(event),
    queryFn: () => eventsAdminApi.roster(event),
    enabled: !!event && enabled,
  })

export function useCancelRegistration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => eventsAdminApi.cancelReg(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['eventRoster'] })
      qc.invalidateQueries({ queryKey: keys.managedEvents })
    },
  })
}

export function useMarkAttended() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, attended }: { name: string; attended: number }) =>
      eventsAdminApi.markAttended(name, attended),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['eventRoster'] }),
  })
}
```

- [ ] **Step 4: Typecheck + commit**
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
```
Expected: no new errors.
```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/hooks/useData.ts
git commit -m "feat(events-mgmt): shared management types, api, hooks"
```

---

## Phase C — Mobile `/m`

### Task C1: Manage Events list + route + Profile entry

**Files:** Create `frontend/src/pages/EventManageScreen.tsx`; modify `frontend/src/App.tsx`, `frontend/src/pages/Profile.tsx`

**Interfaces:** Consumes `useManagedEvents`. Navigates to `/events/manage/new` and `/events/manage/:name`.

- [ ] **Step 1: Write `EventManageScreen.tsx`** (mirror `BrandsScreen`; Soft-Pop)
```tsx
import { useNavigate } from 'react-router-dom'
import { Plus, CalendarCog } from 'lucide-react'
import { DetailScreen, PullToRefresh } from '@/components/Layout'
import { EmptyState, FullScreenLoader, Pill } from '@/components/ui'
import { useManagedEvents } from '@/hooks/useData'

export default function EventManageScreen() {
  const navigate = useNavigate()
  const { data, isLoading, refetch } = useManagedEvents()
  const events = data ?? []
  const addBtn = (
    <button onClick={() => navigate('/events/manage/new')} aria-label="New event"
      className="flex h-10 w-10 items-center justify-center rounded-full text-stone-600 transition active:scale-90 dark:text-slate-300">
      <Plus className="h-6 w-6" />
    </button>
  )
  return (
    <DetailScreen title="Manage Events" right={addBtn}>
      {isLoading && !data ? (
        <FullScreenLoader label="Loading…" />
      ) : (
        <PullToRefresh onRefresh={refetch}>
          {events.length === 0 ? (
            <EmptyState icon={CalendarCog} title="No events yet" subtitle="Tap + to create one." />
          ) : (
            <div className="flex flex-col gap-2.5">
              {events.map((e) => (
                <button key={e.name} onClick={() => navigate(`/events/manage/${encodeURIComponent(e.name)}`)}
                  className="flex items-center gap-3 rounded-2xl border border-paper-edge bg-paper-card p-3.5 text-left shadow-sm transition active:scale-[0.99] dark:border-slate-700 dark:bg-slate-800">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display font-semibold text-stone-800 dark:text-slate-50">{e.title}</span>
                    <span className="block truncate text-xs text-stone-500 dark:text-slate-400">
                      {new Date(e.start_datetime).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })} · {e.registered_count} registered
                    </span>
                  </span>
                  <Pill className="bg-paper-line text-stone-600 dark:bg-slate-700 dark:text-slate-300">{e.status}</Pill>
                </button>
              ))}
            </div>
          )}
        </PullToRefresh>
      )}
    </DetailScreen>
  )
}
```
(If `DetailScreen` has no `right` prop, check `components/Layout.tsx` — `TabScreen` has it; if `DetailScreen` lacks it, put the New button as the first list row instead.)

- [ ] **Step 2: Route in `App.tsx`**
```tsx
import EventManageScreen from './pages/EventManageScreen'
        <Route path="/events/manage" element={<EventManageScreen />} />
```

- [ ] **Step 3: Profile entry** — in `frontend/src/pages/Profile.tsx`, add a row (mirror the existing "Events" row added by the earlier feature; icon `CalendarCog`) navigating to `/events/manage`. Label "Manage Events".

- [ ] **Step 4: Build + commit**
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
```
Expected: success.
```bash
git add frontend/src/pages/EventManageScreen.tsx frontend/src/App.tsx frontend/src/pages/Profile.tsx
git commit -m "feat(events-mgmt): /m manage-events list + entry"
```

---

### Task C2: Event create/edit form + route

**Files:** Create `frontend/src/pages/EventFormScreen.tsx`; modify `frontend/src/App.tsx`

**Interfaces:** Consumes `useSaveEvent`, `useDeleteEvent`, `eventsAdminApi` (via hooks), `uploadRewardImage`. Route `/events/manage/new` and `/events/manage/:name` (edit). Edit view links to `/events/manage/:name/roster`.

This mirrors `frontend/src/pages/RewardFormScreen.tsx` (read it for the exact image-upload + `field` class + save/delete pattern). Key differences: event fields, `<input type="datetime-local">`, `<select>` for pricing/status, and it loads the existing event to seed edit state.

- [ ] **Step 1: Write `EventFormScreen.tsx`**
```tsx
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trash2, Check, ImagePlus, Users } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { uploadRewardImage } from '@/lib/api'
import { deleteErrorMessage } from '@/lib/format'
import { useSaveEvent, useDeleteEvent, useManagedEvent } from '@/hooks/useData'
import type { EventFormPayload } from '@/lib/types'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100'

// Frappe stores 'YYYY-MM-DD HH:MM:SS'; <input type=datetime-local> wants 'YYYY-MM-DDTHH:MM'.
const toInput = (v?: string | null) => (v ? v.slice(0, 16).replace(' ', 'T') : '')
const toFrappe = (v: string) => (v ? v.replace('T', ' ') + (v.length === 16 ? ':00' : '') : '')

const empty: EventFormPayload = {
  title: '', description: '', cover_image: null, start_datetime: '', end_datetime: '',
  location: '', capacity: 0, pricing: 'Free', points_cost: 0, price: 0, status: 'Draft',
}

export default function EventFormScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { name: rawName } = useParams()
  const name = rawName ? decodeURIComponent(rawName) : ''
  const isEdit = !!name
  const save = useSaveEvent()
  const del = useDeleteEvent()
  const { data: existing, isLoading: loading } = useManagedEvent(name, isEdit)

  const [form, setForm] = useState<EventFormPayload>(empty)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Seed the edit form from get_managed_event (gated by _can_manage server-side,
  // so a non-SM organizer can load their own Draft — Vernon Event is SM-only-read
  // via /api/resource, which is why we use the admin endpoint instead).
  useEffect(() => {
    if (!isEdit || !existing) return
    const d = existing as Record<string, unknown>
    setForm({
      title: (d.title as string) ?? '',
      description: (d.description as string) ?? '',
      cover_image: (d.cover_image as string) ?? null,
      start_datetime: toInput(d.start_datetime as string),
      end_datetime: toInput(d.end_datetime as string),
      location: (d.location as string) ?? '',
      capacity: (d.capacity as number) ?? 0,
      pricing: (d.pricing as EventFormPayload['pricing']) ?? 'Free',
      points_cost: (d.points_cost as number) ?? 0,
      price: (d.price as number) ?? 0,
      status: (d.status as string) ?? 'Draft',
    })
  }, [isEdit, existing])

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setUploading(true)
    try {
      const url = await uploadRewardImage(f)
      setForm((s) => ({ ...s, cover_image: url }))
      toast('success', 'Image uploaded')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const onSave = () => {
    if (!form.title.trim()) return toast('error', 'Title is required')
    if (!form.start_datetime) return toast('error', 'Start is required')
    const payload: EventFormPayload = {
      ...form,
      title: form.title.trim(),
      start_datetime: toFrappe(form.start_datetime),
      end_datetime: form.end_datetime ? toFrappe(form.end_datetime) : null,
      capacity: Number(form.capacity) || 0,
      points_cost: Number(form.points_cost) || 0,
      price: Number(form.price) || 0,
    }
    save.mutate(
      { payload, name: isEdit ? name : undefined },
      {
        onSuccess: () => { toast('success', isEdit ? 'Event saved' : 'Event created'); navigate('/events/manage') },
        onError: (e) => toast('error', (e as Error).message),
      },
    )
  }

  const remove = async () => {
    if (!(await confirm({ title: 'Delete this event?', confirmLabel: 'Delete', destructive: true }))) return
    del.mutate(name, {
      onSuccess: () => { toast('success', 'Event deleted'); navigate('/events/manage') },
      onError: (e) => toast('error', deleteErrorMessage(e, 'event')),
    })
  }

  if (isEdit && loading) {
    return <DetailScreen title="Event"><Spinner className="mx-auto h-5 w-5 text-slate-400" /></DetailScreen>
  }

  return (
    <DetailScreen title={isEdit ? 'Edit event' : 'New event'}>
      <div className="flex flex-col gap-4">
        {/* cover image */}
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className="flex h-36 w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-white text-slate-400 dark:border-slate-600 dark:bg-slate-800">
          {uploading ? <Spinner className="h-5 w-5" /> : form.cover_image
            ? <img src={form.cover_image} alt="" className="h-full w-full object-cover" />
            : <span className="flex flex-col items-center gap-1 text-xs"><ImagePlus className="h-6 w-6" /> Cover image</span>}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />

        <input className={field} placeholder="Title" value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        <textarea className={field} rows={3} placeholder="Description" value={form.description ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        <input className={field} placeholder="Location (address or URL)" value={form.location ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
        <div className="flex gap-3">
          <label className="flex-1 text-xs font-semibold text-slate-500">Start
            <input type="datetime-local" className={field} value={form.start_datetime}
              onChange={(e) => setForm((f) => ({ ...f, start_datetime: e.target.value }))} /></label>
          <label className="flex-1 text-xs font-semibold text-slate-500">End
            <input type="datetime-local" className={field} value={form.end_datetime ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, end_datetime: e.target.value }))} /></label>
        </div>
        <div className="flex gap-3">
          <label className="flex-1 text-xs font-semibold text-slate-500">Capacity (0=∞)
            <input type="text" inputMode="numeric" className={field} value={String(form.capacity)}
              onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value.replace(/[^\d]/g, '')) }))} /></label>
          <label className="flex-1 text-xs font-semibold text-slate-500">Pricing
            <select className={field} value={form.pricing}
              onChange={(e) => setForm((f) => ({ ...f, pricing: e.target.value as EventFormPayload['pricing'] }))}>
              <option>Free</option><option>Points</option><option>Rupiah</option>
            </select></label>
        </div>
        {form.pricing === 'Points' && (
          <label className="text-xs font-semibold text-slate-500">Points cost
            <input type="text" inputMode="numeric" className={field} value={String(form.points_cost)}
              onChange={(e) => setForm((f) => ({ ...f, points_cost: Number(e.target.value.replace(/[^\d]/g, '')) }))} /></label>
        )}
        {form.pricing === 'Rupiah' && (
          <label className="text-xs font-semibold text-slate-500">Price (Rp)
            <input type="text" inputMode="numeric" className={field} value={String(form.price)}
              onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value.replace(/[^\d]/g, '')) }))} /></label>
        )}
        <label className="text-xs font-semibold text-slate-500">Status
          <select className={field} value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
            <option>Draft</option><option>Published</option><option>Cancelled</option><option>Completed</option>
          </select></label>

        <button onClick={onSave} disabled={save.isPending || uploading}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
          {save.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} {isEdit ? 'Save changes' : 'Create event'}
        </button>

        {isEdit && (
          <>
            <button onClick={() => navigate(`/events/manage/${encodeURIComponent(name)}/roster`)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-sm font-semibold text-brand-600 shadow-sm active:scale-95 dark:bg-slate-800">
              <Users className="h-4 w-4" /> Registrations
            </button>
            <button onClick={remove} disabled={del.isPending}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-sm font-semibold text-rose-600 shadow-sm active:bg-rose-50 disabled:opacity-60 dark:bg-slate-800">
              {del.isPending ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />} Delete event
            </button>
          </>
        )}
      </div>
    </DetailScreen>
  )
}
```

- [ ] **Step 2: Routes in `App.tsx`** (order: `new` before `:name`)
```tsx
import EventFormScreen from './pages/EventFormScreen'
        <Route path="/events/manage/new" element={<EventFormScreen />} />
        <Route path="/events/manage/:name" element={<EventFormScreen />} />
```

- [ ] **Step 3: Build + commit**
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
```
Expected: success.
```bash
git add frontend/src/pages/EventFormScreen.tsx frontend/src/App.tsx
git commit -m "feat(events-mgmt): /m event create/edit form"
```

---

### Task C3: Roster screen + route

**Files:** Create `frontend/src/pages/EventRosterScreen.tsx`; modify `frontend/src/App.tsx`

**Interfaces:** Consumes `useEventRoster`, `useCancelRegistration`, `useMarkAttended`, `useConfirm`, `useToast`. Route `/events/manage/:name/roster`.

- [ ] **Step 1: Write `EventRosterScreen.tsx`**
```tsx
import { useParams } from 'react-router-dom'
import { UserCheck, UserX, Ticket } from 'lucide-react'
import { DetailScreen, PullToRefresh } from '@/components/Layout'
import { EmptyState, FullScreenLoader, Pill } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { useEventRoster, useCancelRegistration, useMarkAttended } from '@/hooks/useData'

export default function EventRosterScreen() {
  const { name: raw } = useParams()
  const event = raw ? decodeURIComponent(raw) : ''
  const toast = useToast()
  const confirm = useConfirm()
  const { data, isLoading, refetch } = useEventRoster(event)
  const cancelReg = useCancelRegistration()
  const attend = useMarkAttended()
  const rows = (data ?? []).filter((r) => r.status !== 'Cancelled')

  const onCancel = async (name: string) => {
    if (!(await confirm({ title: 'Cancel this registration?', message: 'Points are refunded automatically; the seat is freed.', confirmLabel: 'Cancel registration', destructive: true }))) return
    cancelReg.mutate(name, { onSuccess: () => toast('success', 'Registration cancelled'), onError: (e) => toast('error', (e as Error).message) })
  }

  return (
    <DetailScreen title="Registrations">
      {isLoading && !data ? <FullScreenLoader label="Loading…" /> : (
        <PullToRefresh onRefresh={refetch}>
          {rows.length === 0 ? <EmptyState icon={Ticket} title="No registrations" /> : (
            <div className="flex flex-col gap-2.5">
              {rows.map((r) => (
                <div key={r.name} className="flex items-center gap-3 rounded-2xl border border-paper-edge bg-paper-card p-3.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display font-semibold text-stone-800 dark:text-slate-50">{r.full_name}</span>
                    <span className="block truncate text-xs text-stone-500 dark:text-slate-400">{r.status} · {r.method}{r.amount ? ` · ${r.amount}` : ''}</span>
                  </span>
                  <button onClick={() => attend.mutate({ name: r.name, attended: r.attended ? 0 : 1 })}
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${r.attended ? 'bg-emerald-500 text-white' : 'bg-paper-line text-stone-500 dark:bg-slate-700'}`} aria-label="Toggle attended">
                    <UserCheck className="h-4 w-4" />
                  </button>
                  <button onClick={() => onCancel(r.name)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-paper-line text-rose-600 dark:bg-slate-700" aria-label="Cancel registration">
                    <UserX className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </PullToRefresh>
      )}
    </DetailScreen>
  )
}
```

- [ ] **Step 2: Route in `App.tsx`**
```tsx
import EventRosterScreen from './pages/EventRosterScreen'
        <Route path="/events/manage/:name/roster" element={<EventRosterScreen />} />
```

- [ ] **Step 3: Build + commit**
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npm run build
```
Expected: success.
```bash
git add frontend/src/pages/EventRosterScreen.tsx frontend/src/App.tsx
git commit -m "feat(events-mgmt): /m roster (cancel + mark-attended)"
```

---

## Phase D — Web `/w`

### Task D1: Manage Events list + route + nav

**Files:** Create `frontend-web/src/pages/EventManage.tsx`; modify `frontend-web/src/App.tsx`, `frontend-web/src/lib/nav.ts`

**Interfaces:** Consumes shared `useManagedEvents`. Flat-Notion (mirror `frontend-web/src/pages/Events.tsx`). Navigates to `/events/manage/new`, `/events/manage/:name`.

- [ ] **Step 1: Write `EventManage.tsx`** — `Page`/`PageHeader` (with a "New event" action button → `/events/manage/new`) + `DataTable` (columns: title, when, status, `registered_count`) with `onRowClick` → `/events/manage/${encodeURIComponent(e.name)}`; `Spinner`/`ErrorState` states. Reuse the exact shape of `Events.tsx` (F1).

- [ ] **Step 2: Route in web `App.tsx`** (inside `<Route element={<AppShell />}>`, ungated):
```tsx
import EventManage from '@web/pages/EventManage'
          <Route path="/events/manage" element={<EventManage />} />
```

- [ ] **Step 3: Nav leaf in `nav.ts`** — add `{ to: '/events/manage', label: 'Manage Events', sub: 'Create & roster', icon: CalendarCog }` to the REWARDS group (import `CalendarCog` from lucide-react). Set `match: '/events/manage'` if needed so it doesn't fight the `/events` leaf's active state.

- [ ] **Step 4: Build + commit**
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build
```
Expected: success.
```bash
git add frontend-web/src/pages/EventManage.tsx frontend-web/src/App.tsx frontend-web/src/lib/nav.ts
git commit -m "feat(events-mgmt): /w manage-events list + nav"
```

---

### Task D2: Web event create/edit form + route

**Files:** Create `frontend-web/src/pages/EventForm.tsx`; modify `frontend-web/src/App.tsx`

**Interfaces:** Consumes `useSaveEvent`, `useDeleteEvent`, `useManagedEvent` (loads the full event for edit — gated endpoint, NOT `/api/resource`), `uploadRewardImage`, `useToast`, `useConfirm`. Flat-Notion (mirror `frontend-web/src/pages/GroupForm.tsx` for structure + `Field` from `@web/components/ui`). Same field set + `toInput`/`toFrappe` datetime helpers as the mobile form (Task C2 Step 1). Route `/events/manage/new` and `/events/manage/:name`. Edit view links to `/events/manage/:name/roster`.

- [ ] **Step 1: Write `EventForm.tsx`** — read `GroupForm.tsx` for the web form conventions (`Page`, `Field`, `useToast`, `useConfirm`, `safeDecode` from `@web/lib/route`), then build the event form with the identical fields and save/delete/roster-link behavior as `EventFormScreen.tsx` (Task C2). Load the full event for edit via `useManagedEvent(name, isEdit)` (the gated admin endpoint — NOT `resource.get`, which is SM-only-read). Use `<input type="datetime-local">`, `<select>` for pricing/status, and the `toInput`/`toFrappe` helpers verbatim from C2. Semantic tokens only (no `paper-*`).

- [ ] **Step 2: Routes in web `App.tsx`** (`new` before `:name`, inside AppShell):
```tsx
import EventForm from '@web/pages/EventForm'
          <Route path="/events/manage/new" element={<EventForm />} />
          <Route path="/events/manage/:name" element={<EventForm />} />
```

- [ ] **Step 3: Build + commit**
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build
```
Expected: success.
```bash
git add frontend-web/src/pages/EventForm.tsx frontend-web/src/App.tsx
git commit -m "feat(events-mgmt): /w event create/edit form"
```

---

### Task D3: Web roster + route

**Files:** Create `frontend-web/src/pages/EventRoster.tsx`; modify `frontend-web/src/App.tsx`

**Interfaces:** Consumes `useEventRoster`, `useCancelRegistration`, `useMarkAttended`, `useConfirm`, `useToast`. Flat-Notion `DataTable`. Route `/events/manage/:name/roster`.

- [ ] **Step 1: Write `EventRoster.tsx`** — `Page`/`PageHeader` + `DataTable` of roster rows (columns: name/full_name, status, method, amount, attended-toggle button, cancel button). Filter out `Cancelled`. Cancel via `useCancelRegistration` behind a `useConfirm`; attended toggle via `useMarkAttended`. Mirror the action/logic of `EventRosterScreen.tsx` (C3), flat-Notion presentation.

- [ ] **Step 2: Route in web `App.tsx`**
```tsx
import EventRoster from '@web/pages/EventRoster'
          <Route path="/events/manage/:name/roster" element={<EventRoster />} />
```

- [ ] **Step 3: Build + commit**
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npm run build
```
Expected: success.
```bash
git add frontend-web/src/pages/EventRoster.tsx frontend-web/src/App.tsx
git commit -m "feat(events-mgmt): /w roster (cancel + mark-attended)"
```

---

## Phase E — Tests + deploy

### Task E1: `test_events_admin.py`

**Files:** Create `vernon_project/api/test_events_admin.py`

- [ ] **Step 1: Write `FrappeTestCase` tests** covering the spec's risk areas:
  1. `test_can_manage_gate` — an event organized by user A: user B (non-SM) calling `event_roster`/`save_event(name=...)`/`delete_event` on it raises `PermissionError`; A and a System Manager succeed.
  2. `test_save_event_stamps_organizer` — `save_event` with no `name` sets `organizer = session user`; a payload attempting to set `organizer` is ignored.
  3. `test_cancel_registration_refunds_points_and_frees_seat` — Confirmed Points reg; after `cancel_registration`, status is `Cancelled`, `_user_balance` rises by the amount, and `_active_count` drops by 1.
  4. `test_mark_attended` — toggles the `attended` Check 0→1→0.
  Use `Vernon Event` / `Vernon Event Registration`; roll back in `tearDown`.

- [ ] **Step 2: Import/compile-check ONLY (do NOT run `bench run-tests` on the live prod site)**
```bash
cd /home/frappe/frappe-bench && python3 -m py_compile apps/vernon_project/vernon_project/api/test_events_admin.py
```
Expected: clean (no output).

- [ ] **Step 3: Commit**
```bash
git add vernon_project/api/test_events_admin.py
git commit -m "test(events-mgmt): _can_manage gate, organizer stamp, cancel refund, attended"
```

---

### Task E2: Deploy

- [ ] **Step 1:** `bench --site project.vernon.id migrate` (attended field) — already done in A1, re-run is a no-op.
- [ ] **Step 2:** Clean build both apps:
```bash
cd /home/frappe/frappe-bench/apps/vernon_project
( cd frontend && npm run build ) && ( cd frontend-web && npm run build )
```
- [ ] **Step 3:** Stage the frontend build artifacts EXCLUDING the user's untracked `characters/` WIP, then commit:
```bash
git add -A vernon_project/public/frontend/index.html vernon_project/public/frontend/assets \
  vernon_project/public/frontend_web/index.html vernon_project/public/frontend_web/assets \
  vernon_project/www/m.html vernon_project/www/w.html vernon_project/www/vernon_sw.js
git commit -m "build(events-mgmt): deploy /m + /w management bundles"
```
- [ ] **Step 4:** Flag to the user: a **privileged restart** (`sudo supervisorctl restart all`) is required for the new `events_admin` endpoints to serve over HTTP (the controller lacks sudo).

---

## Self-Review

**Spec coverage:**
- `attended` Check → A1. ✓
- `_can_manage` (organizer or SM) → A2. ✓
- `manage_list_events` / `save_event` (organizer stamp, never reassign) / `delete_event` (LinkExists surfaced) → A2. ✓
- `event_roster` / `cancel_registration` (points auto-refund + seat free) / `mark_attended` → A3. ✓
- Shared types/api/hooks + `canManageEvents` (any authed user) → B1. ✓
- `/m` list + form (cover upload, pricing/status, datetime) + roster + Profile entry → C1–C3. ✓
- `/w` list + form + roster + nav → D1–D3. ✓
- Reuse `uploadRewardImage` → C2/D2. ✓
- No native confirm (useConfirm) → C2/C3/D2/D3. ✓
- Tests (gate, stamp, cancel refund, attended) → E1. ✓
- Out-of-scope (Rupiah money refund, waitlist, cross-organizer edit, role-narrowing) → not built. ✓

**Placeholder scan:** No TBD/TODO. D1/D2/D3 reference sibling templates (Events.tsx/GroupForm.tsx/EventRosterScreen.tsx) rather than repeating full code — acceptable: those templates are in-repo and the exact field set + datetime helpers are given verbatim in C2; each web task lists exact files, imports, hooks, route, and verify+commit.

**Type consistency:** `EventFormPayload`/`ManagedEvent`/`RosterEntry` used consistently across api.ts, hooks, and both form/list/roster screens. `eventsAdminApi.{list,get,save,remove,roster,cancelReg,markAttended}` names match B1 producers and C/D consumers. `save_event(payload, name?)` return `{name}` matches `useSaveEvent`; edit-load goes through `get_managed_event` → `useManagedEvent` (C2 + D2), NOT `/api/resource`. Datetime helpers `toInput`/`toFrappe` defined in C2, reused by D2.

**Resolved during planning:** the edit form loads via the gated `get_managed_event` endpoint (→ `useManagedEvent`), not `/api/resource` — so a non-SM organizer can load their own Draft even though `Vernon Event` is System-Manager-only-read. No `/api/resource` dependency remains.
