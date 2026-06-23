import { useMemo, useRef, useState } from 'react'
import { useDashboard, useWallet } from '@/hooks/useData'
import { TodoCard } from '@/components/TodoCard'
import { Segmented, EmptyState, Spinner } from '@/components/ui'
import { FilterButton, activeFilterCount, type FilterDimension, type FilterValue } from '@/components/FilterSheet'
import { applyProjectItemFilters, buildOptions } from '@/lib/filters'
import { formatNumber } from '@/lib/format'
import { Popover } from '@web/components/overlays/Popover'
import { SearchableSelect } from '@/components/SearchableSelect'
import { CheckCircle2 } from 'lucide-react'
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

  // Lens predicates — v1 approximation.
  // CONCERN: 'owned' and 'led' use truthy-check on the owner/leader field string
  // rather than comparing to the current user's email. This means "Owned" shows
  // all tasks that have any owner set, not tasks owned by me. Exact matching
  // requires boot.user from useBoot() and is deferred to a later refinement.
  const lensed = useMemo(() => allTasks.filter((t) => {
    if (lens === 'mine') return t.is_mine
    if (lens === 'owned') return !!t.project_owner
    if (lens === 'led') return !!t.project_leader
    // 'in' — all tasks the user has any association with (implicit via dashboard)
    return true
  }), [allTasks, lens])

  const dimensions: FilterDimension[] = useMemo(() => [
    { key: 'status', label: 'Status', options: buildOptions(lensed, (t) => t.status_key, (t) => t.status) },
    { key: 'project', label: 'Project', options: buildOptions(lensed, (t) => t.project, (t) => t.project_name) },
  ], [lensed])

  const visible = useMemo(() => applyProjectItemFilters(lensed, filters), [lensed, filters])

  if (dash.isLoading) {
    return <div className="flex justify-center py-20"><Spinner /></div>
  }

  const counts = dash.data!.counts
  const donePct = counts.completed_today + counts.due_today > 0
    ? Math.round((counts.completed_today / (counts.completed_today + counts.due_today)) * 100)
    : 0
  const w = wallet.data

  const groups: { title: string; items: ProjectItem[] }[] = [
    { title: 'Overdue', items: visible.filter((t) => t.is_overdue) },
    { title: 'Today', items: visible.filter((t) => !t.is_overdue && !!t.today_allocation) },
    { title: 'Upcoming', items: visible.filter((t) => !t.is_overdue && !t.today_allocation) },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Today</h1>

      {/* hero row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 rounded-2xl bg-white dark:bg-slate-900 shadow-card p-6 flex items-center gap-6">
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
            <div className="flex items-center gap-1 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
              {counts.review} to review
            </div>
          </div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-card p-6">
          <div className="text-sm text-slate-500">Points balance</div>
          <div className="text-3xl font-bold">{w ? formatNumber(w.balance) : '—'}</div>
          <div className="text-xs text-slate-500 mt-2">
            +{w ? formatNumber(w.today_earned) : 0} today · +{w ? formatNumber(w.yesterday_earned) : 0} yesterday
          </div>
          {/* Marketplace link deferred to Phase 2 */}
          <span className="inline-block mt-3 text-xs text-slate-400">Marketplace — coming soon</span>
        </div>
      </div>

      {/* tasks toolbar */}
      <div className="flex items-center justify-between gap-3">
        <Segmented options={LENSES} value={lens} onChange={setLens} />
        {/* Wrap FilterButton in a span so Popover can use its anchorRef (FilterButton does not forwardRef) */}
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
      </div>

      {/* three-column task grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {groups.map((g) => (
          <section key={g.title} className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-500">{g.title} · {g.items.length}</h2>
            {g.items.length === 0 ? (
              <div className="text-sm text-slate-400 py-6 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                Nothing here
              </div>
            ) : (
              g.items.map((t) => <TodoCard key={t.name} todo={t} showProject />)
            )}
          </section>
        ))}
      </div>

      {visible.length === 0 && (
        <EmptyState icon={CheckCircle2} title="All clear" subtitle="No tasks match." />
      )}
    </div>
  )
}
