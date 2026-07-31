import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, CalendarDays, CalendarRange, Plus, X } from 'lucide-react'
import { SearchableSelect } from '@/components/SearchableSelect'
import { EmptyState, Spinner } from '@/components/ui'
import { useMoveTodoDeadline } from '@/hooks/useData'
import { deadlineTone, type DeadlineTone } from '@/lib/planDay'
import { addDaysISO, formatDate, formatEstimate } from '@/lib/format'
import type { ProjectItem } from '@/lib/types'

// Deadline-urgency → left accent colour on a row.
const TONE_BORDER: Record<DeadlineTone, string> = {
  overdue: 'border-l-rose-500',
  today: 'border-l-orange-500',
  soon: 'border-l-amber-400',
  future: 'border-l-emerald-500',
  none: 'border-l-transparent',
}

// "Plan my project" day view: pick a date, see the project todos DUE that day, and
// set/clear each todo's deadline (a leader/owner arranging the team by due date —
// the single-day sibling of the deadline week board). Writes `deadline` via
// useMoveTodoDeadline; the calendar refetch re-filters, so no optimistic state.
export function PlanDeadlineDay({
  candidates,
  selected,
  onSelect,
  today,
}: {
  candidates: ProjectItem[]
  selected: string
  onSelect: (iso: string) => void
  today: string
}) {
  const navigate = useNavigate()
  const move = useMoveTodoDeadline()
  const [movingIds, setMovingIds] = useState<Set<string>>(() => new Set())
  const setDeadline = (todo: ProjectItem, date: string | null) => {
    if (movingIds.has(todo.name)) return
    setMovingIds((s) => new Set(s).add(todo.name))
    move
      .mutateAsync({ todo, date })
      .catch(() => {}) // hook already toasts on error
      .finally(() =>
        setMovingIds((s) => {
          const n = new Set(s)
          n.delete(todo.name)
          return n
        }),
      )
  }

  const due = useMemo(() => candidates.filter((t) => t.deadline === selected), [candidates, selected])
  // Everything not already due on this date can be pulled onto it (incl. no-deadline).
  const addPool = useMemo(() => candidates.filter((t) => t.deadline !== selected), [candidates, selected])

  const chip = (label: string, iso: string) => (
    <button
      onClick={() => onSelect(iso)}
      className={clsx(
        'rounded-full border px-3.5 py-2 text-sm font-semibold transition active:scale-95',
        selected === iso
          ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
          : 'border-paper-edge bg-paper-card text-stone-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
      )}
    >
      {label}
    </button>
  )

  return (
    <div>
      {/* Date navigator */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onSelect(addDaysISO(selected, -1))}
          aria-label="Previous day"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-paper-line text-stone-600 transition active:scale-90 dark:bg-slate-700 dark:text-slate-300"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="flex-1 text-center font-display text-lg font-semibold text-stone-800 dark:text-slate-50">
          {formatDate(selected)}
        </p>
        <button
          onClick={() => onSelect(addDaysISO(selected, 1))}
          aria-label="Next day"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-paper-line text-stone-600 transition active:scale-90 dark:bg-slate-700 dark:text-slate-300"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {chip('Today', today)}
        {chip('Tomorrow', addDaysISO(today, 1))}
        <label className="relative ml-auto flex items-center gap-1.5 rounded-full border border-paper-edge bg-paper-card px-3.5 py-2 text-sm font-semibold text-stone-500 transition active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
          <CalendarDays className="h-4 w-4" />
          <span>Pick</span>
          <input
            type="date"
            value={selected}
            onChange={(e) => e.target.value && onSelect(e.target.value)}
            aria-label="Pick a date"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>

      {/* Set a todo's deadline to this date */}
      <div className="mt-5">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">
          <Plus className="h-3.5 w-3.5" /> Set due on this date
        </div>
        <SearchableSelect
          value=""
          onChange={(v) => {
            const t = candidates.find((c) => c.name === v)
            if (t) setDeadline(t, selected)
          }}
          options={addPool.map((t) => ({ value: t.name, label: t.to_do, keywords: t.project_name }))}
          placeholder={addPool.length ? 'Pick a todo to set due here…' : 'Everything is already due here'}
          disabled={!addPool.length}
        />
      </div>

      {/* Todos due on the selected date */}
      <div className="mt-5">
        {due.length === 0 ? (
          <EmptyState icon={CalendarRange} title="Nothing due" subtitle="Set a todo above to make it due on this day." />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {due.map((t) => {
              const moving = movingIds.has(t.name)
              const tone = deadlineTone(t, today)
              return (
                <li
                  key={t.name}
                  className={clsx(
                    'relative flex items-center gap-2 rounded-2xl border border-l-4 bg-paper-card px-3 py-2.5 dark:bg-slate-800',
                    'border-paper-edge dark:border-slate-700',
                    TONE_BORDER[tone],
                  )}
                >
                  <button
                    onClick={() => navigate(`/project-item/${encodeURIComponent(t.name)}`)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-stone-800 dark:text-slate-100">
                      {t.to_do}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] font-medium text-stone-400 dark:text-slate-500">
                      {t.project_name} · {t.project_detail_title} · {formatEstimate(t.estimated)}
                    </p>
                  </button>
                  <button
                    onClick={() => setDeadline(t, null)}
                    disabled={moving}
                    aria-label="Clear deadline"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper-line text-stone-500 transition active:scale-90 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-400"
                  >
                    {moving ? <Spinner className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
