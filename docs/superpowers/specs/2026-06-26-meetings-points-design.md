# Meetings with Points — Design

**Date:** 2026-06-26
**Status:** Approved (design)

## Problem

Users need to schedule meetings, invite teammates, and — when the organizer
marks a meeting done — award points to everyone who was invited. Points must
flow through the existing gamification system (Point Ledger + Group/level
mechanics), not a parallel one.

## Decisions (from brainstorming)

- **Points source:** reuse the Group/level system (`base_rate_per_minute ×
  estimated_minutes × difficulty%`), identical to Project Todo.
- **Invitees:** restricted to the linked Project's Team members.
- **Surfaces:** `/m` (mobile `frontend/`) and `/w` (desktop `frontend-web/`),
  driven by whitelisted endpoints in `api/mobile.py`. Frappe desk forms come
  free from the doctype JSON.

## Data model

### `Meeting` (new doctype, module Vernon Project)

| field | type | notes |
|-------|------|-------|
| `title` | Data, reqd | |
| `project` | Link Project, reqd | scopes invitees to Project Team |
| `organizer` | Link User | defaults to creator; gates mark-done |
| `scheduled_at` | Datetime | |
| `estimated` | Int | minutes; feeds point calc |
| `group` | Link Group | |
| `level` / `level_id` / `level_type` | Data / Data / Data | snapshot cache, mirrors Project Todo |
| `point` | Float | **derived**, read-only; snapshot of level value |
| `status` | Select `⚪️ Scheduled\n✅ Done` | two states only — no approval chain |
| `participants` | Table → Meeting Participant | |
| `notes` | Small Text | optional |

### `Meeting Participant` (new child doctype)

| field | type |
|-------|------|
| `user` | Link User |

### `Point Ledger` (extend existing — do NOT fork)

- add `meeting` (Link Meeting) — traceability + idempotency key
- add `Meeting` to `source` Select options (currently `Todo\nGrant\nGift`)
- add `Participant` to `role` Select options (currently `Assignee\nLeader`)

## Server logic — `meeting.py` controller

Mirrors `project_todo.py` patterns.

- **`validate`:**
  - `snapshot_point_from_level()` — same formula as Project Todo:
    `round(base_rate_per_minute × estimated × difficulty% / 100)`. No group or
    nothing chosen → `point = 0`.
  - default `organizer` to `frappe.session.user` on insert.
  - reject any participant `user` not in the Project's `Project Team`
    (mirrors `validate_assigned_to_team_member`).
  - default `status` to `⚪️ Scheduled` on new.
- **`on_change`:** when status transitions
  - `Scheduled → Done`: `sync_point_ledger()` — for each participant, upsert a
    Point Ledger row keyed on `(meeting, user)`:
    `{meeting, user, role:"Participant", source:"Meeting", project, group,
    level_name:level, point, points_earned: point, credited_on: now}`.
    Idempotent (re-marking done does not double-credit). Then `_notify` each
    participant (type `Points`).
  - `Done → Scheduled`: `_remove_ledger()` — delete this meeting's ledger rows.
  - Flat award: `points_earned == point`. **No** late/early timing adjustment
    (meetings have no deadline). This is the one deliberate divergence from
    Project Todo's `_compute_earned`.
- **Idempotency:** ledger upsert checks
  `frappe.db.exists("Point Ledger", {"meeting": self.name, "user": user})`.

### Permissions (mirror Project Todo)

- `get_permission_query_conditions` / `has_permission`: readable by the
  Project's owner / leader / admin / team members, and System Manager.
- create: Project Owner or Project Leader (or System Manager).
- mark-done / reopen: `organizer`, or Project Owner / Leader, or System Manager.

## Mobile API — `api/mobile.py`

All return `{status, message, ...}` like `update_todo`, so the clients show
friendly feedback. New whitelisted functions:

- `create_meeting(project, title, scheduled_at=None, estimated=0, group=None, level_id=None, participants=None, notes=None)`
- `update_meeting(meeting, ...same fields...)`
- `list_meetings(project=None)` — meetings visible to the caller, shaped for cards
- `set_meeting_participants(meeting, users)` — replace participant rows
- `mark_meeting_done(meeting)` / `reopen_meeting(meeting)`
- `meeting_invitable_users(project, txt="")` — Project Team users, mirrors
  `assignable_users` for todos

`participants` accepts a JSON list of user ids; the endpoint maps to child rows.

## Frontend (`/m` mobile + `/w` desktop)

Both apps consume the same endpoints via their `lib/api.ts`.

- **List:** a Meetings list/section showing title, project, scheduled time,
  participant count, point value, status badge.
- **Create/Edit:** `CreateMeetingSheet` modeled on `CreateProjectItemSheet` —
  project picker → participant `MultiSelectSearch` (options from
  `meeting_invitable_users`), group/level select, datetime, estimated minutes.
- **Detail:** participants list + per-meeting point, and a **Mark Done** button
  shown only to the organizer; pressing it calls `mark_meeting_done` and the
  award happens server-side. A reopen affordance mirrors it.

## Out of scope (YAGNI)

Approval chain, recurring meetings, per-participant point amounts, calendar
sync, late/early timing penalties. Add later if needed.

## Testing

- Backend: `meeting` controller unit tests — point snapshot, team-membership
  rejection, Scheduled→Done credits each participant exactly once (idempotent),
  Done→Scheduled removes rows, non-organizer cannot mark done. Extend
  `api/test_mobile.py` for the new endpoints.
- Frontend: follow existing component test conventions for the sheet and
  mark-done flow.
