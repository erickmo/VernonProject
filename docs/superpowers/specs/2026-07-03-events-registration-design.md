# Events & Registration — Design

**Date:** 2026-07-03
**App:** vernon_project (project.vernon.id)
**Status:** Approved for planning

## Summary

Staff (organizers) host events. Users register to join. An event is Free,
Points-priced, or Rupiah-priced (chosen per event). System Managers create
events in Frappe Desk; users register from the `/m` (mobile) and `/w` (web)
frontends.

## Non-goals (v1)

Auto-refunds on cancellation (manual for now), waitlists, public/guest
registration (internal Vernon users only), recurring events, and event
check-in/attendance. Say so to pull any into scope.

## Approach

Two doctypes mirroring the existing `Marketplace Reward` → `Reward Redemption`
split:

- **Event** — the offering an organizer creates.
- **Event Registration** — one row per user signup, holds payment state.

Rejected: single Event with a child-table of participants (cannot hold
per-user Midtrans order or per-user status transitions, cannot query "my
events" cleanly); reusing `Meeting`/`Meeting Participant` (project-scoped,
points-only, no payment — wrong shape).

The host is modeled as `organizer` (Link → User, defaults to the creating
user), matching the existing `Meeting.organizer` pattern. There is no separate
Company/office entity in v1.

## Data model

### Event (created in Desk by System Manager)

| field | type | notes |
|-------|------|-------|
| `title` | Data | required |
| `description` | Text Editor | |
| `cover_image` | Attach Image | |
| `organizer` | Link → User | host; defaults to creator |
| `start_datetime` | Datetime | required |
| `end_datetime` | Datetime | |
| `location` | Data | physical address or URL |
| `capacity` | Int | 0 = unlimited |
| `pricing` | Select | `Free` / `Points` / `Rupiah` |
| `points_cost` | Float | used when pricing = Points |
| `price` | Currency | rupiah; used when pricing = Rupiah |
| `status` | Select | `Draft` / `Published` / `Cancelled` / `Completed` |

Only `Published` events are listed/registerable on the frontends.

### Event Registration

| field | type | notes |
|-------|------|-------|
| `event` | Link → Event | required |
| `user` | Link → User | required |
| `registered_on` | Datetime | |
| `status` | Select | `Pending` / `Confirmed` / `Cancelled` |
| `method` | Select | `Free` / `Points` / `Rupiah` (copied from event at signup) |
| `amount` | Float | points or rupiah charged |
| `midtrans_order_id` | Data | rupiah only |
| `snap_token` | Data | rupiah only |
| `transaction_status` | Data | rupiah only; raw Midtrans status |
| `paid_on` | Datetime | rupiah only |

Constraint: at most one non-`Cancelled` registration per `(event, user)`.

## Payment flows — `vernon_project/api/events.py`

Single whitelisted `register(event)` entry point; branches on the event's
`pricing`:

- **Free** → create Registration `Confirmed` immediately.
- **Points** → read the user's balance. If `balance >= points_cost`, create
  Registration `Confirmed` with `method="Points"` and `amount=points_cost`.
  The registration row **is** the debit: extend `_user_balance()` (in
  `api/mobile.py`) to subtract `SUM(amount)` of non-`Cancelled`,
  `method="Points"` registrations — the same debit model as Reward Redemption
  (there is no negative Point Ledger row for spending in this codebase).
  Otherwise reject with insufficient-balance. Guarded by the existing
  `get_lock('vernon_spend:{user}')` advisory lock so concurrent signups can't
  overspend.
- **Rupiah** → create Registration `Pending`, request a Midtrans Snap token
  (server key), store `midtrans_order_id` + `snap_token`, return the token to
  the frontend to open the Snap popup.

**Webhook** `midtrans_webhook` (guest-whitelisted): verifies the Midtrans
signature hash (`order_id + status_code + gross_amount + server_key`), looks up
the Registration by `midtrans_order_id`, and on `settlement`/`capture` flips
`Pending` → `Confirmed` and sets `paid_on`. On `expire`/`cancel`/`deny` sets
`Cancelled`. Records raw status in `transaction_status`. Idempotent (re-delivery
of the same terminal status is a no-op).

**Capacity** enforced at registration time: reject if count of non-`Cancelled`
registrations for the event `>= capacity` (when capacity > 0). Points debit and
capacity check happen inside one DB transaction to avoid overselling/double
charge on concurrent signups.

**Config**: three fields added to the existing **Vernon Settings** Single
doctype (mirrors edubing's `Edubing Settings` pattern — not `site_config`):
`midtrans_client_key` (Data), `midtrans_server_key` (Password, read via
`get_password`), `midtrans_is_production` (Check). Registration fails with a
clear error if keys are absent and a Rupiah event is attempted. Only
`client_key` + the Snap.js CDN URL are exposed to the browser; `server_key`
never leaves the backend.

## Frontend — both apps

Shared layer (`frontend/src`): `lib/types.ts` (Event, EventRegistration),
`lib/api.ts` (list events, get event, register, my registrations),
`hooks/useData.ts` fetch hooks. Rupiah path loads the Midtrans Snap JS and
opens the popup with the returned token; on popup success the UI polls the
registration until the webhook confirms.

Screens (both `/m` Soft-Pop and `/w` flat-Notion, per each app's design
system):

1. **Events list** — published events with pricing badge (Free / N pts / Rp N).
2. **Event detail** — full info + Register button. Free = instant; Points =
   confirm dialog then deduct; Rupiah = Snap popup.
3. **My Registrations** — the user's events with status.

No native `alert/confirm`; use the dialog modal.

## Testing

Deferred per the live-site/code-first convention; final-phase tests cover the
points debit path, capacity race, and webhook signature + idempotency.
