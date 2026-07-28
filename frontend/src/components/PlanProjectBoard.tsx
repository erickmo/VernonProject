import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, FolderKanban, X } from 'lucide-react'
import { SearchableSelect } from '@/components/SearchableSelect'
import { EmptyState, Spinner } from '@/components/ui'
import { useMoveTodoPlan } from '@/hooks/useData'
import { weekStartISO } from '@/pages/PlanScreen'
import { boardDate, planColumns } from '@/lib/planDay'
import { addDaysISO, formatDate, formatEstimate, todayISO } from '@/lib/format'
import type { ProjectItem } from '@/lib/types'

// Weekday short + day number for a column header (e.g. "Mon 28"). TZ-safe local parse.
function dayLabel(iso: string): { wd: string; day: number } {
  const d = new Date(iso + 'T00:00:00')
  return { wd: d.toLocaleDateString(undefined, { weekday: 'short' }), day: d.getDate() }
}

// "By project" week board: pick a project, then move its todos across the week by
// tap-to-move. Each move collapses the todo to a single date (useMoveTodoPlan) and
// invalidates calendar, so the board re-buckets from fresh data — no optimistic state.
export function PlanProjectBoard({
  candidates,
  projectOptions,
}: {
  candidates: ProjectItem[]
  projectOptions: { value: string; label: string }[]
}) {
  const today = todayISO()
  const [boardProject, setBoardProject] = useState('')
  const [boardWeekStart, setBoardWeekStart] = useState(() => weekStartISO(today))
  const [picked, setPicked] = useState<ProjectItem | null>(null)
  const move = useMoveTodoPlan()

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysISO(boardWeekStart, i)),
    [boardWeekStart],
  )
  const projectTodos = useMemo(
    () => candidates.filter((t) => t.project === boardProject),
    [candidates, boardProject],
  )
  const cols = useMemo(() => planColumns(projectTodos, weekDates), [projectTodos, weekDates])
  const weekSet = useMemo(() => new Set(weekDates), [weekDates])

  const drop = (date: string | null) => {
    if (!picked || move.isPending) return
    move.mutate({ todo: picked, date })
    setPicked(null)
  }

  // A compact card. Tapping picks it (to move); tapping the picked card deselects.
  // While something else is picked, the card is inert so the tap falls through to
  // the column drop target beneath it.
  const card = (t: ProjectItem, outOfWeek?: string | null) => {
    const isPicked = picked?.name === t.name
    return (
      <button
        key={t.name}
        disabled={move.isPending}
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
          'w-full rounded-xl border px-2.5 py-2 text-left transition active:scale-[0.98]',
          isPicked
            ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-400 dark:border-brand-400 dark:bg-brand-500/20'
            : 'border-paper-edge bg-paper-card dark:border-slate-700 dark:bg-slate-800',
        )}
      >
        <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-stone-800 dark:text-slate-100">
          {t.to_do}
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-stone-400 dark:text-slate-500">
            {formatEstimate(t.estimated)}
          </span>
          {outOfWeek && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
              planned {formatDate(outOfWeek)}
            </span>
          )}
        </div>
      </button>
    )
  }

  // A column = header + card list, and (while moving) one big drop target.
  const column = (opts: {
    key: string
    title: string
    sub?: string
    isToday?: boolean
    date: string | null
    todos: ProjectItem[]
    render: (t: ProjectItem) => React.ReactNode
  }) => (
    <div
      key={opts.key}
      onClick={picked ? () => drop(opts.date) : undefined}
      className={clsx(
        'w-40 shrink-0 rounded-2xl p-2 transition',
        picked
          ? 'cursor-pointer bg-brand-50 ring-2 ring-dashed ring-brand-300 dark:bg-brand-500/10 dark:ring-brand-500/40'
          : 'bg-paper-line/60 dark:bg-slate-800/40',
      )}
    >
      <div className="mb-2 flex items-baseline justify-between px-1">
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
      <div className="flex flex-col gap-2">
        {opts.todos.length === 0 ? (
          <p className="px-1 py-3 text-center text-[11px] text-stone-300 dark:text-slate-600">—</p>
        ) : (
          opts.todos.map(opts.render)
        )}
      </div>
    </div>
  )

  return (
    <div>
      {/* Project picker */}
      <SearchableSelect
        value={boardProject}
        onChange={(v) => {
          setBoardProject(v)
          setPicked(null)
        }}
        options={projectOptions}
        placeholder="Pick a project…"
      />

      {!boardProject ? (
        <EmptyState icon={FolderKanban} title="Pick a project" subtitle="Pick a project to plan its week." />
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

          {/* Columns — horizontally scrollable */}
          <div className="no-scrollbar -mx-4 mt-4 flex gap-3 overflow-x-auto px-4 pb-2">
            {column({
              key: 'unscheduled',
              title: 'Unscheduled',
              date: null,
              todos: cols.unscheduled,
              // Unscheduled cards planned in another week carry their out-of-week date as a chip.
              render: (t) => {
                const bd = boardDate(t)
                return card(t, bd && !weekSet.has(bd) ? bd : null)
              },
            })}
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
        </>
      )}
    </div>
  )
}
