import type { TeamPriorityCoverageMember } from '@/lib/types'

export interface DayOpenSlots {
  date: string
  open: { user: string; full_name: string; remaining: number }[]
  allFull: boolean
}

/**
 * Pivot member-major coverage (members × 7 days) to day-major: for each day, the
 * members who still have an OPEN priority slot (slots > 0 && used < slots), with how
 * many remain. The day axis and its order come from the first member's `days` — the
 * endpoint returns Mon→Sun for the requested week and every member's `days` array is
 * aligned (same dates, same order). Empty `members` → []. `allFull` is true when no
 * member has capacity that day (includes days where slots === 0).
 */
export function groupOpenSlotsByDay(members: TeamPriorityCoverageMember[]): DayOpenSlots[] {
  const axis = members[0]?.days ?? []
  return axis.map((col, i) => {
    const open = members
      .filter((m) => {
        const d = m.days[i]
        return !!d && d.slots > 0 && d.used < d.slots
      })
      .map((m) => {
        const d = m.days[i]
        return { user: m.user, full_name: m.full_name, remaining: d.slots - d.used }
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
    return { date: col.date, open, allFull: open.length === 0 }
  })
}
