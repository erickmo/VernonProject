# Confirm-on-Advance + Chained Approvals — Design

**Date:** 2026-06-24
**Status:** Approved (design)
**Scope:** Both apps — `frontend-web` (desktop/web) and `frontend` (mobile PWA)

## Problem

Status advances on a Project Todo (`Mark Done`, `Approve (Leader)`, `Approve (Owner)`) are
currently a single direct click that mutates immediately, with no confirmation. Two issues:

1. No confirm step — accidental advances are easy and irreversible by the actor (only
   higher roles can move backward / restore).
2. When one user is permitted to perform several consecutive steps (notably the project
   owner, who can advance at every gate), they must click, wait, and re-click for each step.

## Goal

- Every status advance opens a **confirm dialog** before mutating.
- When the **same user** can perform the **next** approval step too, the dialog **stays open**
  and **relabels** to that next step so the user can chain approvals in one session.
- When no further step is available to that user (or the task reaches `Completed`), the
  dialog closes.

This honors the standing project convention: never use native `alert/confirm/prompt`; use the
dialog modal.

## Current State (reference)

Linear flow, role-gated, no configurable approval table:

```
⚪️ Planned  →  🟠 Done  →  🔷 Checked By PL  →  ✅ Completed
```

| Transition | Allowed roles | Label (`next_status_label`) |
|---|---|---|
| Planned → Done | owner, leader, assigned_to | `Mark Done` |
| Done → Checked By PL | owner, leader | `Approve (Leader)` |
| Checked By PL → Completed | owner | `Approve (Owner)` |

Key locations:

- Backend transition: `vernon_project/api/project_todo.py::update_status(todo_id)` —
  returns `{status, message}` today.
- Permission + label helpers: `vernon_project/api/mobile.py` — `_can_advance(status_key,
  project, user, assigned_to)` and `NEXT_LABEL` map.
- Web advance UI: `frontend-web/src/pages/Review.tsx` (`approve(id)` → `useAdvanceStatus()`),
  direct mutation, no dialog.
- Web dialog primitive: `frontend-web/src/components/overlays/Dialog.tsx`
  (props: `open, onClose, title, children, footer, widthClass, onSubmit`).
- Mobile advance UI: `frontend/src/pages/ProjectItemScreen.tsx` (`onAdvance()` →
  `useAdvanceStatus()`) and `frontend/src/components/TodoCard.tsx` quick-advance button —
  both direct mutation, no dialog.
- Mobile dialog primitive: `frontend/src/components/Confirm.tsx` — `useConfirm()` hook
  returning `Promise<boolean>` (one-shot).

## Design

### Behavior (both apps)

1. User clicks an advance action → confirm dialog opens.
   - Title = the action label, e.g. `Approve (Leader)?`
   - Body = the task title (read-only context). **Simple confirm — no note/comment field.**
   - Buttons: `Cancel` and the action (`<next_status_label>`).
2. On confirm → call `update_status(todo_id)`.
   - **Success + same user can advance again** → dialog stays open; title + action button
     relabel to the new step; displayed status reflects the new state. User may confirm again.
   - **Success + no further step for this user** (or task now `Completed`) → dialog closes.
   - **Error** → dialog stays open, shows the error message, no advance.
3. Cancel closes the dialog with no change.

Cancel-task and Restore flows are out of scope and remain as-is (already dialog-based).

### Backend change

`update_status` extends its return payload so the frontend can drive chaining from the
mutation response directly — avoiding a refetch race where the list/detail query has not yet
refreshed:

```python
return {
    "status": ...,          # message severity bucket (info/success) — unchanged meaning
    "message": ...,         # unchanged
    "status_key": new_key,  # "planned" | "done" | "checked" | "completed"
    "can_advance": _can_advance(new_key, project, user, assigned_to),
    "next_status_label": NEXT_LABEL.get(new_key),  # None when terminal/none
}
```

- Reuses the existing `_can_advance` and `NEXT_LABEL` from `vernon_project/api/mobile.py`
  (import them, or relocate to a shared module if a circular import arises — prefer import).
- No DocType / schema change. No migration.
- Existing callers that read only `{status, message}` keep working (additive fields).

### Web (`frontend-web`)

- New `AdvanceDialog` component built on `Dialog.tsx`. Owns local state
  `{ open, todoId, title, label }`. On confirm it calls the advance mutation, reads
  `can_advance` + `next_status_label` from the response, and either relabels (chain) or
  closes. Invalidates the relevant query on each successful step so the underlying view
  stays in sync.
- `Review.tsx`: `approve(id)` opens `AdvanceDialog` instead of calling the mutation directly.
  Apply the same routing anywhere else the web app advances status.

### Mobile (`frontend`)

- Plain `useConfirm()` resolves once, which cannot express chaining. Add a small
  `useAdvanceConfirm` wrapper (or extend the confirm flow) that:
  re-prompts with the relabeled action button after each successful step until
  `can_advance` is false.
- `ProjectItemScreen.tsx` `onAdvance()` and `TodoCard.tsx` quick-advance both route through
  `useAdvanceConfirm`. Query invalidation on each step keeps the screen/card in sync.

### Edge cases

- **Mutation error:** keep dialog open, surface the returned message, do not advance.
- **Concurrent advance by another user:** backend permission check rejects; dialog shows the
  returned message and closes (no valid next step for this user).
- **`assigned_to` actor:** can only perform Planned → Done, so `can_advance` is false
  afterward — dialog closes after a single step (never chains).
- **Owner power path:** owner on a Planned task may chain Planned → Done → Checked →
  Completed within one dialog session. This is intended.

### Testing

Deferred to the final phase, per the live-site / code-first project convention (single LIVE
site, no test DB). Manual verification on `project.vernon.id` after deploy:
web advance + chaining, mobile advance + chaining, error/permission paths.

## Out of Scope

- Note/comment captured at approval time (no backend field added).
- Changes to cancel/restore flows.
- Any change to the linear status model or role gates.
