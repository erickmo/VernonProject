import { useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, CalendarRange, CalendarDays, Plus, Save, Filter, ListPlus } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { PlanRow } from '@/components/PlanRow'
import { PlanProjectBoard } from '@/components/PlanProjectBoard'
import { PlanDeadlineDay } from '@/components/PlanDeadlineDay'
import { SearchableSelect } from '@/components/SearchableSelect'
import { EmptyState, FullScreenLoader, Segmented, Spinner } from '@/components/ui'
import { useCalendar, useDailyTargets } from '@/hooks/useData'
import { usePlanDate } from '@/hooks/usePlanDay'
import { weekLoad } from '@/lib/planDay'
import { todoIsOpen } from '@/lib/filters'
import { addDaysISO, formatDate, formatEstimate, todayISO } from '@/lib/format'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Monday of the week containing `iso` (Mon-first). TZ-safe via addDaysISO.
export function weekStartISO(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay() // 0 Sun … 6 Sat
  return addDaysISO(iso, -((dow + 6) % 7))
}

// Date-first planning screen. Pick today / tomorrow / any date, edit each todo's
// minutes for that date (usePlanDate writes only that date's allocation row), and
// balance across the week via the strip. Candidate pool = every open, non-waiting
// todo across projects (getCalendar), so any date's plan can draw from all of them —
// a today-scoped pool would leave future days empty.
export default function PlanScreen() {
  const today = todayISO()
  const [scope, setScope] = useState<'work' | 'project'>('work')
  const [mode, setMode] = useState<'date' | 'project'>('project')
  const [selected, setSelected] = useState(today)
  const { data, isLoading } = useCalendar()

  const candidates = useMemo(
    () => (data?.todos ?? []).filter((t) => todoIsOpen(t) && !t.is_waiting),
    [data],
  )
  // Scope narrows the pool: "My work" = todos assigned to me; "My project" = every
  // todo in projects I lead or own (so a leader/owner can arrange the whole team).
  const scoped = useMemo(
    () => candidates.filter((t) => (scope === 'work' ? t.is_mine : t.is_leader || t.is_owner)),
    [candidates, scope],
  )

  const plan = usePlanDate(scoped, selected)

  const weekStart = weekStartISO(selected)
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i)), [weekStart])
  const { data: targets } = useDailyTargets(weekStart, weekDates[6])
  const loads = useMemo(() => weekLoad(scoped, weekDates, targets ?? {}), [scoped, weekDates, targets])

  // Optional project narrowing — only the day list + add-pool; the load bar and
  // week strip stay whole-day (capacity is capacity across every project).
  const [projectFilter, setProjectFilter] = useState('')
  const projectOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of scoped) if (!m.has(t.project)) m.set(t.project, t.project_name)
    return [...m].map(([value, label]) => ({ value, label }))
  }, [scoped])
  const inProject = (t: (typeof candidates)[number]) => !projectFilter || t.project === projectFilter

  const dayList = plan.visible.filter((t) => (plan.mins[t.name] || 0) > 0 && inProject(t))
  const addable = scoped.filter((t) => (plan.mins[t.name] || 0) === 0 && inProject(t))
  const dayTarget = targets?.[selected] ?? 0
  const dayPct = dayTarget > 0 ? Math.min(1, plan.total / dayTarget) : 0
  const met = dayTarget > 0 && plan.total >= dayTarget
  const tomorrow = addDaysISO(today, 1)

  const onSave = () => {
    plan.save().catch(() => {
      /* save() already toasted */
    })
  }

  // Seed EVERY unplanned todo of the filtered project onto this date at once —
  // "plan the whole project for this day" instead of adding them one by one.
  // Stages minutes (est) into the day list; Save writes them like any edit.
  const addAll = () => addable.forEach((t) => plan.useEstimate(t))

  // Horizontal swipe changes the active date (left → next day, right → prev).
  const swipe = useRef<{ x: number; y: number } | null>(null)

  const chip = (label: string, iso: string) => (
    <button
      onClick={() => setSelected(iso)}
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
    <DetailScreen title="Plan">
      {isLoading && !data ? (
        <FullScreenLoader label="Loading your work…" />
      ) : (
        <div
          className="touch-pan-y"
          onTouchStart={(e) => {
            const t = e.changedTouches[0]
            swipe.current = { x: t.clientX, y: t.clientY }
          }}
          onTouchEnd={(e) => {
            // Board mode owns horizontal scroll of its columns — don't hijack it as a date swipe.
            if (mode !== 'date') return
            const s = swipe.current
            if (!s) return
            swipe.current = null
            const t = e.changedTouches[0]
            const dx = t.clientX - s.x
            const dy = t.clientY - s.y
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5)
              setSelected(addDaysISO(selected, dx < 0 ? 1 : -1))
          }}
        >
          {/* Scope — my own assigned work, or the projects I lead / own */}
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: 'work', label: 'My work' },
              { value: 'project', label: 'My project' },
            ]}
          />

          {/* View — plan a single day, or move todos across the week */}
          <div className="mt-3">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'date', label: 'By date' },
                { value: 'project', label: 'By project' },
              ]}
            />
          </div>

          {mode === 'project' ? (
            // By project: my-work moves the day-plan; my-project moves the deadline.
            <div className="mt-5">
              <PlanProjectBoard candidates={scoped} mode={scope === 'project' ? 'deadline' : 'alloc'} />
            </div>
          ) : scope === 'project' ? (
            // My project / by date: the leader/owner sets what's due on this day.
            <div className="mt-5">
              <PlanDeadlineDay candidates={scoped} selected={selected} onSelect={setSelected} today={today} />
            </div>
          ) : (
            <>
          {/* Date navigator */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(addDaysISO(selected, -1))}
              aria-label="Previous day"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-paper-line text-stone-600 transition active:scale-90 dark:bg-slate-700 dark:text-slate-300"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <p className="flex-1 text-center font-display text-lg font-semibold text-stone-800 dark:text-slate-50">
              {formatDate(selected)}
            </p>
            <button
              onClick={() => setSelected(addDaysISO(selected, 1))}
              aria-label="Next day"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-paper-line text-stone-600 transition active:scale-90 dark:bg-slate-700 dark:text-slate-300"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Quick chips + arbitrary date (native picker — mobile convention) */}
          <div className="mt-3 flex items-center gap-2">
            {chip('Today', today)}
            {chip('Tomorrow', tomorrow)}
            <label className="relative ml-auto flex items-center gap-1.5 rounded-full border border-paper-edge bg-paper-card px-3.5 py-2 text-sm font-semibold text-stone-500 transition active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              <CalendarDays className="h-4 w-4" />
              <span>Pick</span>
              <input
                type="date"
                value={selected}
                onChange={(e) => e.target.value && setSelected(e.target.value)}
                aria-label="Pick a date"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
          </div>

          {/* Mini week strip — Mon-first around the selected date; tap to jump */}
          <div className="mt-5 flex items-end justify-between gap-1.5">
            {loads.map((l, i) => {
              const frac = l.target > 0 ? Math.min(1, l.minutes / l.target) : l.minutes > 0 ? 1 : 0
              const isSel = l.date === selected
              const isToday = l.date === today
              return (
                <button
                  key={l.date}
                  onClick={() => setSelected(l.date)}
                  className="flex flex-1 flex-col items-center gap-1"
                  aria-label={`${DAY_LABELS[i]} — ${formatEstimate(l.minutes)} planned`}
                >
                  <div
                    className={clsx(
                      'flex h-16 w-full items-end overflow-hidden rounded-lg',
                      isSel ? 'bg-brand-100 dark:bg-brand-500/25' : 'bg-paper-line dark:bg-slate-700/60',
                    )}
                  >
                    <div
                      className={clsx(
                        'w-full rounded-lg transition-[height] duration-300',
                        l.target > 0 && l.minutes >= l.target
                          ? 'bg-emerald-500'
                          : l.target === 0
                            ? 'bg-stone-300 dark:bg-slate-500'
                            : 'bg-brand-500',
                      )}
                      style={{ height: `${frac * 100}%` }}
                    />
                  </div>
                  <span
                    className={clsx(
                      'text-[11px] font-semibold',
                      isSel ? 'text-brand-600 dark:text-brand-400' : 'text-stone-400 dark:text-slate-500',
                    )}
                  >
                    {DAY_LABELS[i]}
                  </span>
                  <span className={clsx('h-1 w-1 rounded-full', isToday ? 'bg-brand-500' : 'bg-transparent')} />
                </button>
              )
            })}
          </div>

          {/* Day-load bar — Σ planned minutes vs the date's target */}
          <div className="mt-5">
            {dayTarget > 0 ? (
              <>
                <div className="flex items-center justify-between text-xs font-medium text-stone-500 dark:text-slate-400">
                  <span>Day load</span>
                  <span>
                    <span
                      className={clsx(
                        'font-bold',
                        met ? 'text-emerald-600 dark:text-emerald-400' : 'text-brand-600 dark:text-brand-400',
                      )}
                    >
                      {formatEstimate(plan.total)}
                    </span>{' '}
                    / {formatEstimate(dayTarget)}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-paper-line dark:bg-slate-700">
                  <div
                    className={clsx('h-full rounded-full transition-[width] duration-300', met ? 'bg-emerald-500' : 'bg-brand-500')}
                    style={{ width: `${dayPct * 100}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-xs font-medium text-stone-500 dark:text-slate-400">
                <span className="font-bold text-brand-600 dark:text-brand-400">{formatEstimate(plan.total)}</span> planned
              </p>
            )}
          </div>

          {/* Filter the day list + add-pool to one project (whole-day load is unchanged) */}
          {projectOptions.length > 1 && (
            <div className="mt-5">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">
                <Filter className="h-3.5 w-3.5" /> Filter by project
              </div>
              <SearchableSelect
                value={projectFilter}
                onChange={setProjectFilter}
                options={[{ value: '', label: 'All projects' }, ...projectOptions]}
                placeholder="All projects"
              />
              {projectFilter && addable.length > 0 && (
                <button
                  onClick={addAll}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-brand-200 bg-brand-50 py-2.5 text-sm font-semibold text-brand-700 transition active:scale-95 dark:border-brand-500/30 dark:bg-brand-500/15 dark:text-brand-300"
                >
                  <ListPlus className="h-4 w-4" /> Add all {addable.length} to this day
                </button>
              )}
            </div>
          )}

          {/* Add a todo to this day */}
          <div className="mt-5">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-slate-500">
              <Plus className="h-3.5 w-3.5" /> Add todo{projectFilter ? '' : ' from any project'}
            </div>
            <SearchableSelect
              value=""
              onChange={(v) => {
                const t = scoped.find((c) => c.name === v)
                if (t) plan.useEstimate(t)
              }}
              options={addable.map((t) => ({ value: t.name, label: t.to_do, keywords: t.project_name }))}
              placeholder={addable.length ? 'Pick a todo to add…' : 'Everything is already on this day'}
              disabled={!addable.length}
            />
          </div>

          {/* Day list — todos allocated minutes on the selected date */}
          <div className="mt-5">
            {dayList.length === 0 ? (
              <EmptyState icon={CalendarRange} title="Nothing planned" subtitle="Add a todo above to plan this day." />
            ) : (
              <ul className="flex flex-col gap-2.5">
                {dayList.map((t) => (
                  <PlanRow
                    key={t.name}
                    todo={t}
                    minutes={plan.mins[t.name] || 0}
                    floor={plan.floors[t.name] || 0}
                    onSet={plan.setMin}
                    onSetRaw={plan.setMinRaw}
                    onUseEstimate={plan.useEstimate}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* Sticky save footer */}
          <div
            className="sticky bottom-0 -mx-4 mt-5 border-t border-paper-edge bg-paper/95 px-4 pt-3 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
          >
            <button
              onClick={onSave}
              disabled={plan.saving}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3 text-sm font-semibold text-white transition active:bg-brand-700 disabled:opacity-60"
            >
              {plan.saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Save plan
            </button>
          </div>
            </>
          )}
        </div>
      )}
    </DetailScreen>
  )
}
