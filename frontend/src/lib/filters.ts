import type { ProjectItem, ProjectCard } from './types'

/** Case-insensitive substring test. Empty/whitespace query matches everything. */
export function matchText(haystack: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return haystack.toLowerCase().includes(q)
}

/**
 * Case-insensitive substring match across a todo's searchable fields.
 * Empty/whitespace query matches everything. Shared by mobile Today, plan-day,
 * global search overlay, and (via a locally-built haystack) the web command palette.
 */
export function matchProjectItem(t: ProjectItem, query: string): boolean {
  return matchText(
    [
      t.to_do,
      t.project_name,
      t.project,
      t.brand,
      t.project_detail_title,
      t.project_owner_name,
      t.project_leader_name,
      t.assigned_to_name,
      t.status,
    ]
      .filter(Boolean)
      .join(' '),
    query,
  )
}

/** Case-insensitive match across a project's searchable fields. */
export function matchProject(p: ProjectCard, query: string): boolean {
  return matchText([p.project_name, p.name, p.brand, p.owner_name, p.leader_name, p.status].filter(Boolean).join(' '), query)
}

/** A distinct project-detail (work item), derived from the todo set. */
export interface ProjectDetailHit {
  name: string
  title: string
  project: string
  project_name: string
  brand: string | null
  open: boolean // has at least one open (not completed/cancelled) todo
}

/** A todo is "open" (ongoing) while it is neither owner-approved nor cancelled. */
export function todoIsOpen(t: ProjectItem): boolean {
  return t.status_key !== 'completed' && t.status_key !== 'cancelled'
}

/**
 * Distinct project-details (work items) present in a todo set, deduped by id.
 * Lets global search surface work items without a dedicated endpoint — every
 * todo already carries its parent detail's id/title/project. `open` aggregates
 * across the detail's todos (open if any child todo is still open).
 */
export function projectDetailsFromTodos(todos: ProjectItem[]): ProjectDetailHit[] {
  const seen = new Map<string, ProjectDetailHit>()
  for (const t of todos) {
    if (!t.project_detail) continue
    const existing = seen.get(t.project_detail)
    if (existing) {
      existing.open = existing.open || todoIsOpen(t)
    } else {
      seen.set(t.project_detail, {
        name: t.project_detail,
        title: t.project_detail_title,
        project: t.project,
        project_name: t.project_name,
        brand: t.brand,
        open: todoIsOpen(t),
      })
    }
  }
  return [...seen.values()]
}

/** Case-insensitive match across a work item's searchable fields. */
export function matchProjectDetail(d: ProjectDetailHit, query: string): boolean {
  return matchText([d.title, d.project_name, d.brand].filter(Boolean).join(' '), query)
}

/** Ongoing/done status filter shared by the global search surfaces. */
export type SearchScope = 'all' | 'ongoing' | 'done'

export function todoInScope(t: ProjectItem, scope: SearchScope): boolean {
  if (scope === 'all') return true
  return scope === 'ongoing' ? todoIsOpen(t) : t.status_key === 'completed'
}

/** Projects use a text status: 'Ongoing' active, 'Closed' done. */
export function projectInScope(p: ProjectCard, scope: SearchScope): boolean {
  if (scope === 'all') return true
  return scope === 'ongoing' ? p.status === 'Ongoing' : p.status === 'Closed'
}

export function detailInScope(d: ProjectDetailHit, scope: SearchScope): boolean {
  if (scope === 'all') return true
  return scope === 'ongoing' ? d.open : !d.open
}

export const ESTIMATE_OPTIONS = [
  { value: 'none', label: 'No estimate' },
  { value: 'lt30', label: 'Under 30m' },
  { value: '30to120', label: '30m – 2h' },
  { value: 'gt120', label: 'Over 2h' },
]

export function matchEstimate(bucket: string, minutes: number): boolean {
  if (!bucket) return true
  switch (bucket) {
    case 'none':
      return !minutes
    case 'lt30':
      return minutes > 0 && minutes < 30
    case '30to120':
      return minutes >= 30 && minutes <= 120
    case 'gt120':
      return minutes > 120
    default:
      return true
  }
}

/** Build unique {value,label,count} options from a list, via accessors. */
export function buildOptions<T>(
  items: T[],
  getValue: (i: T) => string | null | undefined,
  getLabel: (i: T) => string | null | undefined,
): { value: string; label: string; count: number }[] {
  const map = new Map<string, { label: string; count: number }>()
  for (const it of items) {
    const v = getValue(it)
    if (!v) continue
    const label = getLabel(it) || v
    const cur = map.get(v)
    if (cur) cur.count++
    else map.set(v, { label, count: 1 })
  }
  return [...map.entries()]
    .map(([value, { label, count }]) => ({ value, label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

/** Apply the standard project/brand/owner/leader/estimate filters to todos. */
export function applyProjectItemFilters(list: ProjectItem[], f: Record<string, string>): ProjectItem[] {
  return list.filter(
    (t) =>
      (!f.status || t.status_key === f.status) &&
      (!f.project || t.project === f.project) &&
      (!f.brand || t.brand === f.brand) &&
      (!f.owner || t.project_owner === f.owner) &&
      (!f.leader || t.project_leader === f.leader) &&
      matchEstimate(f.estimate || '', t.estimated),
  )
}
