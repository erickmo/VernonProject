# Cancel Todo — Reversible Cancelled State

**Date:** 2026-06-23
**Status:** Approved design

## Summary

Add a `🚫 Cancelled` status to Project Todo: a reversible terminal state off
the linear workflow. A user who can edit a todo may cancel it (with an optional
reason) from any non-completed state, and restore it back to `⚪️ Planned`.
Cancelled todos are hidden from active lists by default; the project-detail
screen has a toggle to reveal them.

## Decisions

| Decision | Choice |
|---|---|
| Model | Single new status value `🚫 Cancelled` (not a separate flag) |
| Reversible | Yes — restore returns the todo to `⚪️ Planned` |
| Cancellable from | Planned / Done / Checked only — **not** Completed |
| Points | No reversal logic — Completed (the only scoring trigger) cannot be cancelled |
| Access | Anyone who can edit the todo (System Manager OR project_owner / project_leader / assigned_to) |
| Cancel reason | Optional note, stored on the todo, shown while cancelled, cleared on restore |
| Visibility | Hidden from active lists by default; **toggle on project-detail screen only** |
| Dashboard / workload / gantt | Always hide cancelled (no toggle) |

## Data Model

### `project_todo.status` (Select)

Append `🚫 Cancelled` to the existing options. Final option string set:

```
⚪️ Planned
🟠 Done
🔷 Checked By PL
✅ Completed
🚫 Cancelled
```

### New field: `cancellation_reason`

- Fieldtype: Small Text, label "Cancellation Reason", optional.
- Set when cancelling (may be empty), cleared on restore.

### `mobile.py` status constants

```python
STATUS_CANCELLED = "🚫 Cancelled"   # add to the constants block
STATUS_KEY[STATUS_CANCELLED] = "cancelled"
```

`Cancelled` gets **no** `NEXT_STATUS` entry — it is off the linear chain and
cannot be advanced. `_status_key` returns `"cancelled"` for it.

### Frontend `StatusKey` (types.ts)

```ts
export type StatusKey = 'planned' | 'done' | 'checked' | 'completed' | 'cancelled'
```

## Backend — two new whitelisted methods (`vernon_project/api/mobile.py`)

Both reuse the **exact** edit-permission check already used by `update_todo`
(`mobile.py:967-968`): `is_sm = "System Manager" in roles`; allowed if
`is_sm or user in (project.project_owner, project.project_leader, row.assigned_to)`.
Both return the existing `{"status": ..., "message": ...}` shape the mobile UI
expects, and both `save(ignore_permissions=True)`.

### `cancel_todo(project_item, reason=None)`

1. Resolve the todo → project_detail → project (same chain as `update_todo`).
2. Permission check (above) — else `{"status":"error","message":"You don't have permission to edit this task."}`.
3. If `row.status == STATUS_COMPLETED` → `{"status":"error","message":"Cannot cancel a completed task."}`.
4. If `row.status == STATUS_CANCELLED` → `{"status":"info","message":"Task is already cancelled."}`.
5. Set `row.status = STATUS_CANCELLED`; `row.cancellation_reason = (reason or "").strip() or None`.
6. Save; return `{"status":"ok","message":"Task cancelled."}`.

### `restore_todo(project_item)`

1. Same resolve + permission check.
2. If `row.status != STATUS_CANCELLED` → `{"status":"info","message":"Task is not cancelled."}`.
3. Set `row.status = STATUS_PLANNED`; `row.cancellation_reason = None`.
4. Save; return `{"status":"ok","message":"Task restored."}`.

### Scoring / controller safety

- Scoring (`sync_point_ledger`) fires only on `Completed`. Cancel can never act
  on a Completed todo, and restore goes `Cancelled → Planned`, so no scoring path
  is triggered and no point reversal is needed.
- The Project Todo controller restricts status changes only for Project Admin
  (`validate_project_admin_status_update`); Project Admin is not in the cancel
  permission set, so this is consistent. `validate_done_todo_fields` locks
  certain fields when Done/Completed but does not block a status change, and we
  change no locked fields — saving `status=Cancelled` works.

## List Visibility

| Endpoint | Behavior |
|---|---|
| `get_project` (project-detail todos) | Exclude `🚫 Cancelled` by default; accept `include_cancelled=0`; when `1`, include them. |
| `get_dashboard` | Always exclude `🚫 Cancelled`. |
| `get_member_workload` | Always exclude `🚫 Cancelled`. |
| `get_project_gantt` | Always exclude `🚫 Cancelled`. |

Each query filters on the `status` column (or the post-query shaped list) to
drop the cancelled status string unless `include_cancelled` is set (only
`get_project` honors that flag).

## Frontend

### `ProjectItemScreen`

- **Cancel task** button: shown when the viewer can edit AND `status_key` is not
  `completed` and not `cancelled`. Opens the app confirm dialog with an optional
  reason input (use the existing dialog/Confirm provider — never native prompt);
  on confirm calls `cancelTodo(project_item, reason)`.
- **Restore** button: shown when `status_key === 'cancelled'`; confirm →
  `restoreTodo(project_item)`.
- When cancelled, show the `cancellation_reason` (if any) in the detail.
- Status badge renders `cancelled` with muted + strikethrough styling.

### Project-detail screen

- "Show cancelled" toggle. Off by default → calls `get_project` without the flag.
  On → passes `include_cancelled=1`. Cancelled rows render muted/strikethrough.

### Wiring

- `api.ts`: `cancelTodo(projectItem, reason?)`, `restoreTodo(projectItem)`.
- `hooks/useData.ts`: mutations for cancel/restore that invalidate the task
  query and the project / dashboard list queries.
- `lib/types.ts`: `StatusKey` adds `'cancelled'`; the project-item type gains
  `cancellation_reason?: string | null`.

## Error Handling

| Condition | Result |
|---|---|
| No edit permission | `{"status":"error","message":"You don't have permission to edit this task."}` |
| Cancel a Completed todo | `{"status":"error","message":"Cannot cancel a completed task."}` |
| Cancel an already-Cancelled todo | `{"status":"info","message":"Task is already cancelled."}` |
| Restore a non-Cancelled todo | `{"status":"info","message":"Task is not cancelled."}` |
| Todo not found | `{"status":"error","message":"Task not found."}` |

## Testing / Verification

Live, code-first site (`project.vernon.id`), no test DB — manual + console
verification after deploy (defer automated tests to a final phase):

1. Cancel a Planned/Done/Checked todo (with and without reason) → status
   `🚫 Cancelled`, reason stored.
2. Cancel attempt on a Completed todo → rejected; points untouched.
3. Restore → status `⚪️ Planned`, reason cleared.
4. Cancelled todo absent from dashboard, workload, gantt; absent from
   project-detail until "Show cancelled" is toggled on.
5. Permission: a non-owner / non-leader / non-assignee (non-SM) is rejected.

## Out of Scope (YAGNI)

- Point reversal for cancelling completed work.
- Bulk cancel / restore.
- Auto-archive by age.
- Cancellation as a distinct doctype or audit log (beyond the single reason field).
