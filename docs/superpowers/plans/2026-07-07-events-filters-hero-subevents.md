# Events: Filters, Hero, Sub-events — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Browse-list filters (upcoming/past, search, category, price), a manually-featured hero carousel, and single-level nested sub-events to the Events feature on both `/m/events` (mobile) and `/w/events` (web).

**Architecture:** Three nullable fields on the existing **Vernon Event** doctype (`parent_event`, `category`, `is_featured`). A sub-event is a full Vernon Event with `parent_event` set — it reuses the entire event machinery (detail page, `register()`, roster). `list_events` returns top-level events only; `get_event` attaches decorated `sub_events`. All list filtering and hero derivation happen client-side from that one payload. Shared types + a tiny shared filter helper feed both frontends.

**Tech Stack:** Frappe (Python doctype + whitelisted API), React + TypeScript + react-query (shared `frontend/src`), Tailwind (mobile = Soft Pop `paper-*` tokens + lucide; web = flat-Notion semantic tokens).

## Global Constraints

- **Live site, no test DB.** Per project convention, automated Frappe unit tests are deferred; backend logic is verified via `bench console` snippets and browser checks. (User convention overrides the skill's TDD default.)
- **Deploy pipeline:** schema change ⇒ `bench --site project.vernon.id migrate`; Python change ⇒ `bench restart`; frontend change ⇒ `npm run build` in the relevant frontend dir. The operator may run these; each task states which apply.
- **Two frontends share `frontend/src`** (`@/`). Mobile = `frontend/`, web = `frontend-web/` (`@web/`). Editing a shared type/helper affects BOTH — keep them consistent.
- **Mobile idiom:** `paper-*` tokens, `brand-*`, lucide icons, `font-display`. **Web idiom:** semantic tokens (`ink`/`muted`/`line`/`hover`/`brand`), `Page`/`Section`/`Property`/`DataTable`/`Field`/`BentoTile`. NO `paper-*` in web.
- **Category starter set (verbatim):** `Workshop, Seminar, Expo, Kelas, Sosial, Kompetisi, Lainnya` (plus an empty "uncategorized" option).
- **Nesting is one level deep only** — parent → sub-event, no grandchildren.
- **Do not `git add` files you did not create/modify for this plan** (unrelated working-tree changes exist on `main`).

---

## File Structure

**Backend**
- `vernon_project/vernon_project/doctype/vernon_event/vernon_event.json` — +3 fields (modify)
- `vernon_project/vernon_project/doctype/vernon_event/vernon_event.py` — parent validation (modify)
- `vernon_project/api/events.py` — public fields + list filter + `sub_events` (modify)
- `vernon_project/api/events_admin.py` — `EDITABLE` fields (modify)

**Shared frontend (`frontend/src`)**
- `frontend/src/lib/types.ts` — `EventItem` + `EventFormPayload` fields (modify)
- `frontend/src/lib/events.ts` — filter/hero helpers + category constant (**create**)

**Mobile (`frontend/src/pages`)**
- `EventsScreen.tsx` — hero + filters (modify / full rewrite)
- `EventDetailScreen.tsx` — sub-events section (modify)
- `EventFormScreen.tsx` — category + featured + parent fields (modify)

**Web (`frontend-web/src/pages`)**
- `Events.tsx` — hero + filters (modify / full rewrite)
- `EventDetail.tsx` — sub-events section (modify)
- `EventForm.tsx` — category + featured + parent fields (modify)

---

## Task 1: Doctype fields + parent validation

**Files:**
- Modify: `vernon_project/vernon_project/doctype/vernon_event/vernon_event.json`
- Modify: `vernon_project/vernon_project/doctype/vernon_event/vernon_event.py`

**Interfaces:**
- Produces: three new Vernon Event fields — `parent_event` (Link → Vernon Event, empty = top-level), `category` (Select, empty = uncategorized), `is_featured` (Check, 0/1). Validation rejects self-parent and grandchildren.

- [ ] **Step 1: Add the three fields to the doctype JSON**

In `vernon_event.json`, replace the `field_order` array (lines 8-12) with this (adds four entries after `status`):

```json
 "field_order": [
  "title", "description", "cover_image", "organizer", "column_break_a",
  "start_datetime", "end_datetime", "location", "section_break_b",
  "capacity", "pricing", "points_cost", "price", "section_break_c", "status",
  "section_break_d", "category", "is_featured", "parent_event"
 ],
```

Then, in the `"fields"` array, add these four objects immediately after the `status` field object (the one ending `"default": "Draft", "in_list_view": 1}` on line 28) — add a comma after that closing brace, then:

```json
  {"fieldname": "section_break_d", "fieldtype": "Section Break", "label": "Categorization"},
  {"fieldname": "category", "fieldtype": "Select", "label": "Category", "options": "\nWorkshop\nSeminar\nExpo\nKelas\nSosial\nKompetisi\nLainnya"},
  {"fieldname": "is_featured", "fieldtype": "Check", "label": "Featured (show in hero)", "default": "0"},
  {"fieldname": "parent_event", "fieldtype": "Link", "label": "Parent Event (makes this a sub-event)", "options": "Vernon Event", "search_index": 1}
```

(The leading `\n` in `category` options makes the first choice blank = uncategorized.)

- [ ] **Step 2: Add parent validation to the controller**

In `vernon_event.py`, append this block to the end of the `validate` method (after the capacity check on line 17), keeping the existing indentation:

```python
		if self.parent_event:
			if self.parent_event == self.name:
				frappe.throw("An event cannot be its own parent.", frappe.ValidationError)
			# one level deep only: the chosen parent must itself be a top-level event
			if frappe.db.get_value("Vernon Event", self.parent_event, "parent_event"):
				frappe.throw("Sub-events can only nest one level deep.", frappe.ValidationError)
```

- [ ] **Step 3: Sync the schema**

Run: `bench --site project.vernon.id migrate`
Expected: completes without error; new columns `category`, `is_featured`, `parent_event` added to `tabVernon Event`.

- [ ] **Step 4: Runnable check — validation guard (bench console)**

Run `bench --site project.vernon.id console`, then paste (NOT as a loop — single statements, per the bench-console stdin gotcha):

```python
import frappe
p = frappe.get_doc({"doctype":"Vernon Event","title":"P_check","start_datetime":"2030-01-01 10:00:00","status":"Draft"}).insert(ignore_permissions=True)
c = frappe.get_doc({"doctype":"Vernon Event","title":"C_check","start_datetime":"2030-01-01 11:00:00","status":"Draft","parent_event":p.name}).insert(ignore_permissions=True)
gc = frappe.get_doc({"doctype":"Vernon Event","title":"GC_check","start_datetime":"2030-01-01 12:00:00","status":"Draft","parent_event":c.name})
```

Then:

```python
try:
    gc.insert(ignore_permissions=True); print("FAIL: grandchild allowed")
except frappe.ValidationError:
    print("PASS: grandchild rejected")
```

Expected output: `PASS: grandchild rejected`. Clean up:

```python
frappe.delete_doc("Vernon Event", c.name, ignore_permissions=True); frappe.delete_doc("Vernon Event", p.name, ignore_permissions=True); frappe.db.commit()
```

- [ ] **Step 5: Commit**

```bash
git add vernon_project/vernon_project/doctype/vernon_event/vernon_event.json vernon_project/vernon_project/doctype/vernon_event/vernon_event.py
git commit -m "feat(events): add category, is_featured, parent_event fields + nesting guard"
```

---

## Task 2: Public API — fields, top-level list, sub_events

**Files:**
- Modify: `vernon_project/api/events.py`

**Interfaces:**
- Consumes: Task 1 fields.
- Produces: `list_events()` returns only top-level Published events, each carrying `category`, `is_featured`, `parent_event`. `get_event(event)` returns the event plus `sub_events: list` (decorated Published children).

- [ ] **Step 1: Add the new fields to `PUBLIC_EVENT_FIELDS`**

Replace `PUBLIC_EVENT_FIELDS` (lines 9-12) with:

```python
PUBLIC_EVENT_FIELDS = [
	"name", "title", "cover_image", "start_datetime", "end_datetime",
	"location", "pricing", "points_cost", "price", "capacity",
	"category", "is_featured", "parent_event",
]
```

- [ ] **Step 2: Filter `list_events` to top-level only**

Replace the body of `list_events` (lines 47-55) with:

```python
def list_events():
	user = _require_user()
	rows = frappe.get_all(
		"Vernon Event",
		filters={"status": "Published"},
		fields=PUBLIC_EVENT_FIELDS,
		order_by="start_datetime asc",
	)
	# ponytail: client-side filtering. If published-event count reaches thousands,
	# add server params (period, category, pricing, q) here and paginate.
	return [_decorate(r, user) for r in rows if not r.get("parent_event")]
```

- [ ] **Step 3: Attach `sub_events` in `get_event`**

Replace the body of `get_event` (lines 59-68) with:

```python
def get_event(event):
	user = _require_user()
	if not frappe.db.exists("Vernon Event", event):
		frappe.throw("Event not found", frappe.DoesNotExistError)
	row = frappe.db.get_value(
		"Vernon Event", event, PUBLIC_EVENT_FIELDS + ["description", "organizer", "status"], as_dict=True
	)
	if row.status != "Published":
		frappe.throw("Event not available", frappe.PermissionError)
	_decorate(row, user)
	children = frappe.get_all(
		"Vernon Event",
		filters={"parent_event": event, "status": "Published"},
		fields=PUBLIC_EVENT_FIELDS,
		order_by="start_datetime asc",
	)
	row["sub_events"] = [_decorate(c, user) for c in children]
	return row
```

- [ ] **Step 4: Reload the code**

Run: `bench restart`
Expected: workers restart cleanly.

- [ ] **Step 5: Runnable check — sub_events flow (bench console)**

Run `bench --site project.vernon.id console`, paste (single statements):

```python
import frappe
frappe.set_user("Administrator")
p = frappe.get_doc({"doctype":"Vernon Event","title":"Expo_check","start_datetime":"2030-02-01 10:00:00","status":"Published"}).insert(ignore_permissions=True)
c = frappe.get_doc({"doctype":"Vernon Event","title":"Mini_check","start_datetime":"2030-02-01 11:00:00","status":"Published","parent_event":p.name}).insert(ignore_permissions=True)
from vernon_project.api.events import list_events, get_event
top = [e["name"] for e in list_events()]
print("child NOT in list:", c.name not in top, "| parent in list:", p.name in top)
print("sub_events count:", len(get_event(p.name)["sub_events"]))
```

Expected: `child NOT in list: True | parent in list: True` and `sub_events count: 1`. Clean up:

```python
frappe.delete_doc("Vernon Event", c.name, ignore_permissions=True); frappe.delete_doc("Vernon Event", p.name, ignore_permissions=True); frappe.db.commit()
```

- [ ] **Step 6: Commit**

```bash
git add vernon_project/api/events.py
git commit -m "feat(events): top-level-only list + sub_events on get_event"
```

---

## Task 3: Admin API — persist new fields

**Files:**
- Modify: `vernon_project/api/events_admin.py`

**Interfaces:**
- Consumes: Task 1 fields.
- Produces: `save_event` persists `category`, `is_featured`, `parent_event`; `get_managed_event` returns them (it returns `["name"] + EDITABLE`).

- [ ] **Step 1: Add the fields to `EDITABLE`**

Replace the `EDITABLE` list (lines 11-14) with:

```python
EDITABLE = [
	"title", "description", "cover_image", "start_datetime", "end_datetime",
	"location", "capacity", "pricing", "points_cost", "price", "status",
	"category", "is_featured", "parent_event",
]  # NOTE: 'organizer' deliberately excluded — never set from client payload.
# ponytail: parent_event ownership isn't re-checked; all organizers are trusted staff.
# Add a _can_manage(parent) check here if untrusted organizers are ever introduced.
```

- [ ] **Step 2: Reload the code**

Run: `bench restart`
Expected: workers restart cleanly.

- [ ] **Step 3: Runnable check — round-trip (bench console)**

Run `bench --site project.vernon.id console`, paste (single statements):

```python
import frappe
frappe.set_user("Administrator")
from vernon_project.api.events_admin import save_event, get_managed_event
name = save_event({"title":"Admin_check","start_datetime":"2030-03-01 10:00:00","status":"Draft","category":"Expo","is_featured":1})["name"]
g = get_managed_event(name)
print("category:", g["category"], "| featured:", g["is_featured"])
```

Expected: `category: Expo | featured: 1`. Clean up:

```python
frappe.delete_doc("Vernon Event", name, ignore_permissions=True); frappe.db.commit()
```

- [ ] **Step 4: Commit**

```bash
git add vernon_project/api/events_admin.py
git commit -m "feat(events): persist category, is_featured, parent_event via admin API"
```

---

## Task 4: Shared types + filter helper

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Create: `frontend/src/lib/events.ts`

**Interfaces:**
- Consumes: API shapes from Tasks 2-3.
- Produces:
  - `EventItem` gains `category?: string`, `is_featured?: boolean`, `parent_event?: string`, `sub_events?: EventItem[]`.
  - `EventFormPayload` gains `category?: string`, `is_featured?: boolean`, `parent_event?: string | null`.
  - `frontend/src/lib/events.ts` exports: `EVENT_CATEGORIES: string[]`, `type EventFilter`, `isUpcoming(e)`, `filterEvents(items, f)`, `featuredUpcoming(items)`, `eventCategories(items)`.

- [ ] **Step 1: Extend `EventItem`**

In `types.ts`, replace the `EventItem` interface (lines 799-815) with:

```ts
export interface EventItem {
  name: string
  title: string
  description?: string
  cover_image?: string
  organizer?: string
  start_datetime: string
  end_datetime?: string
  location?: string
  pricing: 'Free' | 'Points' | 'Rupiah'
  points_cost?: number
  price?: number
  capacity?: number
  registered_count: number
  is_full: boolean
  my_status: 'Pending' | 'Confirmed' | 'Cancelled' | null
  category?: string
  is_featured?: boolean
  parent_event?: string
  sub_events?: EventItem[]
}
```

- [ ] **Step 2: Extend `EventFormPayload`**

Replace the `EventFormPayload` interface (lines 858-870) with:

```ts
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
  category?: string
  is_featured?: boolean
  parent_event?: string | null
}
```

- [ ] **Step 3: Create the shared filter helper**

Create `frontend/src/lib/events.ts`:

```ts
import type { EventItem } from './types'

// Keep in sync with the Vernon Event `category` Select options (backend).
export const EVENT_CATEGORIES = ['Workshop', 'Seminar', 'Expo', 'Kelas', 'Sosial', 'Kompetisi', 'Lainnya']

export type EventFilter = {
  q: string
  period: 'upcoming' | 'past'
  category: string // 'all' or a category value
  pricing: string // 'all' | 'Free' | 'Points' | 'Rupiah'
}

export const isUpcoming = (e: EventItem) => new Date(e.start_datetime).getTime() >= Date.now()

export function filterEvents(items: EventItem[], f: EventFilter): EventItem[] {
  const q = f.q.trim().toLowerCase()
  return items.filter(
    (e) =>
      (f.period === 'upcoming' ? isUpcoming(e) : !isUpcoming(e)) &&
      (f.category === 'all' || e.category === f.category) &&
      (f.pricing === 'all' || e.pricing === f.pricing) &&
      (!q || e.title.toLowerCase().includes(q)),
  )
}

// Hero source: featured AND still upcoming.
export const featuredUpcoming = (items: EventItem[]) => items.filter((e) => e.is_featured && isUpcoming(e))

// Distinct categories actually present in the data (for the chip row).
export const eventCategories = (items: EventItem[]) =>
  [...new Set(items.map((e) => e.category).filter(Boolean))] as string[]
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors from `types.ts` or `events.ts`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/events.ts
git commit -m "feat(events): shared types + client filter/hero helpers"
```

---

## Task 5: Mobile Browse — hero carousel + filters

**Files:**
- Modify (full rewrite): `frontend/src/pages/EventsScreen.tsx`

**Interfaces:**
- Consumes: `useEvents()`, `useManagedEvents()`, and `frontend/src/lib/events.ts` (`filterEvents`, `featuredUpcoming`, `eventCategories`, `EventFilter`).
- Produces: Browse tab shows a horizontal hero of featured-upcoming events, a filter bar (search + upcoming/past + category chips + price chips), and the filtered list. Manage tab unchanged.

- [ ] **Step 1: Rewrite `EventsScreen.tsx`**

Replace the entire file with:

```tsx
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarDays, CalendarCog, Plus, Ticket, Search } from 'lucide-react'
import { DetailScreen, PullToRefresh } from '@/components/Layout'
import { EmptyState, FullScreenLoader, Pill, Segmented } from '@/components/ui'
import { useEvents, useManagedEvents } from '@/hooks/useData'
import { filterEvents, featuredUpcoming, eventCategories, type EventFilter } from '@/lib/events'
import type { EventItem } from '@/lib/types'

type Tab = 'browse' | 'manage'

function priceLabel(e: { pricing: string; points_cost?: number; price?: number }) {
  if (e.pricing === 'Free') return 'Free'
  if (e.pricing === 'Points') return `${e.points_cost ?? 0} pts`
  return `Rp ${(e.price ?? 0).toLocaleString('id-ID')}`
}

const fmtDate = (v: string) => new Date(v).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })

// Small pill-style chip toggle used for period / category / price filter rows.
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition active:scale-95 ${
        active
          ? 'bg-brand-600 text-white'
          : 'bg-paper-line text-stone-600 dark:bg-slate-700 dark:text-slate-300'
      }`}
    >
      {children}
    </button>
  )
}

export default function EventsScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'manage' ? 'manage' : 'browse')
  const browse = useEvents()
  const managed = useManagedEvents()

  const [filter, setFilter] = useState<EventFilter>({ q: '', period: 'upcoming', category: 'all', pricing: 'all' })

  const active = tab === 'browse' ? browse : managed
  const browseItems = (browse.data ?? []) as EventItem[]
  const hero = tab === 'browse' ? featuredUpcoming(browseItems) : []
  const cats = tab === 'browse' ? eventCategories(browseItems) : []
  const browseList = tab === 'browse' ? filterEvents(browseItems, filter) : []
  const manageList = managed.data ?? []

  const addBtn =
    tab === 'manage' ? (
      <button onClick={() => navigate('/events/manage/new')} aria-label="New event"
        className="flex h-10 w-10 items-center justify-center rounded-full text-stone-600 transition active:scale-90 dark:text-slate-300">
        <Plus className="h-6 w-6" />
      </button>
    ) : undefined

  return (
    <DetailScreen title="Events" right={addBtn}>
      <div className="mb-3">
        <Segmented<Tab>
          options={[
            { value: 'browse', label: 'Browse' },
            { value: 'manage', label: 'Manage' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {active.isLoading && !active.data ? (
        <FullScreenLoader label="Loading events…" />
      ) : tab === 'manage' ? (
        <PullToRefresh onRefresh={managed.refetch}>
          {manageList.length === 0 ? (
            <EmptyState icon={CalendarCog} title="No events yet" subtitle="Tap + to create one." />
          ) : (
            <div className="flex flex-col gap-2.5">
              {manageList.map((e) => (
                <button
                  key={e.name}
                  onClick={() => navigate(`/events/manage/${encodeURIComponent(e.name)}`)}
                  className="flex items-center gap-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-3.5 text-left shadow-sm transition active:scale-[0.99]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display font-semibold text-stone-800 dark:text-slate-50">{e.title}</span>
                    <span className="block truncate text-xs text-stone-500 dark:text-slate-400">
                      {fmtDate(e.start_datetime)} · {e.registered_count ?? 0} registered
                    </span>
                  </span>
                  <Pill className="bg-paper-line text-stone-600 dark:bg-slate-700 dark:text-slate-300">{e.status}</Pill>
                </button>
              ))}
            </div>
          )}
        </PullToRefresh>
      ) : (
        <PullToRefresh onRefresh={browse.refetch}>
          {/* Hero: featured upcoming events */}
          {hero.length > 0 && (
            <div className="-mx-1 mb-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {hero.map((e) => (
                <button
                  key={e.name}
                  onClick={() => navigate(`/events/${encodeURIComponent(e.name)}`)}
                  className="relative w-[80%] shrink-0 snap-start overflow-hidden rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 text-left shadow-sm transition active:scale-[0.99]"
                >
                  {e.cover_image ? (
                    <img src={e.cover_image} alt="" className="h-32 w-full object-cover" />
                  ) : (
                    <span className="flex h-32 w-full items-center justify-center bg-brand-50 dark:bg-slate-700">
                      <Ticket className="h-7 w-7 text-brand-500" />
                    </span>
                  )}
                  <span className="block p-3">
                    <span className="mb-1 inline-block rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Featured
                    </span>
                    <span className="block truncate font-display font-semibold text-stone-800 dark:text-slate-50">{e.title}</span>
                    <span className="block truncate text-xs text-stone-500 dark:text-slate-400">
                      {fmtDate(e.start_datetime)} · {priceLabel(e)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="mb-3 space-y-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                value={filter.q}
                onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
                placeholder="Cari acara…"
                className="w-full rounded-xl border border-paper-edge bg-paper-card py-2 pl-9 pr-3 text-sm text-stone-700 placeholder:text-stone-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Chip active={filter.period === 'upcoming'} onClick={() => setFilter((f) => ({ ...f, period: 'upcoming' }))}>Upcoming</Chip>
              <Chip active={filter.period === 'past'} onClick={() => setFilter((f) => ({ ...f, period: 'past' }))}>Past</Chip>
              <span className="mx-0.5 w-px shrink-0 self-stretch bg-paper-line dark:bg-slate-700" />
              {(['all', 'Free', 'Points', 'Rupiah'] as const).map((p) => (
                <Chip key={p} active={filter.pricing === p} onClick={() => setFilter((f) => ({ ...f, pricing: p }))}>
                  {p === 'all' ? 'All price' : p}
                </Chip>
              ))}
            </div>
            {cats.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <Chip active={filter.category === 'all'} onClick={() => setFilter((f) => ({ ...f, category: 'all' }))}>All</Chip>
                {cats.map((c) => (
                  <Chip key={c} active={filter.category === c} onClick={() => setFilter((f) => ({ ...f, category: c }))}>{c}</Chip>
                ))}
              </div>
            )}
          </div>

          {/* Filtered list */}
          {browseList.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No events" subtitle="Try different filters." />
          ) : (
            <div className="flex flex-col gap-2.5">
              {browseList.map((e) => (
                <button
                  key={e.name}
                  onClick={() => navigate(`/events/${encodeURIComponent(e.name)}`)}
                  className="flex items-center gap-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-3.5 text-left shadow-sm transition active:scale-[0.99]"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 dark:bg-slate-700">
                    <Ticket className="h-5 w-5 text-brand-500" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display font-semibold text-stone-800 dark:text-slate-50">{e.title}</span>
                    <span className="block truncate text-xs text-stone-500 dark:text-slate-400">
                      {fmtDate(e.start_datetime)}{e.category ? ` · ${e.category}` : ''}
                    </span>
                  </span>
                  <Pill>{e.my_status === 'Confirmed' ? 'Joined' : priceLabel(e)}</Pill>
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

- [ ] **Step 2: Type-check + build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 3: Browser check**

Load `/m/events`. Verify: featured upcoming events appear in the hero strip; search box filters by title; Upcoming/Past toggle switches the set; price + category chips narrow the list; empty-filter state shows "No events". Manage tab still lists managed events normally.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/EventsScreen.tsx
git commit -m "feat(events): mobile hero carousel + browse filters"
```

---

## Task 6: Mobile detail — sub-events section

**Files:**
- Modify: `frontend/src/pages/EventDetailScreen.tsx`

**Interfaces:**
- Consumes: `ev.sub_events` from `useEvent`.
- Produces: a "Acara di dalam" section listing child events; tapping a child navigates to its own detail screen.

- [ ] **Step 1: Add navigation + imports**

In `EventDetailScreen.tsx`, change the router import (line 2) to include `useNavigate`:

```tsx
import { useParams, useNavigate } from 'react-router-dom'
```

Add `Ticket` to the lucide import (line 3):

```tsx
import { MapPin, Calendar, Ticket } from 'lucide-react'
```

Inside the component, after `const name = raw ? decodeURIComponent(raw) : ''` (line 14), add:

```tsx
  const navigate = useNavigate()
```

- [ ] **Step 2: Render the sub-events section**

Immediately after the registered-count `<p>` element (lines 99-101, the one ending `registered{ev.capacity ? ...}</p>`) and BEFORE the register `<button>`, insert:

```tsx
      {ev.sub_events && ev.sub_events.length > 0 && (
        <div className="mt-5">
          <h2 className="mb-2 font-display text-sm font-semibold text-stone-700 dark:text-slate-200">Acara di dalam</h2>
          <div className="flex flex-col gap-2">
            {ev.sub_events.map((s) => (
              <button
                key={s.name}
                onClick={() => navigate(`/events/${encodeURIComponent(s.name)}`)}
                className="flex items-center gap-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-3 text-left shadow-sm transition active:scale-[0.99]"
              >
                {s.cover_image ? (
                  <img src={s.cover_image} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 dark:bg-slate-700">
                    <Ticket className="h-4 w-4 text-brand-500" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-stone-800 dark:text-slate-50">{s.title}</span>
                  <span className="block truncate text-xs text-stone-500 dark:text-slate-400">
                    {new Date(s.start_datetime).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                    {s.pricing === 'Free' ? ' · Free' : s.pricing === 'Points' ? ` · ${s.points_cost ?? 0} pts` : ` · Rp ${(s.price ?? 0).toLocaleString('id-ID')}`}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-brand-600">
                  {s.my_status === 'Confirmed' ? 'Joined' : 'Lihat'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
```

- [ ] **Step 2b: Type-check + build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 3: Browser check**

Open a parent event (an expo with Published children) at `/m/events/<name>`. Verify the "Acara di dalam" section lists each child with date + price; tapping one opens that child's detail where it can be registered independently.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/EventDetailScreen.tsx
git commit -m "feat(events): mobile sub-events section on detail"
```

---

## Task 7: Mobile form — category, featured, parent fields

**Files:**
- Modify: `frontend/src/pages/EventFormScreen.tsx`

**Interfaces:**
- Consumes: `EventFormPayload` (category/is_featured/parent_event), `EVENT_CATEGORIES`, `useManagedEvents()`.
- Produces: form persists the three new fields. Parent picker lists managed events (excluding the current one).

- [ ] **Step 1: Add imports + parent options hook**

In `EventFormScreen.tsx`, change the hooks import (line 10) to add `useManagedEvents`:

```tsx
import { useSaveEvent, useDeleteEvent, useManagedEvent, useManagedEvents } from '@/hooks/useData'
```

Add below it:

```tsx
import { EVENT_CATEGORIES } from '@/lib/events'
```

Inside the component, after `const del = useDeleteEvent()` (line 33), add:

```tsx
  const managedEvents = useManagedEvents()
```

- [ ] **Step 2: Add the fields to `empty`**

Replace the `empty` constant (lines 20-23) with:

```tsx
const empty: EventFormPayload = {
  title: '', description: '', cover_image: null, start_datetime: '', end_datetime: '',
  location: '', capacity: 0, pricing: 'Free', points_cost: 0, price: 0, status: 'Draft',
  category: '', is_featured: false, parent_event: '',
}
```

- [ ] **Step 3: Seed the new fields on edit**

In the `useEffect` seed (lines 46-58), add these three keys inside the `setForm({ ... })` object, after `status: (d.status as string) ?? 'Draft',`:

```tsx
      category: (d.category as string) ?? '',
      is_featured: !!d.is_featured,
      parent_event: (d.parent_event as string) ?? '',
```

- [ ] **Step 4: Render the three inputs**

Immediately after the Status `<label>` block (lines 156-160, ending `</select></label>`) and BEFORE the Save `<button>`, insert:

```tsx
        <label className="text-xs font-semibold text-slate-500">Category
          <select className={field} value={form.category ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
            <option value="">— Uncategorized —</option>
            {EVENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></label>

        <label className="text-xs font-semibold text-slate-500">Parent event (leave empty for a top-level event)
          <select className={field} value={form.parent_event ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, parent_event: e.target.value }))}>
            <option value="">— None (top-level) —</option>
            {(managedEvents.data ?? []).filter((m) => m.name !== name).map((m) => (
              <option key={m.name} value={m.name}>{m.title}</option>
            ))}
          </select></label>

        <label className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={!!form.is_featured}
            onChange={(e) => setForm((f) => ({ ...f, is_featured: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
          Featured (show in hero)
        </label>
```

- [ ] **Step 5: Type-check + build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds. (`payload = {...form}` in `onSave` already forwards the new fields — no change to `onSave` needed.)

- [ ] **Step 6: Browser check**

At `/m/events/manage/new`: set a category, tick Featured, save → confirm it appears in the hero on Browse. Edit an event, set Parent event to another event, save → confirm it becomes a sub-event (disappears from top-level Browse, appears under the parent's detail). Setting a parent that is itself a sub-event must surface the backend error toast "Sub-events can only nest one level deep."

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/EventFormScreen.tsx
git commit -m "feat(events): mobile form category, featured, parent fields"
```

---

## Task 8: Web Browse — hero strip + filters

**Files:**
- Modify (full rewrite): `frontend-web/src/pages/Events.tsx`

**Interfaces:**
- Consumes: `useEvents()`, `useManagedEvents()`, `frontend/src/lib/events.ts`.
- Produces: web Browse tab renders a featured hero strip + a filter row above the DataTable; the table shows the filtered rows. Manage tab unchanged.

- [ ] **Step 1: Rewrite `Events.tsx`**

Replace the entire file with:

```tsx
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarDays, Search, Ticket } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { ErrorState } from '@web/components/ui'
import { useEvents, useManagedEvents } from '@/hooks/useData'
import { filterEvents, featuredUpcoming, eventCategories, type EventFilter } from '@/lib/events'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable } from '@web/components/DataTable'
import type { EventItem, ManagedEvent } from '@/lib/types'

type Tab = 'browse' | 'manage'
const TABS: { value: Tab; label: string }[] = [
  { value: 'browse', label: 'Browse' },
  { value: 'manage', label: 'Manage' },
]

function price(e: EventItem) {
  if (e.pricing === 'Free') return 'Free'
  if (e.pricing === 'Points') return `${e.points_cost ?? 0} pts`
  return `Rp ${(e.price ?? 0).toLocaleString('id-ID')}`
}

const fmtDate = (v: string) => new Date(v).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium transition ${
        active ? 'bg-brand-600 text-white' : 'bg-hover/[0.05] text-muted hover:bg-hover/[0.1]'
      }`}
    >
      {children}
    </button>
  )
}

export default function Events() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'manage' ? 'manage' : 'browse')
  const browse = useEvents()
  const managed = useManagedEvents()

  const [filter, setFilter] = useState<EventFilter>({ q: '', period: 'upcoming', category: 'all', pricing: 'all' })

  const q = tab === 'browse' ? browse : managed
  const browseItems = (browse.data ?? []) as EventItem[]
  const hero = featuredUpcoming(browseItems)
  const cats = eventCategories(browseItems)
  const browseRows = filterEvents(browseItems, filter)

  const toggle = (
    <div className="flex items-center gap-2">
      {TABS.map((t) => (
        <button
          key={t.value}
          onClick={() => setTab(t.value)}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${tab === t.value ? 'bg-brand-600 text-white' : 'bg-hover/[0.05] text-muted hover:bg-hover/[0.1]'}`}
        >
          {t.label}
        </button>
      ))}
      {tab === 'manage' && (
        <button
          onClick={() => navigate('/events/manage/new')}
          className="ml-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          New event
        </button>
      )}
    </div>
  )

  return (
    <Page>
      <PageHeader icon={CalendarDays} title="Events" actions={toggle} />
      {q.isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : tab === 'browse' ? (
        <div className="space-y-4">
          {/* Hero: featured upcoming */}
          {hero.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {hero.map((e) => (
                <button
                  key={e.name}
                  onClick={() => navigate(`/events/${encodeURIComponent(e.name)}`)}
                  className="overflow-hidden rounded-xl border border-line bg-hover/[0.02] text-left transition hover:bg-hover/[0.05]"
                >
                  {e.cover_image ? (
                    <img src={e.cover_image} alt="" className="h-32 w-full object-cover" />
                  ) : (
                    <span className="flex h-32 w-full items-center justify-center bg-brand-50 dark:bg-brand-600/10">
                      <Ticket className="h-7 w-7 text-brand-600" />
                    </span>
                  )}
                  <span className="block p-3">
                    <span className="mb-1 inline-block rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Featured</span>
                    <span className="block truncate font-medium text-ink">{e.title}</span>
                    <span className="block truncate text-sm text-muted">{fmtDate(e.start_datetime)} · {price(e)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={filter.q}
                onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
                placeholder="Search events…"
                className="rounded-lg border border-line bg-hover/[0.04] py-1.5 pl-8 pr-3 text-sm text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none"
              />
            </div>
            <Chip active={filter.period === 'upcoming'} onClick={() => setFilter((f) => ({ ...f, period: 'upcoming' }))}>Upcoming</Chip>
            <Chip active={filter.period === 'past'} onClick={() => setFilter((f) => ({ ...f, period: 'past' }))}>Past</Chip>
            <span className="mx-1 h-5 w-px bg-line" />
            {(['all', 'Free', 'Points', 'Rupiah'] as const).map((p) => (
              <Chip key={p} active={filter.pricing === p} onClick={() => setFilter((f) => ({ ...f, pricing: p }))}>{p === 'all' ? 'All price' : p}</Chip>
            ))}
            {cats.length > 0 && <span className="mx-1 h-5 w-px bg-line" />}
            {cats.length > 0 && (
              <Chip active={filter.category === 'all'} onClick={() => setFilter((f) => ({ ...f, category: 'all' }))}>All</Chip>
            )}
            {cats.map((c) => (
              <Chip key={c} active={filter.category === c} onClick={() => setFilter((f) => ({ ...f, category: c }))}>{c}</Chip>
            ))}
          </div>

          <DataTable
            rows={browseRows}
            columns={[
              { key: 'title', header: 'Event', sortValue: (e) => e.title,
                render: (e) => <span className="font-medium text-ink">{e.title}</span> },
              { key: 'start', header: 'When', sortValue: (e) => e.start_datetime,
                render: (e) => <span className="text-muted">{fmtDate(e.start_datetime)}</span> },
              { key: 'category', header: 'Category', render: (e) => <span className="text-muted">{e.category || '—'}</span> },
              { key: 'price', header: 'Price', render: (e) => <span className="text-muted">{price(e)}</span> },
              { key: 'status', header: '', render: (e) => e.my_status === 'Confirmed' ? <span className="text-brand-600">Joined</span> : e.is_full ? <span className="text-muted">Full</span> : null },
            ]}
            getKey={(e) => e.name}
            onRowClick={(e) => navigate(`/events/${encodeURIComponent(e.name)}`)}
          />
        </div>
      ) : (
        <DataTable
          rows={(managed.data ?? []) as ManagedEvent[]}
          columns={[
            { key: 'title', header: 'Event', sortValue: (e) => e.title,
              render: (e) => <span className="font-medium text-ink">{e.title}</span> },
            { key: 'when', header: 'When', sortValue: (e) => e.start_datetime,
              render: (e) => <span className="text-muted">{fmtDate(e.start_datetime)}</span> },
            { key: 'status', header: 'Status', render: (e) => <span className="text-muted">{e.status}</span> },
            { key: 'registered_count', header: 'Registered', render: (e) => <span className="text-muted">{e.registered_count}</span> },
          ]}
          getKey={(e) => e.name}
          onRowClick={(e) => navigate(`/events/manage/${encodeURIComponent(e.name)}`)}
        />
      )}
    </Page>
  )
}
```

- [ ] **Step 2: Type-check + build**

Run: `cd frontend-web && npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 3: Browser check**

Load `/w/events`. Verify: featured hero cards render above the table; search + period + price + category chips filter the table rows; Manage tab unchanged.

- [ ] **Step 4: Commit**

```bash
git add frontend-web/src/pages/Events.tsx
git commit -m "feat(events): web hero strip + browse filters"
```

---

## Task 9: Web detail — sub-events section

**Files:**
- Modify: `frontend-web/src/pages/EventDetail.tsx`

**Interfaces:**
- Consumes: `ev.sub_events`.
- Produces: a "Sub-events" `Section` listing children as clickable rows → each child's detail.

- [ ] **Step 1: Add `Ticket` to the lucide import**

Change line 3 to:

```tsx
import { CalendarDays, MapPin, Users, ArrowLeft, Ticket } from 'lucide-react'
```

- [ ] **Step 2: Render the sub-events section**

Immediately after the About `Section` block (lines 99-106, the `{ev.description && ( ... )}` block) and BEFORE the register `<Section>` (line 108), insert:

```tsx
      {ev.sub_events && ev.sub_events.length > 0 && (
        <Section title="Sub-events">
          <div className="flex flex-col gap-2">
            {ev.sub_events.map((s) => (
              <button
                key={s.name}
                onClick={() => navigate(`/events/${encodeURIComponent(s.name)}`)}
                className="flex items-center gap-3 rounded-xl border border-line bg-hover/[0.02] p-3 text-left transition hover:bg-hover/[0.05]"
              >
                {s.cover_image ? (
                  <img src={s.cover_image} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-600/10">
                    <Ticket className="h-4 w-4 text-brand-600" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{s.title}</span>
                  <span className="block truncate text-sm text-muted">
                    {new Date(s.start_datetime).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                    {s.pricing === 'Free' ? ' · Free' : s.pricing === 'Points' ? ` · ${s.points_cost ?? 0} pts` : ` · Rp ${(s.price ?? 0).toLocaleString('id-ID')}`}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium text-brand-600">
                  {s.my_status === 'Confirmed' ? 'Joined' : 'View'}
                </span>
              </button>
            ))}
          </div>
        </Section>
      )}
```

- [ ] **Step 3: Type-check + build**

Run: `cd frontend-web && npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 4: Browser check**

Open a parent event at `/w/events/<name>` — the "Sub-events" section lists children; clicking one opens its own detail with its register button.

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/pages/EventDetail.tsx
git commit -m "feat(events): web sub-events section on detail"
```

---

## Task 10: Web form — category, featured, parent fields

**Files:**
- Modify: `frontend-web/src/pages/EventForm.tsx`

**Interfaces:**
- Consumes: `EventFormPayload` new fields, `EVENT_CATEGORIES`, `useManagedEvents()`.
- Produces: web form persists category/is_featured/parent_event using the existing `Field` + `field` patterns.

- [ ] **Step 1: Add imports + parent options hook**

Change the hooks import (line 12) to add `useManagedEvents`:

```tsx
import { useSaveEvent, useDeleteEvent, useManagedEvent, useManagedEvents } from '@/hooks/useData'
```

Add below the type import (after line 13):

```tsx
import { EVENT_CATEGORIES } from '@/lib/events'
```

Inside the component, after `const del = useDeleteEvent()` (line 35), add:

```tsx
  const managedEvents = useManagedEvents()
```

- [ ] **Step 2: Add fields to `empty`**

Replace the `empty` constant (lines 22-25) with:

```tsx
const empty: EventFormPayload = {
  title: '', description: '', cover_image: null, start_datetime: '', end_datetime: '',
  location: '', capacity: 0, pricing: 'Free', points_cost: 0, price: 0, status: 'Draft',
  category: '', is_featured: false, parent_event: '',
}
```

- [ ] **Step 3: Seed the new fields on edit**

In the `useEffect` seed (lines 45-57), add after `status: (d.status as string) ?? 'Draft',`:

```tsx
      category: (d.category as string) ?? '',
      is_featured: !!d.is_featured,
      parent_event: (d.parent_event as string) ?? '',
```

- [ ] **Step 4: Render the three inputs**

Inside the `<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">`, immediately after the Pricing `<Field>` block closes (the `</Field>` on line 264, before the `form.pricing === 'Points'` conditional on line 266), insert:

```tsx
              <Field label="Category">
                {(id) => (
                  <select
                    id={id}
                    className={field}
                    value={form.category ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  >
                    <option value="">— Uncategorized —</option>
                    {EVENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
              </Field>

              <Field label="Parent event (empty = top-level)">
                {(id) => (
                  <select
                    id={id}
                    className={field}
                    value={form.parent_event ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, parent_event: e.target.value }))}
                  >
                    <option value="">— None (top-level) —</option>
                    {(managedEvents.data ?? []).filter((m) => m.name !== name).map((m) => (
                      <option key={m.name} value={m.name}>{m.title}</option>
                    ))}
                  </select>
                )}
              </Field>

              <Field label="Featured" className="sm:col-span-2">
                {(id) => (
                  <label htmlFor={id} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      id={id}
                      type="checkbox"
                      checked={!!form.is_featured}
                      onChange={(e) => setForm((f) => ({ ...f, is_featured: e.target.checked }))}
                      className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-500"
                    />
                    Show in the Browse hero
                  </label>
                )}
              </Field>
```

- [ ] **Step 5: Type-check + build**

Run: `cd frontend-web && npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds. (`payload = {...form}` in `onSave` already forwards the new fields.)

- [ ] **Step 6: Browser check**

At `/w/events/manage/new`: set category, tick Featured → appears in web hero. Edit an event, set a Parent → becomes a sub-event under that parent's detail. Nesting a sub-event under another sub-event surfaces the backend error.

- [ ] **Step 7: Commit**

```bash
git add frontend-web/src/pages/EventForm.tsx
git commit -m "feat(events): web form category, featured, parent fields"
```

---

## Final verification (whole feature)

- [ ] `bench --site project.vernon.id migrate` and `bench restart` have run (Tasks 1-3).
- [ ] Both frontends built: `cd frontend && npm run build`, `cd frontend-web && npm run build`.
- [ ] End-to-end on `/m/events` and `/w/events`:
  - Create an Expo (top-level, category=Expo, Featured on) → shows in hero.
  - Create two mini-gatherings with `parent_event` = the Expo, each Published, own pricing/capacity → they do NOT appear as top-level Browse cards.
  - Open the Expo detail → both mini-gatherings listed → registering for one works via the existing flow and does not register for the Expo.
  - Filter bar: search, Upcoming/Past, category, price all narrow the list correctly.

## Self-Review Notes

- **Spec coverage:** filters (Tasks 5, 8 + helper Task 4) ✓; hero/`is_featured` (Tasks 1, 5, 8) ✓; sub-events/`parent_event` (Tasks 1, 2, 6, 9) + register-each reuse (existing `register()`, unchanged) ✓; category field (Tasks 1, 7, 10) ✓; client-side filtering (Task 4 helper) ✓; nesting one-level guard (Task 1) ✓.
- **Type consistency:** `EventFilter`, `filterEvents`, `featuredUpcoming`, `eventCategories`, `EVENT_CATEGORIES`, `isUpcoming` defined in Task 4, consumed identically in Tasks 5/7/8/10. `EventItem.sub_events` (Task 4) consumed in Tasks 6/9.
- **Deliberate simplification:** parent picker is a plain `<select>` (not SearchableSelect) and `save_event` doesn't re-check parent ownership — both noted inline with upgrade paths.
