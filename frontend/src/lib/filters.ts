import type { ProjectItem } from './types'

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
      (!f.waiting || (f.waiting === 'only' ? t.is_waiting : !t.is_waiting)) &&
      matchEstimate(f.estimate || '', t.estimated),
  )
}
