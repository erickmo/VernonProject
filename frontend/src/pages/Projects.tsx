import { useMemo, useState } from 'react'
import { FolderKanban, Plus, Search, X } from 'lucide-react'
import { TabScreen, PullToRefresh } from '@/components/Layout'
import { EmptyState, FullScreenLoader, Segmented } from '@/components/ui'
import { ProjectCard } from '@/components/ProjectCard'
import { FilterButton, FilterSheet } from '@/components/FilterSheet'
import { ProjectFormSheet } from '@/components/ProjectFormSheet'
import { useProjects, useBoot, canCreateProject } from '@/hooks/useData'
import { buildOptions } from '@/lib/filters'

type StatusFilter = 'Ongoing' | 'Closed' | 'all'

export default function Projects() {
  const { data, isLoading, refetch } = useProjects()
  const { data: boot } = useBoot()
  const [formOpen, setFormOpen] = useState(false)
  const [status, setStatus] = useState<StatusFilter>('Ongoing')
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [sheet, setSheet] = useState(false)

  const projects = data ?? []

  const dimensions = useMemo(
    () => [
      { key: 'brand', label: 'Brand', options: buildOptions(projects, (p) => p.customer, (p) => p.customer) },
      {
        key: 'owner',
        label: 'Project Owner',
        options: buildOptions(projects, (p) => p.project_owner, (p) => p.owner_name),
      },
      {
        key: 'leader',
        label: 'Project Leader',
        options: buildOptions(projects, (p) => p.project_leader, (p) => p.leader_name),
      },
    ],
    [projects],
  )

  const q = query.trim().toLowerCase()
  const list = projects.filter(
    (p) =>
      (status === 'all' ? true : p.status === status) &&
      (!filters.brand || p.customer === filters.brand) &&
      (!filters.owner || p.project_owner === filters.owner) &&
      (!filters.leader || p.project_leader === filters.leader) &&
      (!q || p.project_name.toLowerCase().includes(q) || (p.customer || '').toLowerCase().includes(q)),
  )

  const advCount = ['brand', 'owner', 'leader'].filter((k) => filters[k]).length

  return (
    <TabScreen title="Projects" subtitle={`${list.length} of ${projects.length}`}>
      {canCreateProject(boot) && (
        <div className="mb-3">
          <button
            onClick={() => setFormOpen(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl bg-brand-600 py-2.5 text-sm font-semibold text-white active:scale-95"
          >
            <Plus className="h-4 w-4" /> New project
          </button>
        </div>
      )}
      {isLoading && !data ? (
        <FullScreenLoader label="Loading projects…" />
      ) : (
        <PullToRefresh onRefresh={refetch}>
          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search project or brand…"
              className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-9 text-[15px] text-slate-700 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="mb-3 flex items-stretch gap-2">
            <FilterButton count={advCount} onClick={() => setSheet(true)} />
            <div className="min-w-0 flex-1">
              <Segmented<StatusFilter>
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'Ongoing', label: 'Ongoing' },
                  { value: 'Closed', label: 'Closed' },
                  { value: 'all', label: 'All' },
                ]}
              />
            </div>
          </div>

          {list.length ? (
            <div className="flex flex-col gap-2.5">
              {list.map((p) => (
                <ProjectCard key={p.name} p={p} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={FolderKanban}
              title="No projects match"
              subtitle="Adjust your search or filters to see more."
            />
          )}
        </PullToRefresh>
      )}

      <FilterSheet
        open={sheet}
        onClose={() => setSheet(false)}
        dimensions={dimensions}
        value={filters}
        onChange={(k, v) => setFilters((f) => ({ ...f, [k]: v }))}
        onClear={() => setFilters({})}
      />

      <ProjectFormSheet open={formOpen} onClose={() => setFormOpen(false)} />
    </TabScreen>
  )
}
