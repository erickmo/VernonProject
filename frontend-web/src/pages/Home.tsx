import { useEffect, useMemo, useRef, useState, type ReactNode, type ComponentType } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import {
  Sparkles, Plus, Gift, ShieldCheck, CheckCheck, Video, Check, CalendarClock,
  FolderKanban, Trophy, Flame, QrCode, BarChart3, BookOpen, Pause, Search, X,
  SearchX, AlertTriangle, Users, Wand2, User, KeyRound, Flag, ChevronRight,
} from 'lucide-react'
import {
  useBoot, useDashboard, useProjects, useWallet, useGamification, useMyAttendance,
  useMeetings, useWeeklyRecap, useClaimDaily, useDailyVerse, useHomeBanners,
  usePreviousShiftShortfall,
} from '@/hooks/useData'
import { useFocusedTaskIds } from '@/hooks/useFocusTimer'
import { formatEstimate, todayISO, byAllocationAsc } from '@/lib/format'
import { focusedFirst } from '@/lib/planDay'
import { applyProjectItemFilters, buildOptions, ESTIMATE_OPTIONS } from '@/lib/filters'
import { FilterButton, activeFilterCount, type FilterValue, type FilterDimension } from '@/components/FilterSheet'
import { SearchableSelect } from '@/components/SearchableSelect'
import { MeetingReminder, upcomingMeetings } from '@/components/MeetingReminder'
import { MarkDoneSheet } from '@/components/MarkDoneSheet'
import { MeetingSheet } from '@/components/MeetingSheet'
import { TodoCard } from '@/components/TodoCard'
import { Popover } from '@web/components/overlays/Popover'
import { Segmented, EmptyState } from '@/components/ui'
import { Page, PageHeader, rise } from '@web/components/Page'
import { Button, ErrorState, Skeleton } from '@web/components/ui'
import { CardList } from '@web/components/Card'
import { PlanDayDrawer } from '@web/components/PlanDayDrawer'
import { useAutoPlanToday, useAutoFillPlan } from '@/hooks/usePlanDay'
import { QuickCreate } from '@web/components/QuickCreate'
import { buildNavGroups } from '@web/lib/nav'
import type { ProjectItem, BannerSlide, MeetingListItem, ProjectCard as ProjectCardType } from '@/lib/types'

// ── small building blocks ─────────────────────────────────────────────────────

const ACCENT: Record<string, string> = {
  rose: 'text-rose-600 dark:text-rose-400',
  amber: 'text-amber-600 dark:text-amber-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  violet: 'text-violet-600 dark:text-violet-400',
  brand: 'text-brand-600 dark:text-brand-400',
  ink: 'text-ink',
}

// Soft-pop stat tile — the "at a glance" summary blocks that stand in for the
// mobile Today Spotlight/progress hero.
function StatTile({
  label, value, sub, accent = 'ink', to, onClick, active,
}: {
  label: string; value: ReactNode; sub?: ReactNode; accent?: keyof typeof ACCENT
  to?: string; onClick?: () => void; active?: boolean
}) {
  const cls = clsx(
    'block rounded-2xl bg-surface p-4 text-left shadow-card transition',
    active && 'ring-2 ring-brand-500',
    (to || onClick) && 'hover:bg-hover/[0.03] active:scale-[0.99] dark:hover:bg-hover/[0.04]',
  )
  const inner = (
    <>
      <div className={clsx('text-2xl font-semibold tabular-nums leading-none', ACCENT[accent])}>{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
      {sub != null && <div className="text-[11px] text-muted">{sub}</div>}
    </>
  )
  if (to) return <Link to={to} className={cls}>{inner}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={clsx(cls, 'w-full')}>{inner}</button>
  return <div className={cls}>{inner}</div>
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
        ? <Link to={to} className="truncate text-sm font-semibold text-ink hover:text-brand-600">{title}</Link>
        : <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>}
    </div>
  )
  return (
    <div className={clsx('rounded-2xl bg-surface p-4 shadow-card', className)}>
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

// Brand nudge banner — mirrors Today's per-lens ActionBanner (approvals to owe).
function ActionBanner({
  icon: Icon, text, onClick,
}: {
  icon: ComponentType<{ className?: string }>; text: string; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl bg-brand-50 p-4 text-left shadow-card transition active:scale-[0.99] dark:bg-brand-500/15"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
        <Icon className="h-5 w-5" />
      </span>
      <span className="flex-1 text-sm font-semibold text-brand-800 dark:text-brand-300">{text}</span>
      <ChevronRight className="h-5 w-5 text-brand-400" />
    </button>
  )
}

// One project as a soft-pop card (single source — dedupes the old steer/member copies).
function ProjectRow({ p }: { p: ProjectCardType }) {
  const pct = p.item_total ? Math.round((p.item_done / p.item_total) * 100) : 0
  return (
    <Link
      to={`/project/${encodeURIComponent(p.name)}`}
      className="block rounded-2xl bg-surface p-4 shadow-card transition hover:bg-hover/[0.03] active:scale-[0.99] dark:hover:bg-hover/[0.04]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold text-ink">{p.project_name}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted">{pct}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
      {(p.overdue > 0 || p.review > 0) && (
        <div className="mt-1.5 flex gap-2 text-[11px]">
          {p.overdue > 0 && <span className="text-rose-600 dark:text-rose-400">{p.overdue} overdue</span>}
          {p.review > 0 && <span className="text-amber-600 dark:text-amber-400">{p.review} to review</span>}
        </div>
      )}
    </Link>
  )
}

function ProjectLens({ items, empty }: { items: ProjectCardType[]; empty: string }) {
  if (!items.length) return <EmptyState icon={FolderKanban} title="Nothing here" subtitle={empty} />
  return <CardList>{items.map((p) => <ProjectRow key={p.name} p={p} />)}</CardList>
}

type Lens = 'me' | 'owned' | 'led' | 'in'
const LENS_META: Record<Lens, { label: string; icon: ComponentType<{ className?: string }> }> = {
  me: { label: 'For me', icon: User },
  owned: { label: 'Owned', icon: KeyRound },
  led: { label: 'Led', icon: Flag },
  in: { label: "I'm in", icon: Users },
}

type Tab = 'overdue' | 'today' | 'upcoming' | 'planned' | 'waiting'

// group icons for the "Jump to" launcher tiles that represent a whole section
const GROUP_ICON: Record<string, ComponentType<{ className?: string }>> = {
  reports: BarChart3,
}

// ── skeleton ──────────────────────────────────────────────────────────────────

function HomeSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-64" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
      </div>
    </div>
  )
}

function VerseCard() {
  const { data: verse } = useDailyVerse()
  if (!verse) return null
  return (
    <div className="rounded-2xl bg-surface p-5 shadow-card">
      <div className="mb-2 flex items-center gap-2 text-muted">
        <BookOpen className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">Ayat Hari Ini</span>
      </div>
      <p className="max-w-2xl text-[15px] leading-relaxed text-ink">"{verse.text}"</p>
      <p className="mt-2 text-sm font-medium text-muted">— {verse.reference}</p>
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
    <div className="relative max-w-3xl overflow-hidden rounded-2xl shadow-card">
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
  const projects = useProjects()
  const wallet = useWallet()
  const gam = useGamification()
  const attendance = useMyAttendance()
  const meetings = useMeetings()
  const recap = useWeeklyRecap()
  const claim = useClaimDaily()
  const [markDoneMeeting, setMarkDoneMeeting] = useState<MeetingListItem | null>(null)
  const [openMeeting, setOpenMeeting] = useState<MeetingListItem | null>(null)
  const banners = useHomeBanners()
  const shortfall = usePreviousShiftShortfall()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [lens, setLens] = useState<Lens>('me')
  const [tab, setTab] = useState<Tab | null>(null)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<FilterValue>({})
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef<HTMLSpanElement>(null)
  const [planOpen, setPlanOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const autoFill = useAutoFillPlan()

  // Deep-link: /?plan=1 (e.g. the /help "Plan your day" card) opens the plan flow.
  useEffect(() => {
    if (params.get('plan') === '1') setPlanOpen(true)
  }, [params])

  const allTasks: ProjectItem[] = useMemo(() => {
    const d = dash.data
    return d ? [...d.overdue, ...d.due_today, ...d.upcoming] : []
  }, [dash.data])

  const focusedIds = useFocusedTaskIds()
  const planned = useMemo(
    () => focusedFirst(allTasks.filter((t) => t.today_allocation > 0 && !t.is_waiting).slice().sort(byAllocationAsc), focusedIds),
    [allTasks, focusedIds],
  )
  const planCandidates = useMemo(() => {
    const d = dash.data
    if (!d) return []
    const byId = new Map<string, ProjectItem>()
    for (const t of [...d.due_today, ...d.overdue]) byId.set(t.name, t)
    for (const t of d.upcoming) if ((t.today_allocation || 0) > 0) byId.set(t.name, t)
    return [...byId.values()]
  }, [dash.data])

  // Silent auto-plan toward the daily minimum (same logic as Auto-plan button).
  useAutoPlanToday({ due_today: dash.data?.due_today, overdue: dash.data?.overdue, upcoming: dash.data?.upcoming })

  // Jump to the "For me" work list on a given tab (KPI tiles switch lens + tab).
  const goTab = (t: Tab) => {
    setLens('me')
    setTab(t)
    setTimeout(() => document.getElementById('my-work')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  if (!dash.data) {
    return dash.isError ? <ErrorState onRetry={() => dash.refetch()} /> : <HomeSkeleton />
  }

  const d = dash.data
  const counts = d.counts
  const b = boot.data

  // deadline lists + which tab is active (default: overdue if any, else today).
  // is_waiting todos are parked — excluded from the work lists (parity with
  // mobile's activeTodos filter) and surfaced only in their own Waiting tab.
  const overdueActive = d.overdue.filter((t) => !t.is_waiting)
  const dueTodayActive = d.due_today.filter((t) => !t.is_waiting)
  const upcomingActive = d.upcoming.filter((t) => !t.is_waiting)
  const waiting = allTasks.filter((t) => t.is_waiting)
  const lists: Record<Tab, ProjectItem[]> = {
    overdue: overdueActive,
    today: dueTodayActive,
    upcoming: upcomingActive,
    planned,
    waiting,
  }
  const activeTab: Tab = tab ?? (overdueActive.length ? 'overdue' : 'today')
  const tabs: { value: Tab; label: string }[] = [
    { value: 'overdue', label: `Overdue ${overdueActive.length}` },
    { value: 'today', label: `Today ${dueTodayActive.length}` },
    { value: 'upcoming', label: `Upcoming ${upcomingActive.length}` },
    { value: 'planned', label: `Planned ${planned.length}` },
    ...(waiting.length ? [{ value: 'waiting' as Tab, label: `Waiting ${waiting.length}` }] : []),
  ]

  // Multi-dimension filters (project/brand/owner/leader/estimate) — mobile Today
  // parity. Options derive from the active (non-waiting) work set; applied to the
  // current tab's list *before* the free-text search (compose: filter → search → tab).
  const workActive = [...overdueActive, ...dueTodayActive, ...upcomingActive]
  const filterDims: FilterDimension[] = [
    { key: 'project', label: 'Project', options: buildOptions(workActive, (t) => t.project, (t) => t.project_name) },
    { key: 'brand', label: 'Brand', options: buildOptions(workActive, (t) => t.brand, (t) => t.brand) },
    { key: 'owner', label: 'Project Owner', options: buildOptions(workActive, (t) => t.project_owner, (t) => t.project_owner_name) },
    { key: 'leader', label: 'Project Leader', options: buildOptions(workActive, (t) => t.project_leader, (t) => t.project_leader_name) },
    { key: 'estimate', label: 'Estimated time', options: ESTIMATE_OPTIONS },
  ]

  // Free-text search across the current axis (todo text + project) — mobile parity.
  // Waiting axis shows parked tasks in full (only search applies) — mirrors mobile,
  // and avoids hiding them behind dimension filters built from the active work set.
  const filteredRows = activeTab === 'waiting' ? lists.waiting : applyProjectItemFilters(lists[activeTab], filters)
  const q = query.trim().toLowerCase()
  const rows = q
    ? filteredRows.filter((t) =>
        `${t.to_do} ${t.project_name} ${t.project_detail_title}`.toLowerCase().includes(q),
      )
    : filteredRows

  // review split (approvals I owe) — surfaced via the per-lens ActionBanners.
  const review = d.review ?? []
  const ownerApprovals = review.filter((t) => t.status_key === 'checked')
  const leadChecks = review.filter((t) => t.status_key === 'done')

  // meetings scheduled today
  const today = todayISO()
  const todaysMeetings = (meetings.data?.meetings ?? []).filter(
    (m) => m.scheduled_at && m.scheduled_at.slice(0, 10) === today,
  )
  // next 5 un-done meetings (today or later) drive the vibrant top reminder
  const upcoming = upcomingMeetings(meetings.data?.meetings ?? [])

  // attendance — only surfaces when the module is actually in use for this user
  const attRows = attendance.data?.rows ?? []
  const attToday = attRows.find((r) => r.attendance_date === today) ?? attRows[0]

  // Lens project sets — mirror mobile Today's For me / Owned / Led / I'm in.
  const allProjects = projects.data ?? []
  const owned = allProjects.filter((p) => p.is_owner)
  const led = allProjects.filter((p) => p.is_leader)
  const memberIn = allProjects.filter((p) => p.is_member && !p.is_owner && !p.is_leader)
  const lensCount: Record<Lens, number> = {
    me: workActive.length,
    owned: owned.length,
    led: led.length,
    in: memberIn.length,
  }

  const daily = gam.data?.daily
  const w = wallet.data
  const r = recap.data

  const needCount = counts.overdue + counts.due_today + counts.review
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  const firstName = (b?.full_name || '').trim().split(' ')[0]

  return (
    <Page className="space-y-6">
      <PageHeader
        title={firstName ? `${greeting}, ${firstName}` : greeting}
        subtitle={`${dateStr} · ${needCount === 0 ? 'nothing needs you right now — nice.' : `${needCount} thing${needCount === 1 ? '' : 's'} need you today`}`}
        actions={
          <>
            {daily?.can_claim && (
              <Button variant="secondary" size="sm" onClick={() => claim.mutate()} disabled={claim.isPending}>
                <Gift className="h-4 w-4" /> Claim +{daily.claimable}
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => autoFill.run({ due_today: d.due_today, overdue: d.overdue, upcoming: d.upcoming })}
              disabled={autoFill.saving}
            >
              <Wand2 className="h-4 w-4" /> Auto-plan
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setPlanOpen(true)}>
              <Sparkles className="h-4 w-4" /> Plan my day
            </Button>
            <Button variant="primary" size="sm" onClick={() => setQuickOpen(true)}>
              <Plus className="h-4 w-4" /> New task
            </Button>
          </>
        }
      />

      {/* Managed promo banners — from Settings → Home Banners */}
      <WebBanners slides={banners.data ?? []} />

      {/* DANGER: previous shift day fell below the daily-minimum minutes setting */}
      {shortfall.data?.under && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl bg-rose-50 p-4 shadow-card dark:bg-rose-500/10">
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

      {/* Vibrant meeting reminder — impossible to miss when meetings are on today */}
      <MeetingReminder
        meetings={upcoming}
        onOpen={() => navigate('/meetings')}
        onOpenMeeting={setOpenMeeting}
      />

      <div className="space-y-6 xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start xl:gap-6 xl:space-y-0">
        <div className="min-w-0 space-y-6">
          {/* At-a-glance summary — soft-pop tiles standing in for the mobile Spotlight hero */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-3">
            <StatTile label="Overdue" value={counts.overdue} accent="rose" active={lens === 'me' && activeTab === 'overdue'} onClick={() => goTab('overdue')} />
            <StatTile label="Due today" value={counts.due_today} accent="brand" active={lens === 'me' && activeTab === 'today'} onClick={() => goTab('today')} />
            <StatTile label="Upcoming" value={counts.upcoming} active={lens === 'me' && activeTab === 'upcoming'} onClick={() => goTab('upcoming')} />
            <StatTile label="To review" value={counts.review} accent="amber" to="/review" />
            <StatTile label="Done today" value={counts.completed_today} accent="emerald" sub={counts.completed_minutes_today > 0 ? formatEstimate(counts.completed_minutes_today) : undefined} />
            <StatTile label="Points" value={w ? w.balance.toLocaleString() : '—'} accent="violet" sub={w && w.today_earned ? `+${w.today_earned} today` : undefined} to="/wallet" />
          </div>

          {/* Lens switcher — For me / Owned / Led / I'm in (mobile Today parity) */}
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
            {(Object.keys(LENS_META) as Lens[]).map((k) => {
              const M = LENS_META[k]
              const Icon = M.icon
              const active = lens === k
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setLens(k)}
                  className={clsx(
                    'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold shadow-card transition active:scale-95',
                    active ? 'bg-brand-600 text-white' : 'bg-surface text-muted hover:text-ink',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {M.label}
                  <span className={clsx('rounded-full px-1.5 text-[11px] font-bold tabular-nums', active ? 'bg-white/25' : 'bg-black/[0.05] dark:bg-white/[0.08]')}>
                    {lensCount[k]}
                  </span>
                </button>
              )
            })}
          </div>

          {/* ----- For me: the work list ----- */}
          {lens === 'me' && (
            <div id="my-work" className="scroll-mt-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="w-full max-w-xl overflow-x-auto no-scrollbar sm:w-auto">
                  <Segmented options={tabs} value={activeTab} onChange={setTab} />
                </div>
                <div className="flex flex-1 items-center gap-2 sm:flex-none">
                  <div className="relative min-w-0 flex-1 sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search tasks…"
                      aria-label="Search tasks"
                      className="w-full rounded-full border border-line bg-surface py-2 pl-9 pr-9 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:outline-none"
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
                  <div className="relative shrink-0">
                    <span ref={filterRef}>
                      <FilterButton count={activeFilterCount(filters)} onClick={() => setFilterOpen((o) => !o)} />
                    </span>
                    <Popover open={filterOpen} onClose={() => setFilterOpen(false)} anchorRef={filterRef}>
                      <div className="space-y-4">
                        {filterDims.map((dd) => (
                          <div key={dd.key} className="space-y-1">
                            <div className="text-xs font-semibold text-muted">{dd.label}</div>
                            <SearchableSelect
                              value={filters[dd.key] ?? ''}
                              onChange={(v) => setFilters((f) => ({ ...f, [dd.key]: v }))}
                              options={dd.options.map((o) => ({
                                value: o.value,
                                label: o.count != null ? `${o.label} (${o.count})` : o.label,
                              }))}
                              allowClear
                              placeholder="Any"
                            />
                          </div>
                        ))}
                        <button onClick={() => setFilters({})} className="text-sm text-brand-600">
                          Clear all
                        </button>
                      </div>
                    </Popover>
                  </div>
                </div>
              </div>

              {rows.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {rows.map((t, i) => (
                    <div key={t.name} {...rise(i)}>
                      <TodoCard todo={t} />
                    </div>
                  ))}
                </div>
              ) : q ? (
                <EmptyState icon={SearchX} title={`No matches for "${query.trim()}"`} subtitle="Try a different search." />
              ) : (
                <EmptyState
                  icon={activeTab === 'waiting' ? Pause : Sparkles}
                  title={activeTab === 'overdue' ? 'Nothing overdue' : activeTab === 'planned' ? 'Nothing planned yet' : activeTab === 'waiting' ? 'Nothing waiting' : 'All clear'}
                  subtitle={activeTab === 'planned' ? 'Hit "Plan my day" to allocate today.' : activeTab === 'waiting' ? 'No parked tasks.' : 'No tasks in this view.'}
                />
              )}
            </div>
          )}

          {/* ----- Owned ----- */}
          {lens === 'owned' && (
            <div className="space-y-4">
              {ownerApprovals.length > 0 && (
                <ActionBanner
                  icon={ShieldCheck}
                  text={`${ownerApprovals.length} todo${ownerApprovals.length > 1 ? 's' : ''} awaiting your final approval`}
                  onClick={() => navigate('/review')}
                />
              )}
              <ProjectLens items={owned} empty="You don't own any projects yet." />
            </div>
          )}

          {/* ----- Led ----- */}
          {lens === 'led' && (
            <div className="space-y-4">
              {leadChecks.length > 0 && (
                <ActionBanner
                  icon={CheckCheck}
                  text={`${leadChecks.length} todo${leadChecks.length > 1 ? 's' : ''} to check & approve`}
                  onClick={() => navigate('/review')}
                />
              )}
              <ProjectLens items={led} empty="You're not leading any projects yet." />
            </div>
          )}

          {/* ----- I'm in ----- */}
          {lens === 'in' && <ProjectLens items={memberIn} empty="You're not a member of other projects." />}
        </div>

        <aside className="space-y-6">
          {/* Weekly recap — mirrors mobile Today's RecapCard */}
          {r && (
            <Card title="This week" icon={CalendarClock}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">
                <MiniStat label="Completed" value={r.completed} />
                <MiniStat label="Focused" value={formatEstimate(r.minutes)} />
                <MiniStat label="Points" value={`+${r.points}`} accent="violet" />
                <MiniStat label="Streak" value={<span className="inline-flex items-center gap-1">{r.streak}<Flame className="h-4 w-4 text-amber-500" /></span>} />
              </div>
            </Card>
          )}

          {/* Daily verse — only when the user enabled Ayat Harian */}
          <VerseCard />

          {/* Today's meetings — carries the mark-done capability (web extra, kept) */}
          <Card title="Today's meetings" icon={Video} to="/meetings">
            {todaysMeetings.length === 0 ? (
              <p className="text-sm text-muted">No meetings scheduled today.</p>
            ) : (
              <ul className="space-y-1.5">
                {todaysMeetings.map((m) => (
                  <li key={m.name} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                    <button type="button" onClick={() => setOpenMeeting(m)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <span className="tabular-nums text-xs font-semibold text-muted">{m.scheduled_at?.slice(11, 16) ?? '--:--'}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink hover:text-brand-700 dark:hover:text-brand-300">{m.title}</span>
                    </button>
                    {m.can_mark_done && (
                      <button
                        type="button"
                        onClick={() => setMarkDoneMeeting(m)}
                        title="Mark done"
                        className="rounded-md p-1 text-emerald-600 transition hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Attendance — surfaces only when the module is in use (web extra, kept) */}
          {attToday && (
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
          )}

          {/* Jump-to launcher — the web's rich QuickActions (everything I can do, role-gated) */}
          <div>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
              <Trophy className="h-4 w-4" /> Jump to
            </h2>
            <div className="space-y-4">
              {buildNavGroups(b).map((g) => {
                const leaves = g.leaves.length
                  ? g.leaves
                  : g.to
                  ? [{ to: g.to, label: g.label, sub: '', icon: GROUP_ICON[g.id] ?? FolderKanban }]
                  : []
                if (!leaves.length) return null
                return (
                  <div key={g.id}>
                    <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted/70">{g.label}</div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-2">
                      {leaves.map((l) => {
                        const Icon = l.icon
                        return (
                          <Link
                            key={l.to}
                            to={l.to}
                            className="flex items-center gap-2.5 rounded-2xl bg-surface px-3 py-2.5 shadow-card transition hover:bg-hover/[0.03] dark:hover:bg-hover/[0.04]"
                          >
                            <Icon className="h-4 w-4 shrink-0 text-muted" />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-ink">{l.label}</span>
                              {l.sub && <span className="block truncate text-[11px] text-muted">{l.sub}</span>}
                            </span>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </aside>
      </div>

      {planOpen && <PlanDayDrawer open onClose={() => setPlanOpen(false)} candidates={planCandidates} />}
      <QuickCreate open={quickOpen} onClose={() => setQuickOpen(false)} />
      <MarkDoneSheet meeting={markDoneMeeting} onClose={() => setMarkDoneMeeting(null)} />
      <MeetingSheet meeting={openMeeting} onClose={() => setOpenMeeting(null)} />
    </Page>
  )
}

function MiniStat({ label, value, accent = 'ink' }: { label: string; value: ReactNode; accent?: keyof typeof ACCENT }) {
  return (
    <div>
      <div className={clsx('text-xl font-semibold leading-none tabular-nums', ACCENT[accent])}>{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  )
}

// Attendance card only deep-links to the admin report for managers; regular
// members just see their status. Mirrors nav.ts gating without importing it.
function canManage(b: Parameters<typeof buildNavGroups>[0]): boolean {
  return !!b && (b.roles.includes('System Manager'))
}
