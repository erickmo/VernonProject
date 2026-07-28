import { useMemo, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, FolderKanban } from 'lucide-react'
import { SearchableSelect } from '@/components/SearchableSelect'
import { EmptyState, Spinner } from '@/components/ui'
import { useMoveTodoPlan } from '@/hooks/useData'
import { planColumns, boardDate } from '@/lib/planDay'
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

// "By project" week board: pick a project, then drag its todos between an
// Unscheduled column and one column per weekday. Each drop collapses the todo's
// plan to that single date (useMoveTodoPlan); the calendar invalidation re-buckets.
export function PlanProjectBoard({
  candidates,
  projectOptions,
}: {
  candidates: ProjectItem[]
  projectOptions: { value: string; label: string }[]
}) {
  const today = todayISO()
  const [boardProject, setBoardProject] = useState('')
  const [boardWeekStart, setBoardWeekStart] = useState(() => weekStart(today))
  const dragged = useRef<ProjectItem | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null) // column key being hovered
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

  const drop = (date: string | null) => {
    const t = dragged.current
    dragged.current = null
    setDragOver(null)
    if (t) move.mutate({ todo: t, date })
  }

  // A compact draggable card. Rendered via a plain function (not a nested
  // component) so it never remounts mid-drag.
  const card = (t: ProjectItem) => {
    const bd = boardDate(t)
    const outOfWeek = bd && !weekDates.includes(bd) ? bd : null
    return (
      <div
        key={t.name}
        draggable
        onDragStart={(e) => {
          dragged.current = t
          e.dataTransfer.setData('text/plain', t.name) // Firefox won't drag without data
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragEnd={() => {
          dragged.current = null
          setDragOver(null)
        }}
        className="cursor-grab rounded-xl bg-canvas p-2.5 shadow-sm ring-1 ring-black/[0.04] transition active:cursor-grabbing hover:shadow-md dark:ring-white/[0.06]"
      >
        <div className="line-clamp-2 text-sm font-medium leading-snug text-ink">{t.to_do}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          <span className="tabular-nums">{formatEstimate(t.estimated)}</span>
          {outOfWeek && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              planned {formatDate(outOfWeek)}
            </span>
          )}
        </div>
      </div>
    )
  }

  const column = (key: string, date: string | null, header: ReactNode, list: ProjectItem[]) => (
    <div
      key={key}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(key)
      }}
      onDragLeave={() => setDragOver((d) => (d === key ? null : d))}
      onDrop={() => drop(date)}
      className={clsx(
        'flex w-44 shrink-0 flex-col rounded-2xl p-2.5 transition',
        dragOver === key
          ? 'bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-500/15'
          : 'bg-canvas/60 ring-1 ring-black/[0.04] dark:ring-white/[0.06]',
      )}
    >
      {header}
      <div className="mt-2 flex flex-col gap-2">
        {list.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted">—</p>
        ) : (
          list.map(card)
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Project picker */}
      <div className="rounded-2xl bg-surface p-4 shadow-card">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <FolderKanban className="h-3.5 w-3.5" /> Project
        </div>
        <SearchableSelect
          value={boardProject}
          onChange={setBoardProject}
          options={projectOptions}
          placeholder="Pick a project…"
        />
      </div>

      {!boardProject ? (
        <EmptyState
          icon={FolderKanban}
          title="Pick a project"
          subtitle="Pick a project to plan its week."
        />
      ) : (
        <>
          {/* Week nav */}
          <div className="flex items-center justify-between rounded-2xl bg-surface p-3 shadow-card">
            <button
              onClick={() => setBoardWeekStart(addDaysISO(boardWeekStart, -7))}
              aria-label="Previous week"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-paper-line text-muted transition hover:text-ink active:scale-90 dark:bg-slate-700"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-sm font-semibold text-ink">
              {formatDate(weekDates[0])} – {formatDate(weekDates[6])}
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
          <div className="relative">
            {move.isPending && (
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <Spinner className="h-6 w-6 text-brand-500" />
              </div>
            )}
            <div
              className={clsx(
                'flex gap-3 overflow-x-auto pb-2 transition',
                move.isPending && 'pointer-events-none opacity-50',
              )}
            >
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
