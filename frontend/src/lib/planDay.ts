import type { ProjectItem } from './types'

export type Alloc = { date: string; minutes: number; note?: string }

// Case-insensitive substring match on todo title + project name. Empty query → all.
export function filterCandidates(candidates: ProjectItem[], query: string): ProjectItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return candidates
  return candidates.filter(
    (t) => t.to_do.toLowerCase().includes(q) || (t.project_name || '').toLowerCase().includes(q),
  )
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
