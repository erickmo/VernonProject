import { useNavigate } from 'react-router-dom'
import { ShieldAlert, AlertCircle } from 'lucide-react'
import { useDataHealth } from '@/hooks/useData'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { EmptyState, Spinner } from '@/components/ui'
import type { DataHealthItem } from '@/lib/types'
import { ApiError } from '@/lib/api'
import { ErrorState } from '@web/components/ui'

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
      className="w-full text-left flex flex-col gap-0.5 rounded-xl px-3 py-2.5 bg-canvas hover:bg-hover/[0.04] active:scale-[0.99] transition"
    >
      <span className="font-medium text-sm text-ink truncate">{item.to_do}</span>
      <span className="text-xs text-muted truncate">
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
        <span className="font-semibold text-ink">{title}</span>
        {count > 0 && (
          <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300">
            {count}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted">No issues</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <ItemRow key={item.name} item={item} onClick={() => onItemClick(item.name)} />
          ))}
          {items.length < count && (
            <p className="pt-1 text-xs text-muted">
              showing {items.length} of {count}
            </p>
          )}
        </div>
      )}
    </BentoTile>
  )
}

export default function DataHealth() {
  const { data, isLoading, error, refetch } = useDataHealth()
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
    const denied = error instanceof ApiError && error.status === 403
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Data Health</h1>
        {denied ? (
          <EmptyState
            icon={AlertCircle}
            title="Access denied"
            subtitle="You don't have permission to view the data health report."
          />
        ) : (
          <ErrorState onRetry={() => refetch()} />
        )}
      </div>
    )
  }

  const total = data?.counts.total ?? 0
  const totalAccent = total === 0 ? 'emerald' : total > 10 ? 'rose' : 'amber'

  const sections: SectionKey[] = ['unmapped', 'outliers', 'missing', 'orphaned']

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink flex items-center gap-2">
        <ShieldAlert className="w-6 h-6 text-muted" />
        Data Health
      </h1>

      <BentoGrid>
        <BentoTile span="sm" tone="tint" accent={totalAccent} icon={ShieldAlert}>
          <BentoStat value={total} label={total === 1 ? 'total problem' : 'total problems'} />
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
