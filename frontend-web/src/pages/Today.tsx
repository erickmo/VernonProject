import { useMemo, useRef, useState } from 'react'
import { useDashboard, useWallet, useProjects } from '@/hooks/useData'
import { TodoCard } from '@/components/TodoCard'
import { ProjectCard } from '@/components/ProjectCard'
import { Segmented, EmptyState } from '@/components/ui'
import { ErrorState, Skeleton, CardGridSkeleton } from '@web/components/ui'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { FilterButton, activeFilterCount, type FilterDimension, type FilterValue } from '@/components/FilterSheet'
import { applyProjectItemFilters, buildOptions, ESTIMATE_OPTIONS } from '@/lib/filters'
import { formatNumber, formatEstimateRatio } from '@/lib/format'
import { Popover } from '@web/components/overlays/Popover'
import { SearchableSelect } from '@/components/SearchableSelect'
import { CheckCircle2, ShieldCheck, CheckCheck, FolderKanban } from 'lucide-react'
import type { ProjectItem } from '@/lib/types'

// Rebuilt locally — mobile's Ring is inline in its Today.tsx and not importable
function Ring({ pct }: { pct: number }) {
  const r = 52
  const c = 2 * Math.PI * r
  const off = c * (1 - Math.min(1, Math.max(0, pct / 100)))
  return (
    <svg viewBox="0 0 120 120" className="w-32 h-32 -rotate-90">
      <circle cx="60" cy="60" r={r} fill="none" strokeWidth="12" className="stroke-slate-200 dark:stroke-slate-800" />
      <circle
        cx="60" cy="60" r={r} fill="none" strokeWidth="12" strokeLinecap="round"
        className="stroke-brand-600" strokeDasharray={c} strokeDashoffset={off}
      />
    </svg>
  )
}

function TodaySkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-32" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Skeleton className="md:col-span-2 h-44 rounded-2xl" />
        <Skeleton className="h-44 rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
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
  const wallet = useWallet()
  const projects = useProjects()
  const [lens, setLens] = useState<Lens>('mine')
  const [filters, setFilters] = useState<FilterValue>({})
  // FilterButton does NOT forwardRef — anchor the Popover via a wrapping span
  const filterRef = useRef<HTMLSpanElement>(null)
  const [filterOpen, setFilterOpen] = useState(false)

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

  if (!dash.data) {
    return dash.isError ? (
      <ErrorState onRetry={() => dash.refetch()} />
    ) : (
      <TodaySkeleton />
    )
  }

  const counts = dash.data.counts
  const completedMin = counts.completed_minutes_today
  const dueMin = dash.data.due_today.reduce((s, t) => s + (t.estimated || 0), 0)
  const todayTotalMin = completedMin + dueMin
  const donePct = todayTotalMin > 0 ? Math.round((completedMin / todayTotalMin) * 100) : 0
  const w = wallet.data

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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Today</h1>
      <BentoGrid>
        <BentoTile span="lg" tall tone="gradient" accent="brand" title="Progress">
          <div className="flex flex-1 items-center gap-6">
            <div className="relative">
              <Ring pct={donePct} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold">{counts.completed_today}</span>
                <span className="text-xs text-slate-500">done</span>
              </div>
            </div>
            <div className="space-y-1 text-sm">
              <div><span className="font-semibold">{counts.due_today}</span> due today</div>
              <div><span className="font-semibold">{counts.overdue}</span> overdue</div>
              <div><span className="font-semibold">{counts.upcoming}</span> upcoming</div>
              <div><span className="font-semibold">{formatEstimateRatio(completedMin, todayTotalMin)}</span> done today</div>
            </div>
          </div>
        </BentoTile>

        <BentoTile span="sm" tone="solid" accent="amber" title="Points">
          <BentoStat
            value={w ? formatNumber(w.balance) : '—'}
            label="balance"
            delta={`+${w ? formatNumber(w.today_earned) : 0} today · +${w ? formatNumber(w.yesterday_earned) : 0} yest`}
          />
        </BentoTile>

        <BentoTile span="sm" tone="tint" accent="brand">
          <BentoStat value={counts.due_today} label="Due today" />
        </BentoTile>
        <BentoTile span="sm" tone="tint" accent="rose">
          <BentoStat value={counts.overdue} label="Overdue" />
        </BentoTile>
        <BentoTile span="sm" tone="tint" accent="brand">
          <BentoStat value={counts.upcoming} label="Upcoming" />
        </BentoTile>
        <BentoTile span="sm" tone="tint" accent="emerald" icon={CheckCircle2}>
          <BentoStat value={counts.review} label="To review" />
        </BentoTile>

        <BentoTile span="full" tone="plain">
          <div className="flex items-center justify-between gap-3">
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
        </BentoTile>

        {lens === 'mine' ? (
          groups.map((g) => (
            <BentoTile key={g.title} span="md" tone="plain" title={`${g.title} · ${g.items.length}`}>
              <div className="space-y-2">
                {g.items.length === 0
                  ? <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400 dark:border-slate-800">Nothing here</div>
                  : g.items.map((t) => <TodoCard key={t.name} todo={t} showProject />)}
              </div>
            </BentoTile>
          ))
        ) : (
          <>
            {lens === 'owned' && ownerApprovals > 0 && (
              <BentoTile
                span="full" tone="tint" accent="emerald" to="/review" icon={ShieldCheck}
                title={`${ownerApprovals} todo${ownerApprovals === 1 ? '' : 's'} awaiting your final approval`}
              />
            )}
            {lens === 'led' && leadChecks > 0 && (
              <BentoTile
                span="full" tone="tint" accent="amber" to="/review" icon={CheckCheck}
                title={`${leadChecks} todo${leadChecks === 1 ? '' : 's'} to check & approve`}
              />
            )}
            <BentoTile span="full" tone="plain">
              {!projects.data ? (
                <CardGridSkeleton />
              ) : lensProjects.length === 0 ? (
                <EmptyState icon={FolderKanban} title="Nothing here" subtitle={lensEmpty} />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                  {lensProjects.map((p) => <ProjectCard key={p.name} p={p} />)}
                </div>
              )}
            </BentoTile>
          </>
        )}
      </BentoGrid>

      {lens === 'mine' && visible.length === 0 && (
        <EmptyState icon={CheckCircle2} title="All clear" subtitle="No tasks match." />
      )}
    </div>
  )
}
