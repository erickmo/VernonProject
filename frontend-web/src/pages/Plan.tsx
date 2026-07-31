import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { ClipboardList, ChevronLeft, ChevronRight, Save, CalendarRange, Filter, ListPlus } from 'lucide-react'
import { Page, PageHeader } from '@web/components/Page'
import { DatePicker } from '@web/components/DatePicker'
import { SearchableSelect } from '@/components/SearchableSelect'
import { PlanRow } from '@/components/PlanRow'
import { PlanProjectBoard } from '@web/components/PlanProjectBoard'
import { PlanDeadlineDay } from '@web/components/PlanDeadlineDay'
import { EmptyState, Spinner } from '@/components/ui'
import { usePlanDate } from '@/hooks/usePlanDay'
import { useCalendar, useDailyTargets } from '@/hooks/useData'
import { weekLoad, sortForPlanning } from '@/lib/planDay'
import { todoIsOpen } from '@/lib/filters'
import { todayISO, addDaysISO, formatEstimate, formatDate } from '@/lib/format'

// Mon-first start of the week containing `iso` (TZ-safe via addDaysISO).
function weekStart(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7 // 0=Mon … 6=Sun
  return addDaysISO(iso, -dow)
}

const wd = (iso: string, opt: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, opt)

// Human "Today / Tomorrow / Yesterday / weekday" caption under the date.
function relLabel(iso: string): string {
  const today = todayISO()
  if (iso === today) return 'Today'
  if (iso === addDaysISO(today, 1)) return 'Tomorrow'
  if (iso === addDaysISO(today, -1)) return 'Yesterday'
  return wd(iso, { weekday: 'long' })
}

// Date-first planning surface: pick any date, allocate minutes to that day's
// todos, add todos from any project, and balance the week against per-day
// targets. Web sibling of the mobile PlanScreen; shares usePlanDate + PlanRow.
export default function Plan() {
  const [scope, setScope] = useState<'work' | 'project'>('work')
  const [mode, setMode] = useState<'date' | 'project'>('project')
  const [selected, setSelected] = useState(todayISO())
  const today = todayISO()

  const cal = useCalendar()
  // Active (open, non-waiting) todos are the whole plan pool — the date-first
  // read source per the spec (getCalendar().todos), not the today-scoped
  // dashboard set the "Plan my day" drawer uses.
  const candidates = useMemo(
    () => (cal.data?.todos ?? []).filter((t) => todoIsOpen(t) && !t.is_waiting),
    [cal.data],
  )
  // Scope narrows the pool: "My work" = todos assigned to me; "My project" = every
  // todo in projects I lead or own (so a leader/owner can arrange the whole team).
  const scoped = useMemo(
    () => candidates.filter((t) => (scope === 'work' ? t.is_mine : t.is_leader || t.is_owner)),
    [candidates, scope],
  )

  const plan = usePlanDate(scoped, selected)

  const weekDates = useMemo(() => {
    const start = weekStart(selected)
    return Array.from({ length: 7 }, (_, i) => addDaysISO(start, i))
  }, [selected])
  const targets = useDailyTargets(weekDates[0], weekDates[6]).data ?? {}
  const week = useMemo(() => weekLoad(scoped, weekDates, targets), [scoped, weekDates, targets])

  const target = targets[selected] ?? 0
  const minutes = plan.total
  const over = target > 0 && minutes > target
  const pct = target > 0 ? Math.min(1, minutes / target) : 0

  // Optional project narrowing — only the day list + add-pool; the load bar and
  // week strip stay whole-day (capacity is capacity across every project).
  const [projectFilter, setProjectFilter] = useState('')
  const projectOptions = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of scoped) if (!m.has(t.project)) m.set(t.project, t.project_name)
    return [...m].map(([value, label]) => ({ value, label }))
  }, [scoped])
  const inProject = (t: (typeof candidates)[number]) => !projectFilter || t.project === projectFilter

  const dayList = useMemo(
    () => sortForPlanning(scoped.filter((t) => (plan.mins[t.name] || 0) > 0 && inProject(t)), plan.mins),
    [scoped, plan.mins, projectFilter],
  )
  const addPool = scoped.filter((t) => (plan.mins[t.name] || 0) === 0 && inProject(t))

  const onSave = () => plan.save().catch(() => {}) // save() already toasts on error

  // Seed EVERY unplanned todo of the filtered project onto this date at once —
  // "plan the whole project for this day" instead of adding them one by one.
  const addAll = () => addPool.forEach((t) => plan.useEstimate(t))

  return (
    <Page className="space-y-6">
      <PageHeader
        icon={ClipboardList}
        title="Plan"
        subtitle="Allocate minutes to any date and balance your week"
        actions={
          mode === 'date' && scope === 'work' ? (
            <button
              onClick={onSave}
              disabled={plan.saving}
              className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {plan.saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Save plan
            </button>
          ) : undefined
        }
      />

      {/* Scope — my own assigned work, or the projects I lead / own */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full bg-surface p-1 shadow-card">
          {(
            [
              ['work', 'My work'],
              ['project', 'My project'],
            ] as const
          ).map(([s, label]) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={clsx(
                'rounded-full px-4 py-1.5 text-sm font-semibold transition active:scale-95',
                scope === s ? 'bg-brand-600 text-white shadow-sm' : 'text-muted hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* View — date-first planner vs. by-project week board */}
        <div className="inline-flex rounded-full bg-surface p-1 shadow-card">
          {(
            [
              ['date', 'By date'],
              ['project', 'By project'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={clsx(
                'rounded-full px-4 py-1.5 text-sm font-semibold transition active:scale-95',
                mode === m ? 'bg-brand-600 text-white shadow-sm' : 'text-muted hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'project' ? (
        // By project: my-work moves the day-plan; my-project moves the deadline.
        <PlanProjectBoard candidates={scoped} mode={scope === 'project' ? 'deadline' : 'alloc'} />
      ) : scope === 'project' ? (
        // My project / by date: the leader/owner sets what's due on this day.
        <PlanDeadlineDay candidates={scoped} selected={selected} onSelect={setSelected} />
      ) : (
        <>
      {/* Date controls — prev/next, human date, Today/Tomorrow, arbitrary picker */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-3 shadow-card">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelected(addDaysISO(selected, -1))}
            aria-label="Previous day"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-paper-line text-muted transition hover:text-ink active:scale-90 dark:bg-slate-700"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-[9rem] text-center leading-tight">
            <div className="text-base font-semibold text-ink">{formatDate(selected)}</div>
            <div className="text-xs text-muted">{relLabel(selected)}</div>
          </div>
          <button
            onClick={() => setSelected(addDaysISO(selected, 1))}
            aria-label="Next day"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-paper-line text-muted transition hover:text-ink active:scale-90 dark:bg-slate-700"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {(['Today', 'Tomorrow'] as const).map((label, i) => {
            const iso = addDaysISO(today, i)
            const active = selected === iso
            return (
              <button
                key={label}
                onClick={() => setSelected(iso)}
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
            onChange={(v) => v && setSelected(v)}
            aria-label="Pick a date"
            className="rounded-full bg-paper-line/60 px-3.5 py-2 text-sm font-semibold text-muted transition active:scale-95 dark:bg-slate-800"
          />
        </div>
      </div>

      <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6 lg:space-y-0">
        {/* Day panel — load bar, add picker, allocated todos */}
        <div className="min-w-0 space-y-4">
          {/* Day-load bar */}
          <div className="rounded-2xl bg-surface p-4 shadow-card">
            <div className="flex items-center justify-between text-sm font-medium text-muted">
              <span>{relLabel(selected)}'s load</span>
              {target > 0 ? (
                <span>
                  <span className={clsx('font-bold', over ? 'text-rose-600 dark:text-rose-400' : 'text-brand-600 dark:text-brand-400')}>
                    {formatEstimate(minutes)}
                  </span>{' '}
                  / {formatEstimate(target)}
                </span>
              ) : (
                <span className="font-semibold text-ink">{formatEstimate(minutes)} planned</span>
              )}
            </div>
            {target > 0 && (
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-canvas">
                <div
                  className={clsx('h-full rounded-full transition-[width] duration-300', over ? 'bg-rose-500' : 'bg-brand-500')}
                  style={{ width: `${pct * 100}%` }}
                />
              </div>
            )}
          </div>

          {/* Filter the day list + add-pool to one project (whole-day load unchanged) */}
          {projectOptions.length > 1 && (
            <div className="rounded-2xl bg-surface p-4 shadow-card">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                <Filter className="h-3.5 w-3.5" /> Filter by project
              </div>
              <SearchableSelect
                value={projectFilter}
                onChange={setProjectFilter}
                options={[{ value: '', label: 'All projects' }, ...projectOptions]}
                placeholder="All projects"
              />
              {projectFilter && addPool.length > 0 && (
                <button
                  onClick={addAll}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 py-2 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/15 dark:text-brand-300"
                >
                  <ListPlus className="h-4 w-4" /> Add all {addPool.length} todos to this day
                </button>
              )}
            </div>
          )}

          {/* Add from any project */}
          <div className="rounded-2xl bg-surface p-4 shadow-card">
            <SearchableSelect
              value=""
              onChange={(id) => {
                const t = scoped.find((x) => x.name === id)
                if (t) plan.useEstimate(t)
              }}
              options={addPool.map((t) => ({
                value: t.name,
                label: t.to_do,
                keywords: `${t.project_name} ${t.brand ?? ''}`,
              }))}
              placeholder={projectFilter ? '+ Add todo to this day' : '+ Add todo from any project'}
            />
          </div>

          {/* Allocated todos for the selected date */}
          {!cal.data ? (
            <div className="flex justify-center py-10">
              <Spinner className="h-6 w-6 text-brand-500" />
            </div>
          ) : dayList.length === 0 ? (
            <EmptyState
              icon={CalendarRange}
              title="Nothing planned"
              subtitle="Add a todo above to allocate minutes to this day."
            />
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

        {/* Week strip — per-day load vs target; tap a column to jump */}
        <aside className="rounded-2xl bg-surface p-4 shadow-card">
          <h2 className="mb-3 text-sm font-semibold text-ink">This week</h2>
          <div className="grid grid-cols-7 gap-1">
            {week.map(({ date, minutes: m, target: tg }) => {
              const isSel = date === selected
              const isToday = date === today
              const frac = tg > 0 ? Math.min(1, m / tg) : m > 0 ? 1 : 0
              const overDay = tg > 0 && m > tg
              return (
                <button
                  key={date}
                  onClick={() => setSelected(date)}
                  className={clsx(
                    'flex flex-col items-center gap-1 rounded-xl p-1.5 transition',
                    isSel ? 'bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-500/15' : 'hover:bg-hover/[0.05]',
                  )}
                >
                  <span className={clsx('text-[10px] font-semibold uppercase', isToday ? 'text-brand-600 dark:text-brand-400' : 'text-muted')}>
                    {wd(date, { weekday: 'short' }).slice(0, 2)}
                  </span>
                  <span className={clsx('text-sm font-bold tabular-nums', isSel ? 'text-brand-700 dark:text-brand-300' : 'text-ink')}>
                    {wd(date, { day: 'numeric' })}
                  </span>
                  <div className="flex h-16 w-2.5 items-end overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                    <div
                      className={clsx('w-full rounded-full', overDay ? 'bg-rose-500' : 'bg-brand-500')}
                      style={{ height: `${frac * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] tabular-nums text-muted">{m > 0 ? formatEstimate(m) : '—'}</span>
                </button>
              )
            })}
          </div>
        </aside>
      </div>
        </>
      )}
    </Page>
  )
}
