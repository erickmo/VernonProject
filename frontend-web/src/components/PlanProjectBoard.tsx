import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, FolderKanban } from 'lucide-react'
import { SearchableSelect } from '@/components/SearchableSelect'
import { EmptyState, Spinner } from '@/components/ui'
import { AssigneeTag, PlanLegend, PrioritySlotBadge } from '@/components/PlanMeta'
import { useMoveTodoPlan, useMoveTodoDeadline, useTeamPriorityCoverage, useSetTodoPriority } from '@/hooks/useData'
import { planColumns, boardDate, deadlineDate, allocMinutes, deadlineTone, type DeadlineTone } from '@/lib/planDay'
import { buildOptions } from '@/lib/filters'
import { todayISO, addDaysISO, formatDate, formatEstimate } from '@/lib/format'
import type { ProjectItem } from '@/lib/types'

// ponytail: 3-line helper, same as Plan.tsx's local copy — not worth exporting.
// Mon-first start of the week containing `iso` (TZ-safe via addDaysISO).
function weekStart(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7 // 0=Mon … 6=Sun
  return addDaysISO(iso, -dow)
}

const wd = (iso: string, opt: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, opt)

// Sum of estimate minutes across a set of todos (whole-detail total; Unscheduled column).
const estOf = (list: ProjectItem[]) => list.reduce((s, t) => s + (t.estimated || 0), 0)
// Minutes planned on a specific date across a column (the day's planned load).
const plannedOf = (list: ProjectItem[], date: string) =>
  list.reduce((s, t) => s + allocMinutes(t, date), 0)

// Deadline-urgency → left accent colour on a card.
const TONE_BORDER: Record<DeadlineTone, string> = {
  overdue: 'border-l-rose-500',
  today: 'border-l-orange-500',
  soon: 'border-l-amber-400',
  future: 'border-l-emerald-500',
  none: 'border-l-transparent',
}

// "By project" week board: pick a project, then drag its todos between an
// Unscheduled column and one column per weekday. Each drop collapses the todo's
// plan to that single date (useMoveTodoPlan); the calendar invalidation re-buckets.
export function PlanProjectBoard({
  candidates,
  mode = 'alloc',
}: {
  candidates: ProjectItem[]
  // 'alloc' = my-work board (moves the assignee's day-plan); 'deadline' =
  // my-project board (a leader/owner moves the todo's deadline across the week).
  mode?: 'alloc' | 'deadline'
}) {
  const today = todayISO()
  const deadlineMode = mode === 'deadline'
  const dateOf = deadlineMode ? deadlineDate : boardDate
  const [boardDetail, setBoardDetail] = useState('')
  const [boardWeekStart, setBoardWeekStart] = useState(() => weekStart(today))
  const navigate = useNavigate()
  const dragged = useRef<ProjectItem | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null) // column key being hovered
  // Both hooks always run (rules of hooks); `mode` selects which drives a move.
  const movePlan = useMoveTodoPlan()
  const moveDeadline = useMoveTodoDeadline()
  const move = deadlineMode ? moveDeadline : movePlan
  // Per-todo in-flight set — so several todos can move at once and only each
  // moving card is frozen (not the whole board). Held until its own refetch lands.
  const [movingIds, setMovingIds] = useState<Set<string>>(() => new Set())
  const doMove = (todo: ProjectItem, date: string | null) => {
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

  // Options = distinct Project Details in my todos, labelled "Project · Detail".
  const detailOptions = useMemo(
    () =>
      buildOptions(
        candidates,
        (t) => t.project_detail,
        (t) => `${t.project_name} · ${t.project_detail_title}`,
        (t) => `${t.project_name} ${t.project_detail_title}`,
      ),
    [candidates],
  )
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysISO(boardWeekStart, i)),
    [boardWeekStart],
  )
  const detailTodos = useMemo(
    () => candidates.filter((t) => t.project_detail === boardDetail),
    [candidates, boardDetail],
  )
  const cols = useMemo(() => planColumns(detailTodos, weekDates, dateOf), [detailTodos, weekDates, dateOf])
  const detailTotal = useMemo(() => estOf(detailTodos), [detailTodos])
  const weekSet = useMemo(() => new Set(weekDates), [weekDates])
  // Priority-slot occupancy for this detail's project across the board week — reused
  // from the Tim view's endpoint. Deadline mode only (the leader is placing due dates).
  const boardProject = detailTodos[0]?.project ?? ''
  const occ = useTeamPriorityCoverage(deadlineMode ? boardProject : '', boardWeekStart)
  const occByUserDate = useMemo(() => {
    const m = new Map<string, Map<string, { used: number; slots: number }>>()
    for (const mem of occ.data?.members ?? []) {
      const dm = new Map<string, { used: number; slots: number }>()
      for (const d of mem.days) dm.set(d.date, { used: d.used, slots: d.slots })
      m.set(mem.user, dm)
    }
    return m
  }, [occ.data])
  const setPriority = useSetTodoPriority()

  const drop = (date: string | null) => {
    const t = dragged.current
    dragged.current = null
    setDragOver(null)
    if (t) doMove(t, date)
  }

  // A compact draggable card. Rendered via a plain function (not a nested
  // component) so it never remounts mid-drag.
  const card = (t: ProjectItem) => {
    const bd = dateOf(t)
    const outOfWeek = bd && !weekDates.includes(bd) ? bd : null
    // Only THIS card is frozen+animated while its own move is in flight; other
    // cards stay draggable so several todos can be moved at once.
    const moving = movingIds.has(t.name)
    const tone = deadlineTone(t, today)
    return (
      <div
        key={t.name}
        draggable={!moving}
        onDragStart={(e) => {
          dragged.current = t
          e.dataTransfer.setData('text/plain', t.name) // Firefox won't drag without data
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragEnd={() => {
          dragged.current = null
          setDragOver(null)
        }}
        onClick={() => {
          // A plain click opens the detail drawer; a drag fires dragstart/end and
          // suppresses click, so the two don't collide.
          if (!moving) navigate(`/project-item/${encodeURIComponent(t.name)}`)
        }}
        title="Open detail"
        className={clsx(
          'relative cursor-pointer rounded-xl border-l-4 bg-surface p-2.5 shadow-sm ring-1 ring-black/[0.06] transition hover:shadow-md active:cursor-grabbing dark:ring-white/[0.08]',
          TONE_BORDER[tone],
          moving && 'animate-pulse ring-2 ring-brand-400',
        )}
      >
        <div className="line-clamp-2 text-sm font-medium leading-snug text-ink">{t.to_do}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          <span className="tabular-nums">{formatEstimate(t.estimated)}</span>
          {outOfWeek && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              {deadlineMode ? 'due' : 'planned'} {formatDate(outOfWeek)}
            </span>
          )}
        </div>
        {t.assigned_to_name && (
          <div className="mt-1">
            <AssigneeTag name={t.assigned_to_name} />
          </div>
        )}
        {deadlineMode && t.assigned_to && t.deadline && weekSet.has(t.deadline) && (() => {
          const cell = occByUserDate.get(t.assigned_to)?.get(t.deadline)
          if (!cell) return null
          return (
            <PrioritySlotBadge
              used={cell.used}
              slots={cell.slots}
              isPriority={!!t.is_priority}
              canToggle={!!t.can_prioritize}
              pending={setPriority.isPending && setPriority.variables?.todoName === t.name}
              onToggle={() => setPriority.mutate({ todoName: t.name, isPriority: !t.is_priority })}
            />
          )
        })()}
        {moving && (
          <span className="absolute right-1.5 top-1.5">
            <Spinner className="h-3.5 w-3.5 text-brand-500" />
          </span>
        )}
      </div>
    )
  }

  const column = (key: string, date: string | null, header: ReactNode, list: ProjectItem[]) => {
    // Alloc board date columns show the user's WHOLE-DAY planned load across ALL
    // projects; Unscheduled shows this detail's estimate backlog. The deadline board
    // has no per-day minutes — every column shows the estimate of the work due (or
    // unscheduled) that day.
    const total = deadlineMode ? estOf(list) : date ? plannedOf(candidates, date) : estOf(list)
    return (
      <div
        key={key}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(key)
        }}
        onDragLeave={() => setDragOver((d) => (d === key ? null : d))}
        onDrop={() => drop(date)}
        className={clsx(
          'flex h-full min-w-0 flex-1 flex-col rounded-2xl p-2 transition',
          dragOver === key
            ? 'bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-500/15'
            : 'bg-canvas ring-1 ring-black/[0.05] dark:ring-white/[0.06]',
        )}
      >
        {header}
        <div className="mt-1 text-center text-[11px] font-semibold tabular-nums text-muted">
          {total > 0 ? formatEstimate(total) : '—'}
        </div>
        <div className="mt-2 flex flex-1 flex-col gap-2 overflow-y-auto">
          {list.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted">—</p>
          ) : (
            list.map(card)
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Project-detail picker */}
      <div className="rounded-2xl bg-surface p-4 shadow-card">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <FolderKanban className="h-3.5 w-3.5" /> Project detail
        </div>
        <SearchableSelect
          value={boardDetail}
          onChange={setBoardDetail}
          options={detailOptions}
          placeholder="Pick a project detail…"
        />
      </div>

      {!boardDetail ? (
        <EmptyState
          icon={FolderKanban}
          title="Pick a project detail"
          subtitle="Pick a project detail to plan its week."
        />
      ) : (
        <>
          <PlanLegend />
          {/* Week nav */}
          <div className="flex items-center justify-between rounded-2xl bg-surface p-3 shadow-card">
            <button
              onClick={() => setBoardWeekStart(addDaysISO(boardWeekStart, -7))}
              aria-label="Previous week"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-paper-line text-muted transition hover:text-ink active:scale-90 dark:bg-slate-700"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-center leading-tight">
              <div className="text-sm font-semibold text-ink">
                {formatDate(weekDates[0])} – {formatDate(weekDates[6])}
              </div>
              <div className="text-xs text-muted">
                Detail total{' '}
                <span className="font-semibold tabular-nums text-ink">{formatEstimate(detailTotal)}</span>
              </div>
            </div>
            <button
              onClick={() => setBoardWeekStart(addDaysISO(boardWeekStart, 7))}
              aria-label="Next week"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-paper-line text-muted transition hover:text-ink active:scale-90 dark:bg-slate-700"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Board — Unscheduled + one column per weekday; drag cards between them */}
          <div className="relative rounded-2xl bg-surface p-3 shadow-card">
            {/* Full-width board: Unscheduled + 7 day columns share the width
                equally (no horizontal scroll); each column scrolls vertically. */}
            <div className="flex h-[62vh] min-h-[16rem] gap-2">
              {column(
                'unscheduled',
                null,
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">Unscheduled</div>,
                cols.unscheduled,
              )}
              {weekDates.map((date) => {
                    const isToday = date === today
                    return column(
                      date,
                      date,
                      <div className="flex flex-col items-center leading-tight">
                        <span
                          className={clsx(
                            'text-[10px] font-semibold uppercase',
                            isToday ? 'text-brand-600 dark:text-brand-400' : 'text-muted',
                          )}
                        >
                          {wd(date, { weekday: 'short' }).slice(0, 3)}
                        </span>
                        <span
                          className={clsx(
                            'text-lg font-bold tabular-nums',
                            isToday ? 'text-brand-700 dark:text-brand-300' : 'text-ink',
                          )}
                        >
                          {wd(date, { day: 'numeric' })}
                        </span>
                      </div>,
                      cols.byDate[date],
                    )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
