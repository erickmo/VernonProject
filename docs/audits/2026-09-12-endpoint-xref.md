## Endpoint cross-reference, 2026-09-12

This is a read-only sweep of every `@frappe.whitelist` in vernon_project, taken at main `48d7ab8`, against every caller I could find. It also covers raw writes that reach a todo without going through the `validate_done_todo_fields` lock added in 52r6l30cs4. It follows the earlier sweep (`9f6821f`, `f08d722`, 2026-09-11) and lists only what that sweep did not find.

**Method.** Endpoints were enumerated with the AST, not grep: 322 in total, 13 of them guest. Callers were then matched in these places:

- **Both frontends:** the prefix constants in `frontend/src/lib/api.ts`, resolved first, then `PREFIX + 'fn'`, `${PREFIX}fn` and full dotted paths.
- **Desk JS, www and templates.**
- **Python:** dotted strings, `enqueue` and hooks.
- **Every other app on the bench.**

Each endpoint was also traced one step further, from api.ts wrapper to data hook to component. That catches endpoints whose only "caller" is a wrapper or hook nobody invokes. For endpoints with no caller, git history shows when the caller disappeared.

| Caller | Endpoints |
|---|---|
| /m and /w | 292 |
| Desk JS / www only | 9 |
| Another app only (vedu_erp calendar sync, in flight) | 2 |
| Nothing | 19, triaged below |
| Frontend calls to an endpoint that does not exist | **0** |

### A. Writes that reach a done todo around the lock

The lock runs in `validate()`. These paths write with `frappe.db.set_value` or `frappe.db.delete`, so they skip it.

- **A1. `user_offboarding._transfer_open_todos`** (`user_offboarding.py:117`) runs automatically when a user is disabled (hooks.py:216).
  - It filters on `status not in (Completed, Cancelled)`. So besides Planned, it also reassigns **Done** and **Checked By PL** todos to the project leader or owner, and deletes their day-plan rows.
  - Nothing is earned before Completed. When the todo is approved, `sync_point_ledger` credits the Assignee role to the current `assigned_to`. That means the departed person's finished work is credited to the leader.
  - If the new assignee is the project leader, they collect both the Assignee row and the Leader row.
  - Proposed fix: filter to Planned only. Done and Checked todos keep the person who did the work; they need no further action from the assignee.
  - This is owner policy (should someone who left still earn for work they finished?), so I have not changed it.
- **A2. `mobile.transfer_tasks`** (`mobile.py:4902`) is the admin bulk reassign. It has the same filter, the same raw write, and the same consequence. It was already raised to the owner as item (c) of 52r6l30cs4. A1 is the automatic twin of it and is new.
- **A3. `mobile.move_todos`** (`mobile.py:7527`) can move a done todo to another work item. Already raised as item (a).
- **A4. `mobile.move_project_detail` / `_reparent_detail`** (`mobile.py:7377`) moves the whole work item to another project, done todos included. Already raised as item (b).
- **Legitimate, keep:**
  - `ProjectTodo.on_trash` clears `issue_of` on the children of a deleted todo.
  - `mobile.py:2707` sets `recurring_paused` on the series root. Recurrence settings are deliberately left unlocked.

No raw SQL `UPDATE` touches `tabProject Todo` or its child tables anywhere in the app. No path saves a todo with validation disabled.

### B. Endpoints with no live caller (new findings)

**B1. The only caller is a dead wrapper or hook.** The earlier sweep counted "wrapper exists" as a caller, so these slipped past it.

| Endpoint | Chain | Dead since |
|---|---|---|
| `project_todo.bulk_update_status` | `mobileApi.bulkAdvance` → nothing | `a6abc69` 2026-07-12, the tri-state Review redesign dropped the bulk bar |
| `project_todo.bulk_reject_status` | `mobileApi.bulkReject` → nothing | same |
| `mobile.update_user` | `updateUser` → `useUpdateUser` → nothing | `566b1aa` 2026-07-05; the atomic save in `employee_admin` now calls it from Python |
| `habit.update_habit` | `habitApi.updateHabit` → `useUpdateHabit` → nothing | added in `5fa718b` and never wired. **Habits cannot be edited on /m or /w**, only created, toggled and deleted |

**B2. Nothing calls them.**

| Endpoint | Gate | History |
|---|---|---|
| `report.daily_estimated_time`, `report.daily_estimated_time_access`, `report.over_occupied` | System Manager | No /m, /w or Desk caller anywhere in history. Only `test_report` uses them |
| `project.get_project_team_members` | Project read (added in the 09-08 sweep) | Its only caller, Desk `project_detail.js`, was removed in `c2cc01c` 2026-06-17 |
| `teguran.get_teguran_detail` | the employee themself, or HR | Never wired |
| `project.update_project`, `project.update_project_detail` | owner / leader / SM, with an allowlist and tests | No client. Probably meant for agents over MCP |
| `mobile.update_employee_profile`, `project_todo.list_todo_files` | SM / todo editor | Wrappers dropped in `f08d722`. Still used from Python (`employee_admin`, `get_project_item`), so only the HTTP exposure is unused |
| `disc.reset_disc` | System Manager | Wrapper dropped in `f08d722`. An admin action with no UI |

### C. Not orphans: reachable by design

- **Agent API over MCP**, documented in `mcp_server/README.md`: `get_confirmed_ai_todos`, `get_ai_todos_needing_prompt`, `get_ai_todo_context`, `get_ai_project_context`, `delete_ai_prompt` and `search_todos`.
- `events.midtrans_notify`, the Midtrans payment webhook.
- `recruitment.list_open_jobs` and `get_job`, both guest. The owner decision is already pending from `9f6821f`. Note that `get_job` exposes no more than the `/apply` page already renders. Its accuracy-test items are the static preview set; a real attempt gets a freshly generated bank from `get_ketelitian`.
- `external_calendar.sync_events` and `mobile.create_todo`, called by the vedu_erp calendar-todo sync, which is still on a worktree.

### Proposed batches (each needs a HUB-REQUEST)

1. **Safe deletions, no product question.**
   - Delete `bulk_update_status`, `bulk_reject_status`, `get_project_team_members`, `daily_estimated_time`, `daily_estimated_time_access`, `over_occupied` and `get_teguran_detail`, with their tests.
   - Delete the dead wrappers and hooks: `bulkAdvance`, `bulkReject`, `updateUser`/`useUpdateUser`, and `useBooking`, a generic resource read nobody uses.
   - Drop `@frappe.whitelist` from the Python-internal `update_user`, `update_employee_profile` and `list_todo_files`.
   - Needs a restart and both builds.
2. **Owner decisions.**
   - A1 and A2: who gets the points for a departed person's finished todos.
   - `habit.update_habit`: wire up habit editing on /m and /w, or drop it.
   - `reset_disc`: add an admin button, or drop it.
   - `update_project` / `update_project_detail`: keep for agents, or drop.
