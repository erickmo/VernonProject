import { useNavigate } from 'react-router-dom'
import { ShieldAlert, AlertCircle } from 'lucide-react'
import { useDataHealth } from '@/hooks/useData'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { EmptyState, Spinner } from '@/components/ui'
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
      className="w-full text-left flex flex-col gap-0.5 rounded-xl px-3 py-2.5 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
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
    <BentoTile span="full" tone="plain">
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
    </BentoTile>
  )
}

export default function DataHealth() {
  const { data, isLoading, error } = useDataHealth()
  const navigate = useNavigate()

  const goToTodo = (name: string) => navigate(`/project-item/${encodeURIComponent(name)}`)

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-bold">Data Health</h1>
        <EmptyState
          icon={AlertCircle}
          title="Access denied"
          subtitle="You don't have permission to view the data health report."
        />
      </div>
    )
  }

  const total = data?.counts.total ?? 0
  const totalAccent = total === 0 ? 'emerald' : total > 10 ? 'rose' : 'amber'

  const sections: SectionKey[] = ['unmapped', 'outliers', 'missing', 'orphaned']

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <ShieldAlert className="w-6 h-6 text-slate-500" />
        Data Health
      </h1>

      <BentoGrid>
        <BentoTile span="sm" tone="tint" accent={totalAccent} icon={ShieldAlert}>
          <BentoStat value={data?.counts.total ?? 0} label="problems" />
        </BentoTile>

        {data && sections.map((key) => (
          <Section
            key={key}
            title={SECTION_TITLES[key]}
            count={data.counts[key]}
            items={data[key]}
            onItemClick={goToTodo}
          />
        ))}
      </BentoGrid>
    </div>
  )
}
