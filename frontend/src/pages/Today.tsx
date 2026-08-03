import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import {
  AlertCircle,
  PartyPopper,
  SearchX,
  ChevronRight,
  CheckCheck,
  CalendarDays,
  CalendarOff,
  Clock,
  Coins,
  TrendingDown,
  Flame,
  Coffee,
  Sparkles,
  Wand2,
  Star,
  ArrowUpRight,
  Trophy,
  Ticket,
  Search,
  X,
  AlertTriangle,
  Heart,
} from 'lucide-react'
import { valueOfDay } from '@/lib/values'
import { verseTheme, verseCardStyle } from '@/lib/verseTheme'
import { ValuesWelcome } from '@/components/ValuesWelcome'
import { TabScreen, PullToRefresh } from '@/components/Layout'
import { TodoCard } from '@/components/TodoCard'
import { SwipeProjectLists } from '@/components/SwipeProjectLists'
import { Avatar, EmptyState, FullScreenLoader } from '@/components/ui'
import { NotificationBell } from '@/components/NotificationBell'
import { DiceBearAvatar } from '@/avatar/DiceBearAvatar'
import type { AvatarConfig } from '@/lib/types'
import { NotesButton } from '@/components/NotesButton'
import { RecapCard } from '@/components/RecapCard'
import { AutoPlanProgress } from '@/components/AutoPlanProgress'
import { useAutoPlanToday, useAutoFillPlan } from '@/hooks/usePlanDay'
import { Spotlight, type Slide } from '@/components/Spotlight'
import { QuickActions } from '@/components/QuickActions'
import { BannerCarousel } from '@/components/BannerCarousel'
import { useBoot, useDashboard, useWallet, useHomeBanners, useDailyVerse, usePreviousShiftShortfall, useMeetings } from '@/hooks/useData'
import { MeetingReminder, upcomingMeetings } from '@/components/MeetingReminder'
import { MeetingSheet } from '@/components/MeetingSheet'
import CheerPop from '@/components/CheerPop'
import type { MeetingListItem } from '@/lib/types'
import { useFocusedTaskIds } from '@/hooks/useFocusTimer'
import { focusedFirst } from '@/lib/planDay'
import { matchProjectItem } from '@/lib/filters'
import { byAllocationAsc, byDeadlineAsc, byDeadlineDesc, formatEstimate, formatEstimateRatio, todayISO } from '@/lib/format'
import type { ProjectItem } from '@/lib/types'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

// Friendly label for the shortfall banner's day (ISO 'YYYY-MM-DD').
function shortfallDateLabel(iso: string | null) {
  if (!iso) return 'Your last shift'
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

function Ring({ pct }: { pct: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" className="-rotate-90">
      <circle cx="34" cy="34" r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="6" />
      <circle
        cx="34"
        cy="34"
        r={r}
        fill="none"
        stroke="white"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
      />
    </svg>
  )
}

// Home work view: which axis, and the sub-tab within Plan / Deadline.
type Axis = 'plan' | 'deadline' | 'waiting'
type PlanSub = 'today' | 'past' | 'upcoming'
type DeadlineSub = 'today' | 'overdue' | 'upcoming'

// Segmented pill tabs — used for the axis row (Plan/Deadline/Waiting) and the
// sub-tab rows. Active tab fills brand; each tab can show a count badge.
function PillTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string; count?: number }[]
  value: T
  onChange: (k: T) => void
}) {
  return (
    <div
      className="grid gap-1 rounded-2xl bg-paper-line p-1 dark:bg-slate-800/70"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((t) => {
        const on = t.key === value
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={clsx(
              'flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition active:scale-95',
              on
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            {t.label}
            {typeof t.count === 'number' && (
              <span
                className={clsx(
                  'rounded-full px-1.5 text-[11px] font-bold tabular-nums',
                  on ? 'bg-white/25 text-white' : 'bg-white text-slate-500 dark:bg-slate-700 dark:text-slate-400',
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// Stat-chip sub-tabs — the count is the hero, colored by urgency (today=indigo,
// overdue=red, past=amber, upcoming=slate). Doubles as a mini KPI strip you tap
// to filter. Replaces the flat pill sub-tabs on the Plan/Deadline axes.
const STAT_TONE = {
  brand: { on: 'border-brand-400 dark:border-brand-500/50', bar: 'bg-brand-500', num: 'text-brand-600 dark:text-brand-400' },
  rose: { on: 'border-rose-400 dark:border-rose-500/50', bar: 'bg-rose-500', num: 'text-rose-600 dark:text-rose-400' },
  amber: { on: 'border-amber-400 dark:border-amber-500/50', bar: 'bg-amber-500', num: 'text-amber-600 dark:text-amber-400' },
  slate: { on: 'border-slate-400 dark:border-slate-500/50', bar: 'bg-slate-400', num: 'text-stone-700 dark:text-slate-200' },
} as const

function StatTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string; count: number; tone: keyof typeof STAT_TONE; icon: React.ComponentType<{ className?: string }> }[]
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
            onClick={() => onChange(t.key)}
            className={clsx(
              'relative overflow-hidden rounded-2xl border bg-paper-card p-2.5 text-left transition active:scale-95 dark:bg-slate-800',
              on ? clsx('shadow-sm', c.on) : 'border-paper-edge dark:border-slate-700',
            )}
          >
            <span className={clsx('absolute inset-y-0 left-0 w-1', on ? c.bar : 'bg-transparent')} />
            <span className={clsx('block pl-1 text-xl font-extrabold leading-none tabular-nums', on ? c.num : 'text-stone-400 dark:text-slate-500')}>
              {t.count}
            </span>
            <span className={clsx('mt-1.5 flex items-center gap-1 pl-1 text-[11px] font-semibold', on ? 'text-stone-600 dark:text-slate-300' : 'text-stone-400 dark:text-slate-500')}>
              <Icon className="h-3 w-3" />
              {t.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function VerseCard() {
  const { data: verse } = useDailyVerse()
  const { data: boot } = useBoot()
  if (!verse) return null
  const t = verseTheme(boot?.employee?.religion)
  const Icon = t.Icon
  return (
    <div className="relative mt-4 overflow-hidden rounded-2xl p-5 text-white ring-1 ring-white/15" style={verseCardStyle(t)}>
      <Icon aria-hidden strokeWidth={1.25} className="pointer-events-none absolute -bottom-8 -right-6 h-48 w-48 rotate-6 text-white/10" />
      <div className="relative">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/20 px-2.5 py-1 backdrop-blur-sm">
          <Icon className="h-3.5 w-3.5" />
          <span className="text-[11px] font-bold uppercase tracking-wide">Ayat Hari Ini</span>
        </div>
        <p className="text-[15px] font-medium leading-relaxed drop-shadow-sm">"{verse.text}"</p>
        <p className="mt-2.5 text-xs font-semibold text-white/85">— {verse.reference}</p>
      </div>
    </div>
  )
}

export default function Today() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const { data, isLoading, refetch } = useDashboard()
  const { data: wallet } = useWallet()
  const { data: banners } = useHomeBanners()
  const { data: shortfall } = usePreviousShiftShortfall()
  const { data: meetingsData } = useMeetings()
  const [openMeeting, setOpenMeeting] = useState<MeetingListItem | null>(null)
  // Free-text search over the to-do lists (all axes), matched on todo text + project.
  const [query, setQuery] = useState('')
  const autoFill = useAutoFillPlan()
  // Home work view: axis (Plan/Deadline/Waiting) + sub-tab within Plan/Deadline.
  const [axis, setAxis] = useState<Axis>('plan')
  const [planSub, setPlanSub] = useState<PlanSub>('today')
  const [deadlineSub, setDeadlineSub] = useState<DeadlineSub>('today')
  const focusedIds = useFocusedTaskIds()

  const firstName = boot?.full_name?.split(' ')[0] ?? ''

  // Overdue badge: switch to the personal lens (where the Overdue list lives,
  // clearing any active filter that might hide it) then scroll it into view.
  const goOverdue = () => {
    setAxis('deadline')
    setDeadlineSub('overdue')
    setTimeout(
      () => document.getElementById('today-groups')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      60,
    )
  }

  const all = useMemo(
    () => (data ? [...data.overdue, ...data.due_today, ...data.upcoming] : []),
    [data],
  )
  // Waiting todos are parked — pulled off the active radar into the Waiting
  // axis. `activeTodos` is everything that isn't waiting; it drives the Plan +
  // Deadline views, counts and filters. `waitingTodos` is the parked list,
  // shown in full regardless of deadline / today-allocation.
  const activeTodos = useMemo(() => all.filter((t) => !t.is_waiting), [all])
  const waitingTodos = useMemo(
    () => all.filter((t) => t.is_waiting).slice().sort(byDeadlineAsc),
    [all],
  )

  // Today progress ring — minutes done vs planned today (completed + due-today estimates; overdue excluded).
  const completedMin = data?.counts.completed_minutes_today ?? 0
  // Due-today metrics exclude waiting (parked) — a parked task isn't "to go".
  const dueTodayActive = useMemo(() => (data ? data.due_today.filter((t) => !t.is_waiting) : []), [data])
  const dueTodayCount = dueTodayActive.length
  const dueMin = dueTodayActive.reduce((s, t) => s + (t.estimated || 0), 0)
  const todayTotalMin = completedMin + dueMin
  const pct = todayTotalMin ? completedMin / todayTotalMin : 1

  // Deadline buckets exclude waiting — parked todos live only in the Waiting section.
  const filtered = data
    ? {
        overdue: data.overdue.filter((t) => !t.is_waiting).slice().sort(byDeadlineDesc),
        due_today: dueTodayActive.slice().sort(byDeadlineAsc),
        upcoming: data.upcoming.filter((t) => !t.is_waiting).slice().sort(byDeadlineAsc),
      }
    : null

  // Active set feeding the Plan view's allocation groups.
  const filteredActive = activeTodos

  // Plan view groups by allocation date: today / past (slipped, still planned) /
  // upcoming. A todo allocated across several days appears under each it touches.
  const todayStr = todayISO()
  // next 5 un-done meetings (today or later) you organize or are invited to → vibrant top reminder
  const upcoming = upcomingMeetings(meetingsData?.meetings ?? [], 5, boot?.user)
  const allocOn = (t: ProjectItem, pred: (d: string) => boolean) =>
    (t.allocations ?? []).some((a) => a.date != null && pred(a.date))
  // Mutually exclusive buckets, precedence Today > Past > Upcoming — a todo
  // allocated across days shows once, in its most urgent bucket (so a task
  // planned for today AND an earlier day lands in Today, not Past).
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
  // "Today's plan" = todos allocated minutes today; drives the CTA + ring total.
  const plannedTodos = planGroups.today
  const plannedTodayMin = plannedTodos.reduce((s, t) => s + (t.today_allocation || 0), 0)

  // Silent auto-plan toward the daily minimum (same logic as Auto-plan button).
  useAutoPlanToday({ due_today: data?.due_today, overdue: data?.overdue, upcoming: data?.upcoming })

  // Shared list renderer: cards, or a contextual empty state. Applies the
  // free-text search (todo text + project) so every axis is searchable at once.
  const renderList = (list: ProjectItem[], emptyTitle: string, swipe = true) => {
    const q = query.trim().toLowerCase()
    const shown = list.filter((t) => matchProjectItem(t, query))
    const empty = q ? (
      <EmptyState icon={SearchX} title={`No matches for "${query.trim()}"`} subtitle="Try a different search." />
    ) : activeTodos.length || waitingTodos.length ? (
      <EmptyState icon={SearchX} title={emptyTitle} subtitle="Peek at another tab, or clear the filters." />
    ) : (
      <EmptyState icon={PartyPopper} title="All caught up!" subtitle="Nothing on your plate right now. Go you." />
    )
    // Swipe axes: SwipeProjectLists owns the sticky search + project-picker header
    // and stays mounted even when empty, so the search input keeps focus while typing.
    if (swipe) return <SwipeProjectLists items={shown} search={searchBox} emptyState={empty} />
    // Non-swipe (Waiting): search is rendered inline by the caller, above this list.
    return shown.length ? (
      <div className="mt-3 flex flex-col gap-3">
        {shown.map((t) => (
          <TodoCard key={t.name} todo={t} />
        ))}
      </div>
    ) : (
      empty
    )
  }

  // Search box — rendered under each axis' sub-tab row so it sits directly above
  // the list it filters. Defined once, placed per axis.
  const searchBox = (
    <div className="relative mt-3">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400 dark:text-slate-500" />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search to-dos…"
        aria-label="Search to-dos"
        className="w-full rounded-2xl border border-paper-edge bg-paper-card py-2.5 pl-9 pr-9 text-sm text-stone-800 placeholder:text-stone-400 focus:border-brand-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
      />
      {query && (
        <button
          onClick={() => setQuery('')}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 active:scale-90 dark:text-slate-500"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )

  const right = boot ? (
    <div className="flex items-center gap-1">
      <button
        onClick={() => navigate('/calendar')}
        aria-label="Calendar"
        className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 dark:text-slate-300 transition active:scale-90 active:bg-slate-200/70 dark:active:bg-slate-700"
      >
        <CalendarDays className="h-[22px] w-[22px]" />
      </button>
      <NotesButton />
      <button
        onClick={() => navigate('/activity')}
        aria-label="Team activity"
        className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 dark:text-slate-300 transition active:scale-90 active:bg-slate-200/70 dark:active:bg-slate-700"
      >
        <Sparkles className="h-6 w-6" />
      </button>
      <NotificationBell />
      <button onClick={() => navigate('/me')} className="transition active:scale-95">
        {boot.avatar_config ? (
          <div className="h-[42px] w-[42px] shrink-0 overflow-hidden rounded-full bg-paper-card ring-2 ring-white dark:bg-slate-700 dark:ring-slate-800">
            <DiceBearAvatar config={boot.avatar_config as AvatarConfig} className="h-full w-full" />
          </div>
        ) : (
          <Avatar name={boot.full_name} image={boot.image} size={42} />
        )}
      </button>
    </div>
  ) : null

  // Rotating spotlight slides — built from data already loaded. Most urgent
  // first (overdue → review → today's plan / caught-up), then the two evergreen
  // shortcuts so the banner always has something to rotate.
  const bal = wallet?.balance ?? 0
  const todayEarned = wallet?.today_earned ?? 0
  const spotlight: Slide[] = []
  if (data) {
    if (data.counts.overdue > 0)
      spotlight.push({
        id: 'overdue', eyebrow: 'Needs attention', title: `${data.counts.overdue} overdue`,
        sub: 'Clear them before they pile up', cta: 'Review overdue', icon: AlertCircle,
        gradient: 'from-rose-500 via-red-500 to-orange-500', onAct: goOverdue,
      })
    if (data.counts.review > 0)
      spotlight.push({
        id: 'review', eyebrow: 'Waiting on you', title: `${data.counts.review} to review`,
        sub: "Check & approve teammates' work", cta: 'Open review', icon: CheckCheck,
        gradient: 'from-sky-500 via-blue-500 to-indigo-500', onAct: () => navigate('/review'),
      })
    if (dueTodayCount > 0)
      spotlight.push({
        id: 'plan', eyebrow: 'Your day', title: `${dueTodayCount} due today`,
        sub: 'Line them up so nothing slips', cta: 'Plan my day', icon: Sparkles,
        gradient: 'from-brand-600 via-[#7A5AF8] to-[#E879C7]', onAct: () => navigate('/plan'),
      })
    else if (data.counts.completed_today > 0)
      spotlight.push({
        id: 'caught', eyebrow: 'Nice work', title: 'All caught up',
        sub: `${data.counts.completed_today} done today — enjoy it`, cta: 'See your projects', icon: PartyPopper,
        gradient: 'from-emerald-500 via-teal-500 to-brand-500', onAct: () => navigate('/projects'),
      })
    if (todayEarned > 0)
      spotlight.push({
        id: 'streak', eyebrow: 'Points', title: `+${todayEarned.toLocaleString(undefined, { maximumFractionDigits: 1 })} today`,
        sub: 'Spend them on rewards', cta: 'Open marketplace', icon: Flame,
        gradient: 'from-amber-500 via-orange-500 to-pink-500', onAct: () => navigate('/marketplace'),
      })
  }
  const lv = boot?.leave
  const lr = boot?.leave_rules
  if (lv)
    spotlight.push({
      id: 'cuti', eyebrow: 'Cuti', title: `Sisa ${lv.remaining} hari`,
      sub: lr && (lr.late_enabled || lr.overtime_enabled)
        ? 'Telat & lembur pengaruhi saldo cuti'
        : `Dari kuota ${lv.quota} hari tahun ini`,
      cta: 'Lihat rincian', icon: CalendarOff,
      gradient: 'from-rose-500 via-pink-500 to-fuchsia-500', onAct: () => navigate('/cuti-ledger'),
    })
  spotlight.push({
    id: 'leaderboard', eyebrow: 'Standings', title: 'Where do you rank?',
    sub: 'Productivity & character boards', cta: 'View leaderboard', icon: Trophy,
    gradient: 'from-violet-600 via-purple-500 to-fuchsia-500', onAct: () => navigate('/leaderboard'),
  })
  spotlight.push({
    id: 'events', eyebrow: 'Community', title: 'Join an event',
    sub: "See what's happening at the office", cta: 'Browse events', icon: Ticket,
    gradient: 'from-emerald-500 via-teal-500 to-cyan-500', onAct: () => navigate('/events'),
  })
  spotlight.push({
    id: 'bookings', eyebrow: 'Spaces', title: 'Book a room',
    sub: 'Reserve a meeting room or equipment', cta: 'View bookings', icon: CalendarDays,
    gradient: 'from-sky-500 via-blue-500 to-indigo-500', onAct: () => navigate('/bookings'),
  })

  // Quick-action grid badges (keyed by route). Only the two we already have data for.
  const balShort = bal >= 1000 ? `${(bal / 1000).toFixed(1)}k` : Math.round(bal).toString()
  const actionBadges: Record<string, string | number> = {}
  if (activeTodos.length) actionBadges['/projects'] = activeTodos.length
  if (bal > 0) actionBadges['/marketplace'] = balShort

  return (
    <TabScreen title="Home" subtitle={`${greeting()}, ${firstName}`} right={right}>
      <CheerPop />
      <ValuesWelcome />
      {isLoading && !data ? (
        <FullScreenLoader label="Loading your work…" />
      ) : (
        <PullToRefresh onRefresh={refetch}>
          {data && (
            <>
              {/* Managed promo banners — full-bleed strip, flush to the top. */}
              <BannerCarousel slides={banners ?? []} />

              {/* VernonCorp value of the day — quiet reminder of why we're here. */}
              <div className="mt-3 flex items-center justify-center gap-1.5 text-center">
                <Heart className="h-3 w-3 shrink-0 text-brand-400" fill="currentColor" />
                <span className="text-xs font-medium text-stone-400 dark:text-slate-500">{valueOfDay()}</span>
              </div>

              {/* DANGER: last shift day fell below the daily-minimum minutes setting. */}
              {shortfall?.under && (
                <div
                  role="alert"
                  className="mt-4 flex items-start gap-3 rounded-2xl border-2 border-rose-300 bg-gradient-to-br from-rose-600 to-red-700 p-4 text-white shadow-[0_12px_32px_-8px_rgba(225,29,72,0.75)] ring-2 ring-rose-500/50"
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 animate-pulse items-center justify-center rounded-full bg-white/20">
                    <AlertTriangle className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold uppercase tracking-wide">Daily minimum missed</p>
                    <p className="mt-0.5 text-sm font-medium text-rose-50">
                      {shortfallDateLabel(shortfall.date)}: you planned only{' '}
                      <span className="font-bold">{formatEstimate(shortfall.assigned)}</span> of the{' '}
                      <span className="font-bold">{formatEstimate(shortfall.minimum)}</span> minimum —{' '}
                      <span className="font-bold">{formatEstimate(shortfall.minimum - shortfall.assigned)} short</span>.
                    </p>
                  </div>
                </div>
              )}

              {/* Vibrant meeting reminder — impossible to miss when meetings are on today */}
              <div className={clsx((banners?.length ?? 0) > 0 && 'mt-4')}>
                <MeetingReminder
                  meetings={upcoming}
                  onOpen={() => navigate('/meetings')}
                  onOpenMeeting={setOpenMeeting}
                />
              </div>

              {/* Rotating spotlight hero — auto-cycles the most relevant nudge. */}
              <div className={clsx('mb-3', (banners?.length ?? 0) > 0 && 'mt-4')}>
                <Spotlight slides={spotlight} />
              </div>

              {/* Quick actions — every "what can I do" shortcut as a tile */}
              <div className="my-6">
                <QuickActions badges={actionBadges} />
              </div>

              {/* Weekly recap — auto-surfaces Mon–Wed, dismissible per week */}
              <RecapCard />

              {/* Daily verse — only when the user enabled Ayat Harian */}
              <VerseCard />

              {/* ----- Your work ----- */}
              {filtered && (
                <>
                  <div className="mt-4 flex items-stretch gap-2">
                    <button
                      onClick={() => navigate('/plan')}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-3.5 text-left transition active:scale-[0.99] dark:border-brand-500/30 dark:bg-brand-500/15"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
                        <Sparkles className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-brand-800 dark:text-brand-300">Plan my day</span>
                        <span className="block text-xs text-brand-600/80 dark:text-brand-300/70">
                          {plannedTodayMin > 0
                            ? `${formatEstimate(plannedTodayMin)} planned for today`
                            : "Allocate minutes to today's tasks"}
                        </span>
                      </span>
                      <ChevronRight className="h-5 w-5 text-brand-400" />
                    </button>
                    <button
                      onClick={() => autoFill.run({ due_today: data.due_today, overdue: data.overdue, upcoming: data.upcoming })}
                      disabled={autoFill.saving}
                      aria-label="Auto-plan my day"
                      className="flex w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-brand-200 bg-paper-card text-brand-700 transition active:scale-95 disabled:opacity-50 dark:border-brand-500/30 dark:bg-slate-800 dark:text-brand-300"
                    >
                      <Wand2 className={clsx('h-5 w-5', autoFill.saving && 'animate-pulse')} />
                      <span className="text-[11px] font-semibold">{autoFill.saving ? 'Planning…' : 'Auto-plan'}</span>
                    </button>
                  </div>
                  <div id="today-groups" className="mt-5 scroll-mt-4">
                    {/* Axis: Plan (by allocation) · Deadline (by due date) · Waiting (parked) */}
                    <PillTabs<Axis>
                      tabs={[
                        { key: 'plan', label: 'Plan' },
                        { key: 'deadline', label: 'Deadline' },
                        { key: 'waiting', label: 'Waiting', count: waitingTodos.length },
                      ]}
                      value={axis}
                      onChange={setAxis}
                    />

                    {axis === 'plan' && (
                      <>
                        <div className="mt-3">
                          <StatTabs<PlanSub>
                            tabs={[
                              { key: 'today', label: 'Today', count: planGroups.today.length, tone: 'brand', icon: Clock },
                              { key: 'past', label: 'Past', count: planGroups.past.length, tone: 'amber', icon: CalendarOff },
                              { key: 'upcoming', label: 'Upcoming', count: planGroups.upcoming.length, tone: 'slate', icon: CalendarDays },
                            ]}
                            value={planSub}
                            onChange={setPlanSub}
                          />
                        </div>

                        {planSub === 'today' && plannedTodayMin > 0 && (
                          <p className="mt-4 flex items-center gap-1.5 px-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                            <Clock className="h-3.5 w-3.5 text-brand-500" />
                            Planning for today: <span className="font-bold text-brand-600 dark:text-brand-400">{formatEstimate(plannedTodayMin)}</span>
                          </p>
                        )}

                        {renderList(planGroups[planSub], `Nothing planned ${planSub}`)}
                      </>
                    )}

                    {axis === 'deadline' && (
                      <>
                        <div className="mt-3">
                          <StatTabs<DeadlineSub>
                            tabs={[
                              { key: 'today', label: 'Today', count: filtered.due_today.length, tone: 'brand', icon: Clock },
                              { key: 'overdue', label: 'Overdue', count: filtered.overdue.length, tone: 'rose', icon: AlertTriangle },
                              { key: 'upcoming', label: 'Upcoming', count: filtered.upcoming.length, tone: 'slate', icon: CalendarDays },
                            ]}
                            value={deadlineSub}
                            onChange={setDeadlineSub}
                          />
                        </div>
                        {renderList(
                          deadlineSub === 'today' ? filtered.due_today : deadlineSub === 'overdue' ? filtered.overdue : filtered.upcoming,
                          deadlineSub === 'overdue' ? 'Nothing overdue' : deadlineSub === 'today' ? 'Nothing due today' : 'Nothing upcoming',
                        )}
                      </>
                    )}

                    {axis === 'waiting' && (
                      <>
                        {searchBox}
                        {renderList(waitingTodos, 'Nothing waiting', false)}
                      </>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </PullToRefresh>
      )}

      <AutoPlanProgress open={autoFill.saving} summary={autoFill.summary} />
      <MeetingSheet meeting={openMeeting} onClose={() => setOpenMeeting(null)} />
    </TabScreen>
  )
}
