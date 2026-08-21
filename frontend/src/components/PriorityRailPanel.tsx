import { useState } from 'react'
import clsx from 'clsx'
import { CalendarDays } from 'lucide-react'
import { PriorityRail } from '@/components/PriorityRail'
import { usePriorityOccupancy, useBoot } from '@/hooks/useData'
import { addDaysISO, todayISO } from '@/lib/format'
import type { ProjectItem } from '@/lib/types'

/**
 * Wraps PriorityRail with a Today / Tomorrow / Pick-date filter. The common case (today) reuses
 * data the caller already loaded from the dashboard — no extra request. Any other day queries
 * get_priority_occupancy for just the current user. Renders nothing at all when the feature is
 * off (todaySlots === 0) — slots is a global setting, not date-dependent, so today's value is
 * enough to decide whether to render anything on any day.
 */
export function PriorityRailPanel({
  todaySlots,
  todayItems,
  onOpen,
}: {
  todaySlots: number
  todayItems: ProjectItem[]
  onOpen: (name: string) => void
}) {
  const { data: boot } = useBoot()
  const today = todayISO()
  const tomorrow = addDaysISO(today, 1)
  const [selected, setSelected] = useState(today)
  const isToday = selected === today

  const me = boot?.user
  const occ = usePriorityOccupancy(me ? [me] : [], selected, !isToday && !!me)

  if (!todaySlots) return null

  const slots = isToday ? todaySlots : (me && occ.data?.[me]?.slots) || 0
  const items = isToday ? todayItems : (me && occ.data?.[me]?.items) || []

  const chip = (label: string, iso: string) => (
    <button
      onClick={() => setSelected(iso)}
      className={clsx(
        'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition active:scale-95',
        selected === iso
          ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
          : 'border-paper-edge bg-paper-card text-stone-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="mt-4">
      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chip('Today', today)}
        {chip('Tomorrow', tomorrow)}
        <label
          className={clsx(
            'relative flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition active:scale-95',
            !isToday && selected !== tomorrow
              ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
              : 'border-paper-edge bg-paper-card text-stone-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
          )}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          <span>Pilih</span>
          <input
            type="date"
            value={selected}
            onChange={(e) => e.target.value && setSelected(e.target.value)}
            aria-label="Pilih tanggal"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
      <PriorityRail slots={slots} items={items} onOpen={onOpen} />
    </div>
  )
}
