import { useMemo, useRef, useState } from 'react'
import { Plus, FolderKanban, Search, ChevronDown } from 'lucide-react'
import { useProjects, canCreateProject, useBoot } from '@/hooks/useData'
import { ProjectCard } from '@/components/ProjectCard'
import { Segmented, EmptyState } from '@/components/ui'
import { CardGridSkeleton } from '@web/components/ui'
import { ProjectFormDialog } from '@web/components/ProjectFormDialog'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { FilterButton, activeFilterCount, type FilterValue } from '@/components/FilterSheet'
import { SearchableSelect } from '@/components/SearchableSelect'
import { Popover } from '@web/components/overlays/Popover'
import { buildOptions } from '@/lib/filters'

const STATUS: { value: string; label: string }[] = [
  { value: 'Ongoing', label: 'Ongoing' },
  { value: 'Closed', label: 'Closed' },
  { value: 'all', label: 'All' },
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

  const total = (projects.data ?? []).length

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Projects</h1>

      <BentoGrid>
        <BentoTile
          span="sm"
          tone="tint"
          accent="sky"
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
        >
          <BentoStat value={total} label="projects" />
        </BentoTile>

        <BentoTile span="full" tone="plain">
          <div className="flex items-center gap-3 flex-wrap mb-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search projects"
                className="pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-sm focus:border-brand-600 focus:outline-none dark:text-slate-100"
              />
            </div>
            <Segmented options={STATUS} value={status} onChange={setStatus} />
            <div className="relative">
              <span ref={filterRef}>
                <FilterButton count={activeFilterCount(filters)} onClick={() => setFilterOpen((o) => !o)} />
              </span>
              <Popover open={filterOpen} onClose={() => setFilterOpen(false)} anchorRef={filterRef}>
                <div className="space-y-4">
                  {dims.map((d) => (
                    <div key={d.key} className="space-y-1">
                      <div className="text-xs font-semibold text-slate-500">{d.label}</div>
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
                  <section key={brand} className="space-y-3">
                    <button
                      onClick={() => toggleGroup(brand)}
                      className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      <ChevronDown className={`w-4 h-4 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                      {brand}
                      <span className="text-xs font-normal normal-case text-slate-400">{list.length}</span>
                    </button>
                    {!isCollapsed && (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                        {list.map((p) => (
                          <ProjectCard key={p.name} p={p} />
                        ))}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </BentoTile>
      </BentoGrid>

      <ProjectFormDialog key={showCreate ? 'create-open' : 'create-closed'} open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
