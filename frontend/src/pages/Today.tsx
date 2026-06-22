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
  Clock,
  Coins,
} from 'lucide-react'
import { TabScreen, PullToRefresh } from '@/components/Layout'
import { TodoCard } from '@/components/TodoCard'
import { ProjectCard } from '@/components/ProjectCard'
import { Avatar, EmptyState, FilterChips, FullScreenLoader } from '@/components/ui'
import { FilterButton, FilterSheet } from '@/components/FilterSheet'
import { useBoot, useDashboard, useProjects, useWallet } from '@/hooks/useData'
import { applyProjectItemFilters, buildOptions, ESTIMATE_OPTIONS } from '@/lib/filters'
import { byDeadlineAsc, byDeadlineDesc, formatEstimate } from '@/lib/format'
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

// Active-tab styling per deadline bucket.
const GROUP_TONE: Record<GroupKey, { active: string; badge: string }> = {
  today: { active: 'bg-amber-500 text-white border-amber-500', badge: 'bg-white/25' },
  overdue: { active: 'bg-rose-500 text-white border-rose-500', badge: 'bg-white/25' },
  upcoming: { active: 'bg-slate-600 text-white border-slate-600 dark:bg-slate-500 dark:border-slate-500', badge: 'bg-white/25' },
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

  // Today progress ring
  const todayTotal = data ? data.counts.completed_today + data.counts.overdue + data.counts.due_today : 0
  const pct = todayTotal ? data!.counts.completed_today / todayTotal : 1

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
    return [...byId.values()].sort(byDeadlineAsc)
  })()
  const plannedTodayMin = todayTodos.reduce((s, t) => s + (t.today_allocation || 0), 0)

  const right = boot ? (
    <button onClick={() => navigate('/me')} className="transition active:scale-95">
      <Avatar name={boot.full_name} image={boot.image} size={42} />
    </button>
  ) : null

  return (
    <TabScreen title="Home" subtitle={`${greeting()}, ${firstName}`} right={right}>
      {isLoading && !data ? (
        <FullScreenLoader label="Loading your work…" />
      ) : (
        <PullToRefresh onRefresh={refetch}>
          {data && (
            <>
              {/* Hero */}
              <div className="flex items-center gap-4 rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-card">
                <div className="relative flex h-[68px] w-[68px] items-center justify-center">
                  <Ring pct={pct} />
                  <span className="absolute text-sm font-bold">{Math.round(pct * 100)}%</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-brand-200">Today</p>
                  <p className="mt-0.5 text-lg font-bold leading-tight">
                    {data.counts.completed_today} done · {data.counts.due_today} due
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2 text-xs">
                    {data.counts.overdue > 0 && (
                      <button
                        onClick={goOverdue}
                        className="inline-flex items-center gap-1 rounded-full bg-rose-500/90 px-2 py-0.5 font-semibold active:scale-95"
                      >
                        <AlertCircle className="h-3 w-3" /> {data.counts.overdue} overdue
                      </button>
                    )}
                    {data.counts.review > 0 && (
                      <button
                        onClick={() => navigate('/review')}
                        className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 font-semibold active:scale-95"
                      >
                        <CheckCheck className="h-3 w-3" /> {data.counts.review} to review
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Points card */}
              <button
                onClick={() => navigate('/points')}
                className="mt-3 flex w-full items-center gap-4 rounded-2xl bg-white dark:bg-slate-800 px-4 py-3.5 shadow-card active:scale-[0.99] transition"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-500/15 text-brand-600 dark:text-brand-400">
                  <Coins className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Points</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-slate-50 leading-tight">
                    {(wallet?.balance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-300 dark:text-slate-600 shrink-0" />
              </button>

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
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {M.label}
                      <span
                        className={clsx(
                          'rounded-full px-1.5 text-[11px] font-bold',
                          active ? 'bg-white/25' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
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
                        <div className="mt-5 grid grid-cols-3 gap-2">
                          {groups.map((g) => {
                            const on = g.key === group
                            return (
                              <button
                                key={g.key}
                                onClick={() => setGroup(g.key)}
                                className={clsx(
                                  'flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-semibold transition active:scale-95',
                                  on
                                    ? GROUP_TONE[g.key].active
                                    : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
                                )}
                              >
                                {g.label}
                                <span
                                  className={clsx(
                                    'rounded-full px-1.5 text-[11px] font-bold',
                                    on ? GROUP_TONE[g.key].badge : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
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
                          <EmptyState icon={SearchX} title={`Nothing ${active.label.toLowerCase()}`} subtitle="Try another tab or clear filters." />
                        ) : (
                          <EmptyState icon={PartyPopper} title="You're all caught up!" subtitle="Nothing assigned to you right now." />
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
