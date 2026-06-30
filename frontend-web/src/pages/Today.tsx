import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDashboard, useWallet, useProjects } from '@/hooks/useData'
import { TodoCard } from '@/components/TodoCard'
import { ProjectCard } from '@/components/ProjectCard'
import { Segmented, EmptyState } from '@/components/ui'
import { ErrorState, Skeleton, CardGridSkeleton } from '@web/components/ui'
import { FilterButton, activeFilterCount, type FilterDimension, type FilterValue } from '@/components/FilterSheet'
import { applyProjectItemFilters, buildOptions, ESTIMATE_OPTIONS } from '@/lib/filters'
import { formatEstimate, byAllocationAsc } from '@/lib/format'
import { Popover } from '@web/components/overlays/Popover'
import { SearchableSelect } from '@/components/SearchableSelect'
import { CheckCircle2, ShieldCheck, CheckCheck, FolderKanban, Sparkles } from 'lucide-react'
import { PlanDayDrawer } from '@web/components/PlanDayDrawer'
import { Page, PageHeader, Section } from '@web/components/Page'
import { todoRelationChips } from '@web/components/RelationsRail'
import type { ProjectItem } from '@/lib/types'

function TodaySkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="flex flex-wrap gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-16 rounded-lg" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

type Lens = 'mine' | 'owned' | 'led' | 'in'
const LENSES: { value: Lens; label: string }[] = [
  { value: 'mine', label: 'For me' },
  { value: 'owned', label: 'Owned' },
  { value: 'led', label: 'Led' },
  { value: 'in', label: "I'm in" },
]

export default function Today() {
  const dash = useDashboard()
  useWallet() // ponytail: kept for data prefetch parity; not rendered in new layout
  const projects = useProjects()
  const [lens, setLens] = useState<Lens>('mine')
  const [filters, setFilters] = useState<FilterValue>({})
  // FilterButton does NOT forwardRef — anchor the Popover via a wrapping span
  const filterRef = useRef<HTMLSpanElement>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)

  const allTasks: ProjectItem[] = useMemo(() => {
    const d = dash.data
    if (!d) return []
    return [...d.overdue, ...d.due_today, ...d.upcoming]
  }, [dash.data])

  // 'For me' = all dashboard tasks (the dashboard is already scoped to the user);
  // advanced filters apply only here. Owned / Led / I'm-in are PROJECT lenses,
  // sliced off useProjects() flags, matching the mobile Today page.
  const dimensions: FilterDimension[] = useMemo(() => [
    { key: 'status', label: 'Status', options: buildOptions(allTasks, (t) => t.status_key, (t) => t.status) },
    { key: 'project', label: 'Project', options: buildOptions(allTasks, (t) => t.project, (t) => t.project_name) },
    { key: 'brand', label: 'Brand', options: buildOptions(allTasks, (t) => t.brand, (t) => t.brand) },
    { key: 'owner', label: 'Project Owner', options: buildOptions(allTasks, (t) => t.project_owner, (t) => t.project_owner_name) },
    { key: 'leader', label: 'Project Leader', options: buildOptions(allTasks, (t) => t.project_leader, (t) => t.project_leader_name) },
    { key: 'estimate', label: 'Estimated time', options: ESTIMATE_OPTIONS },
  ], [allTasks])

  const visible = useMemo(() => applyProjectItemFilters(allTasks, filters), [allTasks, filters])

  // Plan-my-day candidates (mobile parity): due-today + overdue + anything
  // already allocated today. plannedTodos = today's plan, fewest-minutes-first.
  const planCandidates = useMemo(() => {
    const d = dash.data
    if (!d) return []
    const byId = new Map<string, ProjectItem>()
    for (const t of [...d.due_today, ...d.overdue]) byId.set(t.name, t)
    for (const t of d.upcoming) if ((t.today_allocation || 0) > 0) byId.set(t.name, t)
    return [...byId.values()]
  }, [dash.data])
  const plannedTodos = useMemo(
    () => allTasks.filter((t) => (t.today_allocation || 0) > 0).slice().sort(byAllocationAsc),
    [allTasks],
  )
  const plannedTodayMin = plannedTodos.reduce((s, t) => s + (t.today_allocation || 0), 0)

  if (!dash.data) {
    return dash.isError ? (
      <ErrorState onRetry={() => dash.refetch()} />
    ) : (
      <TodaySkeleton />
    )
  }

  const counts = dash.data.counts

  // Owner/leader review banners (same status_key split as mobile).
  const review = dash.data.review ?? []
  const ownerApprovals = review.filter((t) => t.status_key === 'checked').length
  const leadChecks = review.filter((t) => t.status_key === 'done').length

  // Project lenses.
  const projList = projects.data ?? []
  const owned = projList.filter((p) => p.is_owner)
  const led = projList.filter((p) => p.is_leader)
  const memberIn = projList.filter((p) => p.is_member && !p.is_owner && !p.is_leader)
  const lensProjects = lens === 'owned' ? owned : lens === 'led' ? led : memberIn
  const lensEmpty =
    lens === 'owned' ? "You don't own any projects yet."
    : lens === 'led' ? "You're not leading any projects yet."
    : "You're not a member of other projects."

  // A task due today belongs in "Today" even with no allocation (mobile parity);
  // upcoming tasks the user allocated time to today get promoted into it too.
  const dueTodayIds = new Set(dash.data.due_today.map((t) => t.name))
  const groups: { title: string; items: ProjectItem[] }[] = [
    { title: 'Overdue', items: visible.filter((t) => t.is_overdue) },
    { title: 'Today', items: visible.filter((t) => !t.is_overdue && (dueTodayIds.has(t.name) || !!t.today_allocation)) },
    { title: 'Upcoming', items: visible.filter((t) => !t.is_overdue && !dueTodayIds.has(t.name) && !t.today_allocation) },
  ]

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <Page>
      <PageHeader title={greeting} subtitle={dateStr} />

      {/* Compact stat strip */}
      <div className="flex flex-wrap gap-6 mb-6">
        {[
          { label: 'Due today', value: counts.due_today },
          { label: 'Overdue', value: counts.overdue },
          { label: 'Upcoming', value: counts.upcoming },
          { label: 'To review', value: counts.review },
        ].map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-0.5">
            <span className="text-2xl font-semibold tabular-nums text-ink">{value}</span>
            <span className="text-xs text-muted">{label}</span>
          </div>
        ))}
      </div>

      {/* Lens + filter controls — verbatim from old layout */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <Segmented options={LENSES} value={lens} onChange={setLens} />
        {lens === 'mine' && (
          <div className="relative">
            <span ref={filterRef}>
              <FilterButton count={activeFilterCount(filters)} onClick={() => setFilterOpen((o) => !o)} />
            </span>
            <Popover open={filterOpen} onClose={() => setFilterOpen(false)} anchorRef={filterRef}>
              <div className="space-y-4">
                {dimensions.map((d) => (
                  <div key={d.key} className="space-y-1">
                    <div className="text-xs font-semibold text-slate-500">{d.label}</div>
                    <SearchableSelect
                      value={filters[d.key] ?? ''}
                      onChange={(v) => setFilters((f) => ({ ...f, [d.key]: v }))}
                      options={d.options.map((o) => ({
                        value: o.value,
                        label: `${o.label}${o.count != null ? ` (${o.count})` : ''}`,
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
        )}
      </div>

      {lens === 'mine' ? (
        <>
          <Section
            title={`Today's plan · ${plannedTodos.length} · ${formatEstimate(plannedTodayMin)}`}
            actions={
              <button
                onClick={() => setPlanOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-700"
              >
                <Sparkles className="h-4 w-4" /> Plan my day
              </button>
            }
          >
            <div className="space-y-2">
              {plannedTodos.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line py-6 text-center text-sm text-muted">
                  Nothing planned for today yet — hit "Plan my day".
                </div>
              ) : (
                plannedTodos.map((t) => <TodoCard key={t.name} todo={t} showProject />)
              )}
            </div>
          </Section>

          {groups.map((g) => (
            <Section key={g.title} title={`${g.title} · ${g.items.length}`}>
              <div className="space-y-2">
                {g.items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-line py-6 text-center text-sm text-muted">
                    Nothing here
                  </div>
                ) : (
                  g.items.map((t) => {
                    const chips = todoRelationChips(t)
                    return (
                      <div key={t.name}>
                        <TodoCard todo={t} />
                        {chips.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1 pl-1">{chips}</div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </Section>
          ))}

          {visible.length === 0 && (
            <EmptyState icon={CheckCircle2} title="All clear" subtitle="No tasks match." />
          )}
        </>
      ) : (
        <>
          {lens === 'owned' && ownerApprovals > 0 && (
            <Section divider={false}>
              <Link
                to="/review"
                className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink transition hover:opacity-80"
              >
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
                <span>{ownerApprovals} todo{ownerApprovals === 1 ? '' : 's'} awaiting your final approval</span>
              </Link>
            </Section>
          )}
          {lens === 'led' && leadChecks > 0 && (
            <Section divider={false}>
              <Link
                to="/review"
                className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink transition hover:opacity-80"
              >
                <CheckCheck className="h-4 w-4 shrink-0 text-amber-500" />
                <span>{leadChecks} todo{leadChecks === 1 ? '' : 's'} to check & approve</span>
              </Link>
            </Section>
          )}
          <Section>
            {!projects.data ? (
              <CardGridSkeleton />
            ) : lensProjects.length === 0 ? (
              <EmptyState icon={FolderKanban} title="Nothing here" subtitle={lensEmpty} />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {lensProjects.map((p) => <ProjectCard key={p.name} p={p} />)}
              </div>
            )}
          </Section>
        </>
      )}

      <PlanDayDrawer open={planOpen} onClose={() => setPlanOpen(false)} candidates={planCandidates} />
    </Page>
  )
}
