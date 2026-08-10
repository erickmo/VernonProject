# Announcement Ticker — Design

**Date:** 2026-08-10
**Status:** Approved

## Goal
Admins broadcast a short, time-boxed message that shows as a non-dismissible ticker
at the top of every page, on both frontends (`/m` mobile, `/w` web).

## Decisions (locked)
- **Who manages:** `System Manager` **or** `HR Manager` role.
- **Multiple active:** all active messages concatenated into one continuous marquee, newest-first — "rotates through all".
- **Content:** message text + optional link (whole segment clickable).
- **Style:** single neutral brand-colored thin bar, non-dismissible. Renders nothing when zero active.
- Skipped (YAGNI): dismiss/ack, severity colors, datetime precision, targeting, rich text.

## Data — DocType `Announcement`
| field | type | notes |
|---|---|---|
| `message` | Small Text | required |
| `link` | Data | optional URL |
| `start_date` | Date | required |
| `end_date` | Date | required |
| `published` | Check | default 0 |

Autoname hash. Empty controller (no side effects). Permissions: `System Manager` + `HR Manager` only — create/read/write/delete. No other role touches the doctype.

## API — `vernon_project/api/announcement.py`
- `get_active_announcements()` — any logged-in user. `published=1 AND start_date ≤ today ≤ end_date`, order `creation desc`, fields `name,message,link`.
- `list_announcements()` / `save_announcement(name?, message, link, start_date, end_date, published)` / `delete_announcement(name)` — each guards `System Manager|HR Manager`, else `frappe.PermissionError`.

## Frontend
Shared (`frontend/src`, imported by web as `@`):
- `types.ts`: `Announcement`, `ActiveAnnouncement`.
- `api.ts`: the four calls.
- `useData.ts`: `useActiveAnnouncements()`, `useAnnouncementsAdmin()`, `canManageAnnouncements(boot)`.

Per-frontend presentation:
- `AnnouncementTicker` — thin full-width marquee bar. Web mounts in `AppShell` above `<main>`; mobile mounts at app root above routes.
- Admin screen `/announcements` (gated): list (active/scheduled/expired) + create/edit/delete. Web bento + dialog; mobile Soft-Pop card + sheet. Nav entry gated to managers.

## Housekeeping
- `scripts/gen_docs.py` CLUSTERS gets `Announcement`; regenerate `docs/assets/data.js`.
- Deploy: `bench migrate` (new table) + `tj-restart` (Python) + rebuild both bundles.
- What's New: App Release row after both bundles ship (Bahasa, platform `Both`).
