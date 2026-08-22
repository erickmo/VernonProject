import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, CalendarRange, X, Zap } from 'lucide-react'
import { DatePicker } from '@web/components/DatePicker'
import { SearchableSelect } from '@/components/SearchableSelect'
import { EmptyState, Spinner } from '@/components/ui'
import { AssigneeTag, PlanLegend, PriorityBadge } from '@/components/PlanMeta'
import { useBoot, useMoveTodoDeadline, usePriorityOccupancy, useSetTodoPriority } from '@/hooks/useData'
import { useTodoMenuTrigger } from '@/hooks/useTodoMenuTrigger'
import { deadlineTone, type DeadlineTone } from '@/lib/planDay'
import { addDaysISO, formatDate, formatEstimate, todayISO } from '@/lib/format'
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
}: {
  candidates: ProjectItem[]
  selected: string
  onSelect: (iso: string) => void
}) {
  const today = todayISO()
  const navigate = useNavigate()
  const { data: boot } = useBoot()
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

  const setPriority = useSetTodoPriority()
  const { makeTriggerProps, consumeLongPress } = useTodoMenuTrigger()
  const assignees = useMemo(
    () => [...new Set(due.map((t) => t.assigned_to).filter(Boolean))],
    [due],
  )
  const occ = usePriorityOccupancy(assignees, selected, assignees.length > 0)

  const onTogglePriority = (todo: ProjectItem) => {
    setPriority.mutate({ todoName: todo.name, isPriority: !todo.is_priority })
  }

  return (
    <div className="space-y-4">
      <PlanLegend />
      {/* Date controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-3 shadow-card">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSelect(addDaysISO(selected, -1))}
            aria-label="Previous day"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-paper-line text-muted transition hover:text-ink active:scale-90 dark:bg-slate-700"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-[9rem] text-center text-base font-semibold text-ink">{formatDate(selected)}</div>
          <button
            onClick={() => onSelect(addDaysISO(selected, 1))}
            aria-label="Next day"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-paper-line text-muted transition hover:text-ink active:scale-90 dark:bg-slate-700"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {(['Today', 'Tomorrow'] as const).map((label, i) => {
            const iso = addDaysISO(today, i)
            const active = selected === iso
            return (
              <button
                key={label}
                onClick={() => onSelect(iso)}
                className={clsx(
                  'rounded-full px-3.5 py-2 text-sm font-semibold shadow-card transition active:scale-95',
                  active ? 'bg-brand-600 text-white' : 'bg-surface text-muted hover:text-ink',
                )}
              >
                {label}
              </button>
            )
          })}
          <DatePicker
            value={selected}
            onChange={(v) => v && onSelect(v)}
            aria-label="Pick a date"
            className="rounded-full bg-paper-line/60 px-3.5 py-2 text-sm font-semibold text-muted transition active:scale-95 dark:bg-slate-800"
          />
        </div>
      </div>

      {/* Set a todo's deadline to this date */}
      <div className="rounded-2xl bg-surface p-4 shadow-card">
        <SearchableSelect
          value=""
          onChange={(id) => {
            const t = candidates.find((x) => x.name === id)
            if (t) setDeadline(t, selected)
          }}
          options={addPool.map((t) => ({
            value: t.name,
            label: t.to_do,
            keywords: `${t.project_name} ${t.brand ?? ''}`,
          }))}
          placeholder={addPool.length ? '+ Set a todo due on this date' : 'Everything is already due here'}
        />
      </div>

      {/* Todos due on the selected date */}
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
                {...makeTriggerProps(t)}
                className={clsx(
                  'flex items-center gap-2 rounded-2xl border-l-4 bg-surface p-3 shadow-card ring-1 ring-black/[0.05] dark:ring-white/[0.06]',
                  TONE_BORDER[tone],
                )}
              >
                <button
                  onClick={() => {
                    if (consumeLongPress()) return
                    navigate(`/project-item/${encodeURIComponent(t.name)}`)
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="line-clamp-2 text-sm font-medium leading-snug text-ink">{t.to_do}</div>
                  <div className="mt-0.5 truncate text-[11px] text-muted">
                    {t.project_name} · {t.project_detail_title} · {formatEstimate(t.estimated)}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <AssigneeTag name={t.assigned_to_name} />
                    {t.assigned_to && (
                      <PriorityBadge
                        used={occ.data?.[t.assigned_to]?.items.length ?? 0}
                        slots={occ.data?.[t.assigned_to]?.slots ?? 0}
                      />
                    )}
                  </div>
                </button>
                {t.can_prioritize && (boot?.settings?.daily_priority_slots ?? 0) > 0 && (
                  <button
                    onClick={() => onTogglePriority(t)}
                    disabled={setPriority.isPending}
                    aria-label={t.is_priority ? 'Lepas prioritas' : 'Jadikan prioritas'}
                    className={clsx(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition active:scale-90 disabled:opacity-50',
                      t.is_priority
                        ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400'
                        : 'bg-paper-line text-muted dark:bg-slate-700',
                    )}
                  >
                    <Zap className="h-4 w-4" fill={t.is_priority ? 'currentColor' : 'none'} />
                  </button>
                )}
                <button
                  onClick={() => setDeadline(t, null)}
                  disabled={moving}
                  aria-label="Clear deadline"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper-line text-muted transition hover:text-ink active:scale-90 disabled:opacity-50 dark:bg-slate-700"
                >
                  {moving ? <Spinner className="h-4 w-4" /> : <X className="h-4 w-4" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
