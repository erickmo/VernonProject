import { useMemo, useState } from 'react'
import { ShieldCheck, SearchX } from 'lucide-react'
import { TabScreen, PullToRefresh } from '@/components/Layout'
import { TodoCard } from '@/components/TodoCard'
import { EmptyState, FullScreenLoader } from '@/components/ui'
import { FilterButton, FilterSheet } from '@/components/FilterSheet'
import { useDashboard } from '@/hooks/useData'
import { buildOptions } from '@/lib/filters'
import { byDeadlineAsc } from '@/lib/format'
import type { ProjectItem } from '@/lib/types'

export default function Review() {
  const { data, isLoading, refetch } = useDashboard()
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [sheet, setSheet] = useState(false)

  const review = (data?.review ?? []).slice().sort(byDeadlineAsc)

  const dimensions = useMemo(
    () => [
      { key: 'project', label: 'Project', options: buildOptions(review, (t) => t.project, (t) => t.project_name) },
      { key: 'brand', label: 'Brand', options: buildOptions(review, (t) => t.brand, (t) => t.brand) },
      {
        key: 'assignee',
        label: 'Assigned to',
        options: buildOptions(review, (t) => t.assigned_to, (t) => t.assigned_to_name),
      },
    ],
    [review],
  )

  const filtered = review.filter(
    (t) =>
      (!filters.project || t.project === filters.project) &&
      (!filters.brand || t.brand === filters.brand) &&
      (!filters.assignee || t.assigned_to === filters.assignee),
  )

  // Group by project so a leader can clear one project at a time.
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; items: ProjectItem[] }>()
    for (const t of filtered) {
      const g = map.get(t.project) || { name: t.project_name, items: [] }
      g.items.push(t)
      map.set(t.project, g)
    }
    return [...map.values()].sort((a, b) => b.items.length - a.items.length)
  }, [filtered])

  const advCount = ['project', 'brand', 'assignee'].filter((k) => filters[k]).length

  return (
    <TabScreen title="Review" subtitle={`${filtered.length} waiting for your approval`}>
      {isLoading && !data ? (
        <FullScreenLoader label="Loading review queue…" />
      ) : (
        <PullToRefresh onRefresh={refetch}>
          {review.length > 0 && (
            <div className="mb-2">
              <FilterButton count={advCount} onClick={() => setSheet(true)} />
            </div>
          )}

          {filtered.length > 0 ? (
            <div className="space-y-5">
              {groups.map((g) => (
                <section key={g.name}>
                  <div className="mb-2 flex items-center justify-between px-1">
                    <h2 className="truncate text-sm font-semibold text-slate-600">{g.name}</h2>
                    <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                      {g.items.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {g.items.map((t) => (
                      <TodoCard key={t.name} todo={t} showAssignee />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : review.length > 0 ? (
            <EmptyState
              icon={SearchX}
              title="Nothing matches these filters"
              subtitle="Clear a filter to see the rest of your queue."
            />
          ) : (
            <EmptyState
              icon={ShieldCheck}
              title="Nothing to review"
              subtitle="When a team member marks work Done, it shows up here for your check."
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
    </TabScreen>
  )
}
