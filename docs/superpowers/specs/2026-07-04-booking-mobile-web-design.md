# Booking in Mobile (/m) + Web (/w) — Design

**Date:** 2026-07-04
**Status:** Approved (brainstorming)

## Goal

Add the Resource Booking feature (book a meeting room + equipment for a time window, with double-booking prevented) to the two vernon_project product frontends — the mobile PWA (`frontend/`, served at `/m`) and the desktop web app (`frontend-web/`, served at `/w`). Scope: booking create/list/cancel for everyone, plus admin management of Meeting Rooms and Equipment.

## Context / prior work

The backend already exists and is live on `project.vernon.id` and `dev.vernon.id`:
- Doctypes: `Meeting Room`, `Equipment`, `Resource Booking` (+ child `Resource Booking Equipment`).
- Overlap validation in `Resource Booking.validate()` (single source of truth: `start < other.end AND end > other.start`, Confirmed-only, self-excluded), `booked_by` forced to session user, `has_permission` (read open, write→owner/SM).
- Whitelisted `vernon_project.api.booking.check_availability(start, end, room, equipment, exclude)`.
- Doctype perms: Meeting Room / Equipment — `All` read, `System Manager` write. Resource Booking — `All` read+create, write→owner/SM.

A separate dashboard app (`/home/frappe/ui`) already has this UI; this design ports it to the two vernon product frontends.

## Key decision: no new backend

The mobile/web admin-CRUD features (Brands/Companies/Groups) use a generic `resource` REST wrapper (`frontend/src/lib/api.ts`, `resource.list/get/create/update/remove` over `/api/resource/<Doctype>`, session+CSRF). Booking reuses this:
- Rooms / Equipment / Bookings CRUD → `resource.*` (doctype perms + `validate()` enforce access + conflicts).
- Live pre-submit conflict check → existing `check_availability` via `api.post`.

**No new whitelisted methods, no doctype changes, no `hooks.py` changes.** The two frontends are same-origin with the Frappe site that serves them, so they reach the already-deployed doctypes.

## Architecture

Shared data layer in `frontend/src` (consumed by both apps via the `@` alias), then parallel screen sets — mobile `*Screen.tsx` (`frontend/src/pages`) and web `*.tsx` (`frontend-web/src/pages`) — each wired into its own router + nav. Mirrors the existing **Brands** (admin list+form) and **Events** (list+form) features exactly.

### Shared layer (`frontend/src`)
- `lib/types.ts` — add `Booking`, `MeetingRoom`, `Equipment`, `Conflict` interfaces.
- `lib/api.ts` — add `BK = 'vernon_project.api.booking.'` and `checkAvailability(args)` calling `api.post(BK+'check_availability', ...)`. (CRUD reuses the existing `resource` object.)
- `hooks/useData.ts` — add query keys and hooks:
  - reads: `useBookings()`, `useRooms()`, `useEquipment()`, and single-record `useBooking(name,enabled)`, `useRoom(name,enabled)`, `useEquipmentItem(name,enabled)` for edit.
  - mutations: `useCreateBooking()`, `useCancelBooking()`, `useSaveRoom()`, `useDeleteRoom()`, `useSaveEquipment()`, `useDeleteEquipment()` (all via `resource.*`, invalidating the matching keys).
  - `useCheckAvailability()` — `useMutation` wrapping `checkAvailability`.
  - role helper `canManageResources(boot)` = `boot.roles.includes('System Manager')`.

### Mobile (`frontend/src/pages`), mirroring Brands/Events
- `BookingsScreen` — all bookings (read-all); Cancel action only on rows where `booked_by === boot.user`; "New" button.
- `BookingFormScreen` — create only: title, start/end (`<input type="datetime-local">` with `toInput`/`toFrappe`), room `<select>` (active rooms), equipment checkboxes (active equipment), live availability check before submit (block + list conflicts, else `resource.create` → server `validate()` re-checks → navigate back).
- `MeetingRoomsScreen` + `MeetingRoomFormScreen` (create/edit/delete) — admin-gated.
- `EquipmentScreen` + `EquipmentFormScreen` (create/edit/delete) — admin-gated.
- Wiring: `App.tsx` routes (bookings ungated; room/equipment gated on `canManageResources(boot)`, like Brands at App.tsx:161-169); `Profile.tsx` menu (a "Bookings" item for all users; "Manage Meeting Rooms" + "Manage Equipment" spread into the admin section under `canManageResources`); a `Today.tsx` shortcut tile for Bookings.

### Web (`frontend-web/src/pages`), mirroring the web Brands/Events pages
- `Bookings` + `BookingForm`, `MeetingRooms` + `MeetingRoomForm`, `Equipment` + `EquipmentForm` — reuse the shared `@/hooks/useData` hooks + `@/lib` types/api; render with `@web/components/Page` (`Page`/`PageHeader`/`Section`) + `@web/components/ui` `Field` + native inputs (`field` CSS string per file), `toFrappe`/`toInput` converters.
- Wiring: `App.tsx` routes (bookings under the shell ungated; room/equipment gated on `canManageResources(boot)`); `lib/nav.ts` — a "Bookings" leaf in the WORK group; "Meeting Rooms" + "Equipment" leaves appended into the admin group via `buildNavGroups(b)` under `canManageResources`.

## Data flow

Form/list → shared react-query hook → `resource.*` or `checkAvailability` → `/api/resource/*` or `/api/method/...check_availability` (session+CSRF) → Frappe → doctype perms + `validate()`. Booking create sends `{title, start(Frappe fmt), end, room|null, status:'Confirmed', equipment:[{equipment}]}`; `booked_by` omitted (server forces it). Cancel = `resource.update('Resource Booking', name, {status:'Cancelled'})`.

## Permissions

- Bookings: everyone reads all, everyone creates; cancel/edit only own (or System Manager) — enforced server-side by `has_permission`; the UI shows Cancel only on own rows.
- Rooms / Equipment: everyone reads (needed to populate booking selects); **only System Manager** creates/edits/deletes. Management screens + their nav entries + routes are gated on `canManageResources(boot)` and re-guarded at page mount (mirror Brands two-layer gating).

## Error handling

Mutations surface `ApiError.message` (from `_server_messages`/`exception`) inline on the form (e.g. a 417 overlap ValidationError if the pre-check was bypassed). The live check renders the returned conflicts and blocks submit.

## Testing / deploy (vernon conventions)

No JS test runner (no test DB) — gate is `npx tsc --noEmit` per frontend + manual smoke. Any pure TS helper (none expected beyond the copied `toInput`/`toFrappe` one-liners) would get an esbuild assert self-check. Commit **source only** per task; **no per-task build**; build per-frontend at the very end (`cd frontend && npm run build`, `cd frontend-web && npm run build`). No backend changes to deploy.

## Out of scope (YAGNI)

Editing an existing booking (create + cancel only for v1; edit a booking = cancel + rebook), recurring bookings, calendar/timeline view, room photos/amenities, notifications, approval workflow.
