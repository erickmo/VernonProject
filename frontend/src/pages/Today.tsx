import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import {
  AlertCircle,
  PartyPopper,
  SearchX,
  User,
  KeyRound,
  Flag,
  Users,
  ChevronRight,
  ShieldCheck,
  CheckCheck,
  FolderKanban,
  CalendarDays,
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
  BookOpen,
  Search,
  X,
  AlertTriangle,
} from 'lucide-react'
import { TabScreen, PullToRefresh } from '@/components/Layout'
import { TodoCard } from '@/components/TodoCard'
import { ProjectCard } from '@/components/ProjectCard'
import { Avatar, EmptyState, FilterChips, FullScreenLoader } from '@/components/ui'
import { FilterButton, FilterSheet } from '@/components/FilterSheet'
import { NotificationBell } from '@/components/NotificationBell'
import { DiceBearAvatar } from '@/avatar/DiceBearAvatar'
import type { AvatarConfig } from '@/lib/types'
import { NotesButton } from '@/components/NotesButton'
import { RecapCard } from '@/components/RecapCard'
import { PlanDaySheet } from '@/components/PlanDaySheet'
import { useAutoPlanToday, useAutoFillPlan } from '@/hooks/usePlanDay'
import { Spotlight, type Slide } from '@/components/Spotlight'
import { QuickActions } from '@/components/QuickActions'
import { BannerCarousel } from '@/components/BannerCarousel'
import { useBoot, useDashboard, useProjects, useWallet, useHomeBanners, useDailyVerse, usePreviousShiftShortfall, useMeetings } from '@/hooks/useData'
import { MeetingReminder, upcomingMeetings } from '@/components/MeetingReminder'
import { MeetingSheet } from '@/components/MeetingSheet'
import type { MeetingListItem } from '@/lib/types'
import { useFocusedTaskIds } from '@/hooks/useFocusTimer'
import { focusedFirst } from '@/lib/planDay'
import { applyProjectItemFilters, buildOptions, ESTIMATE_OPTIONS, matchProjectItem } from '@/lib/filters'
import { byAllocationAsc, byDeadlineAsc, byDeadlineDesc, formatEstimate, formatEstimateRatio, todayISO } from '@/lib/format'
import type { ProjectCard as ProjectCardType, StatusKey, ProjectItem } from '@/lib/types'

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

type Lens = 'me' | 'owned' | 'led' | 'in'

const LENS_META: Record<Lens, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  me: { label: 'For me', icon: User },
  owned: { label: 'Owned', icon: KeyRound },
  led: { label: 'Led', icon: Flag },
  in: { label: "I'm in", icon: Users },
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

function ActionBanner({
  icon: Icon,
  text,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  text: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-brand-100 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/15 p-4 text-left transition active:scale-[0.99]"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
        <Icon className="h-5 w-5" />
      </div>
      <p className="flex-1 text-sm font-semibold text-brand-800 dark:text-brand-300">{text}</p>
      <ChevronRight className="h-5 w-5 text-brand-400" />
    </button>
  )
}

function VerseCard() {
  const { data: verse } = useDailyVerse()
  if (!verse) return null
  return (
    <div className="mt-4 rounded-2xl border border-brand-100 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/15 p-4">
      <div className="mb-1.5 flex items-center gap-2 text-brand-700 dark:text-brand-300">
        <BookOpen className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">Ayat Hari Ini</span>
      </div>
      <p className="text-sm leading-relaxed text-stone-700 dark:text-slate-200">"{verse.text}"</p>
      <p className="mt-2 text-xs font-semibold text-brand-600 dark:text-brand-400">— {verse.reference}</p>
    </div>
  )
}

export default function Today() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const { data, isLoading, refetch } = useDashboard()
  const { data: projects } = useProjects()
  const { data: wallet } = useWallet()
  const { data: banners } = useHomeBanners()
  const { data: shortfall } = usePreviousShiftShortfall()
  const { data: meetingsData } = useMeetings()
  const [openMeeting, setOpenMeeting] = useState<MeetingListItem | null>(null)
  const [lens, setLens] = useState<Lens>('me')
  const [filters, setFilters] = useState<Record<string, string>>({})
  // Free-text search over the to-do lists (all axes), matched on todo text + project.
  const [query, setQuery] = useState('')
  const [sheet, setSheet] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const autoFill = useAutoFillPlan()
  // Quick-action "Plan day" tile can only navigate, so it lands here with
  // ?plan=1 — open the sheet and strip the param so re-tapping works.
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    if (searchParams.get('plan')) {
      setPlanOpen(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])
  // Home work view: axis (Plan/Deadline/Waiting) + sub-tab within Plan/Deadline,
  // plus an optional specific day for the Plan date-picker (ISO yyyy-mm-dd).
  const [axis, setAxis] = useState<Axis>('plan')
  const [planSub, setPlanSub] = useState<PlanSub>('today')
  const [deadlineSub, setDeadlineSub] = useState<DeadlineSub>('today')
  const [pickedDate, setPickedDate] = useState<string>('')
  const focusedIds = useFocusedTaskIds()

  const firstName = boot?.full_name?.split(' ')[0] ?? ''

  // Overdue badge: switch to the personal lens (where the Overdue list lives,
  // clearing any active filter that might hide it) then scroll it into view.
  const goOverdue = () => {
    setLens('me')
    setFilters({})
    setAxis('deadline')
    setDeadlineSub('overdue')
    setPickedDate('')
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

  // Lens project sets
  const owned = (projects ?? []).filter((p) => p.is_owner)
  const led = (projects ?? []).filter((p) => p.is_leader)
  const memberIn = (projects ?? []).filter((p) => p.is_member && !p.is_owner && !p.is_leader)
  const ownerApprovals = (data?.review ?? []).filter((t) => t.status_key === 'checked').length
  const leadChecks = (data?.review ?? []).filter((t) => t.status_key === 'done').length

  const lensCount: Record<Lens, number> = {
    me: activeTodos.length,
    owned: owned.length,
    led: led.length,
    in: memberIn.length,
  }

  // Today progress ring — minutes done vs planned today (completed + due-today estimates; overdue excluded).
  const completedMin = data?.counts.completed_minutes_today ?? 0
  // Due-today metrics exclude waiting (parked) — a parked task isn't "to go".
  const dueTodayActive = useMemo(() => (data ? data.due_today.filter((t) => !t.is_waiting) : []), [data])
  const dueTodayCount = dueTodayActive.length
  const dueMin = dueTodayActive.reduce((s, t) => s + (t.estimated || 0), 0)
  const todayTotalMin = completedMin + dueMin
  const pct = todayTotalMin ? completedMin / todayTotalMin : 1

  // "For me" filtering
  const statusCount = (k: StatusKey) => activeTodos.filter((t) => t.status_key === k).length
  const dimensions = useMemo(
    () => [
      { key: 'project', label: 'Project', options: buildOptions(activeTodos, (t) => t.project, (t) => t.project_name) },
      { key: 'brand', label: 'Brand', options: buildOptions(activeTodos, (t) => t.brand, (t) => t.brand) },
      { key: 'owner', label: 'Project Owner', options: buildOptions(activeTodos, (t) => t.project_owner, (t) => t.project_owner_name) },
      { key: 'leader', label: 'Project Leader', options: buildOptions(activeTodos, (t) => t.project_leader, (t) => t.project_leader_name) },
      { key: 'estimate', label: 'Estimated time', options: ESTIMATE_OPTIONS },
    ],
    [activeTodos],
  )
  const advCount = ['project', 'brand', 'owner', 'leader', 'estimate'].filter((k) => filters[k]).length
  // Buckets exclude waiting — parked todos live only in the Waiting section.
  const filtered = data
    ? {
        overdue: applyProjectItemFilters(data.overdue.filter((t) => !t.is_waiting), filters).slice().sort(byDeadlineDesc),
        due_today: applyProjectItemFilters(dueTodayActive, filters).slice().sort(byDeadlineAsc),
        upcoming: applyProjectItemFilters(data.upcoming.filter((t) => !t.is_waiting), filters).slice().sort(byDeadlineAsc),
      }
    : null

  // Status/advanced-filtered active set — feeds the Plan view's allocation groups.
  const filteredActive = useMemo(() => applyProjectItemFilters(activeTodos, filters), [activeTodos, filters])

  // Plan view groups by allocation date: today / past (slipped, still planned) /
  // upcoming. A todo allocated across several days appears under each it touches.
  const todayStr = todayISO()
  // next 5 un-done meetings (today or later) → vibrant top reminder
  const upcoming = upcomingMeetings(meetingsData?.meetings ?? [])
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
  const planPicked = useMemo(
    () => (pickedDate ? filteredActive.filter((t) => allocOn(t, (d) => d === pickedDate)).slice().sort(byAllocationAsc) : []),
    [filteredActive, pickedDate],
  )

  // "Today's plan" = todos allocated minutes today; drives the CTA + ring total.
  const plannedTodos = planGroups.today
  const plannedTodayMin = plannedTodos.reduce((s, t) => s + (t.today_allocation || 0), 0)

  // Plan-my-day candidates: everything due today + overdue, plus anything already
  // allocated to today (even if its deadline is future) so re-planning is complete.
  // Waiting todos are excluded — you don't plan a parked task.
  const planCandidates = useMemo(() => {
    if (!data) return []
    const byId = new Map<string, ProjectItem>()
    for (const t of [...data.due_today, ...data.overdue]) if (!t.is_waiting) byId.set(t.name, t)
    for (const t of data.upcoming) if ((t.today_allocation || 0) > 0 && !t.is_waiting) byId.set(t.name, t)
    return [...byId.values()]
  }, [data])

  // Silent auto-plan toward the daily minimum (same logic as Auto-plan button).
  useAutoPlanToday({ due_today: data?.due_today, overdue: data?.overdue, upcoming: data?.upcoming })

  // Shared list renderer: cards, or a contextual empty state. Applies the
  // free-text search (todo text + project) so every axis is searchable at once.
  const renderList = (list: ProjectItem[], emptyTitle: string) => {
    const q = query.trim().toLowerCase()
    const shown = list.filter((t) => matchProjectItem(t, query))
    return shown.length ? (
      <div className="mt-3 flex flex-col gap-3">
        {shown.map((t) => (
          <TodoCard key={t.name} todo={t} />
        ))}
      </div>
    ) : q ? (
      <EmptyState icon={SearchX} title={`No matches for "${query.trim()}"`} subtitle="Try a different search." />
    ) : activeTodos.length || waitingTodos.length ? (
      <EmptyState icon={SearchX} title={emptyTitle} subtitle="Peek at another tab, or clear the filters." />
    ) : (
      <EmptyState icon={PartyPopper} title="All caught up!" subtitle="Nothing on your plate right now. Go you." />
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
        gradient: 'from-brand-600 via-[#7A5AF8] to-[#E879C7]', onAct: () => setPlanOpen(true),
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
      {isLoading && !data ? (
        <FullScreenLoader label="Loading your work…" />
      ) : (
        <PullToRefresh onRefresh={refetch}>
          {data && (
            <>
              {/* Managed promo banners — full-bleed strip, flush to the top. */}
              <BannerCarousel slides={banners ?? []} />

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
              <QuickActions badges={actionBadges} />

              {/* Weekly recap — auto-surfaces Mon–Wed, dismissible per week */}
              <RecapCard />

              {/* Daily verse — only when the user enabled Ayat Harian */}
              <VerseCard />

              {/* Lens switcher */}
              <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
                {(Object.keys(LENS_META) as Lens[]).map((k) => {
                  const M = LENS_META[k]
                  const active = lens === k
                  const Icon = M.icon
                  return (
                    <button
                      key={k}
                      onClick={() => setLens(k)}
                      className={clsx(
                        'flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition active:scale-95',
                        active
                          ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                          : 'border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 text-stone-600 dark:text-slate-300',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {M.label}
                      <span
                        className={clsx(
                          'rounded-full px-1.5 text-[11px] font-bold',
                          active ? 'bg-white/25' : 'bg-paper-line dark:bg-slate-800 text-stone-500 dark:text-slate-400',
                        )}
                      >
                        {lensCount[k]}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* ----- For me ----- */}
              {lens === 'me' && filtered && (
                <>
                  <div className="mt-4 flex items-stretch gap-2">
                    <FilterButton count={advCount} onClick={() => setSheet(true)} />
                    <div className="min-w-0 flex-1">
                      <FilterChips<string>
                        value={filters.status || 'all'}
                        onChange={(v) => setFilters((f) => ({ ...f, status: v === 'all' ? '' : v }))}
                        options={[
                          { value: 'all', label: 'All', count: all.length },
                          { value: 'planned', label: '⚪️', count: statusCount('planned') },
                          { value: 'done', label: '🟠', count: statusCount('done') },
                          { value: 'checked', label: '🔷', count: statusCount('checked') },
                        ]}
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex items-stretch gap-2">
                    <button
                      onClick={() => setPlanOpen(true)}
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
                      onChange={(k) => {
                        setAxis(k)
                        if (k !== 'plan') setPickedDate('')
                      }}
                    />

                    {axis === 'plan' && (
                      <>
                        <div className="mt-3 flex items-stretch gap-2">
                          <div className="min-w-0 flex-1">
                            <PillTabs<PlanSub>
                              tabs={[
                                { key: 'today', label: 'Today', count: planGroups.today.length },
                                { key: 'past', label: 'Past', count: planGroups.past.length },
                                { key: 'upcoming', label: 'Upcoming', count: planGroups.upcoming.length },
                              ]}
                              value={pickedDate ? ('' as PlanSub) : planSub}
                              onChange={(k) => {
                                setPlanSub(k)
                                setPickedDate('')
                              }}
                            />
                          </div>
                          <label
                            className={clsx(
                              'relative flex shrink-0 items-center gap-1.5 rounded-2xl border px-3.5 text-sm font-semibold transition active:scale-95',
                              pickedDate
                                ? 'border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/15 dark:text-brand-300'
                                : 'border-paper-edge bg-paper-card text-stone-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
                            )}
                            title="Pick a specific day"
                          >
                            <CalendarDays className="h-4 w-4" />
                            <span>{pickedDate ? 'Day' : 'Pick'}</span>
                            <input
                              type="date"
                              value={pickedDate}
                              onChange={(e) => setPickedDate(e.target.value)}
                              aria-label="Pick a plan day"
                              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            />
                          </label>
                        </div>

                        {searchBox}

                        {pickedDate ? (
                          <p className="mt-4 flex items-center gap-1.5 px-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                            <CalendarDays className="h-3.5 w-3.5 text-brand-500" />
                            Plan for {pickedDate} · <span className="font-bold text-brand-600 dark:text-brand-400">{planPicked.length}</span>
                            <button onClick={() => setPickedDate('')} className="ml-1 font-semibold text-brand-600 underline dark:text-brand-400">
                              clear
                            </button>
                          </p>
                        ) : planSub === 'today' && plannedTodayMin > 0 ? (
                          <p className="mt-4 flex items-center gap-1.5 px-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                            <Clock className="h-3.5 w-3.5 text-brand-500" />
                            Planning for today: <span className="font-bold text-brand-600 dark:text-brand-400">{formatEstimate(plannedTodayMin)}</span>
                          </p>
                        ) : null}

                        {renderList(
                          pickedDate ? planPicked : planGroups[planSub],
                          pickedDate ? `Nothing planned for ${pickedDate}` : `Nothing planned ${planSub}`,
                        )}
                      </>
                    )}

                    {axis === 'deadline' && (
                      <>
                        <div className="mt-3">
                          <PillTabs<DeadlineSub>
                            tabs={[
                              { key: 'today', label: 'Today', count: filtered.due_today.length },
                              { key: 'overdue', label: 'Overdue', count: filtered.overdue.length },
                              { key: 'upcoming', label: 'Upcoming', count: filtered.upcoming.length },
                            ]}
                            value={deadlineSub}
                            onChange={setDeadlineSub}
                          />
                        </div>
                        {searchBox}
                        {renderList(
                          deadlineSub === 'today' ? filtered.due_today : deadlineSub === 'overdue' ? filtered.overdue : filtered.upcoming,
                          deadlineSub === 'overdue' ? 'Nothing overdue' : deadlineSub === 'today' ? 'Nothing due today' : 'Nothing upcoming',
                        )}
                      </>
                    )}

                    {axis === 'waiting' && (
                      <>
                        {searchBox}
                        {renderList(waitingTodos, 'Nothing waiting')}
                      </>
                    )}
                  </div>
                </>
              )}

              {/* ----- Owned ----- */}
              {lens === 'owned' && (
                <>
                  {ownerApprovals > 0 && (
                    <ActionBanner
                      icon={ShieldCheck}
                      text={`${ownerApprovals} todo${ownerApprovals > 1 ? 's' : ''} awaiting your final approval`}
                      onClick={() => navigate('/review')}
                    />
                  )}
                  <LensProjects items={owned} empty="You don't own any projects yet." />
                </>
              )}

              {/* ----- Led ----- */}
              {lens === 'led' && (
                <>
                  {leadChecks > 0 && (
                    <ActionBanner
                      icon={CheckCheck}
                      text={`${leadChecks} todo${leadChecks > 1 ? 's' : ''} to check & approve`}
                      onClick={() => navigate('/review')}
                    />
                  )}
                  <LensProjects items={led} empty="You're not leading any projects yet." />
                </>
              )}

              {/* ----- I'm in ----- */}
              {lens === 'in' && (
                <LensProjects items={memberIn} empty="You're not a member of other projects." />
              )}
            </>
          )}
        </PullToRefresh>
      )}

      <FilterSheet
        open={sheet}
        onClose={() => setSheet(false)}
        dimensions={dimensions}
        value={filters}
        onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
        onClear={() => setFilters((f) => ({ status: f.status || '' }))}
      />

      {planOpen && <PlanDaySheet todos={planCandidates} onClose={() => setPlanOpen(false)} />}
      <MeetingSheet meeting={openMeeting} onClose={() => setOpenMeeting(null)} />
    </TabScreen>
  )
}

function LensProjects({ items, empty }: { items: ProjectCardType[]; empty: string }) {
  if (!items.length) return <EmptyState icon={FolderKanban} title="Nothing here" subtitle={empty} />
  return (
    <div className="mt-4 flex flex-col gap-2.5">
      {items.map((p) => (
        <ProjectCard key={p.name} p={p} />
      ))}
    </div>
  )
}
