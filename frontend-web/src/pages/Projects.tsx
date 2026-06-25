import { useMemo, useState } from 'react'
import { Plus, FolderKanban, Search } from 'lucide-react'
import { useProjects, canCreateProject, useBoot } from '@/hooks/useData'
import { ProjectCard } from '@/components/ProjectCard'
import { Segmented, EmptyState } from '@/components/ui'
import { CardGridSkeleton } from '@web/components/ui'
import { ProjectFormDialog } from '@web/components/ProjectFormDialog'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'

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

  const visible = useMemo(
    () =>
      (projects.data ?? []).filter((p) => {
        if (status !== 'all' && p.status !== status) return false
        if (q && !p.project_name.toLowerCase().includes(q.toLowerCase())) return false
        return true
      }),
    [projects.data, status, q],
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
          </div>

          {projects.isLoading ? (
            <CardGridSkeleton />
          ) : visible.length === 0 ? (
            <EmptyState icon={FolderKanban} title="No projects" subtitle="Nothing matches your filters." />
          ) : (
            <div className="space-y-6">
              {byBrand.map(([brand, list]) => (
                <section key={brand} className="space-y-3">
                  <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    {brand}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                    {list.map((p) => (
                      <ProjectCard key={p.name} p={p} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </BentoTile>
      </BentoGrid>

      <ProjectFormDialog key={showCreate ? 'create-open' : 'create-closed'} open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
