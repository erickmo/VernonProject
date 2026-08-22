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

## Backend (`vernon_project/api/mobile.py`)

### Write — reuse `update_todo`
Add one optional param `checklist=None` to `update_todo`. When not `None`:
- Parse the incoming JSON string, validate it is a list of `{t: str, d: bool}` (coerce/trim `t`, bool `d`, drop empty-text rows), re-serialize, assign `row.checklist`.
- Saved through the existing `row.save()` path (runs controller as today).
- Permission = the **existing** edit gate (System Manager / project owner / leader / `assigned_to` / project admin). The assignee toggling their own items is allowed by this gate.

The frontend sends the **whole array** on every mutation (add / rename / toggle / delete / reorder). Optimistic UI hides the round-trip. No new endpoint.

### Read — `_shape_todo`
- Always expose lightweight counts: `checklist_total` (int), `checklist_done` (int), parsed from the field once per row. Powers the card chip. (0/absent → no chip.)
- Expose the full `checklist` array **only** on the detail/edit path (`include_notes=True`), alongside `notes` — the detail view is the only place items render.

### Edit load — `_load_todo_for_edit`
Return the parsed `checklist` array so the editor opens pre-filled.

A single tiny helper `_parse_checklist(raw)` → `list[{t,d}]` (safe on null / bad JSON → `[]`) is shared by shape, load, and write-validation.

## Frontend (both `/m` and `/w`)

Shared behaviour lives in `frontend/src` (imported as `@` by web); presentation is per-platform.

- **Where:** in the todo detail / edit view, adjacent to the `notes` block.
- **Rows:** each item = checkbox + text field + delete button. "Tambah item" adds a blank row. Drag handle reorders.
- **Persist:** on each change, build the array and call `update_todo({checklist: JSON.stringify(items)})`; optimistic local state.
- **Card chip:** when `checklist_total > 0`, show `▢ {done}/{total}` on the todo card / list row.
- **Design language:** mobile = Soft-Pop card list rows; web = detail block matching its bento/detail styling. Reuse existing input/checkbox primitives (`SearchableSelect` etc. not needed here — plain text input + checkbox).

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
