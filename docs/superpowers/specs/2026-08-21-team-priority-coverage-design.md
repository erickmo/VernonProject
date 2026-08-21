# Team Priority Coverage — Design

**Date:** 2026-08-21
**Status:** Approved, ready for implementation plan

## Context

Two prior specs already shipped on this feature:
`2026-08-20-daily-priority-slots-design.md` (the core feature — daily slots, controller cap,
nightly miss-penalty, vibrant rail) and `2026-08-21-priority-slots-followups-design.md` (rail
reposition, a today/tomorrow/pick-date filter, and a leader ⚡ toggle + per-todo occupancy badge
in `PlanDeadlineDay`, the Plan screen's single-day team view).

Leaders report that `PlanDeadlineDay` alone doesn't answer their actual question: it shows todos
due on ONE picked day, so a team member with no todo due that day is invisible — a leader has no
way to see "is my team's priority slot filled this week" at a glance, across days, per person.
This spec adds that view.

## The ask

> As a project leader / project owner I want an easy UI to check if my team's priority in a
> certain period is already filled, otherwise, I can set priority in the project. Put it in the
> "/plan" screen, listed per user for the project.

## Decisions taken (and rejected alternatives)

| Decision | Chosen | Rejected |
|---|---|---|
| Row shape | Name + fill count + 7-dot week strip | Count only (no visual); a full person×day spreadsheet grid |
| Period | Calendar week (Mon–Sun), prev/next-week nav | Rolling "next 7 days"; free-form date-range picker |
| What a dot means | BOTH signals: color = person's true site-wide fill level; small mark = whether *this* project contributed that day | Only site-wide; only this-project |
| Tapping an actionable dot | Jump to Plan → By date, pre-set to that date (lands on the already-shipped `PlanDeadlineDay` ⚡ toggle) | A new inline mini-picker in this same list |

## Placement

A 4th mode in the existing Plan screen's mode switcher — **"Tim"** (Team) — alongside the current
By date / By project / Peta, visible only when scope = **My project** (the same gate
`PlanDeadlineDay` already uses: this view only makes sense for a leader/owner). If the caller
leads/owns more than one project, a `SearchableSelect` project picker appears above the list
(mirrors `PlanScreen`'s existing project-filter pattern); with exactly one project, it's shown
directly with no picker.

## Data

One new whitelisted endpoint, `get_team_priority_coverage(project, week_start)`.

**Permission:** caller must be System Manager, or the project's owner/leader, or a
`Project Admin User` on it — the same gate `get_project_admins`-derived checks already use
elsewhere (e.g. `update_todo`'s `is_priority` gate).

**Team roster:** every row in `Project.team_members` for the given project (plus the
owner/leader themselves if either is also a team member row — no synthetic membership added).

**Per-day occupancy:** for every team member, for every day Mon–Sun of the given week, compute
`{used, slots, contributed}`:
- `used`/`slots` — that person's TRUE site-wide priority occupancy that day (any project,
  anywhere) — reuses the exact targeted, indexed SQL pattern the follow-ups plan's final fix wave
  already built for `get_priority_occupancy` (filtered directly by `assigned_to`/`deadline`, no
  `_visible_projects()` scan), extended from one date to a `deadline BETWEEN week_start AND
  week_end` range and from one user to the whole team in a single query.
- `contributed` — whether any of that day's priority rows for that person belong to THIS project
  (checked via the same `project_detail → project` join the underlying query already needs).

One query for the whole team, whole week — not one call per user per day.

**Response shape:**

```json
{
  "members": [
    {"user": "budi@x.com", "full_name": "Budi Santoso",
     "days": [
       {"date": "2026-08-24", "used": 2, "slots": 3, "contributed": true},
       {"date": "2026-08-25", "used": 3, "slots": 3, "contributed": false},
       ...7 entries, Mon..Sun...
     ]}
  ]
}
```

`slots` is echoed per-day (it's a global setting, not date-dependent, but keeping it alongside
`used` means the frontend never needs a second source of truth for the cap value).

## UI — `TeamPriorityCoverage.tsx` (new, shared component, both frontends via `@`)

One row per team member:

```
Budi Santoso              4/7 hari terisi
●⬆️  ●   ○   ●⬆️  ●⬆️  ○   ○
Sen  Sel  Rab  Kam  Jum  Sab  Min

Siti Rahayu               7/7 hari terisi  ✓
●⬆️  ●⬆️  ●   ●   ●⬆️  ●   ●⬆️
```

- Dot color: gray = `used === 0`, amber = `0 < used < slots`, green = `used >= slots`.
- ⬆️ overlay: present when `contributed` is true for that day, regardless of color.
- Header count ("4/7 hari terisi") = number of days that week where `used >= slots` (globally
  full), out of 7. A row where every day is globally full gets a small ✓.
- Week nav: the same prev/next-week chip pair pattern already in `PlanScreen`
  (`weekStartISO`/`addDaysISO`), operating on `week_start` for this view specifically (independent
  of whatever date `PlanDeadlineDay`'s own `selected` is currently on).

## Interaction

Tapping a dot that is NOT green (room left — either this project or another could still add a
priority that day) navigates to Plan → **By date**, pre-set to that date. Tapping a green
(fully-full) dot does nothing — there's no action left to take on an already-full day.

This needs one small, additive change to `PlanScreen.tsx` (mobile) and `Plan.tsx` (web): both
currently hold `scope`/`mode`/`selected` as pure local `useState` with no way to arrive pre-set.
Add an optional read of `location.state` (React Router's `navigate(path, {state})` mechanism,
already available via `useLocation` elsewhere in both apps' `App.tsx`) to initialize those three
pieces of state when present, falling back to today's existing defaults (today's date, `mode:
'project'`, `scope: 'work'`) when absent. `TeamPriorityCoverage` navigates via
`navigate('/plan', {state: {scope: 'project', mode: 'date', selected: thatDate}})`.

## Testing

`vernon_project/api/test_priority_slots.py` gains a test class for `get_team_priority_coverage`:
permission gate (owner/leader/admin allowed, unrelated user rejected), correct per-day
used/slots/contributed values across a constructed week including at least one day with a
cross-project contribution (to prove `contributed` is scoped correctly), and the single-query
performance property (reuses the same targeted-query pattern already proven fast in
`get_priority_occupancy`'s fix).

## Ship checklist

- No schema change — reuses `Project Todo`/`Project Team`/`Vernon Settings` fields already shipped.
- Rebuild both bundles.
- What's New row (Bahasa, `Both`): leaders can now see their whole team's priority coverage for
  the week from Plan → My project → Tim, and jump straight to filling a gap.
