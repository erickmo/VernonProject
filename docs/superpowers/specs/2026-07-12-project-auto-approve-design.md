# Project-level Auto-Approve — Design

Date: 2026-07-12
Status: Approved (design), pending spec review
Branch: feat/feedback-to-task

## Problem

Auto-approve today is **per-todo only**: `Project Todo.auto_approve` (Check) skips
the Owner review gate so a Checked-By-PL todo auto-advances to Completed. An owner
who wants a whole project to auto-approve must toggle every todo by hand.

Add a **project-wide default** switch, while keeping **per-todo override** (a todo
can force-on or force-off regardless of the project default).

## Behaviour

Effective auto-approve for a todo resolves as:

```
effective =  True   if todo forces ON
             False  if todo forces OFF
             else   project.auto_approve   (the default)
```

- Todo override **always wins** over the project default, in both directions.
- `effective` replaces the raw `todo.auto_approve` in the Owner-gate skip:
  `🔷 Checked By PL → ✅ Completed` fires without owner action when `effective` is true.
- Nothing else in the workflow changes: points still mint exactly once at
  `✅ Completed`; reject still only works at the review stages and is blocked once
  Completed; the empty-owner truthiness guard stays.

## Data model — Approach A (project bool + todo 2 bools)

No fieldtype change, no data migration (safe: the Partner role had zero holders until
2026-07-12, so no todo has `auto_approve=1` yet).

| Doctype | Field | Type | Default | Meaning |
|---|---|---|---|---|
| Project | `auto_approve` | Check | 0 | Project-wide default |
| Project Todo | `auto_approve` (existing) | Check | 0 | Force ON override |
| Project Todo | `auto_approve_opt_out` (new) | Check | 0 | Force OFF override |

Both new/changed fields are `read_only: 1` (Frappe desk cannot set them; only the
whitelisted API writes them).

Tri-state per todo is stored as 2 bools. The setter enforces mutual exclusivity so
the invalid "both true" state never persists:

| Mode | `auto_approve` | `auto_approve_opt_out` |
|---|---|---|
| `on` | 1 | 0 |
| `off` | 0 | 1 |
| `inherit` | 0 | 0 |

Rejected Approach B: convert `auto_approve` Check → Select(Inherit/On/Off). Cleaner
single field but a live fieldtype change that rewires every existing reader for no
functional gain.

## Backend changes (`vernon_project/`)

### Doctypes
- `doctype/project/project.json`: add `auto_approve` Check (read_only), label
  "Auto-Approve All Todos (Owner)".
- `doctype/project_todo/project_todo.json`: add `auto_approve_opt_out` Check
  (read_only), label "Auto-Approve Opt-Out".

### `api/project_todo.py`
- `_auto_advance(todo, project_leader, project_owner, project_auto_approve)`: new 4th
  param. Compute `effective = todo.auto_approve or (not todo.auto_approve_opt_out and
  project_auto_approve)`; the Owner-gate skip uses `effective` (keeps the existing
  `project_leader == project_owner` clause).
- `update_status`: pass `project.auto_approve` into `_auto_advance`.
- `set_auto_approve(todo_id, mode)`: **signature change** — `mode ∈ {on, off, inherit}`
  → set the 2 bools per the table. Same Partner+owner gate. Return the resolved mode.
- **NEW** `set_project_auto_approve(project, enabled)`: Partner+owner gate (same rule),
  set `Project.auto_approve = cint(enabled)`, save `ignore_permissions=True`.

### `api/mobile.py`
- `_fetch_todos`: add `t.auto_approve_opt_out` and `p.auto_approve AS
  project_auto_approve` to the SELECT.
- `_shape_todo`: replace the raw `auto_approve` output with:
  - `auto_approve_mode`: `"on"` if `row.auto_approve` else `"off"` if
    `row.auto_approve_opt_out` else `"inherit"`.
  - `auto_approve_effective`: bool of the resolution above using
    `row.project_auto_approve`.
  - keep `can_set_auto_approve` (existing `_can_set_auto_approve` gate — reused for the
    project switch too).
- `get_project` return dict: add `auto_approve: bool(doc.auto_approve)` and
  `can_set_auto_approve: _can_set_auto_approve({"project_owner": doc.project_owner}, user)`.

### Recurrence (both paths — see memory "Todo two recurrence paths")
`create_next_occurrence` (project_todo controller) and the `tasks.py` scheduler both
insert the next Project Todo. Wherever they copy `auto_approve`, also copy
`auto_approve_opt_out`. The project default inherits for free (read at advance time).

## Frontend changes

### Shared (`frontend/src`, imported by both apps via `@/`)
- `lib/api.ts`: `setAutoApprove(todoId, mode)` (mode string); new
  `setProjectAutoApprove(project, enabled)` → `set_project_auto_approve`.
- `lib/types.ts`: todo gains `auto_approve_mode: 'on'|'off'|'inherit'` and
  `auto_approve_effective: boolean` (drop raw `auto_approve`); project meta gains
  `auto_approve: boolean` and `can_set_auto_approve: boolean`.
- `hooks/useData.ts`: adapt `useSetAutoApprove` to `(todoId, mode)`; new
  `useSetProjectAutoApprove` (invalidate project/detail/item queries).

### Per-todo control — 3-state segmented (Inherit / On / Off)
Small segmented control, gated by `can_set_auto_approve`. When mode is `inherit`, show
the resolved project default (e.g. "project default: ON"). Places:
- `/m` `pages/ProjectItemScreen.tsx` (replace the current single switch, ~line 1418).
- `/w` `pages/ProjectItem.tsx` (replace the current single switch, ~line 1440).
- Each **todo row** in the project detail todo lists (both frontends) — compact variant.

### Project-wide switch — on/off, gated `can_set_auto_approve`
- `/m`: `pages/ProjectScreen.tsx` **and** `pages/ProjectDetailScreen.tsx`.
- `/w`: `pages/Project.tsx` and `pages/ProjectDetail.tsx` (+ `ProjectDetailPane.tsx` if
  that renders the header).
- Toggling it calls `useSetProjectAutoApprove`, then per-todo rows showing `inherit`
  re-resolve their effective badge on refetch.

## Testing

Extend `tests/test_auto_approve_advance.py` (site-less, per memory "live site /
code-first" — no DB) to cover the resolution matrix on `_auto_advance`:

| project default | todo mode | expected on Checked-By-PL |
|---|---|---|
| ON | inherit | → Completed |
| ON | off (opt-out) | stays Checked |
| OFF | on | → Completed |
| OFF | inherit | stays Checked |
| ON | inherit, **no owner** | stays Checked (truthiness guard) |

## Deploy

Backend Python + doctype JSON → `bench migrate` (new fields) then
`sudo /usr/local/bin/tj-restart`. Frontends → `npm run build` for `/m` and `/w`
(+ Cloudflare asset-cache steps per memory if the `/m` bundle is CF-served). Grant of
the Partner role already done for `mo@vernon.id`.

## Out of scope
- Bulk "opt out all" action. YAGNI — per-todo segmented + project switch covers it.
- Auto-approving the **Leader** gate (Done→Checked). This feature only touches the
  Owner gate, as today.
