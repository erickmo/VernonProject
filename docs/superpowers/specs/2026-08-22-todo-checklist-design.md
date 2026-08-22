# Todo Checklist — Design

**Date:** 2026-08-22
**Status:** Approved for planning
**Scope:** Add a checkable sub-item list ("checklist") to a Project Todo. Both frontends (`/m` mobile, `/w` web).

## Goal

A todo can hold an ordered list of small sub-items, each with text + a done flag. Users add / edit / check / delete / reorder them. A `▢ done/total` chip surfaces on the todo card. That is all — **no** status gating, **no** progress bar, **no** points, **no** reporting.

## Non-goals

- No effect on todo status transitions (Done stays independent of checklist state).
- No Point Ledger interaction.
- No Frappe-desk reporting / queryability (deliberately — see Storage).
- No per-item assignee, due date, or notes.

## Storage

New field on **Project Todo**:

| Field | Type | Notes |
|---|---|---|
| `checklist` | Small Text | JSON array `[{"t": "<text>", "d": <bool>}]`. Array order = display order. Empty/null = no checklist. |

Mirrors the existing `recurring_exception_dates` (Small Text holding JSON) pattern already in this doctype — no new doctype, no child table, no migration beyond the field add. "Just a list" with no reporting need makes desk-visibility worth trading for the smaller schema.

Compact keys (`t`, `d`) keep the field small.

## Backend

Checklist mirrors **notes** end to end — notes is the exact precedent: a Small Text
field, its own save endpoint with a looser gate than full-task edit, and a
self-persisting FE component. Copy that pattern rather than threading a param
through the strict `update_todo` path.

### Write — new endpoint `save_checklist` (`vernon_project/api/project_todo.py`)
Mirror `save_notes` (same file, ~line 507):

```python
@frappe.whitelist()
def save_checklist(todo_id, checklist):
    # gate: assignee / project_owner / project_leader / project admins / System Manager
    # (matches the shape's `can_edit_notes` flag, so FE affordance == backend gate)
    # validate: json.loads → list of {t:str,d:bool}; trim t, coerce d bool, drop empty-t rows
    # todo.checklist = json.dumps(clean, ensure_ascii=False); todo.save(ignore_permissions=True)
```

`save_notes`'s own gate omits admins/SM (a latent mismatch with `can_edit_notes`);
`save_checklist` includes them so the affordance and the gate agree.

The frontend sends the **whole array** on every mutation (add / rename / toggle /
delete / reorder). Optimistic UI hides the round-trip.

### Read — expose in the detail payload
`get_project_item` already calls `_shape_todo(..., include_notes=True)`; adding
`checklist` to `_shape_todo` surfaces it on the detail screen for free.

- In `_shape_todo`: `out["checklist"] = _parse_checklist(row.get("checklist"))` — a list, always. The FE derives the `done/total` chip from the array (no separate count fields).
- Add `t.checklist` to the two todo `SELECT` column lists (`_fetch_todos` ~584 and the other list fetch ~1213) so list-context rows carry the array for the card chip. A `SELECT` that omits it → `row.get("checklist")` is `None` → `_parse_checklist` returns `[]` (safe).
- No change to `get_project_item`/`_load_todo_for_edit` — `checklist` rides down inside the existing `shaped` dict.

Shared helper `_parse_checklist(raw)` → `list[{t,d}]` (safe on null / bad JSON → `[]`), used by shape and by the endpoint's read-back.

## Frontend (both `/m` and `/w`)

Shared behaviour lives in `frontend/src` (imported as `@` by web); presentation is per-platform.

Mirror the existing **`<Notes>`** component (defined locally in
`ProjectItemScreen.tsx` ~line 431 and in web `ProjectItem.tsx`), which self-persists
via `useSaveNotes` and is gated by `data.can_edit_notes`.

- **Shared wiring** (in `frontend/src`, imported by web as `@`):
  - `api.ts`: `saveChecklist(todoId, checklist)` → POST `vernon_project.api.project_todo.save_checklist`.
  - `useData.ts`: `useSaveChecklist(todoId)` mirroring `useSaveNotes` (invalidates the same project-item query).
  - Type: todo detail gains `checklist: {t: string; d: boolean}[]`.
- **Component** `<Checklist todoId initial={data.checklist} canEdit={data.can_edit_notes} />`, one per frontend (mobile Soft-Pop rows, web detail block), rendered next to `<Notes>` in each detail screen.
  - **Rows:** checkbox + text input + delete. "Tambah item" adds a blank row.
  - **Persist:** local optimistic state; on any change build the array and `save.mutate(items)`. Toggling a checkbox commits immediately; text edits commit on blur (mirrors `<Notes>` commit-on-blur).
  - **Read-only** (`!canEdit`): render items as a static checked/unchecked list; hide add/delete.
- **Card chip:** when `checklist.length > 0`, show `▢ {done}/{total}` (done = items with `d`) on `TodoCard.tsx`. Derived from the array already on the row.
- Plain text input + checkbox — no `SearchableSelect`/date primitives needed.

## Testing

- Backend: one self-check asserting `_parse_checklist` round-trips a valid array, drops empty-text rows, and returns `[]` on null / malformed JSON.
- Manual: add items on a todo, check some, reload → persisted; card shows correct `done/total`; delete/reorder persist.

## Rollout

- Field-only schema change → `bench migrate` picks up the new field; `sudo /usr/local/bin/tj-restart` for the Python change.
- No new DocType / endpoint / hook → `gen_docs.py` unaffected.
- Rebuild both bundles.
- Add an **App Release** (What's New) row, Bahasa, `platform=Both`, after it is live in the built bundles.

## Open / deferred

- **Reorder:** if drag-reorder proves fiddly in v1, ship add/edit/check/delete first and defer reorder. Core value is the checkable list.
