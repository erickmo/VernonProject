# Leaders & Notes — Design

**Date:** 2026-07-18
**Status:** Approved (brainstorming), pending implementation plan

## Problem

We want any user to be able to have supervisors and a place to record
observations about them:

1. Each user can have **one or more leaders** (people responsible for them).
2. A user's **leaders can add notes** about that user.
3. A note is either tied to a **specific date** ("on 2026-07-18 …") or **global**
   (a standing note with no date).
4. Each note has a **per-note visibility toggle**: private (leaders + admin only)
   or shared with the user the note is about.

Applies to **all users**, not only interns. This is unrelated to the existing
per–`Project Todo` `mentor` field, which is task-level point credit. "Leaders"
here is a person→person relationship.

## Non-goals (v1)

- No notification to the user when a shared note is added (easy to add later).
- No date ranges — `note_date` is a single date.
- No editing of a note after creation — create + delete only (delete then re-add).
- No threading/replies/reactions on notes.

## Data model

Two new flat (non-child) DocTypes.

### `User Leader`
The user↔leader assignment. One row per (user, leader) pair. This row is the
**write-gate**: only a user with a matching row (or a System Manager) may add
notes about that user.

| Field    | Type        | Notes                     |
|----------|-------------|---------------------------|
| `user`   | Link → User | the person being led      |
| `leader` | Link → User | the assigned leader       |

- Autoname: hash. No DB unique index; the setter replaces the user's full leader
  set atomically and dedups, so duplicate (user, leader) pairs can't arise.
- Permissions: read/write for System Manager only (assignment is admin-driven).
  All app access goes through whitelisted endpoints, not the desk.

### `Leader Note`
A note authored by a leader about a user.

| Field                | Type            | Notes                                             |
|----------------------|-----------------|---------------------------------------------------|
| `user`               | Link → User     | who the note is about                             |
| `author`             | Link → User     | the leader who wrote it (set server-side = session user) |
| `note_date`          | Date (optional) | empty ⇒ **global/standing** note                  |
| `body`               | Small Text      | the note                                          |
| `shared_with_user`   | Check (default 0)| 1 ⇒ the subject user can read this note           |

- Autoname: hash. Controller is empty (no side effects).
- Permissions: whitelisted-endpoint gated (see below); no direct desk role grants.

## API — `vernon_project/api/leader_notes.py`

All endpoints `@frappe.whitelist()`. Session user = `frappe.session.user`.
Helper `_is_leader_of(user, actor)` = exists-check on `User Leader`.
Helper `_is_admin()` = `"System Manager" in frappe.get_roles()`.

| Endpoint | Args | Auth | Behavior |
|----------|------|------|----------|
| `set_user_leaders` | `user`, `leaders` (list of user ids) | admin only | Replaces the user's full leader set: delete existing `User Leader` rows for `user`, insert the given ones (dedup, drop blanks/self). |
| `get_user_leaders` | `user` | admin, or a leader of `user` | Returns `[{leader, leader_name, user_image}]`. |
| `list_led_users` | — | any user | Users the caller leads: `[{user, user_name, user_image}]`. |
| `add_user_note` | `user`, `body`, `note_date=None`, `shared_with_user=0` | admin or leader-of-user | Insert `Leader Note` with `author = session user`. Rejects empty `body`. Returns the shaped new note. |
| `list_user_notes` | `user` | admin/leader ⇒ all notes; the subject user ⇒ only `shared_with_user=1`; anyone else ⇒ 403 | Returns notes newest-first, each shaped with `author_name`, `is_mine`, `can_delete`. |
| `delete_user_note` | `name` | note `author` or admin | Deletes the note. |

Shaping mirrors existing mobile.py conventions (resolve `full_name`,
`user_image` per user). Unauthorized ⇒ the app's standard error-dict / `frappe.throw`
pattern already used in mobile.py.

### Authorization summary
- **Assign leaders:** System Manager only.
- **Write notes:** assigned leaders of that user + System Manager.
- **Read notes:** assigned leaders + System Manager see all; the subject user sees
  only notes flagged `shared_with_user`; everyone else denied.
- **Delete note:** the note's author or System Manager.

## Frontend (both `/m` and `/w`)

Reuses the existing Users → user profile surface
(`UserFormScreen.tsx` / `UserForm.tsx`, plus `Users`/`UsersScreen` list).
Shown on **every user's** profile:

1. **Leaders editor** (admin only): a `MultiSelectSearch` of users → calls
   `set_user_leaders`. Non-admins see the leader list read-only.
2. **Notes timeline**: two groups — **Global** (no date) and **Dated** (grouped
   by `note_date`, newest first). Each note card: body, author name + avatar, a
   `Shared` / `Private` badge, and a delete affordance when `can_delete`.
3. **Add-note form** (visible to assigned leaders + admin): body textarea, an
   optional date via the shared `DatePicker` (empty = global), and a
   "Bagikan ke pengguna" (share-with-user) checkbox → `add_user_note`.

A user viewing their **own** profile: read-only notes list (shared-only), no
add form, no leaders editor.

New shared types in `frontend/src/lib/types.ts`; data hooks in
`frontend/src/hooks/useData.ts`; API wrappers in `frontend/src/lib/api.ts`
(all under `@` = shared, consumed by both frontends per the two-frontends split).

### Conventions to honor
- No native `<select>` → `MultiSelectSearch` / `SearchableSelect`.
- No native `<input type=date>` → shared `DatePicker`.
- No native `alert/confirm` → dialog modal (for delete confirm).
- Bahasa UI labels for end-user-facing text.

## Testing

- New `vernon_project/api/test_leader_notes.py` covers:
  - leader assignment replace semantics (add/remove/dedup/self-exclusion).
  - `add_user_note` gate: assigned leader ✓, admin ✓, unrelated user ✗.
  - `list_user_notes` visibility: leader sees all; subject sees shared-only;
    stranger denied.
  - `delete_user_note`: author ✓, other leader ✗ (non-admin), admin ✓.
  - `note_date` empty ⇒ stored as global; present ⇒ stored as the date.

Live-site caveat (per project memory): one live DB, no test DB — mirror the
existing test approach in `test_mobile.py`.

## Deploy

- New DocTypes + fields ⇒ `bench migrate`.
- New Python endpoints ⇒ `sudo /usr/local/bin/tj-restart`.
- Frontend ⇒ rebuild both bundles.
- Ran app-shape change ⇒ `python3 scripts/gen_docs.py`, commit `data.js`
  (add both DocTypes to the `CLUSTERS` map).
- User-visible ⇒ add an **App Release** row (Bahasa What's New) once shipped.
