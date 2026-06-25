import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, X, CalendarDays } from 'lucide-react'
import clsx from 'clsx'
import { TodoCard } from '@/components/TodoCard'
import { Segmented, EmptyState, FullScreenLoader } from '@/components/ui'
import { useCalendar, useProjects } from '@/hooks/useData'
import { STATUS } from '@/lib/status'
import type { ProjectItem } from '@/lib/types'

type Scope = 'my' | 'all' | 'project'
type DateField = 'deadline' | 'owner_deadline' | 'leader_deadline'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
// Monday-first weekday headers.
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const pad = (n: number) => String(n).padStart(2, '0')
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// localStorage-backed toggle state.
function persisted<T extends string>(k: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  return (window.localStorage.getItem(k) as T) || fallback
}
function persist(k: string, v: string) {
  try {
    window.localStorage.setItem(k, v)
  } catch {
    /* ignore */
  }
}

// Self-contained calendar (toggles + month grid + day sheet). No page shell —
// each platform wraps it in its own chrome (mobile DetailScreen / web AppShell).
export function CalendarView() {
  const { data, isLoading } = useCalendar()
  const { data: projects } = useProjects()

  const now = new Date()
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [scope, setScope] = useState<Scope>(() => persisted('cal.scope', 'my'))
  const [dateField, setDateField] = useState<DateField>(() => persisted('cal.dateField', 'deadline'))
  const [split, setSplit] = useState<boolean>(() => persisted<string>('cal.split', 'off') === 'on')
  const [project, setProject] = useState<string>(() => persisted('cal.project', ''))
  const [openDay, setOpenDay] = useState<string | null>(null)

  const setScopeP = (v: Scope) => { setScope(v); persist('cal.scope', v) }
  const setDateFieldP = (v: DateField) => { setDateField(v); persist('cal.dateField', v) }
  const setSplitP = (v: boolean) => { setSplit(v); persist('cal.split', v ? 'on' : 'off') }
  const setProjectP = (v: string) => { setProject(v); persist('cal.project', v) }

  // Apply scope filter.
  const scoped = useMemo(() => {
    const all = data?.todos ?? []
    if (scope === 'my') return all.filter((t) => t.is_mine && t.status_key === 'planned')
    if (scope === 'project') return project ? all.filter((t) => t.project === project) : all
    return all
  }, [data, scope, project])

  // Map dayKey -> todos that fall on that day, plus an "undated" tally.
  const { byDay, undated } = useMemo(() => {
    const map = new Map<string, ProjectItem[]>()
    let undatedCount = 0
    for (const t of scoped) {
      const days = daysFor(t, dateField, split)
      if (!days.length) {
        undatedCount++
        continue
      }
      for (const d of days) {
        const arr = map.get(d)
        if (arr) arr.push(t)
        else map.set(d, [t])
      }
    }
    return { byDay: map, undated: undatedCount }
  }, [scoped, dateField, split])

  // Build the 6-week (42-cell) grid, Monday-first.
  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1)
    const offset = (first.getDay() + 6) % 7 // 0=Mon .. 6=Sun
    const out: { date: Date; key: string; inMonth: boolean }[] = []
    for (let i = 0; i < 42; i++) {
      const date = new Date(cursor.y, cursor.m, 1 - offset + i)
      out.push({ date, key: keyOf(date), inMonth: date.getMonth() === cursor.m })
    }
    return out
  }, [cursor])

  const todayKey = keyOf(now)

  const step = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }
  const goToday = () => setCursor({ y: now.getFullYear(), m: now.getMonth() })

  const dayTodos = openDay ? byDay.get(openDay) ?? [] : []

  return (
    <div className="mx-auto max-w-3xl">
      {/* Toggles */}
      <div className="mb-4 space-y-2.5">
        <Segmented<Scope>
          value={scope}
          onChange={setScopeP}
          options={[
            { value: 'my', label: 'My' },
            { value: 'all', label: 'All' },
            { value: 'project', label: 'Project' },
          ]}
        />
        {scope === 'project' && (
          <select
            value={project}
            onChange={(e) => setProjectP(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200"
          >
            <option value="">All projects</option>
            {(projects ?? []).map((p) => (
              <option key={p.name} value={p.name}>
                {p.project_name}
              </option>
            ))}
          </select>
        )}
        <Segmented<DateField>
          value={dateField}
          onChange={setDateFieldP}
          options={[
            { value: 'deadline', label: 'Deadline' },
            { value: 'owner_deadline', label: 'Owner' },
            { value: 'leader_deadline', label: 'Leader' },
          ]}
        />
        <label className="flex items-center justify-between rounded-2xl bg-slate-100 dark:bg-slate-800 px-4 py-2.5">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Split schedule
            <span className="ml-1 text-xs font-normal text-slate-400">(spread over planned days)</span>
          </span>
          <input
            type="checkbox"
            checked={split}
            onChange={(e) => setSplitP(e.target.checked)}
            className="h-5 w-9 cursor-pointer appearance-none rounded-full bg-slate-300 dark:bg-slate-600 transition-colors checked:bg-brand-500 relative
              before:absolute before:left-0.5 before:top-0.5 before:h-4 before:w-4 before:rounded-full before:bg-white before:transition-transform checked:before:translate-x-4"
          />
        </label>
      </div>

      {/* Month nav */}
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => step(-1)}
          aria-label="Previous month"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 active:bg-slate-100 dark:active:bg-slate-700"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            {MONTHS[cursor.m]} {cursor.y}
          </h2>
          <button
            onClick={goToday}
            className="rounded-full px-3 py-1 text-xs font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/15"
          >
            Today
          </button>
        </div>
        <button
          onClick={() => step(1)}
          aria-label="Next month"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 active:bg-slate-100 dark:active:bg-slate-700"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {isLoading && !data ? (
        <FullScreenLoader />
      ) : (
        <>
          {/* Weekday header */}
          <div className="grid grid-cols-7 text-center text-[11px] font-medium uppercase tracking-wide text-slate-400">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((c) => {
              const items = byDay.get(c.key) ?? []
              const isToday = c.key === todayKey
              return (
                <button
                  key={c.key}
                  onClick={() => items.length && setOpenDay(c.key)}
                  className={clsx(
                    'flex min-h-[64px] flex-col items-stretch rounded-xl border p-1 text-left transition',
                    c.inMonth
                      ? 'border-slate-200/70 dark:border-slate-700/70 bg-white dark:bg-slate-800'
                      : 'border-transparent bg-slate-50/60 dark:bg-slate-800/40',
                    items.length && 'hover:border-brand-300 active:scale-[0.97]',
                  )}
                >
                  <span
                    className={clsx(
                      'mb-0.5 self-end text-[11px] font-semibold leading-none',
                      isToday
                        ? 'flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white'
                        : c.inMonth
                          ? 'text-slate-600 dark:text-slate-300'
                          : 'text-slate-300 dark:text-slate-600',
                    )}
                  >
                    {c.date.getDate()}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    {items.slice(0, 3).map((t, i) => {
                      const overdue = t.is_overdue && t.status_key !== 'completed'
                      return (
                        <span
                          key={t.name + i}
                          className={clsx(
                            'truncate rounded px-1 py-0.5 text-[9px] font-medium leading-tight text-white',
                            overdue ? 'bg-rose-400' : STATUS[t.status_key].dot,
                          )}
                          title={t.to_do}
                        >
                          {t.to_do}
                        </span>
                      )
                    })}
                    {items.length > 3 && (
                      <span className="px-1 text-[9px] font-medium text-slate-400">+{items.length - 3} more</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {undated > 0 && (
            <p className="mt-3 text-center text-xs text-slate-400">
              {undated} item{undated > 1 ? 's' : ''} without a {dateField.replace('_', ' ')} date hidden
            </p>
          )}

          {byDay.size === 0 && (
            <EmptyState icon={CalendarDays} title="Nothing scheduled" subtitle="No items fall in this view." />
          )}
        </>
      )}

      {/* Day detail sheet (works on mobile + desktop) */}
      {openDay && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center" role="dialog" aria-modal="true">
          <button
            aria-label="Close"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpenDay(null)}
          />
          <div className="relative max-h-[75vh] w-full overflow-y-auto rounded-t-3xl bg-slate-100 dark:bg-slate-900 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 shadow-2xl sm:max-w-lg sm:rounded-3xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">{humanDay(openDay)}</h3>
              <button
                onClick={() => setOpenDay(null)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 active:bg-slate-200 dark:active:bg-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-2.5">
              {dayTodos.map((t) => (
                <TodoCard key={t.name} todo={t} showAssignee={scope !== 'my'} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Which calendar days a todo occupies given the active toggles.
function daysFor(t: ProjectItem, field: DateField, split: boolean): string[] {
  if (split) {
    const allocDays = (t.allocations ?? []).map((a) => a.date).filter(Boolean)
    if (allocDays.length) return Array.from(new Set(allocDays))
  }
  const d = t[field]
  return d ? [d] : []
}

function humanDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
