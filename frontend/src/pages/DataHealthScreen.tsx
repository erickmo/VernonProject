import { useNavigate } from 'react-router-dom'
import { ShieldAlert, AlertCircle } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useDataHealth } from '@/hooks/useData'
import type { DataHealthItem } from '@/lib/types'

type SectionKey = 'unmapped' | 'outliers' | 'missing' | 'orphaned'

const SECTION_TITLES: Record<SectionKey, string> = {
  unmapped: 'Unmapped Todos',
  outliers: 'Outliers',
  missing: 'Missing Group',
  orphaned: 'Orphaned Todos',
}

function ItemRow({ item, onClick }: { item: DataHealthItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex flex-col gap-0.5 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm active:bg-slate-50 dark:active:bg-slate-700/50 transition"
    >
      <span className="font-medium text-sm text-slate-800 dark:text-slate-100 truncate">{item.to_do}</span>
      <span className="text-xs text-slate-400 dark:text-slate-500 truncate">
        {[item.group, item.status, item.detail].filter(Boolean).join(' · ')}
      </span>
    </button>
  )
}

function Section({
  title,
  count,
  items,
  onItemClick,
}: {
  title: string
  count: number
  items: DataHealthItem[]
  onItemClick: (name: string) => void
}) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <span className="font-semibold text-slate-800 dark:text-slate-100">{title}</span>
        {count > 0 && (
          <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300">
            {count}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">No issues</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <ItemRow key={item.name} item={item} onClick={() => onItemClick(item.name)} />
          ))}
          {items.length < count && (
            <p className="pt-1 text-xs text-slate-400 dark:text-slate-500">
              showing {items.length} of {count}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function DataHealthScreen() {
  const { data, isLoading, error } = useDataHealth()
  const navigate = useNavigate()

  const goToTodo = (name: string) => navigate(`/project-item/${encodeURIComponent(name)}`)

  if (isLoading) {
    return (
      <DetailScreen title="Data Health" right={null}>
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
  }

  if (error) {
    return (
      <DetailScreen title="Data Health" right={null}>
        <EmptyState
          icon={AlertCircle}
          title="Access denied"
          subtitle="You don't have permission to view the data health report."
        />
      </DetailScreen>
    )
  }

  const total = data?.counts.total ?? 0
  const totalColor =
    total === 0
      ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
      : total > 10
        ? 'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300'
        : 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300'

  const sections: SectionKey[] = ['unmapped', 'outliers', 'missing', 'orphaned']

  return (
    <DetailScreen title="Data Health" right={null}>
      {/* Summary card */}
      <div className={`flex items-center gap-3 rounded-2xl p-4 mb-1 ${totalColor}`}>
        <ShieldAlert className="h-6 w-6 shrink-0" />
        <div>
          <p className="text-2xl font-bold leading-none">{total}</p>
          <p className="text-sm font-medium mt-0.5">total {total === 1 ? 'problem' : 'problems'}</p>
        </div>
      </div>

      {/* Sections */}
      {data && (
        <div className="flex flex-col gap-3">
          {sections.map((key) => (
            <Section
              key={key}
              title={SECTION_TITLES[key]}
              count={data.counts[key]}
              items={data[key]}
              onItemClick={goToTodo}
            />
          ))}
        </div>
      )}
    </DetailScreen>
  )
}
