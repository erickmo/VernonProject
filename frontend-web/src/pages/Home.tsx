import { useEffect, useMemo, useRef, useState, type ReactNode, type ComponentType } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import {
  Sparkles, Plus, Gift, ShieldCheck, CheckCheck, CalendarClock,
  FolderKanban, Flame, QrCode, BookOpen, Pause, Search, X, Clock, CalendarDays,
  SearchX, AlertTriangle, Users, Wand2, User, KeyRound, Flag, ChevronRight,
} from 'lucide-react'
import {
  useBoot, useDashboard, useProjects, useWallet, useGamification, useMyAttendance,
  useMeetings, useWeeklyRecap, useClaimDaily, useDailyVerse, useHomeBanners,
  usePreviousShiftShortfall,
} from '@/hooks/useData'
import { useFocusedTaskIds } from '@/hooks/useFocusTimer'
import { formatEstimate, todayISO, byAllocationAsc, byDeadlineAsc, byDeadlineDesc } from '@/lib/format'
import { focusedFirst } from '@/lib/planDay'
import { applyProjectItemFilters, buildOptions, ESTIMATE_OPTIONS } from '@/lib/filters'
import { ACTIONS } from '@/lib/actions'
import { FilterButton, activeFilterCount, type FilterValue, type FilterDimension } from '@/components/FilterSheet'
import { SearchableSelect } from '@/components/SearchableSelect'
import { MeetingReminder, upcomingMeetings } from '@/components/MeetingReminder'
import { MeetingSheet } from '@/components/MeetingSheet'
import { TodoCard } from '@/components/TodoCard'
import { ListProgress, ListSummary } from '@web/components/PlanList'
import { Popover } from '@web/components/overlays/Popover'
import { Segmented, EmptyState } from '@/components/ui'
import { Page, rise } from '@web/components/Page'
import { Button, ErrorState, Skeleton } from '@web/components/ui'
import { CardList } from '@web/components/Card'
import { PlanDayDrawer } from '@web/components/PlanDayDrawer'
import { useAutoPlanToday, useAutoFillPlan } from '@/hooks/usePlanDay'
import { QuickCreate } from '@web/components/QuickCreate'
import { DatePicker } from '@web/components/DatePicker'
import { ThreeColProjectList } from '@web/components/ProjectColumns'
import { usePersistentState } from '@web/lib/usePersistentState'
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

// Accent → soft tile fill + icon-chip fill. Shared by StatTile / HeroChip / MiniStat
// so every accented block (rose overdue, amber review, violet points…) reads as one system.
const TINT: Record<string, { tile: string; chip: string }> = {
  rose: { tile: 'bg-rose-50 dark:bg-rose-500/10', chip: 'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300' },
  amber: { tile: 'bg-amber-50 dark:bg-amber-500/10', chip: 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300' },
  emerald: { tile: 'bg-emerald-50 dark:bg-emerald-500/10', chip: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300' },
  violet: { tile: 'bg-violet-50 dark:bg-violet-500/10', chip: 'bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300' },
  brand: { tile: 'bg-brand-50 dark:bg-brand-500/10', chip: 'bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300' },
  ink: { tile: 'bg-surface', chip: 'bg-paper-line text-muted dark:bg-slate-800 dark:text-slate-300' },
}

// Small uppercase zone label — gives the long dashboard scannable rhythm.
function SectionHead({ children }: { children: ReactNode }) {
  return <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">{children}</h2>
}

// Soft-pop stat tile — the "at a glance" summary blocks that stand in for the
// mobile Today Spotlight/progress hero.
function StatTile({
  label, value, sub, accent = 'ink', icon: Icon, to, onClick, active,
}: {
  label: string; value: ReactNode; sub?: ReactNode; accent?: keyof typeof ACCENT
  icon?: ComponentType<{ className?: string }>; to?: string; onClick?: () => void; active?: boolean
}) {
  const t = TINT[accent] ?? TINT.ink
  const clickable = !!(to || onClick)
  const cls = clsx(
    'group block rounded-2xl p-4 text-left shadow-card transition', t.tile,
    active && 'ring-2 ring-brand-500',
    clickable && 'hover:-translate-y-0.5 active:scale-[0.99]',
  )
  const inner = (
    <>
      <div className="flex items-center justify-between">
        {Icon && (
          <span className={clsx('flex h-8 w-8 items-center justify-center rounded-xl', t.chip)}>
            <Icon className="h-4 w-4" />
          </span>
        )}
        {clickable && <ChevronRight className="h-4 w-4 text-muted/40 transition group-hover:translate-x-0.5 group-hover:text-muted" />}
      </div>
      <div className={clsx('mt-3 font-display text-3xl font-semibold tabular-nums leading-none', ACCENT[accent])}>{value}</div>
      <div className="mt-1 text-xs font-medium text-muted">{label}</div>
      {sub != null && <div className="text-xs text-muted">{sub}</div>}
    </>
  )
  if (to) return <Link to={to} className={cls}>{inner}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={clsx(cls, 'w-full')}>{inner}</button>
  return <div className={cls}>{inner}</div>
}

// Actionable count pill for the hero — one tap jumps to that queue.
function HeroChip({
  icon: Icon, accent, label, n, onClick,
}: {
  icon: ComponentType<{ className?: string }>; accent: keyof typeof ACCENT; label: string; n: number; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 active:scale-95', (TINT[accent] ?? TINT.ink).chip)}
    >
      <Icon className="h-4 w-4" />
      <span className="tabular-nums">{n}</span>
      <span className="font-medium opacity-80">{label}</span>
    </button>
  )
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
        <div className="mt-1.5 flex gap-2 text-xs">
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

// Home work view: axis (Plan/Deadline/Waiting) + sub-tab within Plan/Deadline. Mobile Today parity.
type Axis = 'plan' | 'deadline' | 'waiting'
type PlanSub = 'today' | 'past' | 'upcoming'
type DeadlineSub = 'today' | 'overdue' | 'upcoming'

// Does any of a todo's day-allocations satisfy pred? Drives the Plan-axis buckets.
const allocOn = (t: ProjectItem, pred: (d: string) => boolean) =>
  (t.allocations ?? []).some((a) => a.date != null && pred(a.date))


// Shortcut tiles — mobile QuickActions parity from the shared ACTIONS list, but a
// web-styled wrapping grid (no mobile -mx-4 horizontal scroll).
function ShortcutGrid() {
  const navigate = useNavigate()
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-card sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
        <Sparkles className="h-4 w-4" /> Shortcuts
      </h2>
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12">
        {ACTIONS.map((a) => (
          <button
            key={a.title}
            type="button"
            onClick={() => navigate(a.to)}
            className="flex flex-col items-center gap-1.5 transition active:scale-95"
          >
            <span className={clsx('flex h-12 w-12 items-center justify-center rounded-2xl shadow-card', a.tile)}>
              <a.icon className="h-5 w-5" strokeWidth={2} />
            </span>
            <span className="w-full truncate text-center text-xs font-semibold text-muted">{a.short}</span>
          </button>
        ))}
      </div>
    </div>
  )
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
    <div className="rounded-2xl bg-amber-50 p-5 shadow-card dark:bg-amber-500/10">
      <div className="mb-2 flex items-center gap-2 text-amber-700 dark:text-amber-400">
        <BookOpen className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">Ayat Hari Ini</span>
      </div>
      <p className="max-w-2xl text-base leading-relaxed text-amber-950 dark:text-amber-50">"{verse.text}"</p>
      <p className="mt-2 text-sm font-medium text-amber-700/80 dark:text-amber-400/80">— {verse.reference}</p>
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
  const [openMeeting, setOpenMeeting] = useState<MeetingListItem | null>(null)
  const banners = useHomeBanners()
  const shortfall = usePreviousShiftShortfall()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [lens, setLens] = useState<Lens>('me')
  const [axis, setAxis] = useState<Axis>('plan')
  const [planSub, setPlanSub] = useState<PlanSub>('today')
  const [deadlineSub, setDeadlineSub] = useState<DeadlineSub>('today')
  const [pickedDate, setPickedDate] = useState('')
  const [proj1, setProj1] = usePersistentState('home.proj1') // column 1 filter ('' = all)
  const [proj2, setProj2] = usePersistentState('home.proj2') // project focused in column 2
  const [proj3, setProj3] = usePersistentState('home.proj3') // project focused in column 3
  const [proj4, setProj4] = usePersistentState('home.proj4') // project focused in column 4 (xl only)
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
  const activeTodos = useMemo(() => allTasks.filter((t) => !t.is_waiting), [allTasks])
  const filteredActive = useMemo(() => applyProjectItemFilters(activeTodos, filters), [activeTodos, filters])

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

  // KPI tiles jump to the "For me" Deadline axis on a given sub-tab.
  const goDeadline = (sub: DeadlineSub) => {
    setLens('me')
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
    today: applyProjectItemFilters(dueTodayActive, filters).slice().sort(byDeadlineAsc),
    overdue: applyProjectItemFilters(overdueActive, filters).slice().sort(byDeadlineDesc),
    upcoming: applyProjectItemFilters(upcomingActive, filters).slice().sort(byDeadlineAsc),
  }
  const waitingList = waiting.slice().sort(byDeadlineAsc)

  // Multi-dimension filters (project/brand/owner/leader/estimate) — options derive
  // from the active (non-waiting) work set.
  const filterDims: FilterDimension[] = [
    { key: 'project', label: 'Project', options: buildOptions(activeTodos, (t) => t.project, (t) => t.project_name) },
    { key: 'brand', label: 'Brand', options: buildOptions(activeTodos, (t) => t.brand, (t) => t.brand) },
    { key: 'owner', label: 'Project Owner', options: buildOptions(activeTodos, (t) => t.project_owner, (t) => t.project_owner_name) },
    { key: 'leader', label: 'Project Leader', options: buildOptions(activeTodos, (t) => t.project_leader, (t) => t.project_leader_name) },
    { key: 'estimate', label: 'Estimated time', options: ESTIMATE_OPTIONS },
  ]

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
          renderCard={(t, i) => (
            <div key={t.name} {...rise(i)}>
              <TodoCard todo={t} />
            </div>
          )}
          proj1={proj1}
          setProj1={setProj1}
          proj2={proj2}
          setProj2={setProj2}
          proj3={proj3}
          setProj3={setProj3}
          proj4={proj4}
          setProj4={setProj4}
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

  // review split (approvals I owe) — surfaced via the per-lens ActionBanners.
  const review = d.review ?? []
  const ownerApprovals = review.filter((t) => t.status_key === 'checked')
  const leadChecks = review.filter((t) => t.status_key === 'done')

  const today = todayISO()
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
    me: activeTodos.length,
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

  // Today momentum for the hero ring: done-minutes over the day's plate.
  const doneMinToday = counts.completed_minutes_today
  const todayTotalMin = doneMinToday + plannedTodayMin
  const todayPct = todayTotalMin ? Math.round((doneMinToday / todayTotalMin) * 100) : 0
  const showTodayRing = todayTotalMin > 0 || counts.completed_today > 0

  return (
    <Page className="space-y-6">
      {/* Hero — command-center greeting; today's demands surface as tappable focal chips */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-50 via-surface to-surface p-5 shadow-card dark:from-brand-500/10 dark:via-slate-900 dark:to-slate-900 sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-500/10 blur-3xl dark:bg-brand-500/20" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">{dateStr}</p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-ink sm:text-3xl">{firstName ? `${greeting}, ${firstName}` : greeting}</h1>
            <p className="mt-1 text-sm text-muted">
              {needCount === 0
                ? `You're all caught up${daily?.streak ? ` — 🔥 ${daily.streak}-day streak` : ''}.${counts.upcoming > 0 ? '' : ' Enjoy the clear plate.'}`
                : `${needCount} thing${needCount === 1 ? '' : 's'} need you today.`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            {showTodayRing && <TodayRing pct={todayPct} doneCount={counts.completed_today} doneMin={doneMinToday} />}
            <div className="flex items-center gap-2">
              {daily?.can_claim && (
                <Button variant="secondary" size="sm" onClick={() => claim.mutate()} disabled={claim.isPending}>
                  <Gift className="h-4 w-4" /> Claim +{daily.claimable}
                </Button>
              )}
              <Button variant="primary" size="sm" onClick={() => setQuickOpen(true)}>
                <Plus className="h-4 w-4" /> New task
              </Button>
            </div>
          </div>
        </div>
        {needCount > 0 ? (
          <div className="relative mt-4 flex flex-wrap gap-2">
            {counts.overdue > 0 && <HeroChip icon={AlertTriangle} accent="rose" label="overdue" n={counts.overdue} onClick={() => goDeadline('overdue')} />}
            {counts.due_today > 0 && <HeroChip icon={Clock} accent="brand" label="due today" n={counts.due_today} onClick={() => goDeadline('today')} />}
            {counts.review > 0 && <HeroChip icon={ShieldCheck} accent="amber" label="to review" n={counts.review} onClick={() => navigate('/review')} />}
          </div>
        ) : counts.upcoming > 0 ? (
          // Caught up: no dead-end — offer the forward look at what's coming.
          <div className="relative mt-4">
            <HeroChip icon={CalendarDays} accent="brand" label="upcoming" n={counts.upcoming} onClick={() => goDeadline('upcoming')} />
          </div>
        ) : null}
      </div>

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

      {/* Meeting reminder (left) + at-a-glance stats (right) */}
      <section className="space-y-3">
        <SectionHead>At a glance</SectionHead>
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <MeetingReminder
            meetings={upcoming}
            onOpen={() => navigate('/meetings')}
            onOpenMeeting={setOpenMeeting}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Overdue" value={counts.overdue} accent="rose" icon={AlertTriangle} active={lens === 'me' && axis === 'deadline' && deadlineSub === 'overdue'} onClick={() => goDeadline('overdue')} />
            <StatTile label="Due today" value={counts.due_today} accent="brand" icon={Clock} active={lens === 'me' && axis === 'deadline' && deadlineSub === 'today'} onClick={() => goDeadline('today')} />
            <StatTile label="Upcoming" value={counts.upcoming} icon={CalendarDays} active={lens === 'me' && axis === 'deadline' && deadlineSub === 'upcoming'} onClick={() => goDeadline('upcoming')} />
            <StatTile label="To review" value={counts.review} accent="amber" icon={ShieldCheck} to="/review" />
            <StatTile label="Done today" value={counts.completed_today} accent="emerald" icon={CheckCheck} sub={counts.completed_minutes_today > 0 ? formatEstimate(counts.completed_minutes_today) : undefined} />
            <StatTile label="Points" value={w ? w.balance.toLocaleString() : '—'} accent="violet" icon={Sparkles} sub={w && w.today_earned ? `+${w.today_earned} today` : undefined} to="/wallet" />
          </div>
        </div>
      </section>

      {/* Shortcut tiles — mobile QuickActions parity */}
      <ShortcutGrid />

      <div className="space-y-6 xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start xl:gap-6 xl:space-y-0">
        <div className="min-w-0 space-y-6">
          <SectionHead>Your work</SectionHead>
          {/* Lens switcher — For me / Owned / Led / I'm in (mobile Today parity) */}
          <div className="no-scrollbar -mx-1 -mt-3 flex gap-2 overflow-x-auto px-1">
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
                  <span className={clsx('rounded-full px-1.5 text-xs font-bold tabular-nums', active ? 'bg-white/25' : 'bg-black/[0.05] dark:bg-white/[0.08]')}>
                    {lensCount[k]}
                  </span>
                </button>
              )
            })}
          </div>

          {/* ----- For me: Plan / Deadline / Waiting axis (mobile parity) ----- */}
          {lens === 'me' && (
            <div id="my-work" className="scroll-mt-4 space-y-4">
              {/* Work well — groups the toggle toolbar with its todo list in one recessed
                  tray so the two read as a single unit; the white cards float inside it. */}
              <div className="space-y-3 rounded-[1.75rem] border border-line bg-surface p-2.5 sm:p-3">
              {/* ---- Unified work toolbar: axis + search (top) · sub-tabs + Pick + filter (refine) ---- */}
              <div className="rounded-2xl bg-surface shadow-card">
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
                        <Segmented
                          options={[
                            { value: 'today', label: 'Today', badge: planGroups.today.length || undefined },
                            { value: 'past', label: 'Past', badge: planGroups.past.length || undefined },
                            { value: 'upcoming', label: 'Upcoming', badge: planGroups.upcoming.length || undefined },
                          ]}
                          value={pickedDate ? ('' as PlanSub) : planSub}
                          onChange={(k) => {
                            setPlanSub(k)
                            setPickedDate('')
                          }}
                        />
                      ) : (
                        <Segmented
                          options={[
                            { value: 'today', label: 'Today', badge: deadlineLists.today.length || undefined },
                            { value: 'overdue', label: 'Overdue', badge: deadlineLists.overdue.length || undefined },
                            { value: 'upcoming', label: 'Upcoming', badge: deadlineLists.upcoming.length || undefined },
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
                )}
              </div>

              {axis === 'plan' && (
                <>
                  {/* Plan-my-day CTA + Auto-plan — lives inside the Plan tab */}
                  <div className="flex items-stretch gap-2">
                    <button
                      type="button"
                      onClick={() => setPlanOpen(true)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-brand-50 p-3.5 text-left shadow-card transition active:scale-[0.99] dark:bg-brand-500/15"
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
                      className="flex w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl bg-surface text-brand-700 shadow-card transition active:scale-95 disabled:opacity-50 dark:text-brand-300"
                    >
                      <Wand2 className={clsx('h-5 w-5', autoFill.saving && 'animate-pulse')} />
                      <span className="text-xs font-semibold">{autoFill.saving ? 'Planning…' : 'Auto-plan'}</span>
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
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-2">
                <MiniStat label="Completed" value={r.completed} accent="emerald" icon={CheckCheck} />
                <MiniStat label="Focused" value={formatEstimate(r.minutes)} accent="brand" icon={Clock} />
                <MiniStat label="Points" value={`+${r.points}`} accent="violet" icon={Sparkles} />
                <MiniStat label="Streak" value={r.streak} accent="amber" icon={Flame} />
              </div>
            </Card>
          )}

          {/* Daily verse — only when the user enabled Ayat Harian */}
          <VerseCard />

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
        </aside>
      </div>

      {planOpen && <PlanDayDrawer open onClose={() => setPlanOpen(false)} candidates={planCandidates} />}
      <QuickCreate open={quickOpen} onClose={() => setQuickOpen(false)} />
      <MeetingSheet meeting={openMeeting} onClose={() => setOpenMeeting(null)} />
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
