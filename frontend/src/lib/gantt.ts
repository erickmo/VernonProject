import type { StatusKey, ProjectItem } from './types'

export interface GanttBar {
  id: string
  label: string
  start: string // ISO date (yyyy-mm-dd)
  end: string // ISO date, inclusive
  statusKey: StatusKey
  overdue?: boolean
  sub?: string | null
}

export interface GanttGroup {
  title: string
  bars: GanttBar[]
}

/** Bar span for a todo: first allocation day → deadline (1-day fallback). */
export function todoSpan(t: Pick<ProjectItem, 'allocations' | 'deadline'>): { start: string; end: string } | null {
  const dates = (t.allocations ?? []).map((a) => a.date).filter(Boolean).sort()
  const dl = t.deadline
  if (!dates.length && !dl) return null
  const start = dates[0] ?? (dl as string)
  let end = dl ?? dates[dates.length - 1]
  if (end < start) end = start
  return { start, end }
}

/** Build a single gantt group from a project detail's todos. */
export function groupFromItems(title: string, items: ProjectItem[]): GanttGroup {
  const bars: GanttBar[] = []
  for (const t of items) {
    const span = todoSpan(t)
    if (!span) continue
    bars.push({
      id: t.name,
      label: t.to_do,
      start: span.start,
      end: span.end,
      statusKey: t.status_key,
      overdue: t.is_overdue,
      sub: t.assigned_to_name,
    })
  }
  bars.sort((a, b) => a.start.localeCompare(b.start))
  return { title, bars }
}
