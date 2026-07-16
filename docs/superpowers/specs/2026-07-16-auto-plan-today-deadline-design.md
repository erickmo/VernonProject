# Auto-plan: today-deadline todos land in the assignee's plan server-side

Date: 2026-07-16
Status: approved, ready for implementation plan

## The requirement

Two rules, stated by the user:

1. Auto-plan always adds **all** today-deadline todos, regardless of the daily time limit.
2. When a todo is created with a deadline of **that same day**, the **assignee's plan is auto-updated**
   to include it.

## What already works

Rule 1 is already implemented and is **not** in scope. `autoFillPlan`
(`frontend/src/lib/planDay.ts:61`) builds its `base` from *every* today-deadline task and always
writes it. The daily-minutes number (`min_daily_estimated_minutes`, read via the shortfall endpoint)
is a **floor, not a cap**: it only pulls *extra* overdue/future tasks on top of the base. Nothing
limits today-deadline todos today.

## The actual gap (rule 2)

`useAutoPlanToday` (`frontend/src/hooks/usePlanDay.ts:67`) is **client-side**. It is mounted only on
`frontend/src/pages/Today.tsx` (/m) and `frontend-web/src/pages/Home.tsx` (/w). Consequences:

- A todo created by someone else, assigned to Budi, deadline today → Budi's plan stays empty until
  **Budi personally opens his dashboard**.
- Server-side consumers of `allocations` (expected-minutes-per-day, assignment-overload reports)
  see no load for that todo in the meantime.

The plan must be written by the server, at the moment the todo becomes a today-deadline todo, with
nobody's browser involved.

## Design

### Server: one method on the ProjectTodo controller

New `_ensure_today_allocation()` on `ProjectTodo`, called from `validate()`
(`vernon_project/vernon_project/doctype/project_todo/project_todo.py`).

`allocations` is a child table (`Project Todo Allocation`: `allocation_date` Date reqd,
`estimated_minutes` Int, `note` Small Text) on the **same doc**. So the method appends a row to the
save already in flight: no new endpoint, no scheduler, no second write, **no recursion**
(contrast the known `db_set`-inside-`on_change` trap).

Order inside the method:

1. **Reassign wipe.** `old = self.get_doc_before_save()`; if `old and old.assigned_to !=
   self.assigned_to`, then `self.set("allocations", [])`. Allocation rows are stored per-todo, not
   per-user, so the instant Budi owns the todo, Ana's rows are dead data — and if left, Budi
   silently inherits Ana's minutes.
2. **The ensure rule**, evaluated on every save:

```
if self.assigned_to and not self.is_waiting
   and self.status == "⚪️ Planned"
   and self.deadline and getdate(self.deadline) == getdate(nowdate()):
       row = the row in self.allocations with allocation_date == today
       if not row or (row.estimated_minutes or 0) <= 0:
           set/append it with estimated_minutes = (self.estimated or 30)
```

**Ensure, not overwrite.** A today row already sitting at 90m stays 90m. Only a missing or zeroed
row is (re)filled. This is what makes "always" true — the todo cannot be removed from today's plan —
without stomping a deliberate edit. It is also why `set_todo_allocations` (`api/mobile.py:1832`),
which does `doc.set("allocations", [])` then re-appends, cannot be used to drop a today-deadline
todo: the row comes straight back on the same save.

Constants and fields, confirmed against the doctype JSON: `status` Select with `⚪️ Planned`
(`STATUS_PLANNED`, `api/mobile.py:53`), `is_waiting` Check, `deadline` Date, `estimated` Int,
`assigned_to` Link→User. The `30` fallback mirrors `est()` in `planDay.ts:65`.

### Coverage is free

Every write path reaches `validate`, so one hook catches all of them:

- Todo creation via the mobile/web API.
- **Both** recurrence paths — `create_next_occurrence` *and* the `tasks.py` scheduler. This is the
  standing two-recurrence-paths trap (a change that touches only one path gets silently dropped for
  the other); hooking the controller sidesteps it entirely.
- Every deadline edit, including a future-dated todo being pulled back to today.
- Every reassign.

### No backfill

Todos that *already* have a deadline of today never hit `validate`, so they get no server row. They
do not need one: the frontend `autoFillPlan` base already adds them on the next dashboard load.
This is the reason `base` stays in `autoFillPlan` rather than being deleted as now-redundant code —
it is the migration path for the existing backlog, and it is idempotent with the server rule
(`plannedToday` skips anything the server already filled).

### Frontend: lock the row, one shared file each

`PlanRow.tsx` and `usePlanDay.ts` both live under `frontend/src` and are imported by **both** apps
(`@` = `frontend/src` is the shared layer; `frontend-web/src/components/PlanDayDrawer.tsx:4` imports
`PlanRow` directly). So /m and /w fix together, with no duplicated edit.

Without this, the remove/zero control becomes a silent no-op for today-deadline todos: the assignee
sets 0, saves, and the server hands the row straight back on refresh. That reads as a bug.

- `planDay.ts` gains `planFloor(t)`: `est(t)` when the todo is a non-waiting today-deadline todo,
  else `0`.
- `usePlanDay.setMin` clamps to that floor. Root-cause placement: every minus button, every preset
  chip, and every typed `0` in `PlanRow` already routes through `setMin`, so one clamp covers all of
  them.
- `PlanRow` renders a note on floored rows: **"Deadline hari ini — wajib di rencana"**.

**The floor is the estimate, not 1 minute.** A 60m task due today cannot sensibly be split
30-today / 30-tomorrow, because tomorrow is past its deadline. Minutes go up freely; they never go
below the estimate and never reach zero.

The server rule is deliberately more lenient than the UI floor (server refills only at zero; the UI
forbids anything under est). Each does its own job: the server guarantees **presence**, the UI
prevents a confusing bounce-back. An API-direct call setting 5m is left alone by the server (5 > 0,
so `_ensure_today_minutes` returns `None`) but not by the UI: `mins` derives as `max(60, 5) = 60`,
`touchedDiff` marks the row touched, and the next Save of anything in the sheet rewrites 5 → 60 even
though the user never touched that row. Intended, not a bug.

### Checks

- `frontend/src/lib/planDay.selfcheck.ts`: cases for `planFloor` (today-deadline → est; waiting →
  0; other-day → 0; est 0 → 30) and for the `setMin` clamp.
- `vernon_project/vernon_project/doctype/project_todo/test_project_todo.py`: cases for the ensure
  rule (insert dated today → row appears; zeroed row → refilled; 90m row → untouched; waiting /
  non-Planned / other-deadline → no row) and the reassign wipe.

## Out of scope

- Rule 1 (already shipped).
- Deleting `autoFillPlan`'s `base` (needed as the no-backfill migration path).
- Any change to the daily-minimum top-up logic, scoring, or status transitions.

## Ship notes

User-visible on both platforms → needs an `App Release` row (Bahasa, `published=1`, platform
`Both`) once the bundles are rebuilt and live. Python change → `sudo /usr/local/bin/tj-restart`.
Frontend change → rebuild both bundles; watch the Cloudflare `/assets` cache (purge + SW version
bump) per the standing asset-cache trap.
