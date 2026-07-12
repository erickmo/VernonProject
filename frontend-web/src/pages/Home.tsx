import { useEffect, useMemo, useRef, useState, type ReactNode, type ComponentType } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import {
  Sparkles, Plus, Gift, CheckCircle2, ShieldCheck, CheckCheck, Video, Check,
  CalendarClock, FolderKanban, Trophy, Flame, QrCode, ArrowRight, BarChart3,
  BookOpen, Pause, Search, X, SearchX, AlertTriangle, Users, Wand2,
} from 'lucide-react'
import {
  useBoot, useDashboard, useProjects, useWallet, useGamification, useMyAttendance,
  useMeetings, useWeeklyRecap, useClaimDaily, useSetTodoAllocations,
  useDailyVerse, useHomeBanners, usePreviousShiftShortfall,
} from '@/hooks/useData'
import { useFocusedTaskIds } from '@/hooks/useFocusTimer'
import { formatEstimate, todayISO, byAllocationAsc } from '@/lib/format'
import { buildNext, focusedFirst } from '@/lib/planDay'
import { applyProjectItemFilters, buildOptions, ESTIMATE_OPTIONS } from '@/lib/filters'
import { FilterButton, activeFilterCount, type FilterValue, type FilterDimension } from '@/components/FilterSheet'
import { SearchableSelect } from '@/components/SearchableSelect'
import { MeetingReminder, upcomingMeetings } from '@/components/MeetingReminder'
import { MarkDoneSheet } from '@/components/MarkDoneSheet'
import { MeetingSheet } from '@/components/MeetingSheet'
import { Popover } from '@web/components/overlays/Popover'
import { Segmented, EmptyState } from '@/components/ui'
import { Page, PageHeader } from '@web/components/Page'
import { Button, ErrorState, Skeleton } from '@web/components/ui'
import { DataTable, StatusCell, type Column } from '@web/components/DataTable'
import { PlanDayDrawer } from '@web/components/PlanDayDrawer'
import { useAutoPlanToday, useAutoFillPlan } from '@/hooks/usePlanDay'
import { QuickCreate } from '@web/components/QuickCreate'
import { buildNavGroups } from '@web/lib/nav'
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

function StatTile({
  label, value, sub, accent = 'ink', to, onClick, active,
}: {
  label: string; value: ReactNode; sub?: ReactNode; accent?: keyof typeof ACCENT
  to?: string; onClick?: () => void; active?: boolean
}) {
  const cls = clsx(
    'block rounded-lg border bg-surface p-3 text-left transition',
    active ? 'border-brand-500 ring-1 ring-brand-500' : 'border-line',
    (to || onClick) && 'hover:bg-hover/[0.03] dark:hover:bg-hover/[0.04]',
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
    <div className={clsx('rounded-lg border border-line bg-surface p-4', className)}>
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

// Inline "plan for today" toggle — one mutation per row, so it lives in its own
// component (hooks can't run inside a table cell render fn).
function PlanCell({ todo }: { todo: ProjectItem }) {
  const setAlloc = useSetTodoAllocations(todo.name)
  const planned = todo.today_allocation > 0
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (setAlloc.isPending) return
    const minutes = planned ? 0 : todo.estimated > 0 ? todo.estimated : 30
    setAlloc.mutate(buildNext(todo.allocations ?? [], todayISO(), minutes))
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-disabled={setAlloc.isPending}
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold transition',
        setAlloc.isPending && 'opacity-50',
        planned
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
          : 'bg-black/[0.04] text-muted hover:text-ink dark:bg-white/[0.06]',
      )}
    >
      {planned ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
      {planned ? formatEstimate(todo.today_allocation) : 'Plan'}
    </button>
  )
}

const WORK_COLUMNS: Column<ProjectItem>[] = [
  {
    key: 'task',
    header: 'Task',
    sortValue: (r) => r.to_do,
    render: (r) => (
      <div className="min-w-0 max-w-[38rem]">
        <div className={clsx(
          'truncate font-medium',
          r.status_key === 'cancelled' ? 'text-muted line-through'
            : r.is_overdue ? 'text-rose-700 dark:text-rose-400' : 'text-ink',
        )}>{r.to_do}</div>
        <div className="truncate text-xs text-muted">{r.project_name} · {r.project_detail_title}</div>
      </div>
    ),
  },
  {
    key: 'deadline',
    header: 'Deadline',
    width: 'w-40',
    sortValue: (r) => r.deadline ?? '',
    render: (r) => r.deadline
      ? <span className={clsx('text-sm', r.is_overdue ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-muted')}>
          {r.is_overdue ? `Overdue · ${r.deadline_human}` : r.deadline_human}
        </span>
      : <span className="text-sm text-muted">—</span>,
  },
  {
    key: 'est',
    header: 'Est',
    width: 'w-20',
    align: 'right',
    sortValue: (r) => r.estimated,
    render: (r) => <span className="text-sm text-muted">{r.estimated > 0 ? formatEstimate(r.estimated) : '—'}</span>,
  },
  {
    key: 'plan',
    header: 'Today',
    width: 'w-24',
    render: (r) => <PlanCell todo={r} />,
  },
  {
    key: 'status',
    header: 'Status',
    width: 'w-52',
    render: (r) => <StatusCell todo={r} />,
  },
]

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
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Skeleton className="h-96 rounded-lg xl:col-span-8" />
        <Skeleton className="h-96 rounded-lg xl:col-span-4" />
      </div>
    </div>
  )
}

function VerseCard() {
  const { data: verse } = useDailyVerse()
  if (!verse) return null
  return (
    <div className="mt-6 rounded-lg border border-line bg-surface p-5">
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
    <div className="relative mb-6 max-w-3xl overflow-hidden rounded-xl border border-line">
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

  // review split (approvals I owe)
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

  // my projects (things I steer)
  const myProjects = (projects.data ?? [])
    .filter((p) => p.is_owner || p.is_leader)
    .slice(0, 6)

  // projects I'm a member of but don't own or lead — mobile Today's "I'm in" lens
  const memberProjects = (projects.data ?? [])
    .filter((p) => p.is_member && !p.is_owner && !p.is_leader)
    .slice(0, 6)

  const daily = gam.data?.daily
  const w = wallet.data
  const r = recap.data

  const needCount = counts.overdue + counts.due_today + counts.review
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  const firstName = (b?.full_name || '').trim().split(' ')[0]

  return (
    <Page>
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

      {/* Vibrant meeting reminder — impossible to miss when meetings are on today */}
      <MeetingReminder
        meetings={upcoming}
        onOpen={() => navigate('/meetings')}
        onOpenMeeting={setOpenMeeting}
      />

      {/* Managed promo banners — from Settings → Home Banners */}
      <WebBanners slides={banners.data ?? []} />

      {/* DANGER: previous shift day fell below the daily-minimum minutes setting */}
      {shortfall.data?.under && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg border border-rose-300 bg-rose-50 p-4 dark:border-rose-500/40 dark:bg-rose-500/10">
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

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Overdue" value={counts.overdue} accent="rose" active={activeTab === 'overdue'} onClick={() => setTab('overdue')} />
        <StatTile label="Due today" value={counts.due_today} accent="brand" active={activeTab === 'today'} onClick={() => setTab('today')} />
        <StatTile label="Upcoming" value={counts.upcoming} active={activeTab === 'upcoming'} onClick={() => setTab('upcoming')} />
        <StatTile label="To review" value={counts.review} accent="amber" to="/review" />
        <StatTile label="Done today" value={counts.completed_today} accent="emerald" sub={counts.completed_minutes_today > 0 ? formatEstimate(counts.completed_minutes_today) : undefined} />
        <StatTile label="Points" value={w ? w.balance.toLocaleString() : '—'} accent="violet" sub={w && w.today_earned ? `+${w.today_earned} today` : undefined} to="/wallet" />
      </div>

      {/* Daily verse — only when the user enabled Ayat Harian */}
      <VerseCard />

      {/* main work grid */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* left: my work + review */}
        <div className="space-y-6 xl:col-span-8">
          <Card
            title="My work"
            icon={activeTab === 'waiting' ? Pause : undefined}
            action={
              <div className="w-full max-w-md overflow-x-auto no-scrollbar">
                <Segmented options={tabs} value={activeTab} onChange={setTab} />
              </div>
            }
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search tasks…"
                  aria-label="Search tasks"
                  className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-9 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:outline-none"
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
            <DataTable
              rows={rows}
              columns={WORK_COLUMNS}
              getKey={(t) => t.name}
              onRowClick={(t) => navigate(`/project-item/${encodeURIComponent(t.name)}`)}
              empty={
                q ? (
                  <EmptyState icon={SearchX} title={`No matches for "${query.trim()}"`} subtitle="Try a different search." />
                ) : (
                  <EmptyState
                    icon={activeTab === 'waiting' ? Pause : CheckCircle2}
                    title={activeTab === 'overdue' ? 'Nothing overdue' : activeTab === 'planned' ? 'Nothing planned yet' : activeTab === 'waiting' ? 'Nothing waiting' : 'All clear'}
                    subtitle={activeTab === 'planned' ? 'Hit "Plan my day" to allocate today.' : activeTab === 'waiting' ? 'No parked tasks.' : 'No tasks in this view.'}
                  />
                )
              }
            />
          </Card>

          {review.length > 0 && (
            <Card title={`Waiting on you to approve · ${review.length}`} icon={ShieldCheck} to="/review">
              <div className="space-y-1.5">
                {leadChecks.length > 0 && (
                  <Link to="/review" className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-ink transition hover:bg-hover/[0.03]">
                    <CheckCheck className="h-4 w-4 shrink-0 text-amber-500" />
                    <span>{leadChecks.length} to check &amp; approve as leader</span>
                    <ArrowRight className="ml-auto h-4 w-4 text-muted" />
                  </Link>
                )}
                {ownerApprovals.length > 0 && (
                  <Link to="/review" className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-ink transition hover:bg-hover/[0.03]">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
                    <span>{ownerApprovals.length} awaiting your final approval as owner</span>
                    <ArrowRight className="ml-auto h-4 w-4 text-muted" />
                  </Link>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* right: context */}
        <div className="space-y-6 xl:col-span-4">
          <Card title="Today's meetings" icon={Video} to="/meetings">
            {todaysMeetings.length === 0 ? (
              <p className="text-sm text-muted">No meetings scheduled today.</p>
            ) : (
              <ul className="space-y-1.5">
                {todaysMeetings.map((m) => (
                  <li key={m.name} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
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

          <Card title="Projects I steer" icon={FolderKanban} to="/projects">
            {myProjects.length === 0 ? (
              <p className="text-sm text-muted">You don't own or lead any projects.</p>
            ) : (
              <ul className="space-y-2">
                {myProjects.map((p) => {
                  const pct = p.item_total ? Math.round((p.item_done / p.item_total) * 100) : 0
                  return (
                    <li key={p.name}>
                      <Link to={`/project/${encodeURIComponent(p.name)}`} className="block rounded-lg border border-line px-3 py-2 transition hover:bg-hover/[0.03]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-sm font-medium text-ink">{p.project_name}</span>
                          <span className="shrink-0 text-xs tabular-nums text-muted">{pct}%</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                        </div>
                        {(p.overdue > 0 || p.review > 0) && (
                          <div className="mt-1 flex gap-2 text-[11px]">
                            {p.overdue > 0 && <span className="text-rose-600 dark:text-rose-400">{p.overdue} overdue</span>}
                            {p.review > 0 && <span className="text-amber-600 dark:text-amber-400">{p.review} to review</span>}
                          </div>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          {/* ponytail: list markup duplicated from "Projects I steer" to stay strictly
              additive (leaves the working steer card untouched); dedupe if a third copy appears */}
          <Card title="Projects I'm in" icon={Users} to="/projects">
            {memberProjects.length === 0 ? (
              <p className="text-sm text-muted">You're not a member of other projects.</p>
            ) : (
              <ul className="space-y-2">
                {memberProjects.map((p) => {
                  const pct = p.item_total ? Math.round((p.item_done / p.item_total) * 100) : 0
                  return (
                    <li key={p.name}>
                      <Link to={`/project/${encodeURIComponent(p.name)}`} className="block rounded-lg border border-line px-3 py-2 transition hover:bg-hover/[0.03]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-sm font-medium text-ink">{p.project_name}</span>
                          <span className="shrink-0 text-xs tabular-nums text-muted">{pct}%</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                        </div>
                        {(p.overdue > 0 || p.review > 0) && (
                          <div className="mt-1 flex gap-2 text-[11px]">
                            {p.overdue > 0 && <span className="text-rose-600 dark:text-rose-400">{p.overdue} overdue</span>}
                            {p.review > 0 && <span className="text-amber-600 dark:text-amber-400">{p.review} to review</span>}
                          </div>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          {r && (
            <Card title="This week" icon={CalendarClock}>
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label="Completed" value={r.completed} />
                <MiniStat label="Focused" value={formatEstimate(r.minutes)} />
                <MiniStat label="Points" value={`+${r.points}`} accent="violet" />
                <MiniStat label="Streak" value={<span className="inline-flex items-center gap-1">{r.streak}<Flame className="h-4 w-4 text-amber-500" /></span>} />
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* jump-to launcher — everything I can do, role-gated via nav.ts */}
      <div className="mt-8">
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
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {leaves.map((l) => {
                    const Icon = l.icon
                    return (
                      <Link
                        key={l.to}
                        to={l.to}
                        className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5 transition hover:bg-hover/[0.03] dark:hover:bg-hover/[0.04]"
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
