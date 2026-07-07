# Events: Filters, Hero, and Sub-events — Design

**Date:** 2026-07-07
**Route surfaces:** `/m/events` (mobile), `/w/events` (web)
**Status:** Approved, ready for implementation plan

## Goal

Three additions to the existing Events feature:

1. **Filters** on the Browse list — upcoming/past, search-by-name, category, price.
2. **Hero section** — a spotlight carousel of manually-featured events at the top of Browse.
3. **Sub-events** — an expo can contain mini-gatherings inside it. Each sub-event is a
   full, independently-registrable event nested under a parent.

## Existing state (what we build on)

- Doctype **Vernon Event**: `title, description, cover_image, organizer, start_datetime,
  end_datetime, location, capacity, pricing (Free/Points/Rupiah), points_cost, price,
  status (Draft/Published/Cancelled/Completed)`. No category, no hierarchy.
- Doctype **Vernon Event Registration**: `event, user, registered_on, status, method,
  amount, attended` + Midtrans fields.
- API `api/events.py` (public: `list_events`, `get_event`, `register`, `my_registrations`,
  `midtrans_notify`) and `api/events_admin.py` (organizer/SM-gated CRUD + roster).
- Shared types in `frontend/src/lib/types.ts` (`EventItem`, `EventFormPayload`, …) and
  hooks in `frontend/src/hooks/useData.ts`. Both `/m` and `/w` consume these.
- Mobile screens: `EventsScreen`, `EventDetailScreen`, `EventFormScreen`, `EventRosterScreen`,
  `MyRegistrationsScreen`. Web mirrors: `Events`, `EventDetail`, `EventForm`, `EventRoster`.
- Current filtering: none. Browse shows all Published, ordered by `start_datetime asc`
  (this already includes past events).

## Decisions (locked)

- **Sub-events = full nested events**, not a display-only agenda. A sub-event is a normal
  Vernon Event with `parent_event` set. It reuses the entire event machinery: its own
  detail page, capacity, pricing, `register()` flow, and roster. Attendees register per
  sub-event, independently of the parent.
- **Filters = client-side.** The server returns all Published top-level events; the frontend
  filters period/price/category/search and derives the hero. No new API params, no pagination.
  Rationale: community app with dozens of events. Upgrade path noted below.
- **Hero = manual `is_featured` flag.** Only honored for top-level events.
- **Category = a Select field**, not a managed doctype. Starter options below; editable later.

## 1. Doctype changes — Vernon Event (3 new fields)

| Field | Type | Options / default | Notes |
|---|---|---|---|
| `parent_event` | Link → Vernon Event | — | Empty ⇒ top-level. Set ⇒ sub-event of that event. |
| `category` | Select | `Workshop\nSeminar\nExpo\nKelas\nSosial\nKompetisi\nLainnya` | Starter set; add options later without migration. |
| `is_featured` | Check | default `0` | Drives hero. Only honored when `parent_event` is empty. |

All three are nullable/defaulted — existing events are unaffected (top-level, uncategorized,
not featured). No data migration required, only `bench migrate` to add the columns.

**Validation (vernon_event.py):** guard against `parent_event` pointing at itself, and
against a sub-event being chosen as a parent (single level of nesting only — no grandchildren).
`// one level deep; deeper trees not needed`.

## 2. Backend changes

### `api/events.py`

- Add `category, is_featured, parent_event` to `PUBLIC_EVENT_FIELDS`.
- `list_events()` → return **top-level only**: filter `parent_event` empty (in addition to
  the existing `status='Published'`). Response items now carry `category` + `is_featured`.
- `get_event(event)` → after building the event dict, attach
  `sub_events: EventItem[]` = children where `parent_event == event`, `status='Published'`,
  each passed through the existing `_decorate` (so registered_count / is_full / my_status
  are populated per sub-event). Ordered by `start_datetime asc`.
- `register()` — **unchanged.** A sub-event is just an event; existing capacity / balance /
  Midtrans logic already applies.
- `// ponytail: client-side filtering. If the published-event count reaches thousands, add`
  `// server params (period, category, pricing, q) to list_events and paginate.`

### `api/events_admin.py`

- Add `category, is_featured, parent_event` to the `EDITABLE` list (so `save_event` persists
  them) and to the `get_managed_event` return dict (so the form can load them).
- `manage_list_events()` stays flat (no hierarchy in the Manage list). Organizer sets the
  parent via the form.

## 3. Shared types + hooks (`frontend/src/`)

`lib/types.ts`:

- `EventItem`: add `parent_event?: string`, `category?: string`, `is_featured?: boolean`,
  `sub_events?: EventItem[]` (only present on `get_event` detail responses).
- `EventFormPayload`: add `category?: string`, `is_featured?: boolean`,
  `parent_event?: string`.

`hooks/useData.ts`: no new hooks — same endpoints, richer payloads. Query keys unchanged.

## 4. Mobile `/m/events` (Soft Pop system: `paper-*` tokens, lucide icons, `animate-*`)

- **`EventsScreen` — Hero:** horizontal snap-scroll carousel at the top of the Browse tab.
  Source = client-derived `items.filter(e => e.is_featured && upcoming)`. Each card: large
  cover, title, date chip; tap → detail. Hidden when no featured upcoming events.
- **`EventsScreen` — Filters:** below the hero — a search input (title contains, case-insensitive),
  an Upcoming/Past segmented toggle, category chips (`All` + distinct categories present in
  the data), and price chips (`All / Free / Points / Rupiah`). All applied client-side to the
  non-featured list. Empty-state message when filters match nothing.
- **`EventDetailScreen` — Sub-events:** when `sub_events` is non-empty, render an "Acara di
  dalam" section: each child as a compact row (cover thumb, title, date, price) with its own
  Register affordance (tap → the child's own detail screen, which already handles registration).
- **`EventFormScreen`:** add a category Select, an `is_featured` checkbox, and an optional
  parent-event picker (searchable list of top-level events; leaving it empty keeps the event
  top-level). Reuse the existing form patterns.

## 5. Web `/w/events` (flat-Notion: semantic tokens, **no** `paper-*`)

Mirror of the mobile behavior in the web idiom:

- **`Events.tsx`:** a featured hero strip above the Browse DataTable; a filter row
  (search + period + category + price) above the table, client-filtered.
- **`EventDetail.tsx`:** a sub-events section listing children with their register links.
- **`EventForm.tsx`:** category, featured, and parent-event fields.

## Data flow

```
list_events()  ──▶  top-level Published events (+category,+is_featured)
                     │
   frontend splits:  ├── hero   = filter(is_featured && upcoming)
                     └── list   = filter(period, category, price, search)

get_event(name) ──▶  event + sub_events[] (decorated children)
                     └── each sub-event row → its own EventDetail → register() (existing flow)
```

## Deliberate simplifications (upgrade paths)

- **Client-side filtering** instead of server params — add server-side filter/pagination if
  the event volume grows large.
- **Sub-events are not shown as top-level Browse cards** — they are reached through the parent
  detail (and via their own deep link). Surface them in Browse later if desired.
- **Category is a Select**, not an admin-managed doctype — promote to a Link + doctype if
  categories need per-category metadata or non-technical management.
- **Single level of nesting** — parent → sub-event only; no grandchildren.

## Deploy

`bench migrate` (new fields) → `bench restart` (Python API) → `npm run build` in both
`frontend/` and `frontend-web/`. Live site — no test DB; verify in browser after deploy.

## Testing

Per project convention (live site, tests deferred to final phase): backend validation
guard (`parent_event` self/loop rejection) gets one runnable check. Frontend filtering is
verified in-browser after build.
