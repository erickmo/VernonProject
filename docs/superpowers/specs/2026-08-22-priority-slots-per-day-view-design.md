# Priority Slots — "Per hari" (day-major) view in Tim — Design

**Date:** 2026-08-22
**Status:** Approved, ready for implementation plan

## Context

The Plan screen's **Tim** tab (leader/owner only, `scope === 'project'`) already shows a
per-member week grid of priority-slot fill: `frontend/src/components/TeamPriorityCoverage.tsx`
renders one row per Project Team member with a 7-dot strip (dot colour = that day's TRUE
site-wide fill: green full / amber partial / grey empty; an ArrowUp marks days THIS project
contributed). It is a **shared** component — `frontend-web/src/pages/Plan.tsx` imports the same
file via `@`, so both frontends render it. Its data comes from
`vernon_project.api.mobile.get_team_priority_coverage(project, week_start)` (hook
`useTeamPriorityCoverage`), which returns `{ members: [{ user, full_name, days: [{ date, used,
slots, contributed }] }] }` — members × 7 days, `used`/`slots` per day.

## The ask

> For each day, show the list of users that still have an open priority slot.

The current Tim view is **member-major** (one row per person). The ask is the **day-major**
pivot: for each day of the week, list the members who still have capacity (an unfilled priority
slot), so a leader can see at a glance who to hand a priority to on a given day.

## Decisions taken

| Decision | Chosen | Rejected |
|---|---|---|
| User scope | **Project team members** — reuse `get_team_priority_coverage`, no backend change | all users site-wide (needs new endpoint + permission model) |
| Placement | **A `Per anggota / Per hari` toggle inside the Tim view** | a separate new tab (duplicates week nav + picker, more menu surface) |
| Data | **Pure frontend pivot of the already-fetched week data** | a new day-major endpoint |
| "Still has a slot" | **`slots > 0 && used < slots`**, remaining = `slots − used` | any looser/derived definition |

## Components

### 1. Shared pivot helper

New pure function in a shared lib file (`frontend/src/lib/priorityCoverage.ts`; imported by the
shared component, so it reaches both frontends). Signature:

```ts
export type CoverageMember = {
  user: string
  full_name: string
  days: { date: string; used: number; slots: number; contributed: boolean }[]
}
export type DayOpenSlots = {
  date: string
  open: { user: string; full_name: string; remaining: number }[]
  allFull: boolean   // true when NO member has capacity that day (incl. slots === 0)
}
export function groupOpenSlotsByDay(members: CoverageMember[]): DayOpenSlots[]
```

Behaviour: iterate the 7 day-columns in the order they appear in `members[0].days` (the endpoint
already returns Mon→Sun for the requested week). For each date, collect members whose day cell has
`slots > 0 && used < slots`, as `{ user, full_name, remaining: slots - used }`, sorted by
`full_name`. `allFull = open.length === 0`. Returns one entry per day (7 for a full week), even
empty ones, preserving day order. Derives the date axis from the first member's `days`; returns
`[]` when `members` is empty (the component already renders its own "no members" empty state).

### 2. Toggle + day-major render in `TeamPriorityCoverage.tsx` (shared)

Add local `const [view, setView] = useState<'member' | 'day'>('member')`. A small two-segment
pill (`Per anggota` | `Per hari`) sits above the week-nav — always visible, both views share the
same project picker, week nav, `weekStart` state, `useTeamPriorityCoverage` fetch, loading and
empty states. Only the body below the week nav switches on `view`.

**`view === 'day'` body:** `groupOpenSlotsByDay(data.members)` → for each day render a card:
- Header: the human date (reuse `formatDate(d.date)`) + a day-of-week label; the whole header is
  a button that calls the existing `onOpenDate(d.date)` (jumps to the single-day view to set a
  priority). Keep it a button only when `!d.allFull` (parity with the current dot: full days are
  not actionable) — a full day renders a non-interactive header.
- Body: if `allFull`, a muted `Semua terisi ✓` line. Else one line per `open` member:
  `{full_name} — {remaining} slot kosong`.

Styling stays in the component's existing mobile Soft-Pop token set (`paper-*`, `stone`/`slate`,
`emerald`/`amber`) — the same tokens the member view uses; no new colours. Both frontends inherit
it because the component is shared (accepted precedent — the member view already ships this way).

`onOpenDate` from web `Plan.tsx` already sets `scope='project'; mode='date'; selected=date`;
mobile's caller in `PlanScreen.tsx` similarly jumps to the day view. Unchanged.

## Data / backend

None. No endpoint, schema, doctype, hook, or permission change. Reuses
`get_team_priority_coverage`, `useTeamPriorityCoverage`, and the existing `onOpenDate` contract.

## Testing

The project's frontends have **no unit-test runner** (no vitest/jest); adding one for a single
pure helper is out of scope. Verification:
- `tsc --noEmit` clean on both frontends (`frontend` baseline 3, `frontend-web` baseline 5).
- The day-major helper is the inverse of the member view's existing per-cell logic (`used >=
  slots` = full, `used === 0` = empty), over the same `used`/`slots` fields already rendered —
  low risk.
- Manual: on the Tim tab (My project scope, as a leader), toggle `Per hari`; each day lists the
  members with `remaining` open slots and collapses full days to `Semua terisi ✓`; tapping a
  non-full day header jumps to that day's single-day view.

## Ship checklist

- Frontend only — `gen_docs.py` expected to change only the docs devlog index (this spec/plan);
  commit the regenerated `data.js` (exclude untracked WIP specs so the deterministic staleness
  check stays clean).
- Rebuild both bundles; bump SW `ASSET_CACHE` (`vernon-assets-v24` → next); purge CF; clear
  website cache.
- What's New row (Bahasa, `Both`): di tab Tim (layar Plan), pimpinan bisa lihat "Per hari" —
  daftar anggota yang masih punya slot prioritas kosong tiap hari, untuk cepat menugaskan.
