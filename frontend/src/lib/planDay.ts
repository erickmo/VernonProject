import type { ProjectItem } from './types'
import { matchProjectItem } from './filters'

export type Alloc = { date: string; minutes: number; note?: string }

// Case-insensitive substring match across the shared searchable fields (see matchProjectItem).
export function filterCandidates(candidates: ProjectItem[], query: string): ProjectItem[] {
  return candidates.filter((t) => matchProjectItem(t, query))
}

// Todos with planned minutes (mins > 0) float to the top, most-minutes first;
// the rest keep their original order. Stable for ties and for unplanned items.
export function sortForPlanning(candidates: ProjectItem[], mins: Record<string, number>): ProjectItem[] {
  return candidates
    .map((t, i) => ({ t, i, m: mins[t.name] || 0 }))
    .sort((a, b) => {
      const ap = a.m > 0 ? 1 : 0
      const bp = b.m > 0 ? 1 : 0
      if (ap !== bp) return bp - ap // planned before unplanned
      if (ap && a.m !== b.m) return b.m - a.m // among planned: most minutes first
      return a.i - b.i // otherwise preserve input order (stable)
    })
    .map((x) => x.t)
}

// Minutes of t's allocation row for `date` (0 if none). Invariant:
// allocMinutes(t, todayISO()) === t.today_allocation (same today alloc row).
export function allocMinutes(t: ProjectItem, date: string): number {
  return t.allocations?.find((a) => a.date === date)?.minutes ?? 0
}

// Per-date day load: Σ allocation minutes across todos, paired with each date's target.
export function weekLoad(
  todos: ProjectItem[],
  dates: string[],
  targets: Record<string, number>,
): { date: string; minutes: number; target: number }[] {
  return dates.map((date) => ({
    date,
    minutes: todos.reduce((s, t) => s + allocMinutes(t, date), 0),
    target: targets[date] ?? 0,
  }))
}

// Candidates whose minutes for `date` differ from what's already saved.
export function touchedDiff(
  candidates: ProjectItem[],
  mins: Record<string, number>,
  date: string,
): ProjectItem[] {
  return candidates.filter((t) => (mins[t.name] || 0) !== allocMinutes(t, date))
}

// Replace ONLY today's allocation row; preserve every other-day row. 0 min → drop today's row.
export function buildNext(allocations: Alloc[], today: string, minutes: number): Alloc[] {
  return [
    ...allocations.filter((a) => a.date !== today),
    ...(minutes > 0 ? [{ date: today, minutes }] : []),
  ]
}

// ponytail: pure partition; runnable test deferred — no test infra in this repo
// (project convention: defer tests to final phase). Add a vitest case when infra
// lands. Behaviour: focused todos float to the very top, preserving input order
// within the focused and non-focused groups.
export function focusedFirst(list: ProjectItem[], focused: Set<string>): ProjectItem[] {
  if (!focused.size) return list
  const yes: ProjectItem[] = []
  const no: ProjectItem[] = []
  for (const t of list) (focused.has(t.name) ? yes : no).push(t)
  return [...yes, ...no]
}

// Auto-fill today's plan toward the daily minimum. Base = every today-deadline
// task; if the running total (already-planned-today + base) is under `minMinutes`,
// pull OVERDUE tasks (oldest deadline first) then FUTURE tasks (farthest deadline
// first) until the minimum is met or candidates run out. Whole tasks only — the
// last add may overshoot; no partial splitting. Waiting tasks are never auto-filled;
// null-deadline tasks are excluded from the future pool (the rule is deadline-driven).
// Tasks already allocated today are counted toward the total but never rewritten
// (idempotent with useAutoPlanToday). minMinutes <= 0 => base only.
// Bucketing is trusted from the server (due_today/overdue/upcoming); deadline
// strings are used only to sort the overdue/future pools.
export function autoFillPlan(
  buckets: { due_today: ProjectItem[]; overdue: ProjectItem[]; upcoming: ProjectItem[] },
  minMinutes: number,
): { todo: ProjectItem; minutes: number }[] {
  const est = (t: ProjectItem) => (t.estimated > 0 ? t.estimated : 30)
  const active = (arr: ProjectItem[]) => arr.filter((t) => !t.is_waiting)
  const plannedToday = (t: ProjectItem) => (t.today_allocation || 0) > 0
  const byDeadlineAsc = (a: ProjectItem, b: ProjectItem) =>
    (a.deadline || '￿').localeCompare(b.deadline || '￿')

  const dueToday = active(buckets.due_today)
  const overdue = active(buckets.overdue).slice().sort(byDeadlineAsc) // oldest first
  const upcoming = active(buckets.upcoming)
  const future = upcoming.filter((t) => t.deadline).slice().sort(byDeadlineAsc).reverse() // farthest first

  // base: today-deadline tasks not yet planned today (always written)
  const base = dueToday.filter((t) => !plannedToday(t))
  const result: { todo: ProjectItem; minutes: number }[] = base.map((t) => ({ todo: t, minutes: est(t) }))

  const min = Math.max(0, minMinutes || 0)
  let total =
    [...dueToday, ...overdue, ...upcoming]
      .filter(plannedToday)
      .reduce((s, t) => s + (t.today_allocation || 0), 0) +
    result.reduce((s, r) => s + r.minutes, 0)

  for (const t of [...overdue, ...future]) {
    if (total >= min) break
    if (plannedToday(t)) continue
    result.push({ todo: t, minutes: est(t) })
    total += est(t)
  }
  return result
}

// The minutes a row may not go below in plan-my-day. A todo whose deadline is
// today is pinned to today's plan by the server (ProjectTodo._ensure_today_allocation)
// and cannot be removed, so the UI must not offer a zero it will hand straight back.
// The floor is the whole estimate, not 1m: splitting a today-deadline task across
// days would put the remainder past its own deadline. `today` is passed in to keep
// this pure. 0 = free (no floor).
export function planFloor(t: ProjectItem, today: string): number {
  if (t.is_waiting || !t.deadline || t.deadline !== today) return 0
  return t.estimated > 0 ? t.estimated : 30
}

// --- Project board (the "By project" plan mode) ---------------------------

// The single date a todo shows under on the project board: the earliest of its
// allocation dates. A board move collapses a todo to one date, but date-mode can
// leave several — earliest wins. null = unscheduled (no allocation at all).
export function boardDate(t: ProjectItem): string | null {
  const ds = (t.allocations ?? []).map((a) => a.date).filter(Boolean).sort()
  return ds[0] ?? null
}

// Sum of a todo's planned minutes across all its allocation rows. Used to carry
// the existing plan size when moving a todo to a new single date.
export function allocTotal(t: ProjectItem): number {
  return (t.allocations ?? []).reduce((s, a) => s + (a.minutes || 0), 0)
}

// Bucket a project's todos into the week board's columns. A todo whose boardDate
// falls inside `weekDates` lands in that day's column; everything else — no plan,
// or planned in another week — lands in `unscheduled` (the card can show its
// out-of-week boardDate as a hint). byDate has an entry for every weekDate.
export function planColumns(
  todos: ProjectItem[],
  weekDates: string[],
): { unscheduled: ProjectItem[]; byDate: Record<string, ProjectItem[]> } {
  const inWeek = new Set(weekDates)
  const byDate: Record<string, ProjectItem[]> = {}
  for (const d of weekDates) byDate[d] = []
  const unscheduled: ProjectItem[] = []
  for (const t of todos) {
    const bd = boardDate(t)
    if (bd && inWeek.has(bd)) byDate[bd].push(t)
    else unscheduled.push(t)
  }
  return { unscheduled, byDate }
}
