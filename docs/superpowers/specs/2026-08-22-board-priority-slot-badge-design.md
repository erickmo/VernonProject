# Priority-Slot Badge on the By-Project Board — Design

**Date:** 2026-08-22
**Status:** Approved, ready for implementation plan

## Context

Priority Slots shipped across three prior specs (daily slots, follow-ups, and the team-coverage
"Tim" view). The "Tim" mode gives a leader a per-member week grid; but while a leader is actually
*arranging deadlines* on the **My project → By project** board (`PlanProjectBoard` in deadline
mode), they can't see whether the person they're assigning work to still has a free priority slot
that day. This adds that signal — and the ability to act on it — directly onto the board's cards.

## The ask

> In Plan → My project → By project, show the list of available slots for the user in the daily
> card.

## Decisions taken

| Decision | Chosen | Rejected |
|---|---|---|
| What the badge shows | **Free count** — "N slot kosong" (slots − used) for the card's assignee on the card's day | used/total framing; warn-only-when-full |
| Tappable | **Yes** — tap a card with room left to flag it priority on the spot | display-only |
| Which board | **Deadline mode only** (My project → By project) | also the alloc / My-work board |
| Data source | **Reuse `get_team_priority_coverage(project, week_start)`** | a new endpoint |

## Data

The board is per project-detail; every todo in the picked detail shares one `project`
(`detailTodos[0].project`), and the board already holds `boardWeekStart` (Mon-first). Call the
existing `useTeamPriorityCoverage(project, boardWeekStart)` (shipped in the Tim-view plan) — one
request returns `{members:[{user, full_name, days:[{date, used, slots, contributed}]}]}` for the
whole project team across that week. Build a `Map<user, Map<date, {used, slots}>>` lookup.

`useSetTodoPriority`'s `onSettled` already invalidates the `['team-priority-coverage']` query key
prefix, so the badges refresh automatically after any toggle. No new data plumbing beyond calling
the hook and indexing its result.

Permission: `get_team_priority_coverage` requires the caller be SM / project owner / leader /
admin. In "My project" scope the user is exactly that, so it succeeds; if it ever 403s, the hook's
`data` is undefined and badges simply don't render (graceful).

## Per-card badge

Rendered inside `card()` in `PlanProjectBoard.tsx`, **only when all of**: deadline mode; the card
sits in a day column (its `deadline` is set and within the visible week — Unscheduled and
out-of-week cards get no badge, since a priority needs a real in-week deadline day); the todo has
an `assigned_to`; and `slots > 0` (feature on). For that `(assigned_to, deadline)` looked up in the
coverage map:

- **already priority** (`t.is_priority` true) → filled `⚡ prioritas` chip.
- **room left** (`used < slots`) → `⚡ {slots − used} slot kosong`, amber, **tappable**.
- **full** (`used >= slots`) → `slot penuh ({used}/{slots})`, gray, inert.

`used` from the coverage endpoint counts every non-cancelled priority todo for that person/day
site-wide, so for a not-yet-priority card `slots − used` is the true remaining room; the controller
cap is the authority regardless.

## Tap

Only when the card is not full AND `t.can_prioritize` is true. Tapping calls
`useSetTodoPriority().mutate({ todoName: t.name, isPriority: !t.is_priority })` — the same hook,
cap enforcement, and Bahasa rejection toast the Tim view and the todo-detail menu already use. The
badge's click handler calls `stopPropagation()` so it does not trigger the card's existing
pick-to-move tap (identical to how the card's "Info / open detail" button already isolates its
tap). While the mutation is pending the badge shows a small spinner and is disabled.

## Components

- New shared `PrioritySlotBadge` in `frontend/src/components/PlanMeta.tsx` (both boards already
  import from there), props `{ used: number; slots: number; isPriority: boolean; canToggle:
  boolean; pending: boolean; onToggle: () => void }`. It owns the three-state render (priority /
  free / full) and the null-render when `slots <= 0`.
- `frontend/src/components/PlanProjectBoard.tsx` (mobile) and
  `frontend-web/src/components/PlanProjectBoard.tsx` (web): each plumbs `useTeamPriorityCoverage` +
  the lookup and renders `<PrioritySlotBadge>` inside `card()` under the conditions above. These
  are two separate, non-shared implementations — same addition in each, in its own styling idiom.

No backend change, no new doctype, no new endpoint.

## Testing

Backend is unchanged and already covered by `TestTeamPriorityCoverage`. This is a frontend-only
presentation + reuse-of-existing-mutation change; verification is `tsc` clean on both frontends and
a manual check that the badge shows the right free count, toggles, and refreshes. No new automated
test (nothing new is testable at the unit level beyond what the endpoint tests already cover).

## Ship checklist

- No schema change, no new endpoint — `python3 scripts/gen_docs.py` will show no diff (run it to
  confirm), so no docs regen needed unless it changes.
- Rebuild both bundles; bump the SW `ASSET_CACHE` version so installed PWAs pick it up.
- What's New row (Bahasa, `Both`): on the By-project board a leader now sees each person's free
  priority slots per day and can flag a priority straight from the card.
