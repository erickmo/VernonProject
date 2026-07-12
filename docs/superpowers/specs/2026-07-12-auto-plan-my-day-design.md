# Auto-plan my day — design

## Goal

One-click "Auto-plan" button in the home "my plan" area (both frontends) that
fills today's plan to the daily-minimum minutes.

Rule (user): base = every **today-deadline** task. If today's planned total is
below `Vernon Settings.min_daily_estimated_minutes`, pull **overdue first**
(oldest deadline first), then **future** (nearest deadline first), allocating
each task's estimated minutes to **today**, until the minimum is met or
candidates run out.

## Context (existing, reused)

- `useAutoPlanToday` (in `frontend/src/hooks/usePlanDay.ts`) already silently
  writes est-minutes to today's allocation for every due-today + overdue task on
  load/refetch. The new button's *added* value is topping up to the minimum from
  future work.
- Allocation write path already exists: `mobileApi.setTodoAllocations(name, allocs)`
  + `buildNext(allocations, today, minutes)` (touches only today's row).
- Daily minimum is already reachable in the frontend via
  `usePreviousShiftShortfall().data.minimum` (self-serve endpoint
  `my_previous_shift_shortfall`, not SM-gated, returns `minimum` = the setting).
  **No new backend endpoint.**
- Dashboard pre-buckets my Planned todos into `overdue` / `due_today` / `upcoming`
  (server-side, by deadline). `upcoming` has no future-date cap and sorts
  null-deadline last → complete future pool.

## Core (pure) — add to `frontend/src/lib/planDay.ts`

```
autoFillPlan(
  buckets: { due_today: ProjectItem[]; overdue: ProjectItem[]; upcoming: ProjectItem[] },
  minMinutes: number,
): { todo: ProjectItem; minutes: number }[]
```

- `est(t) = t.estimated > 0 ? t.estimated : 30` (matches `useEstimate` / auto-plan).
- Skip `is_waiting` everywhere. Skip null-deadline in the future pool (rule is
  deadline-driven).
- **Base** = `due_today` tasks not already planned today → always written.
- **Running total** = (sum of `today_allocation` over all non-waiting candidates
  already planned today) + base minutes. Already-planned-today tasks are counted,
  never rewritten (idempotent with `useAutoPlanToday`).
- If total `< minMinutes`: iterate **overdue** (oldest deadline first) then
  **future** (nearest deadline first), skip already-planned, add est-minutes,
  stop when total ≥ min or pool exhausted.
- Whole tasks only — last add may overshoot; no partial splitting.
- `minMinutes ≤ 0` → base only (respects "0 = never flag").
- Bucketing comes from the server, so no `deadline == today` date-equality in the
  fn; deadline strings are used only to **sort** the overdue/future pools.
- Ships one assert-based case set in `planDay.selfcheck.ts` (repo convention;
  vitest deferred).

## Action — `useAutoFillPlan()` in `usePlanDay.ts`

Reads minimum from `usePreviousShiftShortfall()`. `run(buckets)`:
computes `autoFillPlan`, writes each pick via `setTodoAllocations`+`buildNext`,
invalidates `keys.dashboard` + each `keys.projectItem`, toasts
`Auto-planned N tasks · Xh added` (or an "already at target" note when empty).
Exposes `{ run, saving }`.

## Buttons

- Web `Home.tsx`: secondary button beside "Plan my day" in `PageHeader` actions,
  `Wand2` icon, label "Auto-plan", calls `run({ due_today, overdue, upcoming })`
  from `dash.data`. (flat-Notion tokens)
- Mobile `Today.tsx`: compact secondary affordance beside the "Plan my day" CTA,
  same call from `data`. (Soft-Pop tokens, lucide icon)

## Skipped (YAGNI — add when asked)

- Preview/confirm dialog — the action only *adds* today-allocations, fully
  reversible in the "Plan my day" drawer/sheet.
- Partial-minute splitting of the last task.
- New backend endpoint — the minimum + buckets already exist client-side.
