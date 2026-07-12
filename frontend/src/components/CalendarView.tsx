import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, X, CalendarDays, Users, MapPin, Clock } from 'lucide-react'
import clsx from 'clsx'
import { useNavigate } from 'react-router-dom'
import { TodoCard } from '@/components/TodoCard'
import { MeetingSheet } from '@/components/MeetingSheet'
import { Segmented, EmptyState, FullScreenLoader } from '@/components/ui'
import { useCalendar, useMeetings, useBookings, useProjects, useBoot } from '@/hooks/useData'
import { STATUS, STATUS_ORDER } from '@/lib/status'
import { formatEstimate } from '@/lib/format'
import type { ProjectItem, MeetingListItem, Booking, ProjectCard } from '@/lib/types'

// The lens the calendar is showing. Each mode buckets a different source of
// dated things onto the month grid and sums a per-day estimate.
type Mode = 'assigned' | 'plan' | 'meeting' | 'booking' | 'project'

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'assigned', label: 'Assigned' },
  { value: 'plan', label: 'My Plan' },
  { value: 'meeting', label: 'Meetings' },
  { value: 'booking', label: 'Bookings' },
  { value: 'project', label: 'Projects' },
]

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
// Monday-first weekday headers.
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// A single dated thing on the grid. `minutes` feeds the per-day estimate total.
type CalItem =
  | { kind: 'todo'; day: string; minutes: number; color: string; label: string; todo: ProjectItem }
  | { kind: 'meeting'; day: string; minutes: number; color: string; label: string; meeting: MeetingListItem }
  | { kind: 'booking'; day: string; minutes: number; color: string; label: string; booking: Booking }
  | { kind: 'project'; day: string; minutes: number; color: string; label: string; project: ProjectCard }

const BOOKING_COLOR = 'bg-violet-500'
const PROJECT_COLOR = 'bg-rose-500'

// Meeting chips are colored by how I'm involved: organizing, invited, or just
// observing (visible via the project but not on the invite list).
const MEETING_INVOLVEMENT = {
  organizer: { color: 'bg-emerald-500', label: 'Meeting · organizer' },
  participant: { color: 'bg-sky-500', label: 'Meeting · invited' },
  observer: { color: 'bg-slate-400', label: 'Meeting · observing' },
} as const
type Involvement = keyof typeof MEETING_INVOLVEMENT
function meetingInvolvement(m: MeetingListItem, me: string): Involvement {
  if (m.organizer === me) return 'organizer'
  if (m.participants.includes(me)) return 'participant'
  return 'observer'
}
const meetingColor = (m: MeetingListItem, me: string) => MEETING_INVOLVEMENT[meetingInvolvement(m, me)].color

const pad = (n: number) => String(n).padStart(2, '0')
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
// Frappe datetime 'YYYY-MM-DD HH:MM:SS' -> Date (local).
const parseDT = (s: string) => new Date(s.replace(' ', 'T'))

function todoColor(t: ProjectItem): string {
  if (t.is_overdue && t.status_key !== 'completed') return 'bg-rose-400'
  return STATUS[t.status_key].dot
}

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

// Self-contained calendar (mode toggle + month grid + day sheet). No page shell —
// each platform wraps it in its own chrome (mobile DetailScreen / web AppShell).
// `fluid` drops the centered 768px cap so the web page can fill its column.
export function CalendarView({ fluid = false }: { fluid?: boolean } = {}) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>(() => persisted('cal.mode', 'assigned'))
  const setModeP = (v: Mode) => { setMode(v); persist('cal.mode', v) }

  // Only fetch the source the active mode needs (react-query dedupes across
  // pages, so these are cheap when already warm).
  const calendar = useCalendar()
  const meetings = useMeetings()
  const bookings = useBookings()
  const projects = useProjects()
  const me = useBoot().data?.user ?? ''

  const isLoading =
    (mode === 'assigned' || mode === 'plan') ? calendar.isLoading
    : mode === 'meeting' ? meetings.isLoading
    : mode === 'booking' ? bookings.isLoading
    : projects.isLoading

  const now = new Date()
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [openMeeting, setOpenMeeting] = useState<MeetingListItem | null>(null)

  // Build every CalItem for the active mode, then bucket onto days + sum minutes.
  const { byDay, estByDay, undated } = useMemo(() => {
    const items = buildItems(mode, {
      todos: calendar.data?.todos ?? [],
      meetings: meetings.data?.meetings ?? [],
      bookings: bookings.data ?? [],
      projects: projects.data ?? [],
    }, me)
    const map = new Map<string, CalItem[]>()
    const est = new Map<string, number>()
    let undatedCount = 0
    for (const it of items) {
      if (!it.day) { undatedCount++; continue }
      const arr = map.get(it.day)
      if (arr) arr.push(it)
      else map.set(it.day, [it])
      est.set(it.day, (est.get(it.day) ?? 0) + (it.minutes || 0))
    }
    return { byDay: map, estByDay: est, undated: undatedCount }
  }, [mode, calendar.data, meetings.data, bookings.data, projects.data, me])

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

  const legend = legendFor(mode)
  const showEstimates = mode !== 'project' // projects carry no minute estimate
  const dayItems = openDay ? byDay.get(openDay) ?? [] : []

  return (
    <div className={fluid ? 'w-full' : 'mx-auto max-w-3xl'}>
      {/* Mode selector */}
      <div className="mb-4">
        <Segmented<Mode> value={mode} onChange={setModeP} options={MODE_OPTIONS} scroll />
      </div>

      {/* Legend: what the day-cell chip colors mean */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {legend.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
            <span className={clsx('h-2.5 w-2.5 rounded-sm', l.color)} />
            {l.label}
          </span>
        ))}
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

      {isLoading ? (
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
              const est = estByDay.get(c.key) ?? 0
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
                  {/* Header row: per-day estimate total (left) + date number (right) */}
                  <div className="mb-0.5 flex items-center justify-between">
                    {showEstimates && est > 0 ? (
                      <span className="rounded bg-slate-100 dark:bg-slate-700 px-1 text-[9px] font-semibold leading-tight text-slate-500 dark:text-slate-300">
                        {formatEstimate(est)}
                      </span>
                    ) : (
                      <span />
                    )}
                    <span
                      className={clsx(
                        'text-[11px] font-semibold leading-none',
                        isToday
                          ? 'flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white'
                          : c.inMonth
                            ? 'text-slate-600 dark:text-slate-300'
                            : 'text-slate-300 dark:text-slate-600',
                      )}
                    >
                      {c.date.getDate()}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {items.slice(0, 3).map((it, i) => (
                      <span
                        key={i}
                        className={clsx(
                          'truncate rounded px-1 py-0.5 text-[9px] font-medium leading-tight text-white',
                          it.color,
                        )}
                        title={it.label}
                      >
                        {it.label}
                      </span>
                    ))}
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
              {undated} item{undated > 1 ? 's' : ''} without a date hidden
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
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">{humanDay(openDay)}</h3>
                {showEstimates && (estByDay.get(openDay) ?? 0) > 0 && (
                  <p className="text-xs text-slate-500">Total estimate {formatEstimate(estByDay.get(openDay) ?? 0)}</p>
                )}
              </div>
              <button
                onClick={() => setOpenDay(null)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 active:bg-slate-200 dark:active:bg-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-2.5">
              {dayItems.map((it, i) => (
                <DayRow key={i} item={it} me={me} navigate={navigate} onClose={() => setOpenDay(null)} onOpenMeeting={setOpenMeeting} />
              ))}
            </div>
          </div>
        </div>
      )}

      <MeetingSheet meeting={openMeeting} onClose={() => setOpenMeeting(null)} />
    </div>
  )
}

// One row in the day sheet, rendered per item kind.
function DayRow({
  item,
  me,
  navigate,
  onClose,
  onOpenMeeting,
}: {
  item: CalItem
  me: string
  navigate: (to: string) => void
  onClose: () => void
  onOpenMeeting: (m: MeetingListItem) => void
}) {
  if (item.kind === 'todo') {
    return <TodoCard todo={item.todo} showAssignee={false} />
  }
  if (item.kind === 'meeting') {
    const m = item.meeting
    const inv = MEETING_INVOLVEMENT[meetingInvolvement(m, me)]
    return (
      <button
        onClick={() => onOpenMeeting(m)}
        className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-left active:scale-[0.99]"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 flex-1 truncate font-semibold text-slate-900 dark:text-slate-50">{m.title}</span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-slate-500">
            <span className={clsx('h-2 w-2 rounded-full', inv.color)} />
            {inv.label.replace('Meeting · ', '')}
          </span>
        </div>
        <div className="mt-0.5 text-right text-[11px] text-slate-400">{m.status}</div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          {m.scheduled_at && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{timeOf(m.scheduled_at)}</span>}
          <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{m.participants.length}</span>
          {m.estimated > 0 && <span>{formatEstimate(m.estimated)}</span>}
        </div>
      </button>
    )
  }
  if (item.kind === 'booking') {
    const b = item.booking
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-900 dark:text-slate-50">{b.title}</span>
          <span className="text-xs text-slate-500">{b.status}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{timeOf(b.start)}–{timeOf(b.end)}</span>
          {b.room && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{b.room}</span>}
        </div>
      </div>
    )
  }
  // project deadline
  const p = item.project
  return (
    <button
      onClick={() => { onClose(); navigate(`/project/${encodeURIComponent(p.name)}`) }}
      className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-left active:scale-[0.98]"
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-900 dark:text-slate-50">{p.project_name}</span>
        <span className="text-xs text-slate-500">{p.status}</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">Deadline · {p.leader_name || p.owner_name}</p>
    </button>
  )
}

// Turn the active mode's source data into a flat CalItem list.
function buildItems(
  mode: Mode,
  src: { todos: ProjectItem[]; meetings: MeetingListItem[]; bookings: Booking[]; projects: ProjectCard[] },
  me: string,
): CalItem[] {
  const out: CalItem[] = []
  if (mode === 'assigned' || mode === 'plan') {
    // Personal lens: only my tasks. Assigned = leader's authoritative split;
    // Plan = my own day-plan. Both fall back to the deadline when unsplit.
    const mine = src.todos.filter((t) => t.is_mine && t.status_key !== 'completed' && t.status_key !== 'cancelled')
    for (const t of mine) {
      const rows = mode === 'assigned' ? (t.assigned_allocation ?? []) : (t.allocations ?? [])
      const days = rows.filter((r) => r.date)
      if (days.length) {
        for (const r of days) {
          out.push({ kind: 'todo', day: r.date, minutes: r.minutes || 0, color: todoColor(t), label: t.to_do, todo: t })
        }
      } else if (t.deadline) {
        // No split recorded — place the whole estimate on the deadline.
        out.push({ kind: 'todo', day: t.deadline, minutes: t.estimated || 0, color: todoColor(t), label: t.to_do, todo: t })
      } else {
        out.push({ kind: 'todo', day: '', minutes: 0, color: todoColor(t), label: t.to_do, todo: t })
      }
    }
    // My meetings live on the same personal calendar — a meeting I organize or
    // am invited to shows alongside my tasks on its scheduled day.
    for (const m of src.meetings) {
      if (!m.scheduled_at) continue
      if (m.organizer !== me && !m.participants.includes(me)) continue
      out.push({ kind: 'meeting', day: m.scheduled_at.slice(0, 10), minutes: m.estimated || 0, color: meetingColor(m, me), label: m.title, meeting: m })
    }
  } else if (mode === 'meeting') {
    for (const m of src.meetings) {
      out.push({
        kind: 'meeting',
        day: m.scheduled_at ? m.scheduled_at.slice(0, 10) : '',
        minutes: m.estimated || 0,
        color: meetingColor(m, me),
        label: m.title,
        meeting: m,
      })
    }
  } else if (mode === 'booking') {
    for (const b of src.bookings) {
      if (b.status === 'Cancelled') continue
      // ponytail: multi-day bookings count on the start day only. Split per-day if that ever matters.
      const mins = Math.max(0, Math.round((parseDT(b.end).getTime() - parseDT(b.start).getTime()) / 60000))
      out.push({ kind: 'booking', day: b.start.slice(0, 10), minutes: mins, color: BOOKING_COLOR, label: b.title, booking: b })
    }
  } else {
    for (const p of src.projects) {
      out.push({ kind: 'project', day: p.deadline ?? '', minutes: 0, color: PROJECT_COLOR, label: p.project_name, project: p })
    }
  }
  return out
}

function legendFor(mode: Mode): { color: string; label: string }[] {
  if (mode === 'assigned' || mode === 'plan') {
    // personal lens only surfaces meetings I organize or am invited to
    return [
      ...STATUS_ORDER.map((k) => ({ color: STATUS[k].dot, label: STATUS[k].label })),
      { color: 'bg-rose-400', label: 'Overdue' },
      MEETING_INVOLVEMENT.organizer,
      MEETING_INVOLVEMENT.participant,
    ]
  }
  if (mode === 'meeting') return [MEETING_INVOLVEMENT.organizer, MEETING_INVOLVEMENT.participant, MEETING_INVOLVEMENT.observer]
  if (mode === 'booking') return [{ color: BOOKING_COLOR, label: 'Reservation' }]
  return [{ color: PROJECT_COLOR, label: 'Project deadline' }]
}

function timeOf(dt: string): string {
  const d = parseDT(dt)
  if (isNaN(d.getTime())) return dt
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
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
