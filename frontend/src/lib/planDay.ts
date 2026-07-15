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

// Candidates whose today-minutes differ from what's already saved.
export function touchedDiff(candidates: ProjectItem[], mins: Record<string, number>): ProjectItem[] {
  return candidates.filter((t) => (mins[t.name] || 0) !== (t.today_allocation || 0))
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
