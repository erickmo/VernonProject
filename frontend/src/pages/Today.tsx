import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  Star,
  ArrowUpRight,
} from 'lucide-react'
import { TabScreen, PullToRefresh } from '@/components/Layout'
import { TodoCard } from '@/components/TodoCard'
import { ProjectCard } from '@/components/ProjectCard'
import { Avatar, EmptyState, FilterChips, FullScreenLoader } from '@/components/ui'
import { FilterButton, FilterSheet } from '@/components/FilterSheet'
import { NotificationBell } from '@/components/NotificationBell'
import { NotesButton } from '@/components/NotesButton'
import { Fab } from '@/components/Fab'
import { QuickAddSheet, type QuickAddMode } from '@/components/QuickAddSheet'
import { useBoot, useDashboard, useProjects, useWallet } from '@/hooks/useData'
import { applyProjectItemFilters, buildOptions, ESTIMATE_OPTIONS } from '@/lib/filters'
import { byDeadlineAsc, byDeadlineDesc, byEstimatedAsc, formatEstimate, formatEstimateRatio } from '@/lib/format'
import type { ProjectCard as ProjectCardType, StatusKey, ProjectItem } from '@/lib/types'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
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

type GroupKey = 'today' | 'overdue' | 'upcoming'

// Active-tab styling per deadline bucket — warm fills; overdue is a gentle
// amber (not an alarm-red) so a late task nudges rather than scolds.
const GROUP_TONE: Record<GroupKey, { active: string; badge: string }> = {
  today: { active: 'bg-brand-600 text-white shadow-sm', badge: 'bg-white/25 text-white' },
  overdue: { active: 'bg-amber-500 text-white shadow-sm', badge: 'bg-white/25 text-white' },
  upcoming: { active: 'bg-stone-600 text-white shadow-sm dark:bg-slate-600', badge: 'bg-white/25 text-white' },
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

export default function Today() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const { data, isLoading, refetch } = useDashboard()
  const { data: projects } = useProjects()
  const { data: wallet } = useWallet()
  const [lens, setLens] = useState<Lens>('me')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [sheet, setSheet] = useState(false)
  const [quickAdd, setQuickAdd] = useState<QuickAddMode | null>(null)
  // Which deadline bucket to show: today / overdue / upcoming.
  const [group, setGroup] = useState<'today' | 'overdue' | 'upcoming'>('today')

  const firstName = boot?.full_name?.split(' ')[0] ?? ''

  // Overdue badge: switch to the personal lens (where the Overdue list lives,
  // clearing any active filter that might hide it) then scroll it into view.
  const goOverdue = () => {
    setLens('me')
    setFilters({})
    setGroup('overdue')
    setTimeout(
      () => document.getElementById('today-groups')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      60,
    )
  }

  const all = useMemo(
    () => (data ? [...data.overdue, ...data.due_today, ...data.upcoming] : []),
    [data],
  )

  // Lens project sets
  const owned = (projects ?? []).filter((p) => p.is_owner)
  const led = (projects ?? []).filter((p) => p.is_leader)
  const memberIn = (projects ?? []).filter((p) => p.is_member && !p.is_owner && !p.is_leader)
  const ownerApprovals = (data?.review ?? []).filter((t) => t.status_key === 'checked').length
  const leadChecks = (data?.review ?? []).filter((t) => t.status_key === 'done').length

  const lensCount: Record<Lens, number> = {
    me: all.length,
    owned: owned.length,
    led: led.length,
    in: memberIn.length,
  }

  // Today progress ring — minutes done vs planned today (completed + due-today estimates; overdue excluded).
  const completedMin = data?.counts.completed_minutes_today ?? 0
  const dueMin = data ? data.due_today.reduce((s, t) => s + (t.estimated || 0), 0) : 0
  const todayTotalMin = completedMin + dueMin
  const pct = todayTotalMin ? completedMin / todayTotalMin : 1

  // "For me" filtering
  const statusCount = (k: StatusKey) => all.filter((t) => t.status_key === k).length
  const dimensions = useMemo(
    () => [
      { key: 'project', label: 'Project', options: buildOptions(all, (t) => t.project, (t) => t.project_name) },
      { key: 'brand', label: 'Brand', options: buildOptions(all, (t) => t.brand, (t) => t.brand) },
      { key: 'owner', label: 'Project Owner', options: buildOptions(all, (t) => t.project_owner, (t) => t.project_owner_name) },
      { key: 'leader', label: 'Project Leader', options: buildOptions(all, (t) => t.project_leader, (t) => t.project_leader_name) },
      { key: 'estimate', label: 'Estimated time', options: ESTIMATE_OPTIONS },
    ],
    [all],
  )
  const advCount = ['project', 'brand', 'owner', 'leader', 'estimate'].filter((k) => filters[k]).length
  const filtered = data
    ? {
        overdue: applyProjectItemFilters(data.overdue, filters).slice().sort(byDeadlineDesc),
        due_today: applyProjectItemFilters(data.due_today, filters).slice().sort(byDeadlineAsc),
        upcoming: applyProjectItemFilters(data.upcoming, filters).slice().sort(byDeadlineAsc),
      }
    : null

  // "Today" = due today, plus anything I've allocated time to today even if its
  // deadline is past/future — so the "Planned today" total always maps to rows
  // the user can actually see in the Today tab.
  const todayTodos = (() => {
    if (!filtered) return []
    const byId = new Map<string, ProjectItem>()
    for (const t of filtered.due_today) byId.set(t.name, t)
    for (const t of [...filtered.overdue, ...filtered.upcoming]) {
      if ((t.today_allocation || 0) > 0) byId.set(t.name, t)
    }
    // Today tab sorts quickest-first so short wins surface at the top.
    return [...byId.values()].sort(byEstimatedAsc)
  })()
  const plannedTodayMin = todayTodos.reduce((s, t) => s + (t.today_allocation || 0), 0)

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
      <NotificationBell />
      <button onClick={() => navigate('/me')} className="transition active:scale-95">
        <Avatar name={boot.full_name} image={boot.image} size={42} />
      </button>
    </div>
  ) : null

  return (
    <TabScreen title="Home" subtitle={`${greeting()}, ${firstName}`} right={right}>
      {isLoading && !data ? (
        <FullScreenLoader label="Loading your work…" />
      ) : (
        <PullToRefresh onRefresh={refetch}>
          {data && (
            <>
              {/* Hero — playful indigo "day card": soft-pop gradient, confetti
                  specks, a floating sticker, copy that nudges not nags. */}
              <div className="relative flex items-center gap-4 overflow-hidden rounded-[26px] bg-gradient-to-br from-brand-600 via-[#7A5AF8] to-[#E879C7] p-5 text-white shadow-card">
                {/* washi-tape strip */}
                <div aria-hidden className="pointer-events-none absolute -left-6 top-3 h-7 w-28 -rotate-[18deg] bg-white/25" />
                {/* confetti specks */}
                <div aria-hidden className="pointer-events-none absolute inset-0">
                  <span className="absolute left-[20%] top-3 h-2 w-2 rotate-12 rounded-[2px] bg-amber-300" />
                  <span className="absolute right-[14%] top-6 h-2.5 w-2.5 rounded-full bg-sky-300/90 animate-float" />
                  <span className="absolute right-[30%] bottom-4 h-2 w-2 rotate-45 rounded-[2px] bg-emerald-300" />
                  <span className="absolute left-[46%] bottom-3 h-1.5 w-1.5 rounded-full bg-white/80" />
                </div>
                {/* paper dot motif */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-60"
                  style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.16) 1px, transparent 1.4px)', backgroundSize: '15px 15px' }}
                />
                {/* floating icon stickers */}
                <Sparkles aria-hidden strokeWidth={2.25} className="pointer-events-none absolute -right-1 -top-1 h-7 w-7 animate-float text-amber-200" />
                <Star aria-hidden fill="currentColor" className="pointer-events-none absolute right-10 bottom-3 h-3.5 w-3.5 animate-float text-white/80" style={{ animationDelay: '0.7s' }} />
                <div className="relative z-10 flex h-[68px] w-[68px] items-center justify-center">
                  <Ring pct={pct} />
                  {/* key forces a remount so the pop replays when the ring hits 100% */}
                  <span
                    key={Math.round(pct * 100)}
                    className={clsx('absolute font-display text-base font-semibold', pct >= 1 && 'animate-pop')}
                  >
                    {Math.round(pct * 100)}%
                  </span>
                </div>
                <div className="relative z-10 min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">Your day</p>
                  <p className="mt-0.5 font-display text-xl font-semibold leading-tight">
                    {data.counts.completed_today} done
                    {data.counts.completed_today > 0 && (
                      <PartyPopper aria-hidden className="mx-1 inline-block h-5 w-5 animate-wiggle align-[-0.2em] text-amber-200" />
                    )}{' '}· {data.counts.due_today} to go
                  </p>
                  {todayTotalMin > 0 ? (
                    <p className="text-xs font-semibold text-white/85">
                      {formatEstimateRatio(completedMin, todayTotalMin)} done —{' '}
                      {pct >= 1 ? 'all wrapped up!' : pct >= 0.5 ? 'over halfway, nice!' : "you've got this"}
                    </p>
                  ) : (
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-white/85">
                      Nothing due — enjoy the breathing room <Coffee aria-hidden className="h-3.5 w-3.5" />
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-2 text-xs">
                    {data.counts.overdue > 0 && (
                      <button
                        onClick={goOverdue}
                        className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 font-bold active:scale-95"
                      >
                        <AlertCircle className="h-3 w-3" /> {data.counts.overdue} waiting
                      </button>
                    )}
                    {data.counts.review > 0 && (
                      <button
                        onClick={() => navigate('/review')}
                        className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 font-bold active:scale-95"
                      >
                        <CheckCheck className="h-3 w-3" /> {data.counts.review} to review
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Points card */}
              {(() => {
                const bal = wallet?.balance ?? 0
                const tod = wallet?.today_earned ?? 0
                const yest = wallet?.yesterday_earned ?? 0
                const isBeating = tod > 0 && tod >= yest
                const isZero = tod === 0
                return (
                  <button
                    onClick={() => navigate('/marketplace')}
                    className="mt-3 w-full rounded-3xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 px-4 py-4 shadow-card active:scale-[0.99] transition text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400">
                        <Coins className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Spendable points</p>
                        <p className="text-lg font-bold text-slate-900 dark:text-slate-50 leading-tight">
                          {bal.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-slate-300 dark:text-slate-600 shrink-0" />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          {tod > 0 && <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                          <span className={`text-sm font-bold ${tod > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                            +{tod.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                          </span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">today</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-slate-300 dark:text-slate-600">
                            +{yest.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                          </span>
                          <span className="text-xs text-slate-300 dark:text-slate-600">yest</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {isZero ? (
                          <span className="text-xs font-semibold text-amber-500">Earn your first points today →</span>
                        ) : isBeating ? (
                          <>
                            <Flame aria-hidden fill="currentColor" className="h-4 w-4 shrink-0 animate-wiggle text-orange-500" />
                            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Beating yesterday!</span>
                          </>
                        ) : (
                          <>
                            <TrendingDown className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Keep it up →</span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })()}

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
                  {(() => {
                    const groups: { key: GroupKey; label: string; todos: ProjectItem[] }[] = [
                      { key: 'today', label: 'Today', todos: todayTodos },
                      { key: 'overdue', label: 'Overdue', todos: filtered.overdue },
                      { key: 'upcoming', label: 'Upcoming', todos: filtered.upcoming },
                    ]
                    const active = groups.find((g) => g.key === group) ?? groups[0]
                    return (
                      <div id="today-groups" className="scroll-mt-4">
                        <div className="mt-5 grid grid-cols-3 gap-1 rounded-2xl bg-paper-line p-1 dark:bg-slate-800/70">
                          {groups.map((g) => {
                            const on = g.key === group
                            return (
                              <button
                                key={g.key}
                                onClick={() => setGroup(g.key)}
                                className={clsx(
                                  'flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition active:scale-95',
                                  on
                                    ? GROUP_TONE[g.key].active
                                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
                                )}
                              >
                                {g.label}
                                <span
                                  className={clsx(
                                    'rounded-full px-1.5 text-[11px] font-bold tabular-nums',
                                    on ? GROUP_TONE[g.key].badge : 'bg-white text-slate-500 dark:bg-slate-700 dark:text-slate-400',
                                  )}
                                >
                                  {g.todos.length}
                                </span>
                              </button>
                            )
                          })}
                        </div>

                        {group === 'today' && plannedTodayMin > 0 && (
                          <p className="mt-4 flex items-center gap-1.5 px-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                            <Clock className="h-3.5 w-3.5 text-brand-500" />
                            Planning for today: <span className="font-bold text-brand-600 dark:text-brand-400">{formatEstimate(plannedTodayMin)}</span>
                          </p>
                        )}

                        {active.todos.length ? (
                          <div className="mt-3 flex flex-col gap-3">
                            {active.todos.map((t) => (
                              <TodoCard key={t.name} todo={t} />
                            ))}
                          </div>
                        ) : all.length ? (
                          <EmptyState icon={SearchX} title={`Nothing ${active.label.toLowerCase()}`} subtitle="Peek at another tab, or clear the filters." />
                        ) : (
                          <EmptyState icon={PartyPopper} title="All caught up!" subtitle="Nothing on your plate right now. Go you." />
                        )}
                      </div>
                    )
                  })()}
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

      <Fab onTap={() => setQuickAdd('task')} onLongPress={() => setQuickAdd('note')} />
      <QuickAddSheet open={quickAdd !== null} mode={quickAdd ?? 'task'} onClose={() => setQuickAdd(null)} />
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
