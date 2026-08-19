import { useEffect, useMemo, useState, type ReactNode, type ComponentType } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import {
  Sparkles, Plus, Gift, ShieldCheck, CheckCheck, CalendarClock,
  Flame, QrCode, Pause, Search, X, Clock, CalendarDays, CalendarOff, CalendarArrowUp,
  SearchX, AlertTriangle, Wand2, ChevronRight, Heart, LayoutList, AtSign,
} from 'lucide-react'
import { valueOfDay } from '@/lib/values'
import { verseTheme, verseCardStyle } from '@/lib/verseTheme'
import { ValuesWelcome } from '@web/components/ValuesWelcome'
import CheerPop from '@/components/CheerPop'
import {
  useBoot, useDashboard, useWallet, useGamification, useMyAttendance,
  useMeetings, useWeeklyRecap, useClaimDaily, useDailyVerse, useHomeBanners,
  usePreviousShiftShortfall, useUnreadMentions, useMarkRead,
} from '@/hooks/useData'
import { deepLink } from '@/lib/notifications'
import { useFocusedTaskIds } from '@/hooks/useFocusTimer'
import { formatEstimate, todayISO, byAllocationAsc, byDeadlineAsc, byDeadlineDesc } from '@/lib/format'
import { focusedFirst } from '@/lib/planDay'
import { ACTION_GROUPS, GROUP_ACCENT, MOBILE_ONLY, type ActionItem } from '@/lib/actions'
import { useHoldFeedback } from '@/hooks/useHoldFeedback'
import { MeetingReminder, upcomingMeetings } from '@/components/MeetingReminder'
import { MeetingSheet } from '@/components/MeetingSheet'
import { TodoCard } from '@/components/TodoCard'
import { ListProgress, ListSummary } from '@web/components/PlanList'
import { Segmented, EmptyState } from '@/components/ui'
import { Page, rise } from '@web/components/Page'
import { Button, ErrorState, Skeleton } from '@web/components/ui'
import { AutoPlanProgress } from '@/components/AutoPlanProgress'
import { useAutoPlanToday, useAutoFillPlan, useMoveYesterdayToToday } from '@/hooks/usePlanDay'
import { QuickCreate } from '@web/components/QuickCreate'
import { DatePicker } from '@web/components/DatePicker'
import { ThreeColProjectList } from '@web/components/ProjectColumns'
import type { ProjectItem, BannerSlide, MeetingListItem } from '@/lib/types'

// ── small building blocks ─────────────────────────────────────────────────────

const ACCENT: Record<string, string> = {
  rose: 'text-rose-600 dark:text-rose-400',
  amber: 'text-amber-600 dark:text-amber-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  violet: 'text-violet-600 dark:text-violet-400',
  brand: 'text-brand-600 dark:text-brand-400',
  ink: 'text-ink',
}

// Accent → soft tile fill + icon-chip fill. Shared by QueueRow / MiniStat so every
// accented block (rose overdue, amber review, violet points…) reads as one system.
const TINT: Record<string, { tile: string; chip: string }> = {
  rose: { tile: 'bg-rose-50 dark:bg-rose-500/10', chip: 'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300' },
  amber: { tile: 'bg-amber-50 dark:bg-amber-500/10', chip: 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300' },
  emerald: { tile: 'bg-emerald-50 dark:bg-emerald-500/10', chip: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300' },
  violet: { tile: 'bg-violet-50 dark:bg-violet-500/10', chip: 'bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300' },
  brand: { tile: 'bg-brand-50 dark:bg-brand-500/10', chip: 'bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300' },
  ink: { tile: 'bg-surface', chip: 'bg-paper-line text-muted dark:bg-slate-800 dark:text-slate-300' },
}

// deepLink routes for /w (mirrors NotificationSheet). Mentions resolve to the
// commented doc; the cuti routes only satisfy the shared signature.
const ROUTES = {
  exceptionApprovals: '/attendance/my-approvals',
  myExceptions: '/attendance/my-requests',
  hrExceptions: '/attendance/exceptions',
}

// Small uppercase zone label — gives the long dashboard scannable rhythm.
function SectionHead({ children }: { children: ReactNode }) {
  return <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">{children}</h2>
}

// Compact queue row — icon chip + label (+ sub), count as the hero on the right.
// Fits the narrow "Queues" dashboard column where the big tile stacks far too tall.
function QueueRow({
  label, value, sub, accent = 'ink', icon: Icon, to, onClick, active,
}: {
  label: string; value: ReactNode; sub?: ReactNode; accent?: keyof typeof ACCENT
  icon?: ComponentType<{ className?: string }>; to?: string; onClick?: () => void; active?: boolean
}) {
  const t = TINT[accent] ?? TINT.ink
  const clickable = !!(to || onClick)
  const cls = clsx(
    'group flex items-center gap-2.5 rounded-lg p-2 text-left transition', t.tile,
    active && 'ring-1 ring-brand-500',
    clickable && 'hover:-translate-y-0.5 active:scale-[0.99]',
  )
  const inner = (
    <>
      {Icon && (
        <span className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', t.chip)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{label}</span>
      {sub != null && <span className="shrink-0 truncate text-[11px] font-medium text-muted">{sub}</span>}
      <span className={clsx('shrink-0 font-display text-xl font-semibold tabular-nums leading-none', ACCENT[accent])}>{value}</span>
    </>
  )
  if (to) return <Link to={to} className={cls}>{inner}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={clsx(cls, 'w-full')}>{inner}</button>
  return <div className={cls}>{inner}</div>
}

// Today-momentum ring for the hero — done-minutes as a proportion of the day's
// plate (done + still planned). Instant "how's my day" feedback on landing, so
// the user doesn't have to scroll to the in-list progress header to feel it.
function TodayRing({ pct, doneCount, doneMin }: { pct: number; doneCount: number; doneMin: number }) {
  const R = 26
  const C = 2 * Math.PI * R
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative h-16 w-16 shrink-0">
        <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden>
          <circle cx="32" cy="32" r={R} fill="none" strokeWidth="6" className="stroke-black/[0.07] dark:stroke-white/[0.10]" />
          <circle
            cx="32" cy="32" r={R} fill="none" strokeWidth="6" strokeLinecap="round"
            className="stroke-brand-500 transition-[stroke-dashoffset] duration-700"
            strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center font-display text-sm font-bold tabular-nums text-ink">
          {pct}%
        </div>
      </div>
      <div className="hidden leading-tight sm:block">
        <div className="text-sm font-semibold tabular-nums text-ink">{doneCount} done</div>
        <div className="text-xs text-muted">{doneMin > 0 ? `${formatEstimate(doneMin)} today` : 'today'}</div>
      </div>
    </div>
  )
}

// Soft-pop section container (meetings / attendance / this-week / verse).
function Card({
  title, icon: Icon, to, action, className, children,
}: {
  title?: string; icon?: ComponentType<{ className?: string }>; to?: string
  action?: ReactNode; className?: string; children: ReactNode
}) {
  const heading = title && (
    <div className="flex min-w-0 items-center gap-2">
      {Icon && <Icon className="h-4 w-4 shrink-0 text-muted" />}
      {to
        ? <Link to={to} className="truncate text-base font-semibold text-ink hover:text-brand-600">{title}</Link>
        : <h2 className="truncate text-base font-semibold text-ink">{title}</h2>}
    </div>
  )
  return (
    <div className={clsx('rounded-2xl border border-line bg-surface p-4', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {heading}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

// Home work view: axis (Plan/Deadline/Waiting) + sub-tab within Plan/Deadline. Mobile Today parity.
type Axis = 'plan' | 'deadline' | 'waiting'
type PlanSub = 'today' | 'past' | 'upcoming'
type DeadlineSub = 'today' | 'overdue' | 'upcoming'

// Does any of a todo's day-allocations satisfy pred? Drives the Plan-axis buckets.
const allocOn = (t: ProjectItem, pred: (d: string) => boolean) =>
  (t.allocations ?? []).some((a) => a.date != null && pred(a.date))


// Shortcut tiles — shared ACTION_GROUPS rendered as tinted category sections of
// gradient tiles (web-styled wrapping grid; the mobile /m app scrolls each row).
function ShortcutGrid() {
  // Tabbed groups: only the active category's tiles render, so the block stays
  // one row tall and "Your work" sits higher. Group headers become the tabs.
  const [tab, setTab] = useState(0)
  const groups = ACTION_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((a) => !MOBILE_ONLY.has(a.to.split('?')[0])) }))
    .filter((g) => g.items.length)
  const active = groups[Math.min(tab, groups.length - 1)]
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
        <Sparkles className="h-4 w-4" /> Shortcuts
      </h2>
      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 border-b border-line">
        {groups.map((g, i) => (
          <button
            key={g.title}
            type="button"
            onClick={() => setTab(i)}
            className={clsx(
              '-mb-px flex items-center gap-1.5 border-b-2 pb-2 text-xs font-bold uppercase tracking-wider transition',
              i === Math.min(tab, groups.length - 1)
                ? clsx('border-current', GROUP_ACCENT[g.hue])
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {g.title}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12">
        {active.items.map((a) => (
          <ShortcutTile key={a.title} action={a} tile={active.tile} />
        ))}
      </div>
    </div>
  )
}

// Tap navigates; long-press (touch) plays a press-in + pop and swallows the
// trailing click, matching the mobile QuickActions tiles. Hover lifts the tile.
function ShortcutTile({ action: a, tile }: { action: ActionItem; tile: string }) {
  const navigate = useNavigate()
  const hold = useHoldFeedback()
  return (
    <button
      type="button"
      onClick={() => {
        if (hold.longFired.current) { hold.longFired.current = false; return }
        navigate(a.to)
      }}
      {...hold.bind}
      className="group flex flex-col items-center gap-1.5 transition active:scale-95"
    >
      <span
        style={{ transform: hold.holding ? 'scale(0.9)' : hold.fired ? 'scale(1.12)' : undefined }}
        className={clsx(
          'relative flex h-12 w-12 items-center justify-center rounded-2xl transition-transform group-hover:-translate-y-0.5',
          tile,
          hold.holding && 'ring-2 ring-white/80',
        )}
      >
        <a.icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <span className="w-full truncate text-center text-xs font-semibold text-muted">{a.short}</span>
    </button>
  )
}

// Stat-chip sub-tabs — the count is the hero, colored by urgency (today=indigo,
// overdue=red, past=amber, upcoming=slate). Doubles as a mini KPI strip you tap
// to filter. Replaces the flat segmented sub-tabs on the Plan/Deadline axes.
const STAT_TONE = {
  brand: { on: 'border-brand-400 dark:border-brand-500/50', bar: 'bg-brand-500', num: 'text-brand-600 dark:text-brand-400' },
  rose: { on: 'border-rose-400 dark:border-rose-500/50', bar: 'bg-rose-500', num: 'text-rose-600 dark:text-rose-400' },
  amber: { on: 'border-amber-400 dark:border-amber-500/50', bar: 'bg-amber-500', num: 'text-amber-600 dark:text-amber-400' },
  slate: { on: 'border-slate-400 dark:border-slate-500/50', bar: 'bg-slate-400', num: 'text-ink' },
} as const

function StatTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string; count: number; tone: keyof typeof STAT_TONE; icon: ComponentType<{ className?: string }> }[]
  value: T
  onChange: (k: T) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {tabs.map((t) => {
        const on = t.key === value
        const c = STAT_TONE[t.tone]
        const Icon = t.icon
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={clsx(
              'relative overflow-hidden rounded-xl border bg-surface p-2.5 text-left transition active:scale-[0.98]',
              on ? c.on : 'border-line hover:border-muted/40',
            )}
          >
            <span className={clsx('absolute inset-y-0 left-0 w-1', on ? c.bar : 'bg-transparent')} />
            <span className={clsx('block pl-1 text-xl font-extrabold leading-none tabular-nums', on ? c.num : 'text-muted')}>{t.count}</span>
            <span className={clsx('mt-1.5 flex items-center gap-1 pl-1 text-xs font-semibold', on ? 'text-ink' : 'text-muted')}>
              <Icon className="h-3 w-3" />
              {t.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── skeleton ──────────────────────────────────────────────────────────────────

function HomeSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-3xl" />)}
      </div>
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  )
}

// Friendly label for the shortfall banner's day (ISO 'YYYY-MM-DD').
function shortfallDateLabel(iso: string | null) {
  if (!iso) return 'Your last shift'
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

// Managed promo banners. ponytail: the mobile BannerCarousel is coupled to the
// mobile layout (-mx-4 full-bleed + aspect-16/7 → ~600px tall on the desktop
// shell), so a constrained web strip is the sanctioned "simple web carousel".
function WebBanners({ slides }: { slides: BannerSlide[] }) {
  const navigate = useNavigate()
  const [idx, setIdx] = useState(0)
  if (!slides.length) return null
  const go = (link: string) => {
    if (!link) return
    if (link.startsWith('/')) navigate(link)
    else window.open(link, '_blank', 'noopener')
  }
  return (
    <div className="relative max-w-3xl overflow-hidden rounded-2xl border border-line">
      <div
        onScroll={(e) => setIdx(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((s, k) => (
          <button
            key={s.image + k}
            type="button"
            onClick={() => go(s.link)}
            disabled={!s.link}
            className="relative block aspect-[16/5] w-full shrink-0 snap-center overflow-hidden bg-line"
          >
            <img src={s.image} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="pointer-events-none absolute bottom-2.5 left-1/2 flex -translate-x-1/2 gap-1.5">
          {slides.map((sl, k) => (
            <span key={sl.image + k} className={clsx('h-1.5 rounded-full transition-all', k === idx ? 'w-4 bg-white' : 'w-1.5 bg-white/55')} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── page ────────────────────────────────────────────────────────────────────

export default function Home() {
  const boot = useBoot()
  const dash = useDashboard()
  const wallet = useWallet()
  const gam = useGamification()
  const attendance = useMyAttendance()
  const meetings = useMeetings()
  const recap = useWeeklyRecap()
  const { data: verse } = useDailyVerse()
  const claim = useClaimDaily()
  const [openMeeting, setOpenMeeting] = useState<MeetingListItem | null>(null)
  const banners = useHomeBanners()
  const shortfall = usePreviousShiftShortfall()
  const mentions = useUnreadMentions()
  const markRead = useMarkRead()
  const navigate = useNavigate()

  const [axis, setAxis] = useState<Axis>('plan')
  const [planSub, setPlanSub] = useState<PlanSub>('today')
  const [deadlineSub, setDeadlineSub] = useState<DeadlineSub>('today')
  const [pickedDate, setPickedDate] = useState('')
  const [query, setQuery] = useState('')
  const [quickOpen, setQuickOpen] = useState(false)
  const autoFill = useAutoFillPlan()
  const moveYesterday = useMoveYesterdayToToday()

  const allTasks: ProjectItem[] = useMemo(() => {
    const d = dash.data
    return d ? [...d.overdue, ...d.due_today, ...d.upcoming] : []
  }, [dash.data])

  const focusedIds = useFocusedTaskIds()
  const activeTodos = useMemo(() => allTasks.filter((t) => !t.is_waiting), [allTasks])
  const filteredActive = activeTodos

  // Plan-axis buckets by allocation date: today / past (slipped, still planned) /
  // upcoming. Mutually exclusive, precedence Today > Past > Upcoming (mobile parity).
  const todayStr = todayISO()
  const planGroups = useMemo(() => {
    const isToday = (t: ProjectItem) => allocOn(t, (d) => d === todayStr)
    const isPast = (t: ProjectItem) => allocOn(t, (d) => d < todayStr)
    return {
      today: focusedFirst(filteredActive.filter(isToday).slice().sort(byAllocationAsc), focusedIds),
      past: filteredActive.filter((t) => !isToday(t) && isPast(t)).slice().sort(byDeadlineAsc),
      upcoming: filteredActive
        .filter((t) => !isToday(t) && !isPast(t) && allocOn(t, (d) => d > todayStr))
        .slice()
        .sort(byDeadlineAsc),
    }
  }, [filteredActive, todayStr, focusedIds])
  const planPicked = useMemo(
    () => (pickedDate ? filteredActive.filter((t) => allocOn(t, (d) => d === pickedDate)).slice().sort(byAllocationAsc) : []),
    [filteredActive, pickedDate],
  )
  const plannedTodayMin = planGroups.today.reduce((s, t) => s + (t.today_allocation || 0), 0)

  // Silent auto-plan toward the daily minimum (same logic as Auto-plan button).
  useAutoPlanToday({ due_today: dash.data?.due_today, overdue: dash.data?.overdue, upcoming: dash.data?.upcoming })

  // KPI tiles jump to the "For me" Deadline axis on a given sub-tab.
  const goDeadline = (sub: DeadlineSub) => {
    setAxis('deadline')
    setDeadlineSub(sub)
    setPickedDate('')
    setTimeout(() => document.getElementById('my-work')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  if (!dash.data) {
    return dash.isError ? <ErrorState onRetry={() => dash.refetch()} /> : <HomeSkeleton />
  }

  const d = dash.data
  const counts = d.counts
  const b = boot.data

  // is_waiting todos are parked — excluded from the active work lists and surfaced
  // only in their own Waiting axis.
  const overdueActive = d.overdue.filter((t) => !t.is_waiting)
  const dueTodayActive = d.due_today.filter((t) => !t.is_waiting)
  const upcomingActive = d.upcoming.filter((t) => !t.is_waiting)
  const waiting = allTasks.filter((t) => t.is_waiting)

  // Deadline-axis lists (filter → sort). Overdue newest-first (byDeadlineDesc); the
  // rest nearest-first. Waiting parked list sorted by deadline.
  const deadlineLists: Record<DeadlineSub, ProjectItem[]> = {
    today: dueTodayActive.slice().sort(byDeadlineAsc),
    overdue: overdueActive.slice().sort(byDeadlineDesc),
    upcoming: upcomingActive.slice().sort(byDeadlineAsc),
  }
  const waitingList = waiting.slice().sort(byDeadlineAsc)

  // Shared list renderer. Column 1 = the current sorted flat list. Columns 2-3 =
  // the same todos re-grouped by project (a SearchableSelect focuses one project)
  // so you can work a single project at once. Free-text search applies to both.
  const q = query.trim().toLowerCase()
  const renderList = (list: ProjectItem[], emptyTitle: string, emptySub?: string) => {
    const shown = q
      ? list.filter((t) => `${t.to_do} ${t.project_name} ${t.project_detail_title}`.toLowerCase().includes(q))
      : list
    if (!shown.length) {
      if (q) return <EmptyState icon={SearchX} title={`No matches for "${query.trim()}"`} subtitle="Try a different search." />
      return (
        <EmptyState
          icon={emptyTitle === 'Nothing waiting' ? Pause : Sparkles}
          title={emptyTitle}
          subtitle={emptySub ?? 'No tasks in this view.'}
        />
      )
    }
    return (
      <div className="mt-3">
        <ThreeColProjectList
          items={shown}
          storageKey="home"
          renderCard={(t, i) => (
            <div key={t.name} {...rise(i)}>
              <TodoCard todo={t} />
            </div>
          )}
        />
      </div>
    )
  }

  // Total estimated minutes across a list — feeds the summary strips.
  const sumEst = (l: ProjectItem[]) => l.reduce((s, t) => s + (t.estimated || 0), 0)
  // Day-progress header (minutes done today vs. what's still on the plate). Used
  // above any "today"-scoped list (Plan · Today and Deadline · Today). Returns
  // null when there's nothing to show yet.
  const dayProgressHeader = (leftMin: number, toGo: number) => {
    const done = counts.completed_minutes_today
    const total = done + leftMin
    if (!total && !counts.completed_today) return null
    return (
      <ListProgress
        title="Today's progress"
        note={`${counts.completed_today} done · ${toGo} to go`}
        pct={total ? Math.round((done / total) * 100) : 100}
        doneText={done > 0 ? `${formatEstimate(done)} done` : 'nothing done yet'}
        leftText={leftMin > 0 ? `${formatEstimate(leftMin)} left` : "today's plan clear"}
      />
    )
  }

  const today = todayISO()
  // next 10 un-done meetings (today or later) you organize or are invited to drive the vibrant top reminder
  const upcoming = upcomingMeetings(meetings.data?.meetings ?? [], 10, boot.data?.user)

  // attendance — only surfaces when the module is actually in use for this user
  const attRows = attendance.data?.rows ?? []
  const attToday = attRows.find((r) => r.attendance_date === today) ?? attRows[0]

  const daily = gam.data?.daily
  const w = wallet.data
  const r = recap.data

  const needCount = counts.overdue + counts.due_today + counts.review

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  const firstName = (b?.full_name || '').trim().split(' ')[0]

  // Today momentum for the hero ring: done-minutes over the day's plate.
  const doneMinToday = counts.completed_minutes_today
  const todayTotalMin = doneMinToday + plannedTodayMin
  const todayPct = todayTotalMin ? Math.round((doneMinToday / todayTotalMin) * 100) : 0
  const showTodayRing = todayTotalMin > 0 || counts.completed_today > 0

  return (
    <Page className="space-y-6">
      <CheerPop />
      <ValuesWelcome />
      {/* First row — 4 columns: Hello + Ayat · Meetings · This week · Queues */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:items-stretch">
        {/* 1 · Hello + Ayat */}
        <div className="flex flex-col gap-3">
          <div className="rounded-3xl border border-line bg-gradient-to-br from-brand-50 via-surface to-surface p-4 dark:from-brand-500/10 dark:via-slate-900 dark:to-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">{dateStr}</p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-ink">{firstName ? `${greeting}, ${firstName}` : greeting}</h1>
            <p className="mt-1 text-sm text-muted">
              {needCount === 0
                ? `You're all caught up${daily?.streak ? ` — 🔥 ${daily.streak}-day streak` : ''}.${counts.upcoming > 0 ? '' : ' Enjoy the clear plate.'}`
                : `${needCount} thing${needCount === 1 ? '' : 's'} need you today.`}
            </p>
            {/* VernonCorp value of the day — quiet reminder of why we're here. */}
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-brand-600/80 dark:text-brand-400/80">
              <Heart className="h-3 w-3 shrink-0" fill="currentColor" /> {valueOfDay()}
            </p>
            <div className="mt-3 flex items-center gap-3">
              {showTodayRing && <TodayRing pct={todayPct} doneCount={counts.completed_today} doneMin={doneMinToday} />}
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {daily?.can_claim && (
                  <Button variant="secondary" size="sm" className="w-full" onClick={() => claim.mutate()} disabled={claim.isPending}>
                    <Gift className="h-4 w-4" /> Claim +{daily.claimable}
                  </Button>
                )}
                <Button variant="primary" size="sm" className="w-full" onClick={() => setQuickOpen(true)}>
                  <Plus className="h-4 w-4" /> New task
                </Button>
              </div>
            </div>
          </div>

          {/* Ayat — daily verse, themed by religion */}
          {verse && (() => {
            const vt = verseTheme(b?.employee?.religion)
            const VerseIcon = vt.Icon
            return (
              <div className="relative flex grow flex-col justify-center overflow-hidden rounded-3xl p-4 text-white ring-1 ring-white/15" style={verseCardStyle(vt)}>
                <VerseIcon aria-hidden strokeWidth={1.25} className="pointer-events-none absolute -bottom-10 -right-8 h-56 w-56 rotate-6 text-white/10" />
                <div className="relative">
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/20 px-2.5 py-1 backdrop-blur-sm">
                    <VerseIcon className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-bold uppercase tracking-wide">Ayat Hari Ini</span>
                  </div>
                  <p className="text-sm font-medium leading-relaxed drop-shadow-sm">&ldquo;{verse.text}&rdquo;</p>
                  <p className="mt-2 text-sm font-semibold text-white/85">— {verse.reference}</p>
                </div>
              </div>
            )
          })()}
        </div>

        {/* 2 · Meetings */}
        <MeetingReminder
          meetings={upcoming}
          onOpen={() => navigate('/meetings')}
          onOpenMeeting={setOpenMeeting}
          className="!mb-0 !shadow-none"
        />

        {/* 3 · This week */}
        <div className="flex flex-col rounded-3xl border border-line bg-surface p-3.5">
          <div className="mb-2.5 flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">This week</h2>
          </div>
          {r ? (
            <div className="grid flex-1 content-center grid-cols-2 gap-2.5">
              <MiniStat label="Completed" value={r.completed} accent="emerald" icon={CheckCheck} />
              <MiniStat label="Focused" value={formatEstimate(r.minutes)} accent="brand" icon={Clock} />
              <MiniStat label="Points" value={`+${r.points}`} accent="violet" icon={Sparkles} />
              <MiniStat label="Streak" value={r.streak} accent="amber" icon={Flame} />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center py-6 text-center text-sm text-muted">
              No activity yet this week.
            </div>
          )}
        </div>

        {/* 4 · Queues */}
        <div className="flex flex-col rounded-3xl border border-line bg-surface p-3.5">
          <div className="mb-2.5 flex items-center gap-2">
            <LayoutList className="h-4 w-4 text-muted" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Queues</h2>
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <QueueRow label="Overdue" value={counts.overdue} accent="rose" icon={AlertTriangle} active={axis === 'deadline' && deadlineSub === 'overdue'} onClick={() => goDeadline('overdue')} />
            <QueueRow label="Due today" value={counts.due_today} accent="brand" icon={Clock} active={axis === 'deadline' && deadlineSub === 'today'} onClick={() => goDeadline('today')} />
            <QueueRow label="Upcoming" value={counts.upcoming} icon={CalendarDays} active={axis === 'deadline' && deadlineSub === 'upcoming'} onClick={() => goDeadline('upcoming')} />
            <QueueRow label="To review" value={counts.review} accent="amber" icon={ShieldCheck} to="/review" />
            <QueueRow label="Done today" value={counts.completed_today} accent="emerald" icon={CheckCheck} sub={counts.completed_minutes_today > 0 ? formatEstimate(counts.completed_minutes_today) : undefined} />
            <QueueRow label="Points" value={w ? w.balance.toLocaleString() : '—'} accent="violet" icon={Sparkles} sub={w && w.today_earned ? `+${w.today_earned} today` : undefined} to="/wallet" />
            {b?.leave && <QueueRow label="Sisa cuti" value={b.leave.remaining} accent="rose" icon={CalendarOff} sub={`/ ${b.leave.quota} hari`} to="/attendance/cuti" />}
          </div>
        </div>
      </div>

      {/* Unread @-mentions — surfaced here so a mention can't be missed */}
      {mentions.data && mentions.data.count > 0 && (
        <div className="rounded-3xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-500/30 dark:bg-brand-500/10">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
              <AtSign className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">Mentions</p>
              <p className="text-sm font-semibold text-ink">
                {mentions.data.count} unread mention{mentions.data.count === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {mentions.data.items.map((m) => (
              <button
                key={m.name}
                onClick={() => { markRead.mutate(m.name); navigate(deepLink(m, ROUTES)) }}
                className="flex items-start gap-2 rounded-2xl border border-line bg-surface px-3 py-2.5 text-left transition hover:border-brand-300 hover:bg-brand-50/50 dark:hover:bg-brand-500/10"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{m.title}</span>
                  {m.subject && <span className="mt-0.5 block truncate text-xs text-muted">{m.subject}</span>}
                </span>
                <span className="shrink-0 text-[11px] text-muted">{m.at_human}</span>
              </button>
            ))}
          </div>
          {mentions.data.count > mentions.data.items.length && (
            <p className="mt-2.5 text-xs font-medium text-muted">
              +{mentions.data.count - mentions.data.items.length} more in the bell
            </p>
          )}
        </div>
      )}

      {/* Managed promo banners — from Settings → Home Banners */}
      <WebBanners slides={banners.data ?? []} />

      {/* DANGER: previous shift day fell below the daily-minimum minutes setting */}
      {shortfall.data?.under && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/30 dark:bg-rose-500/10">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Daily minimum missed</p>
            <p className="mt-0.5 text-sm text-rose-700/90 dark:text-rose-200/90">
              {shortfallDateLabel(shortfall.data.date)}: you planned only{' '}
              <span className="font-semibold">{formatEstimate(shortfall.data.assigned)}</span> of the{' '}
              <span className="font-semibold">{formatEstimate(shortfall.data.minimum)}</span> minimum —{' '}
              <span className="font-semibold">{formatEstimate(shortfall.data.minimum - shortfall.data.assigned)} short</span>.
            </p>
          </div>
        </div>
      )}


      {/* Shortcut tiles — mobile QuickActions parity */}
      <ShortcutGrid />

      <div className={clsx('space-y-6', attToday && 'xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start xl:gap-6 xl:space-y-0')}>
        <div className="min-w-0 space-y-6">
          <SectionHead>Your work</SectionHead>
          <div id="my-work" className="scroll-mt-4 space-y-4">
              {/* Work well — groups the toggle toolbar with its todo list in one recessed
                  tray so the two read as a single unit; the white cards float inside it. */}
              <div className="space-y-3 rounded-[1.75rem] border border-line bg-surface p-2.5 sm:p-3">
              {/* ---- Unified work toolbar: axis + search (top) · sub-tabs + Pick + filter (refine) ---- */}
              <div className="rounded-2xl border border-line bg-surface">
                {/* Top: axis (Plan · Deadline · Waiting) + inline search */}
                <div className="flex flex-col gap-2 p-2 sm:flex-row sm:items-center">
                  <div className="sm:shrink-0">
                    <Segmented
                      options={[
                        { value: 'plan', label: 'Plan' },
                        { value: 'deadline', label: 'Deadline' },
                        { value: 'waiting', label: 'Waiting', badge: waitingList.length || undefined },
                      ]}
                      value={axis}
                      onChange={(k) => {
                        setAxis(k)
                        if (k !== 'plan') setPickedDate('')
                      }}
                    />
                  </div>
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search tasks…"
                      aria-label="Search tasks"
                      className="w-full rounded-xl border border-transparent bg-paper-line/50 py-2 pl-9 pr-9 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:bg-surface focus:outline-none dark:bg-slate-800/60"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery('')}
                        aria-label="Clear search"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Refine row — sub-tabs live only on Plan/Deadline; also hosts Pick (Plan) + the
                    filter, which acts on exactly these two lists (Waiting is unfiltered). */}
                {axis !== 'waiting' && (
                  <div className="flex items-center gap-2 border-t border-line p-2">
                    <div className="min-w-0 flex-1">
                      {axis === 'plan' ? (
                        <StatTabs<PlanSub>
                          tabs={[
                            { key: 'today', label: 'Today', count: planGroups.today.length, tone: 'brand', icon: Clock },
                            { key: 'past', label: 'Past', count: planGroups.past.length, tone: 'amber', icon: CalendarOff },
                            { key: 'upcoming', label: 'Upcoming', count: planGroups.upcoming.length, tone: 'slate', icon: CalendarClock },
                          ]}
                          value={pickedDate ? ('' as PlanSub) : planSub}
                          onChange={(k) => {
                            setPlanSub(k)
                            setPickedDate('')
                          }}
                        />
                      ) : (
                        <StatTabs<DeadlineSub>
                          tabs={[
                            { key: 'today', label: 'Today', count: deadlineLists.today.length, tone: 'brand', icon: Clock },
                            { key: 'overdue', label: 'Overdue', count: deadlineLists.overdue.length, tone: 'rose', icon: AlertTriangle },
                            { key: 'upcoming', label: 'Upcoming', count: deadlineLists.upcoming.length, tone: 'slate', icon: CalendarClock },
                          ]}
                          value={deadlineSub}
                          onChange={setDeadlineSub}
                        />
                      )}
                    </div>
                    {axis === 'plan' && (
                      <DatePicker
                        value={pickedDate}
                        onChange={setPickedDate}
                        aria-label="Pick a plan day"
                        placeholder="Pick"
                        className={clsx(
                          'shrink-0 rounded-xl px-3 py-2 text-sm font-semibold transition active:scale-95',
                          pickedDate ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : 'bg-paper-line/60 text-muted dark:bg-slate-800',
                        )}
                      />
                    )}
                  </div>
                )}
              </div>

              {axis === 'plan' && (
                <>
                  {/* Plan-my-day CTA + Auto-plan — lives inside the Plan tab */}
                  <div className="flex items-stretch gap-2">
                    <button
                      type="button"
                      onClick={() => navigate('/plan')}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-brand-50 p-3.5 text-left transition active:scale-[0.99] dark:bg-brand-500/15"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
                        <Sparkles className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-brand-800 dark:text-brand-300">Plan my day</span>
                        <span className="block text-xs text-brand-600/80 dark:text-brand-300/70">
                          {plannedTodayMin > 0 ? `${formatEstimate(plannedTodayMin)} planned for today` : "Allocate minutes to today's tasks"}
                        </span>
                      </span>
                      <ChevronRight className="h-5 w-5 text-brand-400" />
                    </button>
                    <button
                      type="button"
                      onClick={() => autoFill.run({ due_today: d.due_today, overdue: d.overdue, upcoming: d.upcoming })}
                      disabled={autoFill.saving}
                      aria-label="Auto-plan my day"
                      className="flex w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-line bg-surface text-brand-700 transition active:scale-95 disabled:opacity-50 dark:text-brand-300"
                    >
                      <Wand2 className={clsx('h-5 w-5', autoFill.saving && 'animate-pulse')} />
                      <span className="text-xs font-semibold">{autoFill.saving ? 'Planning…' : 'Auto-plan'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => moveYesterday.run(filteredActive)}
                      disabled={moveYesterday.saving}
                      aria-label="Move yesterday's plan to today"
                      className="flex w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-line bg-surface text-brand-700 transition active:scale-95 disabled:opacity-50 dark:text-brand-300"
                    >
                      <CalendarArrowUp className={clsx('h-5 w-5', moveYesterday.saving && 'animate-pulse')} />
                      <span className="text-xs font-semibold">{moveYesterday.saving ? 'Moving…' : 'Carry over'}</span>
                    </button>
                  </div>

                  {pickedDate ? (
                    <p className="flex items-center gap-1.5 px-1 text-xs font-medium text-muted">
                      <CalendarDays className="h-3.5 w-3.5 text-brand-500" />
                      Plan for {pickedDate} · <span className="font-bold text-brand-600 dark:text-brand-400">{planPicked.length}</span>
                      <button onClick={() => setPickedDate('')} className="ml-1 font-semibold text-brand-600 underline dark:text-brand-400">
                        clear
                      </button>
                    </p>
                  ) : planSub === 'today' ? (
                    dayProgressHeader(plannedTodayMin, planGroups.today.length)
                  ) : null}

                  {renderList(
                    pickedDate ? planPicked : planGroups[planSub],
                    pickedDate ? `Nothing planned for ${pickedDate}` : `Nothing planned ${planSub}`,
                    planSub === 'today' && !pickedDate ? 'Hit "Plan my day" to allocate today.' : undefined,
                  )}
                </>
              )}

              {axis === 'deadline' && (
                <>
                  {deadlineSub === 'today' ? (
                    dayProgressHeader(sumEst(deadlineLists.today), deadlineLists.today.length)
                  ) : deadlineSub === 'overdue' ? (
                    <ListSummary count={deadlineLists.overdue.length} minutes={sumEst(deadlineLists.overdue)} label={deadlineLists.overdue.length === 1 ? 'task overdue' : 'tasks overdue'} alert />
                  ) : (
                    <ListSummary count={deadlineLists.upcoming.length} minutes={sumEst(deadlineLists.upcoming)} label={deadlineLists.upcoming.length === 1 ? 'task upcoming' : 'tasks upcoming'} />
                  )}
                  {renderList(
                    deadlineLists[deadlineSub],
                    deadlineSub === 'overdue' ? 'Nothing overdue' : deadlineSub === 'today' ? 'Nothing due today' : 'Nothing upcoming',
                  )}
                </>
              )}

              {axis === 'waiting' && (
                <>
                  <ListSummary count={waitingList.length} minutes={sumEst(waitingList)} label={waitingList.length === 1 ? 'task parked' : 'tasks parked'} />
                  {renderList(waitingList, 'Nothing waiting', 'No parked tasks.')}
                </>
              )}
              </div>
            </div>
        </div>

        {attToday && (
          <aside className="space-y-6">
            {/* Attendance — surfaces only when the module is in use (web extra, kept) */}
            <Card title="Attendance" icon={QrCode} to={canManage(b) ? '/attendance-report' : undefined}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">{attToday.status}</span>
                <span className="text-xs text-muted">
                  {attToday.first_scan ? `in ${attToday.first_scan.slice(11, 16)}` : 'no scan yet'}
                </span>
              </div>
              {(attToday.late_minutes > 0 || attToday.penalty_points !== 0) && (
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                  {attToday.late_minutes > 0 ? `${attToday.late_minutes}m late` : ''}
                  {attToday.penalty_points !== 0 ? `${attToday.late_minutes > 0 ? ' · ' : ''}${attToday.penalty_points} pts` : ''}
                </p>
              )}
            </Card>
          </aside>
        )}
      </div>

      <AutoPlanProgress open={autoFill.saving} summary={autoFill.summary} />
      <QuickCreate open={quickOpen} onClose={() => setQuickOpen(false)} />
      <MeetingSheet meeting={openMeeting} onClose={() => setOpenMeeting(null)} variant="modal" />
    </Page>
  )
}

function MiniStat({
  label, value, accent = 'ink', icon: Icon,
}: {
  label: string; value: ReactNode; accent?: keyof typeof ACCENT; icon?: ComponentType<{ className?: string }>
}) {
  const t = TINT[accent] ?? TINT.ink
  return (
    <div className={clsx('rounded-xl p-3', t.tile)}>
      {Icon && (
        <span className={clsx('mb-2 inline-flex h-7 w-7 items-center justify-center rounded-lg', t.chip)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      )}
      <div className={clsx('font-display text-xl font-semibold leading-none tabular-nums', ACCENT[accent])}>{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  )
}

// Attendance card only deep-links to the admin report for managers; regular
// members just see their status. Mirrors nav.ts gating without importing it.
function canManage(b: { roles: string[] } | null | undefined): boolean {
  return !!b && b.roles.includes('System Manager')
}
