# Transfer Tasks — Design

**Date:** 2026-07-03
**Feature:** Admin transfers all open tasks from one user to another (all projects, or a specific project).

## Purpose

When someone leaves, changes role, or a workload needs rebalancing, an admin
needs to bulk-move a user's open Project Todos to another user. The on-disable
offboarding hook (`user_offboarding.py`) already auto-moves open tasks to the
project leader/owner, but it can leave orphans (no eligible leader/owner) and
offers no manual, targeted, self-serve path. This adds that path in the web
admin (`/w`).

## Decisions (from brainstorming)

- **Scope:** open tasks only — statuses not in `TERMINAL_STATUSES`
  (`✅ Completed`, `🚫 Cancelled`). Completed/cancelled stay with the source
  user as historical record; the Point Ledger stays attributed regardless.
- **UI:** new `/w` admin page under the Admin nav group, gated `canManageUsers`
  (System Manager).
- **Fields moved:** `assigned_to` only. Not `mentor`, not Frappe's `_assign`.
- **Team check:** **block non-members.** If the to-user is not on the Project
  Team of *any* affected project, the whole transfer is refused (atomic — moves
  nothing) and the projects are named. Reuses the exact membership source of
  `Project Todo.validate_assigned_to_team_member`: rows in `Project Team`
  (owner/leader/admin are auto-appended there by `Project.validate`).
- **Project-less todos** (empty `project`): no team exists → always allowed.

## Backend — `vernon_project/api/mobile.py`

Two whitelisted endpoints, both `_require_system_manager()`. Reuse
`TERMINAL_STATUSES` by importing from `vernon_project.user_offboarding` (single
source of the open/terminal split).

### `list_transfer_users()`
Returns all non-`PROTECTED_USERS` users **including disabled ones** (a leaving
user's orphaned tasks are the primary case), fields
`name/full_name/user_image/enabled` + `avatar_config`. Frontend uses the full
list for the From picker and enabled-only for the To picker.

### `transfer_tasks(from_user, to_user, project=None, dry_run=0)`
1. Validate: both exist, neither protected, `from != to`, **to enabled**;
   `project` exists if given.
2. Query open todos: `assigned_to == from_user`,
   `status not in TERMINAL_STATUSES`, `+ project` filter when given.
   Fields: `name, project`.
3. Team check: for each distinct non-empty `project` among the todos, require
   `to_user ∈ Project Team(project)`. Collect the projects that fail.
4. `dry_run` truthy → return `{count, blocked_projects}` (no writes).
5. Else: if `blocked_projects`, `frappe.throw` listing them (nothing moved).
   Otherwise raw `frappe.db.set_value("Project Todo", name, "assigned_to",
   to_user)` per row, `frappe.db.commit()`, return `{moved}`.

Raw `db.set_value` (not `.save()`) mirrors offboarding: intended admin override,
skips re-running point-ledger/recurrence hooks (open tasks have 0 earned).
Recurrence still follows — next-occurrence generation reads `assigned_to` fresh
from the DB, so future occurrences inherit the new assignee. The team check is
enforced explicitly in step 3 (since raw update bypasses the doc validator).

Helper: `_project_team(project) -> set[str]` via
`frappe.get_all("Project Team", filters={parent, parenttype:"Project"},
pluck="user")`.

## Frontend `/w`

- `frontend/src/lib/api.ts` (shared) — additive, safe for `/m`:
  - `listTransferUsers()` → `{ users: TransferUser[] }`
  - `transferTasks(fromUser, toUser, project?, dryRun?)` → POST `transfer_tasks`
    returning `{ count, blocked_projects }` (dry-run) or `{ moved }`.
- `frontend/src/lib/types.ts` (shared) — `TransferUser` (`GrantUser` + `enabled`).
- `frontend-web/src/pages/TransferTasks.tsx` (new):
  - From user (`SearchableSelect`, all users), To user (enabled, `!= from`),
    Project (`SearchableSelect allowClear`, "Any project" default; options from
    `mobileApi.projects()`).
  - **Preview** button → dry-run → shows "N open tasks will move". If
    `blocked_projects` non-empty, show a blocking warning naming them and
    disable Transfer.
  - Transfer → `useConfirm` dialog ("Move N open tasks from A to B? Cannot be
    undone.") → `transfer_tasks` → `useToast` result, reset form.
- `frontend-web/src/App.tsx` — `<Route path="/transfer-tasks">` gated
  `canManageUsers`.
- `frontend-web/src/lib/nav.ts` — "Transfer Tasks" leaf under Admin
  (`canManageUsers`), icon e.g. `ArrowLeftRight`.

## Out of scope (YAGNI)

mentor field, `_assign`, completed/cancelled tasks, per-project pre-filtering of
the dropdown, mobile `/m` UI, undo.

## Verification

`bench restart` (Python) + web `npm build`. Deferred to final phase per project
convention (live site, code-first). Minimal check: a self-contained assert-style
test of the team-check + open-status filtering logic, or a bench-console dry-run
against a real from/to pair.
