# Events Management (in-app) — Design

**Date:** 2026-07-03
**App:** vernon_project (project.vernon.id)
**Status:** Approved for planning
**Extends:** [Events & Registration](2026-07-03-events-registration-design.md)

## Summary

In-app management for events, in both `/m` (mobile) and `/w` (web), replacing
the Desk-only create flow. An organizer can create, edit, delete, and publish
their own events, view the registration roster, cancel a registration, and mark
attendance. System Managers can manage all events. Any authenticated user may
create events (creating one makes them its organizer).

## Access model

`_can_manage(event, user) = (event.organizer == user) OR ("System Manager" in
roles)`. Creating an event stamps `organizer = session user`. Every management
endpoint enforces `_can_manage` (or, for create/list, "authenticated"). This is
a deliberate breadth decision: **every authenticated user can create Published,
org-wide-visible events.** Narrow to a role later by gating create/list behind a
capability if needed.

## Approach

Dedicated whitelisted endpoints in a new `vernon_project/api/events_admin.py`,
NOT `/api/resource`. Rationale: the owner-or-role permission, server-side
`organizer` defaulting, capacity/points side-effects, and the custom
registration actions (cancel, mark-attended) need server logic that
`/api/resource` CRUD can't express cleanly. Keeping management in its own module
also isolates it from the public read/register API in `api/events.py`.

## Schema change

Add one field to `Vernon Event Registration`:

| field | type | notes |
|-------|------|-------|
| `attended` | Check | default 0; set by `mark_attended` |

Orthogonal to `status` (payment lifecycle). Requires `bench migrate`.

## Backend — `api/events_admin.py`

All `@frappe.whitelist()`, guest-guarded, house-style errors. Helper
`_can_manage(event)` throws `PermissionError` when the session user is neither
the event's organizer nor a System Manager.

- `manage_list_events() -> list` — events the user may manage (own; all if SM),
  every status. Fields: name, title, start_datetime, status, pricing,
  capacity, registered_count.
- `save_event(payload: json, name=None) -> {name}` — create or update. On
  create, set `organizer = session user` and insert. On update, load, enforce
  `_can_manage`, apply the editable fields, save. Validates pricing/cost the
  same way the `Vernon Event` controller does (reuses controller `validate`).
- `delete_event(name) -> {ok}` — enforce `_can_manage`, then delete. (Frappe
  blocks delete if registrations link to it via link integrity; the endpoint
  surfaces that as a clear error — cancel/clear registrations first, or the
  organizer sets status `Cancelled` instead.)
- `event_roster(event) -> list` — enforce `_can_manage`; return each
  registration: name, user, full_name, status, method, amount, attended,
  registered_on.
- `cancel_registration(name) -> {ok}` — enforce `_can_manage` on the parent
  event; set the registration `status = "Cancelled"`. **Points auto-refund**:
  `_user_balance` only subtracts non-`Cancelled` `method="Points"` rows, so the
  points return with no explicit ledger write. **Seat auto-frees**:
  `_active_count` ignores `Cancelled`. Rupiah money refunds are out of scope
  (manual). Idempotent (already-Cancelled → no-op ok).
- `mark_attended(name, attended: int) -> {ok}` — enforce `_can_manage`; set the
  `attended` Check.

## Frontend — both apps (shared layer + per-app UI)

Shared (`frontend/src`): types (`ManagedEvent`, `RosterEntry`, `EventFormPayload`),
`eventsAdminApi.*` in `lib/api.ts`, hooks + a `canManageEvents`-style helper
(returns true for any logged-in user; the roster/edit actions are further gated
per-event by the backend). `cover_image` uploads reuse the existing
`uploadRewardImage` file-upload helper.

Screens (mirroring the app's existing admin CRUD — Brands on `/m`, Groups on
`/w`):
1. **Manage Events list** — your events (+ all for SM) with status badge; a
   "New event" action. Entry point reachable by all authenticated users.
2. **Event form** — create/edit: title, description, cover-image upload,
   start/end datetime, location, capacity, pricing + points_cost/price, status.
   Delete action on edit.
3. **Roster** — per event: registrant rows with Cancel + Mark-attended actions
   (confirm via the app dialog; no native confirm).

`/m` Soft-Pop styling (mirror `BrandsScreen`/`BrandFormScreen`) with a Profile
entry link; `/w` flat-Notion styling (mirror `Groups`/`GroupForm`) with a nav
leaf and/or a "New event" button on the existing Events page.

## Out of scope (v1)

Rupiah money refunds on cancel (manual), waitlist, editing another organizer's
event unless System Manager, and per-role narrowing of create access (any user
can create for now).

## Testing

Deferred per the live-site/code-first convention; final-phase tests cover
`_can_manage` enforcement (non-organizer, non-SM rejected), `cancel_registration`
points auto-refund + seat free, and `save_event` organizer stamping.
