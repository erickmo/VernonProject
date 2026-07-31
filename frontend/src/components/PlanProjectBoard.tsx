import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, FolderKanban, Info, X } from 'lucide-react'
import { SearchableSelect } from '@/components/SearchableSelect'
import { EmptyState, Spinner } from '@/components/ui'
import { useMoveTodoPlan, useMoveTodoDeadline } from '@/hooks/useData'
import { weekStartISO } from '@/pages/PlanScreen'
import { boardDate, deadlineDate, planColumns, allocMinutes, deadlineTone, type DeadlineTone } from '@/lib/planDay'
import { buildOptions } from '@/lib/filters'
import { addDaysISO, formatDate, formatEstimate, todayISO } from '@/lib/format'
import type { ProjectItem } from '@/lib/types'

// Weekday short + day number for a column header (e.g. "Mon 28"). TZ-safe local parse.
function dayLabel(iso: string): { wd: string; day: number } {
  const d = new Date(iso + 'T00:00:00')
  return { wd: d.toLocaleDateString(undefined, { weekday: 'short' }), day: d.getDate() }
}

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

// Week board: pick a PROJECT DETAIL (like the homepage select), then move its todos
// across the week by tap-to-move. Each move collapses the todo to a single date
// (useMoveTodoPlan) and invalidates calendar, so the board re-buckets from fresh
// data — no optimistic state.
export function PlanProjectBoard({
  candidates,
  mode = 'alloc',
}: {
  candidates: ProjectItem[]
  // 'alloc' = my-work board (moves the assignee's day-plan); 'deadline' =
  // my-project board (a leader/owner moves the todo's deadline across the week).
  mode?: 'alloc' | 'deadline'
}) {
  const navigate = useNavigate()
  const today = todayISO()
  const deadlineMode = mode === 'deadline'
  const dateOf = deadlineMode ? deadlineDate : boardDate
  const [boardDetail, setBoardDetail] = useState('')
  const [boardWeekStart, setBoardWeekStart] = useState(() => weekStartISO(today))
  const [picked, setPicked] = useState<ProjectItem | null>(null)
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
  const weekSet = useMemo(() => new Set(weekDates), [weekDates])
  const detailTotal = useMemo(() => estOf(detailTodos), [detailTodos])

  const drop = (date: string | null) => {
    if (!picked) return
    doMove(picked, date)
    setPicked(null)
  }

  // A compact card. Tapping picks it (to move); tapping the picked card deselects.
  // While something else is picked, the card is inert so the tap falls through to
  // the column drop target beneath it.
  const card = (t: ProjectItem, outOfWeek?: string | null) => {
    const isPicked = picked?.name === t.name
    // Only THIS card is frozen+animated while its own move is in flight; other
    // cards stay interactive so several todos can be moved at once.
    const moving = movingIds.has(t.name)
    const tone = deadlineTone(t, today)
    return (
      <button
        key={t.name}
        disabled={moving}
        onClick={
          !picked
            ? () => setPicked(t)
            : isPicked
              ? (e) => {
                  e.stopPropagation()
                  setPicked(null)
                }
              : undefined
        }
        className={clsx(
          'relative w-full rounded-xl border px-2.5 py-2 text-left transition active:scale-[0.98]',
          moving && 'animate-pulse ring-2 ring-brand-400',
          isPicked
            ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-400 dark:border-brand-400 dark:bg-brand-500/20'
            : 'border-paper-edge bg-paper-card dark:border-slate-700 dark:bg-slate-800',
          'border-l-4',
          TONE_BORDER[tone],
        )}
      >
        <p className="line-clamp-2 pr-6 text-[13px] font-semibold leading-snug text-stone-800 dark:text-slate-100">
          {t.to_do}
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-stone-400 dark:text-slate-500">
            {formatEstimate(t.estimated)}
          </span>
          {outOfWeek && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
              {deadlineMode ? 'due' : 'planned'} {formatDate(outOfWeek)}
            </span>
          )}
        </div>
        {/* Open the todo detail without triggering the card's pick-to-move tap. */}
        <span
          role="button"
          tabIndex={0}
          aria-label="Open detail"
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/project-item/${encodeURIComponent(t.name)}`)
          }}
          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full text-stone-400 transition active:scale-90 dark:text-slate-500"
        >
          <Info className="h-4 w-4" />
        </span>
        {moving && (
          <span className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl bg-brand-600/90 text-xs font-semibold text-white backdrop-blur-[1px]">
            <Spinner className="h-4 w-4 text-white" /> Memindahkan…
          </span>
        )}
      </button>
    )
  }

  // A column = header (label + its total estimate) + an internally-scrolling card
  // list, and (while moving) one big drop target. h-full so the list scrolls inside
  // the column, not the page.
  const column = (opts: {
    key: string
    title: string
    sub?: string
    isToday?: boolean
    date: string | null
    todos: ProjectItem[]
    render: (t: ProjectItem) => React.ReactNode
  }) => {
    // Alloc board date columns show the user's WHOLE-DAY planned load across ALL
    // projects (how full that day already is); Unscheduled shows this detail's
    // estimate backlog. The deadline board has no per-day minutes — every column
    // shows the estimate of the work due (or unscheduled) that day.
    const total = deadlineMode
      ? estOf(opts.todos)
      : opts.date
        ? plannedOf(candidates, opts.date)
        : estOf(opts.todos)
    return (
      <div
        key={opts.key}
        onClick={picked ? () => drop(opts.date) : undefined}
        className={clsx(
          'flex h-full w-40 shrink-0 flex-col rounded-2xl p-2 transition',
          picked
            ? 'cursor-pointer bg-brand-50 ring-2 ring-dashed ring-brand-300 dark:bg-brand-500/10 dark:ring-brand-500/40'
            : 'bg-paper-line/60 dark:bg-slate-800/40',
        )}
      >
        <div className="flex items-baseline justify-between px-1">
          <span
            className={clsx(
              'text-xs font-bold uppercase tracking-wide',
              opts.isToday ? 'text-brand-600 dark:text-brand-400' : 'text-stone-500 dark:text-slate-400',
            )}
          >
            {opts.title}
          </span>
          {opts.sub && (
            <span className="text-[11px] font-medium text-stone-400 dark:text-slate-500">{opts.sub}</span>
          )}
        </div>
        <div className="mb-2 px-1 text-[11px] font-semibold tabular-nums text-stone-400 dark:text-slate-500">
          {total > 0 ? formatEstimate(total) : '—'}
        </div>
        <div className="no-scrollbar flex flex-1 flex-col gap-2 overflow-y-auto">
          {opts.todos.length === 0 ? (
            <p className="px-1 py-3 text-center text-[11px] text-stone-300 dark:text-slate-600">—</p>
          ) : (
            opts.todos.map(opts.render)
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Project-detail picker */}
      <SearchableSelect
        value={boardDetail}
        onChange={(v) => {
          setBoardDetail(v)
          setPicked(null)
        }}
        options={detailOptions}
        placeholder="Pick a project detail…"
      />

      {!boardDetail ? (
        <EmptyState icon={FolderKanban} title="Pick a project detail" subtitle="Pick a project detail to plan its week." />
      ) : (
        <>
          {/* Week nav */}
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => setBoardWeekStart(addDaysISO(boardWeekStart, -7))}
              aria-label="Previous week"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper-line text-stone-600 transition active:scale-90 dark:bg-slate-700 dark:text-slate-300"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <p className="flex-1 text-center text-sm font-semibold text-stone-700 dark:text-slate-200">
              {formatDate(weekDates[0])} – {formatDate(weekDates[6])}
            </p>
            <button
              onClick={() => setBoardWeekStart(addDaysISO(boardWeekStart, 7))}
              aria-label="Next week"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper-line text-stone-600 transition active:scale-90 dark:bg-slate-700 dark:text-slate-300"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Overall estimate across the whole detail */}
          <p className="mt-2 text-center text-xs font-medium text-stone-500 dark:text-slate-400">
            Detail total{' '}
            <span className="font-bold tabular-nums text-stone-700 dark:text-slate-200">
              {formatEstimate(detailTotal)}
            </span>
          </p>

          {/* Sticky move banner */}
          {picked && (
            <div className="sticky top-0 z-10 mt-3 flex items-center gap-2 rounded-2xl border border-brand-200 bg-brand-50 px-3 py-2.5 text-sm dark:border-brand-500/30 dark:bg-brand-500/15">
              {move.isPending && <Spinner className="h-4 w-4 text-brand-600" />}
              <span className="flex-1 font-medium text-brand-800 dark:text-brand-200">
                Moving <span className="font-bold">'{picked.to_do}'</span> — tap a day (or Unscheduled) to move it
              </span>
              <button
                onClick={() => setPicked(null)}
                aria-label="Cancel move"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/70 text-brand-700 transition active:scale-90 dark:bg-slate-800/70 dark:text-brand-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Board — Unscheduled frozen on the left; the day columns scroll
              horizontally beside it. Fixed height so lists scroll inside each
              column, not the page. */}
          <div className="-mx-4 mt-4 flex h-[60vh] min-h-[15rem] gap-3 px-4">
            {column({
              key: 'unscheduled',
              title: 'Unscheduled',
              date: null,
              todos: cols.unscheduled,
              // Unscheduled cards whose date falls in another week carry it as a chip.
              render: (t) => {
                const bd = dateOf(t)
                return card(t, bd && !weekSet.has(bd) ? bd : null)
              },
            })}
            <div className="no-scrollbar min-w-0 flex-1 overflow-x-auto pb-2">
              <div className="flex h-full gap-3">
                {weekDates.map((d) => {
                  const { wd, day } = dayLabel(d)
                  return column({
                    key: d,
                    title: wd,
                    sub: String(day),
                    isToday: d === today,
                    date: d,
                    todos: cols.byDate[d],
                    render: (t) => card(t),
                  })
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
