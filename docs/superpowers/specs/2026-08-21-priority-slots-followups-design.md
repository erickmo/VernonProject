# Priority Slots Follow-ups — Design

**Date:** 2026-08-21
**Status:** Approved, ready for implementation plan

## Context

The Daily Priority Slots feature (spec `2026-08-20-daily-priority-slots-design.md`) shipped
2026-08-20/21: `Project Todo.is_priority`, a controller-enforced daily + per-project cap, a
nightly miss-penalty, and a vibrant "today's slots" rail on both homepages. This follow-up adds
three refinements on top of that shipped feature — no new doctype, one new endpoint, reuses
already-shipped fields (`is_priority`/`can_prioritize` already flow through `_shape_todo`, so
`get_calendar`/`usePlanPool` already carry them with zero backend change).

## The three asks

1. **Reposition the rail.** Move `PriorityRail` from near the top of each homepage to sit
   immediately above the todo-list tab bar (Plan/Deadline/Waiting/Done).
2. **Day filter on the rail.** Today/Tomorrow/Pick-date chips above the rail; picking a day
   re-renders the same rail with that day's slots instead of today's.
3. **Leader slot management in the Plan screen.** Extend the existing `PlanDeadlineDay` view
   (Plan → My project → By date) with a per-row priority toggle and a true site-wide occupancy
   badge for the assignee on the picked date.

## Decisions taken (and rejected alternatives)

| Decision | Chosen | Rejected |
|---|---|---|
| Day filter surface | Same rail, day-switcher chips above it | A separate new "Priority Slots" screen |
| Leader management surface | Extend `PlanDeadlineDay` (already the leader's date-nav'd team-due-today view) | A new standalone "Team Priorities" section |
| Occupancy badge data | True site-wide count (new small endpoint) | Locally-visible-only count (could undercount, badge could lie) |

## Component 1 — Reposition (both frontends)

`PriorityRail` moves from right after `<BannerCarousel>` to immediately above the axis tab row:

- `frontend/src/pages/Today.tsx`: move the `<PriorityRail>` block from its current mount (line
  ~495, right after `BannerCarousel`) to immediately before the tab row that renders `{ key:
  'plan', label: 'Plan' }` etc. (~line 640). Everything between (Spotlight, QuickActions,
  RecapCard, VerseCard) stays in its current relative order, just now above the rail instead of
  below it.
- `frontend-web/src/pages/Home.tsx`: same relative move — mount immediately before
  `<SectionHead>Your work</SectionHead>` (~line 700), which is the web equivalent of the tab row
  (the `Axis` tabs render just after it).

No data/prop changes — purely a JSX reposition on both sides.

## Component 2 — Day filter on the rail (both frontends)

**Data:** a new endpoint, `get_priority_occupancy(users, date)`, whitelisted, returns
`{ "<user>": { "slots": int, "items": [...shaped todos...] }, ... }` for each requested user on
the given date — same shape as `Dashboard.priority` but parameterized. Permission per requested
user: the caller may always request themself; requesting someone else requires the caller to
lead/own/administer at least one project that user is a team member of (the same trust boundary
`PlanDeadlineDay` already relies on to show team todos).

**Rail behaviour:** defaults to `Dashboard.priority` (today, already loaded by `get_dashboard` —
no extra round-trip for the common case). A small day-switcher (Today / Tomorrow / Pick date —
same chip + native-date-input pattern already used in `PlanScreen`/`PlanDeadlineDay`) sits above
the rail. Picking a day other than today calls `get_priority_occupancy([session.user], date)` and
the rail re-renders with that response instead. Switching back to "Today" drops back to the
already-loaded dashboard data (no refetch).

**Both frontends** get the same day-switcher chip row, each in its own layout, mounted with the
rail from Component 1.

## Component 3 — Leader slot management in `PlanDeadlineDay`

Each row in the "todos due on the selected date" list gains a ⚡ toggle button (visible only when
`t.can_prioritize` is true — the same field already shipped), next to the existing "clear
deadline" (X) button. Tapping it calls the existing `useUpdateTodo(t.name).mutate({ is_priority:
next })` — the same mutation Component 7 of the original feature already wired into the todo
detail menu; no new mutation hook.

**Occupancy badge:** next to each row's assignee tag, a small "2/3" badge shows that assignee's
TRUE site-wide slot usage for the selected date, sourced from `get_priority_occupancy` (Component
2's endpoint) called once per screen-load/date-change with the full set of assignees visible in
the current `due` list (one batched call, not one per row). A rejection from the toggle mutation
still surfaces via the existing Bahasa error toast (naming the exact cap breached) — the badge is
a helpful preview, not a substitute for the authoritative server-side check.

## Notes / assumptions

- Arbitrary "Pick date" on the rail (including past dates) is allowed, same as `PlanScreen`'s
  native date input — a past day simply shows whatever was true that day (including any that were
  later charged the miss penalty). No special-casing.
- The occupancy badge shows total slots used/available only, not a per-project sub-cap breakdown —
  the per-project cap still enforces server-side and surfaces via the existing rejection toast,
  which already names the exact breach.
- `PlanDeadlineDay`'s ⚡ toggle reuses `t.can_prioritize` exactly as shipped — no new permission
  logic on the toggle itself, only on the new occupancy endpoint.

## Testing

Extend `vernon_project/api/test_priority_slots.py` with cases for `get_priority_occupancy`:
self-request always allowed; a shared-project leader can request a team member; an unrelated
user cannot; the returned count matches actual claimed slots for the given date.

## Ship checklist

- No schema change, no migration — one new whitelisted Python function, frontend-only changes.
- Rebuild both bundles.
- What's New row (Bahasa, `Both`): rail moved up, added a day filter, leaders can now flag/see
  team priority slots directly from the Plan screen.
