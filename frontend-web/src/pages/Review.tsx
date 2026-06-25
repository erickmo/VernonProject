import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Check } from 'lucide-react'
import { useDashboard } from '@/hooks/useData'
import { byDeadlineAsc, formatDate } from '@/lib/format'
import { Avatar, EmptyState, Spinner } from '@/components/ui'
import { buildOptions } from '@/lib/filters'
import { FilterButton, activeFilterCount, type FilterValue } from '@/components/FilterSheet'
import { SearchableSelect } from '@/components/SearchableSelect'
import { Popover } from '@web/components/overlays/Popover'
import { useAdvance } from '@/components/AdvanceProvider'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'

export default function Review() {
  const navigate = useNavigate()
  const dash = useDashboard()
  const advanceConfirm = useAdvance()
  const [filters, setFilters] = useState<FilterValue>({})
  const filterRef = useRef<HTMLSpanElement>(null)
  const [filterOpen, setFilterOpen] = useState(false)

  const all = dash.data?.review ?? []

  const dims = useMemo(
    () => [
      {
        key: 'project',
        label: 'Project',
        options: buildOptions(all, (t) => t.project, (t) => t.project_name),
      },
      {
        key: 'brand',
        label: 'Brand',
        options: buildOptions(all, (t) => t.brand ?? '', (t) => t.brand ?? '—'),
      },
      {
        key: 'assignee',
        label: 'Assignee',
        options: buildOptions(all, (t) => t.assigned_to, (t) => t.assigned_to_name),
      },
    ],
    [all],
  )

  const visible = useMemo(
    () =>
      all
        .filter(
          (t) =>
            (!filters.project || t.project === filters.project) &&
            (!filters.brand || (t.brand ?? '') === filters.brand) &&
            (!filters.assignee || t.assigned_to === filters.assignee),
        )
        .slice()
        .sort(byDeadlineAsc),
    [all, filters],
  )

  const byProject = useMemo(() => {
    const m = new Map<string, { displayName: string; items: typeof visible }>()
    for (const t of visible) {
      const existing = m.get(t.project)
      if (existing) existing.items.push(t)
      else m.set(t.project, { displayName: t.project_name, items: [t] })
    }
    return [...m.entries()]
  }, [visible])

  const approve = (t: { name: string; next_status_label: string | null; to_do: string }) =>
    advanceConfirm(t.name, t.next_status_label || 'Approve', t.to_do)

  if (dash.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Review</h1>

      <BentoGrid>
        <BentoTile
          span="sm"
          tone="tint"
          accent="brand"
          actions={
            <div className="relative">
              <span ref={filterRef}>
                <FilterButton
                  count={activeFilterCount(filters)}
                  onClick={() => setFilterOpen((o) => !o)}
                />
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
                  <button
                    onClick={() => setFilters({})}
                    className="text-sm text-brand-600"
                  >
                    Clear all
                  </button>
                </div>
              </Popover>
            </div>
          }
        >
          <BentoStat value={all.length} label="pending" />
        </BentoTile>

        <BentoTile span="full" tone="plain">
          {visible.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Nothing to review"
              subtitle="The queue is empty."
            />
          ) : (
            <div className="space-y-5">
              {byProject.map(([projId, { displayName, items }]) => (
                <section key={projId} className="space-y-2">
                  <h2 className="text-sm font-semibold text-slate-500">{displayName}</h2>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {items.map((t) => (
                          <tr
                            key={t.name}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                            onClick={() => navigate(`/project-item/${encodeURIComponent(t.name)}`)}
                          >
                            <td className="px-4 py-2.5 font-medium">{t.to_do}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <Avatar
                                  name={t.assigned_to_name}
                                  image={t.assigned_to_image ?? undefined}
                                  size={24}
                                />
                                <span className="text-slate-500 whitespace-nowrap">{t.assigned_to_name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                              {formatDate(t.deadline ?? null)}
                            </td>
                            <td
                              className="px-4 py-2.5 text-right"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {t.can_advance && (
                                <button
                                  onClick={() => approve(t)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors"
                                >
                                  <Check className="w-3 h-3" />
                                  {t.next_status_label || 'Approve'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          )}
        </BentoTile>
      </BentoGrid>
    </div>
  )
}
