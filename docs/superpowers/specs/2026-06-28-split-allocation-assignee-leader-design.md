# Split day-allocation into Assignee Plan + Leader (Assigned) Allocation

**Date:** 2026-06-28
**Repos:** `vernon_project` (doctypes, API, mobile PWA frontend), `ui` (web app — Daily Estimated Time report consumer)
**Status:** Approved design, pending implementation plan

## Problem

Today there is ONE day-allocation concept: the `Project Todo Allocation` child table
("Day Allocations"). It is overloaded:

- It is the **assignee's** personal day-split (assignee-only edit), BUT
- it is **forced to sum to `Project Todo.estimated`** (the leader's scoring number), AND
- it is consumed by the **Daily Estimated Time report** as if it were the authoritative
  assigned workload.

The scoring estimate (`estimated`) is editable by leader, owner, AND assignee, so an
assignee can change the number that drives contribution points
(`points = base_rate × estimated × difficulty%`).

We want to separate two distinct concerns:

1. **Assignee plan** — the assignee plans their own day, with their **own** minutes.
   Never affects contribution scoring, never affects the assigned allocation that
   leader/owner see.
2. **Leader (assigned) allocation** — the **leader** sets the todo's `estimated`
   minutes and distributes them across one or more dates (default: the whole estimate
   on the due date). This is authoritative and is what leader/owner see.

## Decisions (locked during brainstorming)

- **Daily Estimated Time report:** show **both** series side by side per user/day —
  assignee-`planned` vs leader-`assigned`.
- **Who sets `estimated`:** **leader + owner** (+ System Manager). Assignee blocked.
- **Cross-visibility on the todo screen:** **see both, edit own.** Everyone sees both
  plans; you edit only the plan you own. Owner edits neither split (owner can still set
  `estimated`).
- **Storage model (A′):** keep the existing `Project Todo Allocation` table as the
  **assignee plan**; add a **new** child doctype for the leader allocation. Lowest churn,
  preserves correct authorship of existing rows, no rewiring of the Today home.
- **Report rollout:** the only report frontend is the web `ui` `DailyEstimatedTimePage`
  (no mobile report screen exists). Implement the doctype/API + the vernon_project todo
  screen first; the web `ui` report (both columns) as a follow-up phase.
- **"My day plan" after Done/Completed:** stays editable (personal, harmless).

## Data model

### `Project Todo Allocation` (existing — now explicitly the *Assignee Plan*)
- Field on Project Todo: `allocations` (Table, "Day Allocations").
- Child fields unchanged: `allocation_date` (Date, reqd), `estimated_minutes` (Int,
  non-negative), `note` (Small Text).
- **Change:** drop the "sum must equal `estimated`" rule. Free-form — the assignee's own
  minutes, any total.
- **Not scored.** Edited by assignee (+ SM) only.
- Relabel description to: "Assignee's personal day-plan (their own minutes). Planning
  only — not scored, not the assigned allocation."

### `Project Todo Assigned Allocation` (NEW — the *Leader Allocation*)
- New child doctype, parent field on Project Todo: `assigned_allocation` (Table,
  "Assigned Allocation").
- Fields (mirror the assignee table): `allocation_date` (Date, reqd),
  `estimated_minutes` (Int, non-negative), `note` (Small Text).
- **Sum of `estimated_minutes` must equal `Project Todo.estimated`** when `estimated > 0`.
- **Virtual default:** when no explicit rows exist, the assigned allocation is a single
  synthesized entry `{ date: deadline, minutes: estimated }`. This is computed on read
  (shaping + report) and is NOT stored. A leader setting explicit rows overrides it.
- **Not scored** (it only distributes `estimated`, which is what is already scored).
- Edited by leader (+ SM) only. Owner views.

`deadline` is `reqd` on Project Todo, so the virtual default always has a date.

## Permissions & contribution independence

- Points formula unchanged: `points = base_rate × estimated × difficulty%`. Neither plan
  feeds points → contribution independence holds by construction. The only scoring input
  is `estimated`, which only leader/owner/SM can set.
- `estimated`: editable by **leader, owner, System Manager**. Assignee blocked. Still
  locked once status is Done/Completed (existing `validate_done_todo_fields`).
- Assigned allocation split: **leader + SM**.
- Assignee plan: **assignee + SM**.

## Backend (`vernon_project/api/mobile.py`)

- `set_todo_allocations(project_item, allocations)` (assignee plan): keep; **remove** the
  sum==estimate validation block. Stays assignee/SM-gated.
- **New** `set_assigned_allocation(project_item, allocations)` (leader/SM-gated): writes
  the `assigned_allocation` child table; **validates sum == estimate** (when estimate > 0),
  reusing the existing short/over message style.
- `update_todo`: when `estimated` is being changed, reject unless caller is
  leader/owner/SM (assignee may still edit `to_do` etc. but not `estimated`). On a
  successful `estimated` change, **clear any explicit `assigned_allocation` rows** so the
  virtual default re-applies (leader re-splits if they want a multi-day split). No
  rescaling logic.
- `_shape_todo`: add to the payload:
  - `assigned_allocation`: the explicit rows, or the virtual default when empty.
  - `assigned_total`: sum of assigned minutes (== estimate via the rule / default).
  - `can_edit_assigned`: `is_leader or SM`.
  - `can_edit_estimate`: `is_leader or is_owner or SM`.
  - Keep `allocations` / `allocated_total` / `today_allocation` as the assignee plan.

## Frontend — todo detail (`vernon_project/frontend/src/pages/ProjectItemScreen.tsx`)

- **Two cards**, both rendered for everyone; each is editable only by its owner, else
  read-only:
  - *My day plan* — the existing `AllocationCard`, renamed. Editable when `is_mine`.
    Remove the sum==estimate validation in its `onSave`. Badge shows the assignee total
    (no estimate constraint).
  - *Assigned plan* — NEW card. Editable when `can_edit_assigned` (leader/SM). Keeps the
    sum==estimate badge + validation. Shows the deadline-default rows when empty.
- `EditForm`: hide/disable the `estimated` input unless `can_edit_estimate`.
- "Split to today" button (already added) writes the **assignee plan** via
  `set_todo_allocations`; keep, `is_mine`-gated. Now valid since the sum rule is gone.
- New data layer:
  - `lib/api.ts`: `setAssignedAllocation(todoId, allocations)` → POST
    `set_assigned_allocation`.
  - `hooks/useData.ts`: `useSetAssignedAllocation(todoId)` — invalidates `projectItem` +
    `dashboard`.
  - `lib/types.ts`: add `assigned_allocation`, `assigned_total`, `can_edit_assigned`,
    `can_edit_estimate` to `ProjectItem` / `ProjectItemDetail`.

## Today home / "plan my day" (`vernon_project/frontend/src/pages/Today.tsx`)

- **No change.** `today_allocation` = assignee plan minutes dated today, which already
  drives the assignee's Today list and the "plan my day" summary. The assignee's personal
  plan IS their day. A leader-facing "assigned today" view is out of scope (YAGNI).

## Daily Estimated Time report (web `ui` only)

- Backend `vernon_project/api/report.py` `daily_estimated_time(from_date, to_date)`:
  return, per user/day, **two** numbers — `planned` (sum of `Project Todo Allocation`
  minutes) and `assigned` (sum of `Project Todo Assigned Allocation` minutes, substituting
  the virtual default `{deadline, estimated}` for todos with no explicit assigned rows).
  Keep the below-threshold flag and apply it to the **`assigned`** series (the
  authoritative workload). Changing the return shape from a single value to a
  `{assigned, planned}` pair is a breaking change to the payload — the web consumer must
  be updated in the same phase.
- Only consumer: web `ui` `DailyEstimatedTimePage`. Shows assigned vs planned per cell
  (side by side), flags divergence / under-threshold. **Follow-up phase** (after the
  vernon_project doctype/API/todo-screen phase).
- The vernon_project mobile PWA has **no** report screen today; a mobile report is out of
  scope.

## Edge cases

- `estimated` changed → explicit assigned rows cleared → assigned re-defaults to
  `{deadline, estimated}`. Assignee plan untouched.
- `estimated == 0` → no sum constraint on assigned; virtual default contributes 0 minutes.
- No deadline → not possible (`deadline` is `reqd`).
- Done/Completed → `estimated` + assigned split locked (existing lock covers `estimated`;
  `set_assigned_allocation` should also refuse when `fields_locked`). Assignee plan stays
  editable.

## Migration

- New doctype `Project Todo Assigned Allocation` → its table is created on
  `bench migrate`. No data backfill (virtual default covers all legacy todos).
- Existing `Project Todo Allocation` rows remain the assignee plan, unmoved.

## Out of scope (YAGNI)

- Leader-facing "assigned today" Today view.
- Rescaling an existing assigned split when `estimated` changes.
- Any owner-edited split.
- Notifications when assignee plan diverges from assigned allocation (the report already
  surfaces divergence visually).
