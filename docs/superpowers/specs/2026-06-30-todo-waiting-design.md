# Project Todo — "Waiting" flag

**Date:** 2026-06-30
**Status:** Approved design, ready for implementation plan

## Problem

A user wants to mark a todo as **waiting** — parked because it's blocked on
something external (a client reply, a delivery, info from another person). The
todo is *not done*: its `status` stays `⚪️ Planned`. Today the only way to get a
Planned todo "off the active radar" is to cancel it, which loses it. Waiting
keeps it visible-but-parked, suppresses the overdue/nudge pressure, and records
why and who parked it.

This is distinct from the existing `blocking` / `blocked_by` dependency system
(which links one todo to another). Waiting is a **manual, free-text, external**
hold with no link to a specific todo.

## Scope

- **In:** backend fields + lifecycle, suppress overdue/nudges while waiting,
  reuse `update_todo` mutation path, mobile `/m` UI (badge + toggle + filter).
- **Out (deferred):** web `/w` UI. The web app reports todos but does not edit
  per-todo status. Backend overdue suppression already benefits any shared
  read. Add a web badge later only if requested.

## Decisions (from brainstorming)

- Waiting is a **manual flag**, not a status value and not auto-derived from
  dependencies.
- It carries: a **required reason**, plus audit of **who** set it and **when**.
- While waiting, the todo must **not** be flagged overdue and must **not**
  generate deadline/comeback nudges.
- Permission to mark waiting = the **existing `update_todo` edit gate**
  (System Manager / project owner / project leader / the assigned user). No new
  permission rule.
- Waiting is only valid while status is `⚪️ Planned`. Advancing status
  auto-clears the flag.

## Data model

Add four fields to `vernon_project/vernon_project/doctype/project_todo/project_todo.json`,
inserted right after the existing `status` field:

| fieldname        | fieldtype | properties                                   |
|------------------|-----------|----------------------------------------------|
| `is_waiting`     | Check     | default `0`                                  |
| `waiting_reason` | Small Text | description: "Why this todo is parked"      |
| `waiting_since`  | Datetime  | `read_only: 1` — set by controller           |
| `waiting_by`     | Link → User | `read_only: 1` — set by controller         |

No permission-block change: the whitelisted `update_todo` endpoint saves with
`ignore_permissions=True` and enforces its own role check, so the doctype's
existing write perms (Owner/Leader/Admin) and read-only Project Team are
untouched.

## Backend lifecycle

In `project_todo.py`, add `self.track_waiting()` to `validate()` (place the call
near `self.track_phase_changes()`), implementing:

```
def track_waiting(self):
    # Waiting only valid while the todo is still Planned (not done). Any other
    # status force-clears the flag so an advanced todo can never stay "waiting".
    if self.status != "⚪️ Planned":
        self.is_waiting = 0

    if self.is_waiting:
        if not self.waiting_reason:
            frappe.throw(_("Please add a reason before marking this todo as waiting."))
        if not self.waiting_since:
            self.waiting_since = now_datetime()
            self.waiting_by = frappe.session.user
    else:
        # Cleared (or auto-cleared) — wipe the audit + reason so nothing stale lingers.
        self.waiting_since = None
        self.waiting_by = None
        self.waiting_reason = None
```

Notes:
- Runs inside the existing `validate()`; no new `on_change`/`on_update` work.
- `validate_done_todo_fields` (project_todo.py:214) locks
  assigned_to/estimated/start_date/deadline once Done — it does **not** touch
  `is_waiting`, and the status≠Planned branch above already forces it off, so the
  two are consistent.
- No point-ledger interaction: `status` never changes, so no Point Ledger rows
  are minted or altered.

## Mutation path (reuse, no new endpoint)

`vernon_project/api/mobile.py::update_todo` (~line 1371) is the existing generic
field editor the mobile app already calls. It has an **explicit** keyword
signature (not `**kwargs`), so unknown fields are silently dropped. Two edits:

1. Add to the signature: `is_waiting=None, waiting_reason=None`.
2. In the field-apply block (~line 1465):
   ```
   if is_waiting is not None:
       row.is_waiting = 1 if str(is_waiting) in ("1", "true", "True") else 0
   if waiting_reason is not None:
       row.waiting_reason = waiting_reason or None
   ```

The existing permission gate (~line 1410: SM / owner / leader / assigned_to) and
`row.save(ignore_permissions=True)` (~line 1490, which runs `validate()` →
`track_waiting`) cover the rest. The required-reason rule lives in
`track_waiting`, so the backend rejects a waiting toggle with no reason
regardless of caller.

Frontend wrapper `api.todos.updateTodo(id, fields)` (frontend/src/lib/api.ts:125)
already forwards an arbitrary `fields` object — **no new client API code**.

## Suppress overdue / nudges while waiting

A waiting todo is parked, so it must not read as overdue and must not be nagged.

**Overdue shaping** (`vernon_project/api/mobile.py`) — add `and not <is_waiting>`
to the overdue boolean at each shaping site:
- ~line 441 (`"overdue": ...`)
- ~line 482 (`overdue = bool(...)`)
- ~line 590 (`"is_overdue": bool(...)`)
- ~line 780 (projects-tab overdue rollup count)

Each of these reads the todo row; ensure the row dict includes `is_waiting`
(add it to the relevant `SELECT`/field lists if not already selected).

**Scheduled nudges** (`vernon_project/tasks.py`):
- `notify_due_todos` SQL (~line 127): add `AND is_waiting = 0` to the WHERE.
- `notify_comeback_nudge` open-work pick (~line 190): add `AND is_waiting = 0`
  so a user whose only open work is parked isn't nagged to "come back."

**Deadline Desk report** (`project_todo_deadline_report.py`): left as-is — it's an
admin Desk report, not a user-facing nudge, and the user did not ask to change
it. Note for later if waiting rows should be hidden there.

## Mobile UI (`/m`, `frontend/src`)

`StatusKey` stays `planned | done | checked | completed | cancelled` (unchanged).
Waiting is orthogonal to status. The `ProjectItem` TS type
(`frontend/src/lib/types.ts`) gains `is_waiting: boolean`, `waiting_reason: string | null`,
`waiting_since: string | null`, `waiting_by_name: string | null` — populated by
the mobile.py shaping that the card/detail already consume.

- **`TodoCard.tsx`** (the status pill is at ~line 90): render a
  "⏸ Waiting" pill beside the status pill when `todo.is_waiting`. Suppress the
  red overdue border + "Overdue" deadline styling while waiting (the row's
  `is_overdue` is already false from backend suppression, so this is mostly the
  border at line 62 — keep it on the normal `meta.ring`).
- **`ProjectItemScreen.tsx`** (single-todo view, route `/project-item/:name`):
  add the action — **"Mark waiting"** (opens a small reason input; submit calls
  `updateTodo(id, { is_waiting: 1, waiting_reason })`, disabled until reason is
  non-empty) and, when already waiting, **"Resume"**
  (`updateTodo(id, { is_waiting: 0 })`) plus a read-only line showing the reason
  and "Waiting since <date> · set by <name>".
- **`filters.ts` / FilterSheet**: add an optional **"Waiting"** quick filter
  (show only waiting / hide waiting). `applyProjectItemFilters` gains one clause:
  `(!f.waiting || (f.waiting === 'only' ? t.is_waiting : !t.is_waiting))`.

## Error handling

- Required-reason enforced server-side in `track_waiting` (`frappe.throw`), and
  guarded client-side by disabling submit until the reason is non-empty.
- Marking waiting on a non-Planned todo is a no-op: `track_waiting` forces
  `is_waiting=0`. The UI only exposes the "Mark waiting" action while
  `status_key === 'planned'`.

## Testing

Per project convention (live site, tests deferred to final phase), add one
focused backend self-check covering the lifecycle invariants:
- marking waiting without a reason raises;
- marking waiting on a Planned todo sets `waiting_since` + `waiting_by`;
- clearing waiting wipes reason + audit;
- advancing status off Planned force-clears `is_waiting`.

A manual mobile smoke (mark waiting → badge shows + not overdue → resume) covers
the UI.

## Touchpoint summary

| File | Change |
|------|--------|
| `…/doctype/project_todo/project_todo.json` | +4 fields after `status` |
| `…/doctype/project_todo/project_todo.py` | `validate()` calls new `track_waiting()` |
| `vernon_project/api/mobile.py` | `update_todo` signature + apply; `is_waiting` in overdue SELECTs; `and not is_waiting` at 4 shaping sites |
| `vernon_project/tasks.py` | `AND is_waiting = 0` in `notify_due_todos` + `notify_comeback_nudge` |
| `frontend/src/lib/types.ts` | +4 fields on `ProjectItem` |
| `frontend/src/components/TodoCard.tsx` | Waiting pill; keep normal border when waiting |
| `frontend/src/pages/ProjectItemScreen.tsx` | Mark-waiting / Resume action + reason input + audit line |
| `frontend/src/lib/filters.ts` | optional Waiting filter clause |
| `…/doctype/project_todo/test_project_todo.py` | lifecycle self-check |
