import { useParams } from 'react-router-dom'
import { Trophy, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'
import { Avatar, EmptyState, Spinner } from '@/components/ui'
import { useUserPointsLog } from '@/hooks/useData'
import { formatNumber } from '@/lib/format'
import type { PointsLogRow } from '@/lib/types'
import { ErrorState } from '@web/components/ui'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { Page, rise } from '@web/components/Page'
import { CATS, CAT_FALLBACK as FALLBACK, groupByDay } from '@web/lib/pointsLog'
import DailyPointsChart, { dailyNetSeries } from '@/components/DailyPointsChart'

const fmt = (n: number) => (n > 0 ? '+' : '') + n.toLocaleString(undefined, { maximumFractionDigits: 1 })

export default function UserPointsLog() {
  const { user } = useParams<{ user: string }>()
  const q = useUserPointsLog(user)
  const { data, isLoading } = q
  const groups = groupByDay<PointsLogRow>(data?.rows ?? [])

  return (
    <Page>
      <div className="mb-6 flex items-center gap-4">
        <Avatar name={data?.full_name ?? user ?? ''} image={data?.image ?? null} config={data?.avatar_config} size={48} />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">{data?.full_name ?? user}</h1>
          <p className="text-sm text-muted">Points earned</p>
        </div>
      </div>

      <BentoGrid>
        <BentoTile span="md" tone="solid" accent="violet" icon={Trophy} title="Total earned">
          <BentoStat value={formatNumber(data?.total_earned ?? 0)} label="all-time earned" />
        </BentoTile>
      </BentoGrid>

      {data && dailyNetSeries(data.rows).length >= 2 && (
        <div className="mt-6 rounded-2xl bg-surface p-4 shadow-card text-ink">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Progress</h2>
          <DailyPointsChart rows={data.rows} />
        </div>
      )}

      <h2 className="mt-6 mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Activity</h2>

      {q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : isLoading && !data ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : !data || data.rows.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="No earnings yet" subtitle="Earned points will show up here." />
      ) : (
        <div className="space-y-5">
          {groups.map((g, gi) => (
            <div key={g.key || gi} {...rise(gi)}>
              <div className="mb-1.5 flex items-baseline justify-between px-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted">{g.label}</h3>
                <span className="text-xs font-medium tabular-nums text-muted">{fmt(g.net)}</span>
              </div>
              <div className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-card">
                {g.rows.map((e, i) => {
                  const cat = (e.category && CATS[e.category]) || FALLBACK
                  const Icon = cat.icon
                  return (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      <div className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', cat.chip)}>
                        <Icon className="h-[18px] w-[18px]" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{e.title}</p>
                        {e.subtitle && <p className="truncate text-xs text-muted">{e.subtitle}</p>}
                      </div>
                      <p
                        className={clsx(
                          'shrink-0 text-sm font-bold tabular-nums',
                          e.amount < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400',
                        )}
                      >
                        {fmt(e.amount)}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Page>
  )
}
