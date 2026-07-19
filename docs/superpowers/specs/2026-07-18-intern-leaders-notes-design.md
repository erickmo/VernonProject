# Leaders & Notes — Design

**Date:** 2026-07-18 (revised 2026-07-19: leaders derived from projects)
**Status:** Implemented + live

## Problem

We want any user to have supervisors and a place to record observations:

1. A user's **leaders are derived**, not assigned: a leader is the
   `project_leader` of any **active** (Ongoing) project the user is a team
   member of. A user in several active projects has several leaders.
2. A user's **leaders can add notes** about that user.
3. A note is either tied to a **specific date** ("on 2026-07-18 …") or **global**
   (a standing note with no date).
4. Each note has a **per-note visibility toggle**: private (leaders + admin only)
   or shared with the user the note is about.

Applies to **all users**. Unrelated to the per–`Project Todo` `mentor` field
(task-level point credit).

## Non-goals (v1)

- No manual leader assignment — leadership follows project membership.
- No notification to the user when a shared note is added.
- No date ranges — `note_date` is a single date.
- No editing of a note after creation — create + delete only.
- No threading/replies/reactions.

## Data model

One new flat DocType. Leadership is **not** stored — it is computed from the
existing `Project` (`project_leader`, `status`) + `Project Team` (`user`) rows.

### `Leader Note`
A note authored by a leader about a user.

| Field                | Type            | Notes                                             |
|----------------------|-----------------|---------------------------------------------------|
| `user`               | Link → User     | who the note is about                             |
| `author`             | Link → User     | the leader who wrote it (set server-side = session user) |
| `note_date`          | Date (optional) | empty ⇒ **global/standing** note                  |
| `body`               | Small Text      | the note                                          |
| `shared_with_user`   | Check (default 0)| 1 ⇒ the subject user can read this note           |

- Autoname hash. Empty controller. System-Manager-only in the desk;
  all app access is endpoint-gated.

## API — `vernon_project/api/leader_notes.py`

All `@frappe.whitelist()`. Session user = `frappe.session.user`.
`ACTIVE_STATUS = "Ongoing"`.
Derivation helpers:
- `_member_projects(user)` = `Project Team` rows where `user` == user (parents).
- `_is_leader_of(user, actor)` = exists an active Project whose `project_leader`
  is `actor` and whose team includes `user`.
- `_leaders_of(user)` = distinct `project_leader` of the active projects `user`
  is a team member of (self excluded).
- `_is_admin()` = `"System Manager" in frappe.get_roles()`.

| Endpoint | Args | Auth | Behavior |
|----------|------|------|----------|
| `get_user_leaders` | `user` | the user themselves, a leader of the user, or admin | Derived `[{leader, leader_name, user_image}]`. |
| `list_led_users` | — | any logged-in user | Distinct team members of the active projects the caller leads: `[{user, user_name, user_image}]` (self excluded). |
| `add_user_note` | `user`, `body`, `note_date=None`, `shared_with_user=0` | admin or leader-of-user | Insert `Leader Note`, `author = session`. Empty body rejected; empty `note_date` ⇒ global. Returns the shaped note. |
| `list_user_notes` | `user` | admin/leader ⇒ all; subject ⇒ shared-only; else 403 | Envelope `{can_add, notes[]}` newest-first. |
| `delete_user_note` | `name` | note `author` or admin | Deletes it. |

### Authorization summary
- **Who leads whom:** derived from active-project leadership (no assignment).
- **Write notes:** the user's leaders + System Manager.
- **Read notes:** leaders + admin see all; the subject sees only shared notes;
  everyone else denied.
- **Delete note:** the note's author or System Manager.

## Frontend (both `/m` and `/w`)

On the user edit page (`UserFormScreen.tsx` / `UserForm.tsx`), edit mode only:

1. **Leaders** — read-only chips of the derived leaders (`get_user_leaders`).
   No editor; leadership is set by project membership elsewhere.
2. **Notes timeline** — **Global** (no date) then **Dated** groups, newest
   first. Each card: body, author + avatar, `Dibagikan`/`Privat` badge, delete
   when `can_delete` (confirm via dialog).
3. **Add-note form** (when `can_add`): body, optional date (native `<input
   type=date>` on /m, shared `DatePicker` on /w), "Bagikan ke pengguna" toggle.

Shared types/api/hooks under `@` (`frontend/src/lib`, `frontend/src/hooks`);
per-frontend components. Conventions honored: `MultiSelectSearch` not native
select (n/a now), shared `DatePicker` on /w, dialog not native confirm, Bahasa.

## Testing

`vernon_project/api/test_leader_notes.py` builds real `Project` + `Project Team`
rows and covers: `_is_leader_of` true for active-project leader, false for a
Closed-project leader / stranger / self; derived `get_user_leaders` and
`list_led_users`; add-note gate (leader ✓, admin ✓, stranger ✗, closed-project
leader ✗); note visibility (leader all / subject shared-only / stranger 403);
delete (author ✓, other leader ✗, admin ✓); `note_date` global vs dated.
Live site, no test DB — rows self-clean; leader users get the `Project Leader`
role (Project validation requires it).

## Deploy

- New DocType ⇒ `bench migrate`.
- Python ⇒ `sudo /usr/local/bin/tj-restart`.
- Frontend ⇒ rebuild both bundles.
- App-shape change ⇒ `python3 scripts/gen_docs.py`, commit `data.js`.
- User-visible ⇒ App Release row (Bahasa What's New).
