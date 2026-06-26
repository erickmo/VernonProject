# Personal Notes — Design Spec

Date: 2026-06-26
Status: Approved, implementing

## Goal

A private personal-notes feature for vernon_project users. Each note is a freetext
**body** plus an optional **checklist**. Notes are unrelated to projects: **no points,
no deadline, no project link, no recurring** — pure text + checklist. Owners may share
a note with other users; **shared users get read-only access**.

This document is the implementation contract. Field names, endpoint signatures, and
JSON shapes below are normative — backend and frontend must match them exactly.

## Out of scope (explicit)

No `project`, no `points`/Point Ledger writes, no `deadline`, no `group`/`level`, no
recurring. None of these fields exist on the note.

---

## 1. Data model (3 DocTypes, module "Vernon Project")

### `Personal Note` (parent)

- `autoname: "hash"`, `naming_rule: "Random"`, `allow_rename: 0`.
- Mirror conventions from `vernon_project/vernon_project/doctype/project_todo/project_todo.json`.

| fieldname | fieldtype | flags |
|---|---|---|
| `user` | Link → User | `reqd: 1`, `in_list_view: 1`, `search_index: 1` — owner |
| `title` | Data | — |
| `body` | Long Text | — |
| `items` | Table → `Personal Note Item` | — |
| `shares` | Table → `Personal Note Share` | — |

Permissions block: `System Manager` full CRUD. Per-user access is enforced via the
`has_permission` hook (below) + the mobile API. Add `track_changes: 0`.

### `Personal Note Item` (child, `istable: 1`)

Mirror `vernon_project/vernon_project/doctype/group_level/group_level.json` format.

| fieldname | fieldtype | flags |
|---|---|---|
| `label` | Small Text | `in_list_view: 1` |
| `checked` | Check | `default: "0"`, `in_list_view: 1` |

Order is the native child-table `idx`.

### `Personal Note Share` (child, `istable: 1`)

| fieldname | fieldtype | flags |
|---|---|---|
| `shared_user` | Link → User | `reqd: 1`, `in_list_view: 1` |

### Controller `personal_note.py`

```python
import frappe
from frappe.model.document import Document

class PersonalNote(Document):
    def before_insert(self):
        if not self.user:
            self.user = frappe.session.user

    def _shared_users(self):
        return {r.shared_user for r in (self.shares or [])}

def get_permission_query_conditions(user=None):
    """Desktop list view: owner OR shared-with sees the note."""
    user = user or frappe.session.user
    if "System Manager" in frappe.get_roles(user):
        return ""
    safe = frappe.db.escape(user)
    return (
        f"(`tabPersonal Note`.`user` = {safe} OR EXISTS ("
        f" SELECT 1 FROM `tabPersonal Note Share` s"
        f" WHERE s.parent = `tabPersonal Note`.name AND s.shared_user = {safe}))"
    )

def has_permission(doc, ptype="read", user=None):
    user = user or frappe.session.user
    if "System Manager" in frappe.get_roles(user):
        return True
    if doc.user == user:
        return True
    # shared users: read only
    if ptype == "read":
        return any(r.shared_user == user for r in (doc.shares or []))
    return False
```

### `hooks.py` registration

Append to the existing dicts (`permission_query_conditions` at ~line 143,
`has_permission` at ~line 150):

```python
"Personal Note": "vernon_project.vernon_project.doctype.personal_note.personal_note.get_permission_query_conditions",
# and
"Personal Note": "vernon_project.vernon_project.doctype.personal_note.personal_note.has_permission",
```

---

## 2. Mobile API — append to `vernon_project/api/mobile.py`

All `@frappe.whitelist()`. Reject Guest. Follow the existing `{status, message}`
convention. Reuse `_user_name_map(emails)` for share/owner display names.

### Note JSON shape (returned everywhere)

```json
{
  "name": "abc123",
  "title": "Groceries",
  "body": "weekend plan",
  "items": [{"label": "milk", "checked": 1, "idx": 1}],
  "shares": [{"user": "a@b.id", "full_name": "Ann", "image": "/files/a.png"}],
  "is_owner": true,
  "can_edit": true,
  "owner_user": "me@x.id",
  "owner_name": "Me",
  "modified": "2026-06-26 10:00:00"
}
```

- `shares` is populated only when `is_owner` is true; `[]` for shared viewers.
- `can_edit == is_owner` (shared = read-only).

### Endpoints

| function | params | rule | returns |
|---|---|---|---|
| `get_personal_notes()` | — | any logged-in | `{"owned": [note…], "shared": [note…]}` |
| `get_personal_note(note_id)` | `note_id` | owner OR shared | `{"status":"ok","note":{…}}` else `{"status":"error",…}` |
| `create_personal_note(title=None, body=None, items=None)` | `items` = JSON string of `[{"label","checked"}]` | any logged-in; discard if title+body+items all empty | `{"status":"ok","name":…}` |
| `update_personal_note(note_id, title=None, body=None, items=None)` | as above | **owner only** | `{"status":"ok"}` |
| `delete_personal_note(note_id)` | `note_id` | **owner only** | `{"status":"ok"}` |
| `share_personal_note(note_id, users)` | `users` = JSON string list of emails | **owner only**; dedupe, skip self, validate User exists | `{"status":"ok","shares":[…]}` |
| `unshare_personal_note(note_id, user)` | `note_id`, `user` | **owner only** | `{"status":"ok"}` |

Mutations on a note the caller doesn't own → `{"status":"error","message":"Not permitted"}`.
`items` is fully replaced on each update (clear + re-append, preserving order).
`frappe.db.commit()` after each mutation (matches existing endpoints).

---

## 3. Frontend (`frontend/src`, one React PWA, both surfaces)

### `lib/types.ts`

```ts
export interface PersonalNoteItem { label: string; checked: number; idx?: number }
export interface PersonalNoteShare { user: string; full_name: string; image?: string }
export interface PersonalNote {
  name: string; title: string; body: string
  items: PersonalNoteItem[]; shares: PersonalNoteShare[]
  is_owner: boolean; can_edit: boolean
  owner_user: string; owner_name: string; modified: string
}
```

### `lib/api.ts` — add to `mobileApi` (mirror existing method style)

- `getPersonalNotes()` → GET → `{ owned: PersonalNote[]; shared: PersonalNote[] }`
- `getPersonalNote(noteId)` → GET
- `createPersonalNote(title, body, items)` → POST (`items` JSON-stringified)
- `updatePersonalNote(noteId, title, body, items)` → POST
- `deletePersonalNote(noteId)` → POST
- `sharePersonalNote(noteId, users)` → POST (`users` JSON-stringified)
- `unsharePersonalNote(noteId, user)` → POST

### `hooks/useData.ts`

`usePersonalNotes()` — React Query `['personalNotes']` → `{ owned, shared }`, plus a
`refetch`. Mirror existing query hooks in this file.

### Screens / components

- `pages/NotesScreen.tsx` — `TabScreen`-based. Two sections: **My Notes** (`owned`) and
  **Shared with me** (`shared`). Card per note: title, body preview, checklist progress
  `done/total`. FAB / header "+" → `/notes/new`. Use `EmptyState` when both empty.
- `pages/NoteFormScreen.tsx` — `DetailScreen`-based. Route `/notes/new` and `/notes/:name`.
  - Owner: editable title, body textarea, checklist editor (add / tick / remove / reorder),
    share manager (user picker listing current `shares`, remove buttons). Save + delete.
  - Shared viewer (`can_edit === false`): fully **read-only** render — no inputs, ticks shown
    but disabled, no share/delete.
- `components/NotesButton.tsx` — header icon (lucide `StickyNote` or `NotebookPen`) that
  routes to `/notes`. Styled like `NotificationBell`.

### Wiring

- `App.tsx`: add routes `/notes`, `/notes/new`, `/notes/:name`.
- Place `<NotesButton />` in the top-header `right` slot beside `<NotificationBell />`,
  starting on `pages/Today.tsx` (the `right` node built around line 197).

---

## 4. Edge cases

- Empty note (no title, body, or items) → not persisted (create returns ok with no name, or
  client guards). Pick: client guards + server discards.
- Shared user calls a mutation endpoint → `Not permitted` error.
- Unshare → target loses access on next fetch (`get_personal_note` returns error).
- Share with self / duplicate / unknown user → ignored or validated server-side.
- Delete cascades child items + shares (native Frappe behavior).
- Checklist reorder persisted via `idx` (full replace on update keeps array order).

## 5. Testing (deferred to final phase per live-site convention)

- Owner full CRUD round-trip.
- Shared user can read, cannot update/delete/share (PermissionError).
- Unshare revokes read access.
- `get_personal_notes` separates owned vs shared correctly.
- Checklist items + checked state + order persist across update.

## 6. Deploy steps (run after code written)

1. `bench --site project.vernon.id migrate` (creates the 3 tables).
2. Build frontend (npm/yarn build in `frontend/`).
3. `bench --site project.vernon.id clear-cache` + restart for Python.
