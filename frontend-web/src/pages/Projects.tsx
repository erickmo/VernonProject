import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, FolderKanban, Search, ChevronDown, AlertCircle, CheckCheck } from 'lucide-react'
import { useProjects, canCreateProject, useBoot } from '@/hooks/useData'
import { Segmented, EmptyState, ProgressBar } from '@/components/ui'
import { CardGridSkeleton } from '@web/components/ui'
import { ProjectFormDialog } from '@web/components/ProjectFormDialog'
import { FilterButton, activeFilterCount, type FilterValue } from '@/components/FilterSheet'
import { SearchableSelect } from '@/components/SearchableSelect'
import { Popover } from '@web/components/overlays/Popover'
import { buildOptions } from '@/lib/filters'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable, type Column } from '@web/components/DataTable'
import { EntityChip } from '@web/components/EntityChip'
import type { ProjectCard as ProjectCardType } from '@/lib/types'

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'Ongoing', label: 'Ongoing' },
  { value: 'Closed', label: 'Closed' },
  { value: 'all', label: 'All' },
]

function StatusBadge({ status, review }: { status: string; review: number }) {
  if (review > 0)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 dark:bg-brand-500/15 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300">
        <CheckCheck className="h-3.5 w-3.5" />
        {review} review
      </span>
    )
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        status === 'Ongoing'
          ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
          : 'bg-surface text-muted'
      }`}
    >
      {status}
    </span>
  )
}

// ponytail: defined outside component — no hook deps, stable reference
const COLUMNS: Column<ProjectCardType>[] = [
  {
    key: 'name',
    header: 'Project',
    render: (p) => (
      <Link
        to={`/project/${encodeURIComponent(p.name)}`}
        className="font-medium text-ink hover:text-brand-600 truncate block max-w-xs"
        onClick={(e) => e.stopPropagation()}
      >
        {p.project_name}
      </Link>
    ),
    sortValue: (p) => p.project_name,
  },
  {
    key: 'progress',
    header: 'Progress',
    width: 'w-44',
    render: (p) => (
      <div className="flex items-center gap-2 min-w-0">
        <ProgressBar value={p.progress} className="w-20 shrink-0" />
        <span className="text-xs text-muted shrink-0">
          {p.item_done}/{p.item_total}
        </span>
      </div>
    ),
    sortValue: (p) => p.progress,
  },
  {
    key: 'owner',
    header: 'Owner',
    width: 'w-36',
    render: (p) => (
      <EntityChip avatarName={p.owner_name} label={p.owner_name} />
    ),
    sortValue: (p) => p.owner_name,
  },
  {
    key: 'status',
    header: 'Status',
    width: 'w-32',
    render: (p) => <StatusBadge status={p.status} review={p.review} />,
    sortValue: (p) => p.status,
  },
  {
    key: 'overdue',
    header: 'Overdue',
    width: 'w-24',
    align: 'right',
    render: (p) =>
      p.overdue > 0 ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400">
          <AlertCircle className="h-3.5 w-3.5" />
          {p.overdue}
        </span>
      ) : null,
    sortValue: (p) => p.overdue,
  },
]

export default function Projects() {
  const projects = useProjects()
  const boot = useBoot()
  const [status, setStatus] = useState('Ongoing')
  const [q, setQ] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [filters, setFilters] = useState<FilterValue>({})
  const filterRef = useRef<HTMLSpanElement>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  // ponytail: default expanded (desktop has room); skip mobile's collapse-all seed.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set<string>(JSON.parse(localStorage.getItem('projectsCollapsedGroups') || '[]'))
    } catch {
      return new Set<string>()
    }
  })
  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      localStorage.setItem('projectsCollapsedGroups', JSON.stringify([...next]))
      return next
    })

  const dims = useMemo(
    () => [
      { key: 'brand', label: 'Brand', options: buildOptions(projects.data ?? [], (p) => p.brand, (p) => p.brand) },
      { key: 'owner', label: 'Project Owner', options: buildOptions(projects.data ?? [], (p) => p.project_owner, (p) => p.owner_name) },
      { key: 'leader', label: 'Project Leader', options: buildOptions(projects.data ?? [], (p) => p.project_leader, (p) => p.leader_name) },
    ],
    [projects.data],
  )

  const visible = useMemo(
    () =>
      (projects.data ?? []).filter((p) => {
        if (status !== 'all' && p.status !== status) return false
        if (q) {
          const ql = q.toLowerCase()
          if (!p.project_name.toLowerCase().includes(ql) && !(p.brand || '').toLowerCase().includes(ql)) return false
        }
        if (filters.brand && p.brand !== filters.brand) return false
        if (filters.owner && p.project_owner !== filters.owner) return false
        if (filters.leader && p.project_leader !== filters.leader) return false
        return true
      }),
    [projects.data, status, q, filters],
  )

  const byBrand = useMemo(() => {
    const m = new Map<string, typeof visible>()
    for (const p of visible) {
      const k = p.brand || 'No brand'
      const existing = m.get(k)
      if (existing) existing.push(p)
      else m.set(k, [p])
    }
    return [...m.entries()]
  }, [visible])

  return (
    <Page>
      <PageHeader
        icon={FolderKanban}
        title="Projects"
        actions={
          canCreateProject(boot.data) ? (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              New project
            </button>
          ) : undefined
        }
      />

      <div className="flex items-center gap-3 flex-wrap mb-6">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects"
            className="pl-9 pr-3 py-2 rounded-lg border border-line bg-transparent text-sm focus:border-brand-600 focus:outline-none text-ink"
          />
        </div>
        <Segmented options={STATUS_OPTIONS} value={status} onChange={setStatus} />
        <div className="relative">
          <span ref={filterRef}>
            <FilterButton count={activeFilterCount(filters)} onClick={() => setFilterOpen((o) => !o)} />
          </span>
          <Popover open={filterOpen} onClose={() => setFilterOpen(false)} anchorRef={filterRef}>
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
      </div>

      {projects.isLoading ? (
        <CardGridSkeleton />
      ) : visible.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No projects" subtitle="Nothing matches your filters." />
      ) : (
        <div className="space-y-6">
          {byBrand.map(([brand, list]) => {
            const isCollapsed = collapsed.has(brand)
            return (
              <section key={brand} className="border-t border-line pt-4">
                <button
                  onClick={() => toggleGroup(brand)}
                  className="flex items-center gap-2 text-sm font-semibold text-muted uppercase tracking-wide hover:text-ink mb-3"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                  {brand}
                  <span className="text-xs font-normal normal-case text-muted">{list.length}</span>
                </button>
                {!isCollapsed && (
                  <DataTable
                    rows={list}
                    columns={COLUMNS}
                    getKey={(p) => p.name}
                    empty={<EmptyState icon={FolderKanban} title="No projects" />}
                  />
                )}
              </section>
            )
          })}
        </div>
      )}

      <ProjectFormDialog key={showCreate ? 'create-open' : 'create-closed'} open={showCreate} onClose={() => setShowCreate(false)} />
    </Page>
  )
}
