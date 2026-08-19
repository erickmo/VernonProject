# My Approvals (history) + Undo Approval

Date: 2026-08-19

## Problem

There's no way to see a history of approvals a user has personally granted (Leader's
Done→Checked, Owner's Checked→Completed), and no way to undo one if it was a mistake.
The existing `/review` screen only shows *pending* items still awaiting approval.

## Design

### Backend — `vernon_project/api/project_todo.py`

- **`get_my_approvals()`** — todos where the current user is `tested_by` (Leader gate)
  or `completed_by` (Owner gate). Reuses `mobile.py`'s `_fetch_todos` (statuses
  `Checked`/`Completed` only — mirrors `get_dashboard`'s backlog-avoidance) and
  `_shape_todo` for the card shape. Adds two fields per row on top:
  `approved_at` (their own stamp — `completed_at` if they were the Owner-approver,
  else `tested_at`) and `approval_role` (`"Leader"`/`"Owner"`). Sorted `approved_at`
  descending (newest approval first) server-side.
- **`undo_approval(todo_id)`** — self-service, one gate, one step back:
  - `Checked By PL` + `tested_by == me` → back to `Done`, clear `tested_at`/`tested_by`.
  - `Completed` + `completed_by == me` → back to `Checked By PL`, clear
    `completed_at`/`completed_by`.
  - Any other state → error ("nothing of yours to undo here"). This keeps it
    self-service and safe: you can't undo out from under someone who already
    advanced past your action.
  - Reverting away from `Completed` re-triggers `on_change`'s existing
    `prev_state == Completed → self._remove_ledger()` — the Point Ledger rows
    un-mint for free, no new ledger code needed.
  - If the Completion had auto-generated the next recurrence
    (`generate_next(force=True)` in `on_change`), delete that occurrence too —
    but **only if it's still pristine** (`status == Planned`, `developed_at` unset,
    i.e. nobody has touched it since). One already worked on is left alone.

### Backend — `vernon_project/api/mobile.py`

- New `_can_undo(status_key, row, user)` helper, mirroring `_can_advance`/
  `_can_reject`: true when `status_key == "checked" and row.tested_by == user`, or
  `status_key == "completed" and row.completed_by == user`.
- `_shape_todo` gains a `can_undo` field (same pattern as `can_advance`/`can_reject`),
  so it works everywhere a `TodoCard` renders, not just the new screen.

### Frontend — shared (`frontend/src`, imported into web via `@`)

- `TodoCard.tsx` — Undo button in the action footer, gated on `todo.can_undo`,
  alongside the existing Approve/Reject buttons.
- New `UndoProvider.tsx` — confirm dialog via `useConfirm()` (no native confirm),
  mirrors `RejectProvider.tsx`'s simpler shape (no reason field needed) → calls
  `useUndoApproval()`.
- `hooks/useData.ts` — `useMyApprovals()` (query) + `useUndoApproval()` (mutation,
  mirrors `useRejectStatus`'s `onSettled` invalidation).
- `lib/api.ts` — `mobileApi.getMyApprovals()` / `mobileApi.undoApproval(todoId)`.
- `lib/types.ts` — `ProjectItem.can_undo?: boolean`; a small `MyApprovalItem` type
  extending it with `approved_at`/`approval_role`.

### Frontend — per-platform

- New `pages/MyApprovals.tsx` in **both** `frontend/` and `frontend-web/`, same
  split as `Review.tsx` (mobile Soft-Pop card feed / web bento `Page`+
  `ThreeColProjectList`). Plain list, server-sorted descending, reusing `TodoCard`
  + `EmptyState`. No bulk actions, no filters — this is a small history view, not
  the Review queue.
- Route `/my-approvals` in both `App.tsx`, wrapped by the new `UndoProvider`
  (alongside the existing `AdvanceProvider`/`RejectProvider`).
- Entry point: mobile's bottom nav is a fixed 5 tabs (no room, no overflow menu) →
  add a tile to `Profile.tsx`'s "Work" group (next to Plan/Meetings). Web: add to
  `lib/nav.ts`'s `WORK` mega-menu group (not `NAV_PRIMARY` — that's for the 5
  pinned/badged tabs; this is secondary).

## Explicitly out of scope (YAGNI)

- Bulk undo.
- Undoing someone else's approval (admin/leader override) — undo scope is
  self-service only, per explicit requirement.
- Filters/search on the history screen.
- A dedicated "undo" notification to the other party — the existing
  `_notify_status_change` already fires on any status change reaching
  Done/Checked/Completed, which covers it (the assignee/leader/owner sees the
  todo re-enter their queue).

## Testing

`undo_approval`'s three branches (undo-checked, undo-completed incl. ledger +
pristine-recurrence cleanup, reject when not eligible) get one
`test_undo_approval.py` using the existing `project_todo` test fixtures/patterns.
