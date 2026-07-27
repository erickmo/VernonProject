# Project Notes — design

**Date:** 2026-07-25
**Status:** approved (design), pending implementation
**Goal:** attach multiple freeform notes to a Project. A shared per-project noticeboard, readable and writable by everyone on the project.

## Summary

Today `Leader Note` holds notes *about a user* (optionally project-tagged) with a
user-centric permission model. There is no place to pin notes to a **Project itself**.
This adds one: any team member of a project can add short notes; all team members read
them; the author (or a project leader/owner/admin/SysMgr) can delete. Newest-first,
add-only (no edit — delete + re-add covers it).

## Storage — new doctype `Project Note`

A standalone doctype, **not** a child table on Project. A child table would force a full
Project re-save on every note edit, which recomputes rewards/`total` and runs naming side
effects; a standalone doc keeps clean per-note `author`/`note_date` with no blast radius.

| field | type | rules |
|---|---|---|
| `project` | Link → Project | reqd |
| `author` | Link → User | set server-side from `frappe.session.user`, **never** from client input |
| `note_date` | Date | default = today (server-set) |
| `body` | Small Text | reqd |

- `autoname`: hash (mirrors `Leader Note`).
- Desk permissions: **System Manager only** (read+write). Every real interaction goes
  through the whitelisted API below — the doctype is not exposed to normal roles in desk.

## API — `vernon_project/api/project_notes.py`

One shared trust-boundary guard used by all three endpoints:

```
_can_access(project) -> bool
  True if frappe.session.user is:
    - the project's project_owner / project_leader / project_admin, OR
    - a row in that project's Project Team, OR
    - a System Manager
  Status-agnostic: notes remain readable/writable on Closed/Inbox projects.
  Raise frappe.PermissionError when False.
```

Endpoints (all `@frappe.whitelist()`):

- `get_project_notes(project)` → newest-first list, each:
  `{name, body, author, author_name, author_image, note_date, can_delete}`.
  `can_delete` = caller is the note author OR owner/leader/admin/SysMgr.
  Author display fields resolved in one `User` query (mirror `_user_meta_map` in `leader_notes.py`).
- `add_project_note(project, body)` → validate `_can_access` + non-empty `body`;
  insert `Project Note` with `author=session`, `note_date=today`; return the new row shaped like a `get` item.
- `delete_project_note(name)` → load note, resolve its project, allow if caller is author
  OR owner/leader/admin/SysMgr of that project; else `PermissionError`. Then delete.

## Shared frontend logic — `frontend/src`

- `frontend/src/lib/types.ts`: add `ProjectNote` type matching the `get` item shape.
- Data hooks (same file/pattern as `useProject`, `useDeleteProjectDetail`):
  `useProjectNotes(project)`, `useAddProjectNote()`, `useDeleteProjectNote()` — react-query,
  invalidate `['project-notes', project]` on add/delete.

## UI — both frontends (per repo two-frontends rule)

A **Notes** section inside the existing project-detail surface on each side. Same capability,
each in its own design system:

- **/m mobile** (`frontend/src/pages/Projects.tsx` project-detail view): a Soft-Pop card
  "Notes" — list of notes (body, author avatar + name, `note_date`; `×` delete when
  `can_delete`), plus an add-note compose (small textarea + Add button). Reuse the mobile
  compose/dialog convention (no native `alert/confirm`; delete via dialog modal).
- **/w web** (`frontend-web/src/pages/Project.tsx`): a `<Section>` titled "Notes" alongside
  Goal/Team — same list + inline add. Web design-system (bento/Section).

First check whether `LeaderNotesSection.tsx` / `NotesButton.tsx` are generic enough to reuse.
Expectation: **model-after, not reuse** — Leader Note's API and permission model differ
(user-keyed, `shared_with_user`, Ongoing-only). Keep a separate `ProjectNotesSection` per side.

## Repo-rule chores (part of this task, not optional)

- **Docs data**: new doctype + new endpoints → add `Project Note` to `scripts/gen_docs.py`
  `CLUSTERS`, run `python3 scripts/gen_docs.py`, commit regenerated `docs/assets/data.js`.
- **What's New**: after it ships live (bundles rebuilt), insert an `App Release` row
  (Bahasa, one bullet/line, `published=1`, `platform=Both`, semver bump from newest row).

## Testing

- API unit test (`vernon_project/api/test_project_notes.py`, mirroring `test_leader_notes.py`):
  - team member can add + read; non-member gets `PermissionError` on read/add.
  - author can delete own; non-author non-leader cannot; leader/owner can delete any.
  - `author`/`note_date` are server-set and ignore client-supplied values.
- Live site is code-first (no test DB); run the API test at the end and verify through the
  real endpoint once per platform.

## Out of scope (YAGNI — add when asked)

Per-note title, edit-in-place, pinning, private/share toggle, @mentions, reactions, threading.
