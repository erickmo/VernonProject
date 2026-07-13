import { useMemo, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { Search, AlertCircle, CheckCheck, ChevronDown, Layers } from 'lucide-react'
import { useProjects } from '@/hooks/useData'
import { ProgressBar, Spinner, Segmented } from '@/components/ui'
import { buildOptions } from '@/lib/filters'
import { FilterButton, activeFilterCount } from '@/components/FilterSheet'
import { SearchableSelect } from '@/components/SearchableSelect'
import { Popover } from '@web/components/overlays/Popover'
import type { ProjectCard } from '@/lib/types'

type StatusFilter = 'Ongoing' | 'Inbox' | 'Closed' | 'all'

// Single source of truth for a rail row so grouped + flat lists render identically.
function ProjectRow({ p }: { p: ProjectCard }) {
  return (
    <NavLink
      to={`/project/${encodeURIComponent(p.name)}`}
      className={({ isActive }) =>
        clsx(
          'block rounded-xl px-2.5 py-2 transition active:scale-[0.99]',
          isActive ? 'bg-brand-50 shadow-sm dark:bg-brand-500/15' : 'hover:bg-hover/[0.04]',
        )
      }
    >
      {({ isActive }) => (
        <>
          <div className="flex items-center gap-2">
            <span
              className={clsx(
                'min-w-0 flex-1 truncate text-sm font-medium',
                isActive ? 'text-brand-700 dark:text-brand-300' : 'text-ink',
              )}
            >
              {p.project_name}
            </span>
            {p.review > 0 && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-brand-600">
                <CheckCheck className="h-3 w-3" />
                {p.review}
              </span>
            )}
            {p.overdue > 0 && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                <AlertCircle className="h-3 w-3" />
                {p.overdue}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <ProgressBar value={p.progress} className="flex-1" />
            <span className="shrink-0 text-[10px] tabular-nums text-muted">
              {p.item_done}/{p.item_total}
            </span>
          </div>
          {p.brand && <div className="mt-0.5 truncate text-[10px] text-muted">{p.brand}</div>}
        </>
      )}
    </NavLink>
  )
}

// Persistent left rail: searchable project list, active-row highlight.
// Left half of the projects workspace split. Filters/grouping mirror mobile Projects.tsx.
export function ProjectRail() {
  const projects = useProjects()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<StatusFilter>('Ongoing')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [grouped, setGrouped] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const filterRef = useRef<HTMLSpanElement>(null)
  const [filterOpen, setFilterOpen] = useState(false)

  const all = projects.data ?? []

  const dims = useMemo(
    () => [
      { key: 'brand', label: 'Brand', options: buildOptions(all, (p) => p.brand, (p) => p.brand) },
      { key: 'owner', label: 'Project Owner', options: buildOptions(all, (p) => p.project_owner, (p) => p.owner_name) },
      { key: 'leader', label: 'Project Leader', options: buildOptions(all, (p) => p.project_leader, (p) => p.leader_name) },
    ],
    [all],
  )

  const visible = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return all.filter((p) => {
      if (status !== 'all' && p.status !== status) return false
      if (filters.brand && p.brand !== filters.brand) return false
      if (filters.owner && p.project_owner !== filters.owner) return false
      if (filters.leader && p.project_leader !== filters.leader) return false
      // match name / brand / owner / leader so you can find "projects led by X"
      if (ql && ![p.project_name, p.brand, p.owner_name, p.leader_name].some((s) => (s || '').toLowerCase().includes(ql)))
        return false
      return true
    })
  }, [all, q, status, filters])

  // Brand groups, sorted A→Z with unbranded last, projects by name within — mirrors mobile.
  const groups = useMemo(() => {
    const byBrand = new Map<string, ProjectCard[]>()
    for (const p of visible) {
      const key = p.brand || ''
      const arr = byBrand.get(key)
      if (arr) arr.push(p)
      else byBrand.set(key, [p])
    }
    return [...byBrand.entries()]
      .map(([brand, items]) => ({
        brand,
        items: items.slice().sort((a, b) => a.project_name.localeCompare(b.project_name)),
      }))
      .sort((a, b) => (!a.brand ? 1 : !b.brand ? -1 : a.brand.localeCompare(b.brand)))
  }, [visible])

  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-line p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search projects or people"
            placeholder="Search projects or people"
            className="w-full rounded-xl border border-line bg-transparent py-1.5 pl-8 pr-2 text-sm text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none"
          />
        </div>

        <Segmented<StatusFilter>
          value={status}
          onChange={setStatus}
          options={[
            { value: 'Ongoing', label: 'Ongoing' },
            { value: 'Inbox', label: 'Inbox' },
            { value: 'Closed', label: 'Closed' },
            { value: 'all', label: 'All' },
          ]}
        />

        <div className="flex items-center gap-2">
          <div className="relative">
            <span ref={filterRef}>
              <FilterButton count={activeFilterCount(filters)} onClick={() => setFilterOpen((o) => !o)} />
            </span>
            <Popover open={filterOpen} onClose={() => setFilterOpen(false)} anchorRef={filterRef} align="left">
              <div className="space-y-4">
                {dims.map((d) => (
                  <div key={d.key} className="space-y-1">
                    <div className="text-xs font-semibold text-muted">{d.label}</div>
                    <SearchableSelect
                      value={filters[d.key] ?? ''}
                      onChange={(v) => setFilters((f) => ({ ...f, [d.key]: v }))}
                      options={d.options.map((o) => ({
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
          <button
            onClick={() => setGrouped((g) => !g)}
            aria-pressed={grouped}
            title="Group by brand"
            className={clsx(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition',
              grouped ? 'border-brand-600 bg-brand-600 text-white shadow-sm' : 'border-line bg-surface text-muted',
            )}
          >
            <Layers className="h-4 w-4" />
            Group
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {projects.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : visible.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted">No projects</div>
        ) : grouped ? (
          <div className="space-y-3">
            {groups.map((g) => {
              const key = g.brand || '__none__'
              const isCollapsed = collapsed.has(key)
              return (
                <div key={key}>
                  <button
                    onClick={() => toggleGroup(key)}
                    className="mb-1 flex w-full items-center gap-2 px-2.5 text-left"
                  >
                    <span className="truncate text-xs font-bold uppercase tracking-wide text-muted">
                      {g.brand || 'No brand'}
                    </span>
                    <span className="rounded-full bg-brand-50 px-1.5 text-[10px] font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                      {g.items.length}
                    </span>
                    <ChevronDown
                      className={clsx('ml-auto h-3.5 w-3.5 text-muted transition-transform', isCollapsed && '-rotate-90')}
                    />
                  </button>
                  {!isCollapsed && (
                    <ul className="space-y-0.5">
                      {g.items.map((p) => (
                        <li key={p.name}>
                          <ProjectRow p={p} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <ul className="space-y-0.5">
            {visible.map((p) => (
              <li key={p.name}>
                <ProjectRow p={p} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
