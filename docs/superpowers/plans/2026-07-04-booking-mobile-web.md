# Booking in Mobile (/m) + Web (/w) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add Resource Booking (book room + equipment, list, cancel) plus admin management of Meeting Rooms & Equipment to the vernon_project mobile PWA (`frontend/`, `/m`) and desktop web app (`frontend-web/`, `/w`).

**Architecture:** No new backend — reuse the existing `resource` REST wrapper (`/api/resource/<Doctype>`) + the existing `check_availability` whitelisted method. Shared data layer in `frontend/src` (types + api + react-query hooks), consumed by both apps via the `@` alias; parallel screen sets per app wired into each app's router + nav. Mirrors the existing **Brands** (admin list+form) and **Events** (list+form with datetime) features.

**Tech Stack:** React 18 + TS + Vite + @tanstack/react-query + Tailwind. Backend Frappe (unchanged).

## Global Constraints

- **Repo:** `/home/frappe/frappe-bench/apps/vernon_project`, branch `main`. Other developers commit in parallel — **re-check HEAD before each task**; stage **only** each task's explicit paths (`git add <paths>`), never `git add -A`/`.`/`-u`; new commits only (no amend/rebase/stash/reset).
- **No backend changes.** No doctype, `hooks.py`, or new whitelisted method. Only the already-deployed `check_availability` is called. Doctypes are live on project.vernon.id + dev.vernon.id.
- **No test runner** (no test DB). Gate per task = `npx tsc --noEmit` (0 errors) in the affected frontend(s) + manual reasoning. No JS unit tests (matches repo). Pure TS helpers (none beyond copied `toInput`/`toFrappe` one-liners) would get an esbuild assert self-check.
- **No per-task build.** `public/` serves live from disk; a mid-feature build ships half-wired code. Build per-frontend ONCE at the end (Task 8): `cd frontend && npm run build`, `cd frontend-web && npm run build`.
- **Doctype fields (verbatim):** Meeting Room = `room_name`(Data,reqd), `capacity`(Int), `location`(Data), `is_active`(Check). Equipment = `equipment_name`(Data,reqd), `category`(Data), `is_active`(Check). Resource Booking = `title`, `booked_by`(read-only, server-forced), `start`(Datetime), `end`(Datetime), `room`(Link Meeting Room), `equipment`(child table `Resource Booking Equipment` with field `equipment`→Link Equipment), `status`(Select `Confirmed`/`Cancelled`), `notes`(Small Text).
- **Datetime round-trip:** Frappe stores `'YYYY-MM-DD HH:MM:SS'`; `<input type="datetime-local">` uses `'YYYY-MM-DDTHH:MM'`. Use the existing helpers (mobile `EventFormScreen.tsx:17-18`, web `EventForm.tsx:19-20`): `toInput = v => v ? v.slice(0,16).replace(' ','T') : ''`, `toFrappe = v => v ? v.replace('T',' ')+':00' : ''`.
- **Role gate:** room/equipment management is System Manager only via `canManageResources(boot)`.

---

## Task 1: Shared data layer (types + api + hooks)

The foundation both app tracks depend on. All in `frontend/src` (also used by `frontend-web` via `@`).

**Files:**
- Modify: `frontend/src/lib/types.ts` (append interfaces)
- Modify: `frontend/src/lib/api.ts` (add `BK` + `checkAvailability`; import `Conflict`)
- Modify: `frontend/src/hooks/useData.ts` (keys, hooks, role helper)

**Interfaces produced (consumed by all later tasks):**
- Types `Booking`, `MeetingRoom`, `Equipment`, `Conflict`, `BookingEquipmentRow`.
- `checkAvailability(args)` → `Promise<{ conflicts: Conflict[] }>`.
- Hooks: `useBookings()`, `useRooms()`, `useEquipment()`, `useBooking(name,enabled)`, `useRoom(name,enabled)`, `useEquipmentItem(name,enabled)`, `useCreateBooking()`, `useCancelBooking()`, `useCreateRoom()`, `useUpdateRoom()`, `useDeleteRoom()`, `useCreateEquipment()`, `useUpdateEquipment()`, `useDeleteEquipment()`, `useCheckAvailability()`, `canManageResources(boot)`.

- [ ] **Step 1: Append types to `frontend/src/lib/types.ts`**

```typescript
export interface MeetingRoom {
  name: string
  room_name: string
  capacity?: number
  location?: string
  is_active?: 0 | 1
}

export interface Equipment {
  name: string
  equipment_name: string
  category?: string
  is_active?: 0 | 1
}

export interface BookingEquipmentRow {
  equipment: string
}

export interface Booking {
  name: string
  title: string
  booked_by: string
  /** Frappe datetime 'YYYY-MM-DD HH:MM:SS' */
  start: string
  end: string
  room?: string
  status: 'Confirmed' | 'Cancelled'
  notes?: string
  /** present only on single-doc fetch */
  equipment?: BookingEquipmentRow[]
}

export interface Conflict {
  resource_type: 'Room' | 'Equipment'
  resource: string
  booking: string
  title: string
  start: string
  end: string
}
```

- [ ] **Step 2: Add `checkAvailability` to `frontend/src/lib/api.ts`**

Add `Conflict` to the existing `import type { ... } from './types'` line. After the existing namespace constants (near `const M = 'vernon_project.api.mobile.'`), add:

```typescript
const BK = 'vernon_project.api.booking.'

/** Live pre-submit conflict check. Reuses the deployed whitelisted method.
 *  equipment is JSON-encoded (list param). Returns the conflicts array. */
export function checkAvailability(args: {
  start: string
  end: string
  room?: string
  equipment?: string[]
  exclude?: string
}): Promise<{ conflicts: Conflict[] }> {
  return api.post<{ conflicts: Conflict[] }>(BK + 'check_availability', {
    start: args.start,
    end: args.end,
    room: args.room,
    equipment: JSON.stringify(args.equipment ?? []),
    exclude: args.exclude,
  })
}
```

(`api.post` returns `data.message ?? data`; the method returns `{conflicts}` so the resolved value is `{conflicts: Conflict[]}`.)

- [ ] **Step 3: Add query keys in `frontend/src/hooks/useData.ts`**

In the `const keys = { ... }` block (around line 49-95), add (pick names that don't collide with existing keys):

```typescript
  bookings: ['bookings'] as const,
  booking: (n: string) => ['booking', n] as const,
  meetingRooms: ['meeting-rooms'] as const,
  meetingRoom: (n: string) => ['meeting-room', n] as const,
  equipmentList: ['equipment-list'] as const,
  equipmentItem: (n: string) => ['equipment-item', n] as const,
```

- [ ] **Step 4: Add the role helper + hooks in `frontend/src/hooks/useData.ts`**

Ensure `Booking`, `MeetingRoom`, `Equipment` are imported from `../lib/types`, and `checkAvailability` from `../lib/api` (match the file's existing import style). Add near the other `canManage*` helpers:

```typescript
// Rooms & Equipment are System-Manager-managed (matches the doctype write perm).
export function canManageResources(boot: Boot | undefined): boolean {
  return !!boot && boot.roles.includes('System Manager')
}
```

Then add the hooks (mirror the Brands hooks at lines 625-667):

```typescript
export function useBookings() {
  return useQuery({
    queryKey: keys.bookings,
    queryFn: () =>
      resource.list<Booking[]>('Resource Booking', {
        fields: ['name', 'title', 'booked_by', 'start', 'end', 'room', 'status'],
        limit: 0,
      }),
  })
}

export function useBooking(name: string, enabled = true) {
  return useQuery({
    queryKey: keys.booking(name),
    queryFn: () => resource.get<Booking>('Resource Booking', name),
    enabled: !!name && enabled,
  })
}

export function useCreateBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      resource.create<{ name: string }>('Resource Booking', payload),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.bookings }),
  })
}

export function useCancelBooking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      resource.update<{ name: string }>('Resource Booking', name, { status: 'Cancelled' }),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.bookings }),
  })
}

export function useRooms() {
  return useQuery({
    queryKey: keys.meetingRooms,
    queryFn: () =>
      resource.list<MeetingRoom[]>('Meeting Room', {
        fields: ['name', 'room_name', 'capacity', 'location', 'is_active'],
        limit: 0,
      }),
  })
}

export function useRoom(name: string, enabled = true) {
  return useQuery({
    queryKey: keys.meetingRoom(name),
    queryFn: () => resource.get<MeetingRoom>('Meeting Room', name),
    enabled: !!name && enabled,
  })
}

export function useCreateRoom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      resource.create<{ name: string }>('Meeting Room', payload),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.meetingRooms }),
  })
}

export function useUpdateRoom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, payload }: { name: string; payload: Record<string, unknown> }) =>
      resource.update<{ name: string }>('Meeting Room', name, payload),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: keys.meetingRooms })
      qc.invalidateQueries({ queryKey: keys.meetingRoom(vars.name) })
    },
  })
}

export function useDeleteRoom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => resource.remove('Meeting Room', name),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.meetingRooms }),
  })
}

export function useEquipment() {
  return useQuery({
    queryKey: keys.equipmentList,
    queryFn: () =>
      resource.list<Equipment[]>('Equipment', {
        fields: ['name', 'equipment_name', 'category', 'is_active'],
        limit: 0,
      }),
  })
}

export function useEquipmentItem(name: string, enabled = true) {
  return useQuery({
    queryKey: keys.equipmentItem(name),
    queryFn: () => resource.get<Equipment>('Equipment', name),
    enabled: !!name && enabled,
  })
}

export function useCreateEquipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      resource.create<{ name: string }>('Equipment', payload),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.equipmentList }),
  })
}

export function useUpdateEquipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, payload }: { name: string; payload: Record<string, unknown> }) =>
      resource.update<{ name: string }>('Equipment', name, payload),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: keys.equipmentList })
      qc.invalidateQueries({ queryKey: keys.equipmentItem(vars.name) })
    },
  })
}

export function useDeleteEquipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => resource.remove('Equipment', name),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.equipmentList }),
  })
}

export function useCheckAvailability() {
  return useMutation({ mutationFn: checkAvailability })
}
```

- [ ] **Step 5: Typecheck**

Run: `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit`
Expected: 0 errors. (If `resource`/`useQuery`/`useMutation`/`useQueryClient`/`Boot` need importing, they're already used in this file — reuse the existing imports.)

- [ ] **Step 6: Commit**

```bash
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/hooks/useData.ts
git commit -m "feat(booking): shared data layer (types, api, hooks) for mobile+web"
```

---

## Task 2: Mobile — Bookings list + form

**Files:**
- Create: `frontend/src/pages/BookingsScreen.tsx`
- Create: `frontend/src/pages/BookingFormScreen.tsx`
- Modify: `frontend/src/App.tsx` (routes)
- Modify: `frontend/src/pages/Profile.tsx` (a "Bookings" menu item, all users)
- Modify: `frontend/src/pages/Today.tsx` (a Bookings shortcut tile)

**Interfaces:** Consumes Task 1 hooks + `useBoot()`.

- [ ] **Step 1: Read the templates.** Open `frontend/src/pages/EventsScreen.tsx` (list), `frontend/src/pages/EventFormScreen.tsx` (form with `datetime-local` + `toInput`/`toFrappe` at lines 17-18 + native `<select>`), and `frontend/src/pages/BrandsScreen.tsx` (list + navigate to /new and /:name). Match their imports, the `DetailScreen`/screen wrapper they use, and styling classes.

- [ ] **Step 2: Write `BookingsScreen.tsx`** — clone `EventsScreen.tsx`'s structure:
  - `const { data: boot } = useBoot()`, `const { data: bookings = [] } = useBookings()`, `const cancel = useCancelBooking()`, `const navigate = useNavigate()`.
  - Header with a right-side "New" button → `navigate('/bookings/new')`.
  - Render each booking row: title, room ?? '—', `start.slice(0,16)`–`end.slice(0,16)`, booked_by, a status pill. Show a **Cancel** button only when `b.status === 'Confirmed' && b.booked_by === boot?.user`; onClick (stopPropagation) → `cancel.mutate(b.name)`. Surface `cancel.error` (an `ApiError`) as an inline message.
  - No admin gate (bookings are for everyone).

- [ ] **Step 3: Write `BookingFormScreen.tsx`** — create-only, clone `EventFormScreen.tsx` for the datetime/select scaffolding:
  - Copy `toInput`/`toFrappe` (lines 17-18 of EventFormScreen).
  - State: `title`, `start`, `end` (datetime-local strings), `room` (string), `equipment` (`string[]`), plus `conflicts: Conflict[]` and `err: string`.
  - `const rooms = (useRooms().data ?? []).filter(r => r.is_active)`, `const equip = (useEquipment().data ?? []).filter(e => e.is_active)`.
  - `const check = useCheckAvailability()`, `const create = useCreateBooking()`, `const navigate = useNavigate()`.
  - Inputs: Title (`<input>`); Start/End (`<input type="datetime-local">`); Room (`<select>`: `<option value="">— None —</option>` + rooms mapped by `r.name`); Equipment (checkboxes over `equip`, toggling membership in the `equipment` array). Mirror the field styling used in EventFormScreen.
  - Submit handler:
    ```typescript
    async function submit() {
      setErr(''); setConflicts([])
      if (!title || !start || !end) { setErr('Title, Start and End are required.'); return }
      if (toFrappe(end) <= toFrappe(start)) { setErr('End must be after Start.'); return }
      const res = await check.mutateAsync({ start: toFrappe(start), end: toFrappe(end), room: room || undefined, equipment })
      if (res.conflicts.length) { setConflicts(res.conflicts); return }
      try {
        await create.mutateAsync({
          title, start: toFrappe(start), end: toFrappe(end),
          room: room || null, status: 'Confirmed',
          equipment: equipment.map(e => ({ equipment: e })),
        })
        navigate('/bookings')
      } catch (e) { setErr(e instanceof Error ? e.message : 'Save failed.') }
    }
    ```
  - Render `err` and the `conflicts` list (each: `{c.resource_type} {c.resource} already booked {c.start}–{c.end} ({c.title})`) as red blocks. Submit button disabled while `check.isPending || create.isPending`.

- [ ] **Step 4: Add routes in `frontend/src/App.tsx`.** Next to the other authenticated routes (ungated, like the Notes/Events routes), add:
```tsx
<Route path="/bookings" element={<BookingsScreen />} />
<Route path="/bookings/new" element={<BookingFormScreen />} />
```
Add the two imports at the top with the other page imports.

- [ ] **Step 5: Add nav entries.**
  - `Profile.tsx`: add a general (ungated) menu item in a suitable section (mirror the Events item at line 148): `{ icon: CalendarClock, label: 'Bookings', hue: 'sky', onClick: () => navigate('/bookings') }` (import an icon from lucide-react already used in the file's icon set).
  - `Today.tsx`: add a shortcut tile mirroring the Events shortcut (line ~392): a card with `onAct: () => navigate('/bookings')`, label "Book a room", an existing gradient.

- [ ] **Step 6: Typecheck + commit**
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/pages/BookingsScreen.tsx frontend/src/pages/BookingFormScreen.tsx frontend/src/App.tsx frontend/src/pages/Profile.tsx frontend/src/pages/Today.tsx
git commit -m "feat(booking): mobile bookings list + form + nav"
```

---

## Task 3: Mobile — Meeting Rooms admin (list + form)

Clone the Brands admin feature exactly (`BrandsScreen.tsx` + `BrandFormScreen.tsx`), for `Meeting Room`, gated on `canManageResources`.

**Files:**
- Create: `frontend/src/pages/MeetingRoomsScreen.tsx` (clone `BrandsScreen.tsx`)
- Create: `frontend/src/pages/MeetingRoomFormScreen.tsx` (clone `BrandFormScreen.tsx`)
- Modify: `frontend/src/App.tsx` (gated routes)
- Modify: `frontend/src/pages/Profile.tsx` (admin menu item)

- [ ] **Step 1: `MeetingRoomsScreen.tsx`** — clone `BrandsScreen.tsx`: swap `useBrands→useRooms`, `canManageBrands→canManageResources`, title "Meeting Rooms", rows show `room_name` + `location` + (capacity) + an inactive badge when `!is_active`; navigate to `/meeting-rooms/new` and `/meeting-rooms/${name}`.
- [ ] **Step 2: `MeetingRoomFormScreen.tsx`** — clone `BrandFormScreen.tsx`: fields `room_name`(text, reqd), `capacity`(number), `location`(text), `is_active`(checkbox, default checked); use `useRoom`/`useCreateRoom`/`useUpdateRoom`/`useDeleteRoom`; `canManageResources` gate; navigate back to `/meeting-rooms`. On create, Frappe autoname is `prompt` — set the doc **name** to the entered `room_name` (pass `name: room_name` in the create payload) since prompt-named doctypes require an explicit name.
- [ ] **Step 3: Routes in `App.tsx`** — clone the Brands gated block (App.tsx:161-169):
```tsx
{canManageResources(boot) && (
  <>
    <Route path="/meeting-rooms" element={<MeetingRoomsScreen />} />
    <Route path="/meeting-rooms/new" element={<MeetingRoomFormScreen />} />
    <Route path="/meeting-rooms/:name" element={<MeetingRoomFormScreen />} />
  </>
)}
```
Add imports + `canManageResources` to the `useData` import.
- [ ] **Step 4: `Profile.tsx` admin item** — spread into the admin section like Manage Brands (line 191-193): `...(canManageResources(boot) ? [{ icon: DoorOpen, label: 'Manage Meeting Rooms', hue: 'indigo', onClick: () => navigate('/meeting-rooms') }] : [])`.
- [ ] **Step 5: Typecheck + commit**
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/pages/MeetingRoomsScreen.tsx frontend/src/pages/MeetingRoomFormScreen.tsx frontend/src/App.tsx frontend/src/pages/Profile.tsx
git commit -m "feat(booking): mobile Meeting Rooms admin"
```

---

## Task 4: Mobile — Equipment admin (list + form)

Identical to Task 3 for `Equipment`.

**Files:**
- Create: `frontend/src/pages/EquipmentScreen.tsx` (clone `BrandsScreen.tsx`)
- Create: `frontend/src/pages/EquipmentFormScreen.tsx` (clone `BrandFormScreen.tsx`)
- Modify: `frontend/src/App.tsx`; Modify: `frontend/src/pages/Profile.tsx`

- [ ] **Step 1:** `EquipmentScreen.tsx` — clone Brands list; `useEquipment`, title "Equipment", rows show `equipment_name` + `category` + inactive badge; navigate `/equipment/new`, `/equipment/${name}`.
- [ ] **Step 2:** `EquipmentFormScreen.tsx` — clone Brand form; fields `equipment_name`(text,reqd), `category`(text), `is_active`(checkbox); `useEquipmentItem`/`useCreateEquipment`/`useUpdateEquipment`/`useDeleteEquipment`; `canManageResources`; set `name: equipment_name` on create (prompt autoname); back to `/equipment`.
- [ ] **Step 3:** `App.tsx` gated block for `/equipment`, `/equipment/new`, `/equipment/:name` under `canManageResources(boot)`; add imports.
- [ ] **Step 4:** `Profile.tsx` admin item `Manage Equipment` (icon `Projector`) under `canManageResources`.
- [ ] **Step 5: Typecheck + commit**
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend/src/pages/EquipmentScreen.tsx frontend/src/pages/EquipmentFormScreen.tsx frontend/src/App.tsx frontend/src/pages/Profile.tsx
git commit -m "feat(booking): mobile Equipment admin"
```

---

## Task 5: Web — Bookings list + form

Web pages reuse the shared hooks (`@/hooks/useData`) + `@/lib` types/api; render with `@web/components/Page` + `@web/components/ui` `Field` + native inputs. Clone `frontend-web/src/pages/Events.tsx` (list) and `frontend-web/src/pages/EventForm.tsx` (form; has `field` CSS + `toInput`/`toFrappe` at lines 16/19-20).

**Files:**
- Create: `frontend-web/src/pages/Bookings.tsx`
- Create: `frontend-web/src/pages/BookingForm.tsx`
- Modify: `frontend-web/src/App.tsx` (routes)
- Modify: `frontend-web/src/lib/nav.ts` (WORK-group leaf)

- [ ] **Step 1: Read templates** `frontend-web/src/pages/Events.tsx`, `EventForm.tsx`, `components/Page.tsx`, `components/ui.tsx` (the `Field` wrapper), `lib/nav.ts`.
- [ ] **Step 2: `Bookings.tsx`** — `<Page><PageHeader icon={CalendarClock} title="Bookings" actions={<button onClick={()=>nav('/bookings/new')}>New Booking</button>}/>` + a table of `useBookings()` rows (title/room/start/end/booked_by/status) with a Cancel button on `status==='Confirmed' && booked_by===boot.user` calling `useCancelBooking()`. Get current user from `useBoot()`.
- [ ] **Step 3: `BookingForm.tsx`** — create-only; same submit logic as the mobile form (Task 2 Step 3) but rendered with web `Field` + native `<input>`/`<select>`/checkboxes and the file's `field` CSS string; room `<select>` from `useRooms()` active, equipment checkboxes from `useEquipment()` active; live `useCheckAvailability()` gate; on success `nav('/bookings')`.
- [ ] **Step 4: Routes in `frontend-web/src/App.tsx`** (ungated, under the AppShell, like Notes at 160-162):
```tsx
<Route path="/bookings" element={<Bookings />} />
<Route path="/bookings/new" element={<BookingForm />} />
```
- [ ] **Step 5: Nav leaf in `lib/nav.ts`** — add to the `WORK` group a leaf `{ to: '/bookings', label: 'Bookings', sub: 'Rooms & equipment', icon: CalendarClock }`.
- [ ] **Step 6: Typecheck + commit**
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend-web/src/pages/Bookings.tsx frontend-web/src/pages/BookingForm.tsx frontend-web/src/App.tsx frontend-web/src/lib/nav.ts
git commit -m "feat(booking): web bookings list + form + nav"
```

---

## Task 6: Web — Meeting Rooms admin

Clone the web Brands admin pages (`frontend-web/src/pages/Brands.tsx` + `BrandForm.tsx`) for `Meeting Room`, gated on `canManageResources`.

**Files:**
- Create: `frontend-web/src/pages/MeetingRooms.tsx` (clone `Brands.tsx`)
- Create: `frontend-web/src/pages/MeetingRoomForm.tsx` (clone `BrandForm.tsx`)
- Modify: `frontend-web/src/App.tsx` (gated routes); Modify: `frontend-web/src/lib/nav.ts` (admin group leaf)

- [ ] **Step 1:** `MeetingRooms.tsx` — clone `Brands.tsx`: `useRooms`, page-mount guard `if (!canManageResources(boot)) navigate('/')`, title "Meeting Rooms", table `room_name`/`location`/`capacity`/active.
- [ ] **Step 2:** `MeetingRoomForm.tsx` — clone `BrandForm.tsx`: fields `room_name`/`capacity`/`location`/`is_active`; `useRoom`/`useCreateRoom`/`useUpdateRoom`/`useDeleteRoom`; guard; set `name: room_name` on create (prompt autoname); back to `/meeting-rooms`.
- [ ] **Step 3:** `App.tsx` — clone the Brands gated block (193-199) for `/meeting-rooms`(+`/new`,`/:name`) under `canManageResources(b)`.
- [ ] **Step 4:** `lib/nav.ts` — append a `Meeting Rooms` leaf into the admin group built in `buildNavGroups(b)` under `canManageResources` (mirror the gated `...(canManageUsers(b) ? [...] : [])` spread).
- [ ] **Step 5: Typecheck + commit**
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend-web/src/pages/MeetingRooms.tsx frontend-web/src/pages/MeetingRoomForm.tsx frontend-web/src/App.tsx frontend-web/src/lib/nav.ts
git commit -m "feat(booking): web Meeting Rooms admin"
```

---

## Task 7: Web — Equipment admin

Identical to Task 6 for `Equipment`.

**Files:**
- Create: `frontend-web/src/pages/Equipment.tsx`, `frontend-web/src/pages/EquipmentForm.tsx`
- Modify: `frontend-web/src/App.tsx`, `frontend-web/src/lib/nav.ts`

- [ ] **Step 1-2:** clone `Brands.tsx`/`BrandForm.tsx` for `Equipment` (fields `equipment_name`/`category`/`is_active`; hooks `useEquipment`/`useEquipmentItem`/`useCreateEquipment`/`useUpdateEquipment`/`useDeleteEquipment`; set `name: equipment_name` on create; guard `canManageResources`; back to `/equipment`).
- [ ] **Step 3:** `App.tsx` gated routes `/equipment`(+`/new`,`/:name`).
- [ ] **Step 4:** `lib/nav.ts` admin-group `Equipment` leaf under `canManageResources`.
- [ ] **Step 5: Typecheck + commit**
```bash
cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit
cd /home/frappe/frappe-bench/apps/vernon_project
git add frontend-web/src/pages/Equipment.tsx frontend-web/src/pages/EquipmentForm.tsx frontend-web/src/App.tsx frontend-web/src/lib/nav.ts
git commit -m "feat(booking): web Equipment admin"
```

---

## Task 8: Full typecheck + build both frontends

- [ ] **Step 1:** `cd /home/frappe/frappe-bench/apps/vernon_project/frontend && npx tsc --noEmit` → 0 errors.
- [ ] **Step 2:** `cd /home/frappe/frappe-bench/apps/vernon_project/frontend-web && npx tsc --noEmit` → 0 errors.
- [ ] **Step 3 (build — deploy step, may be user-run):** `cd frontend && npm run build` and `cd frontend-web && npm run build`.
- [ ] **Step 4: Manual smoke** (dev.vernon.id via `npm run dev`, or the live site): `/m` and `/w` → Bookings → New Booking (room + equipment + window) → Create; overlapping window → conflict shown, submit blocked; Cancel on own row → Cancelled. As System Manager: Manage Meeting Rooms + Manage Equipment (create/edit/deactivate). As a non-admin: those nav items + routes are absent.

---

## Self-Review Notes

- **Spec coverage:** shared layer (T1) ✓; mobile bookings list+form (T2) ✓; mobile room/equipment admin (T3,T4) ✓; web bookings (T5) ✓; web room/equipment admin (T6,T7) ✓; nav + gating on all ✓; build (T8) ✓. No backend tasks — none needed (reuse). All-bookings read + own-only cancel ✓ (T2/T5 guard on `booked_by===boot.user`). System-Manager-only resource management ✓ (`canManageResources`, route + mount guard).
- **Type consistency:** hook names in T1 (`useBookings`/`useRooms`/`useEquipment`/`useCreate*`/`useUpdate*`/`useDelete*`/`useCheckAvailability`/`canManageResources`) are used verbatim in T2-T7. `checkAvailability` return `{conflicts}` consumed in both forms. `toFrappe`/`toInput` copied per-form (existing repo idiom).
- **Prompt-autoname gotcha** flagged in every room/equipment create step (`name` must be set explicitly).
- **Parallel-repo safety:** every task stages only its explicit paths; re-check HEAD before dispatch.
- **Deviation:** editing an existing booking is out of scope (create + cancel only) — matches the spec.
