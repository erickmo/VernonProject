import { useState } from 'react'
import { Wallet, CheckCircle2, ShoppingBag } from 'lucide-react'
import clsx from 'clsx'
import { EmptyState, Spinner } from '@/components/ui'
import { useWallet, useWalletLog } from '@/hooks/useData'
import { formatNumber } from '@/lib/format'
import { ErrorState } from '@web/components/ui'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { rise } from '@web/components/Page'
import { CATS, CAT_FALLBACK as FALLBACK, groupByDay } from '@web/lib/pointsLog'
import DailyPointsChart, { dailyNetSeries } from '@/components/DailyPointsChart'

// Signed amount, keeping up to 1 fraction digit (points can be fractional).
const fmt = (n: number) => (n > 0 ? '+' : '') + n.toLocaleString(undefined, { maximumFractionDigits: 1 })

const FILTERS = ['all', 'earned', 'spent'] as const
type Filter = (typeof FILTERS)[number]

export default function WalletLog() {
  const { data: wallet } = useWallet()
  const logQuery = useWalletLog()
  const { data: log, isLoading } = logQuery
  const [filter, setFilter] = useState<Filter>('all')

  const filtered = (log ?? []).filter((e) =>
    filter === 'all' ? true : filter === 'earned' ? e.kind === 'credit' : e.kind === 'debit',
  )
  const groups = groupByDay(filtered)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Points log</h1>

      <BentoGrid>
        <BentoTile span="md" tall tone="solid" accent="amber" icon={Wallet} title="Spendable balance">
          <BentoStat value={formatNumber(wallet?.balance ?? 0)} label="balance" />
        </BentoTile>

        <BentoTile span="sm" tone="tint" accent="amber" title="Earned today">
          <BentoStat value={`+${formatNumber(wallet?.today_earned ?? 0)}`} label="today" />
        </BentoTile>

        <BentoTile span="sm" tone="tint" accent="amber" title="Summary">
          <dl className="space-y-2 text-sm pt-1">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Total earned</dt>
              <dd className="font-semibold tabular-nums">{formatNumber(wallet?.earned ?? 0)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Total redeemed</dt>
              <dd className="font-semibold tabular-nums">{formatNumber(wallet?.redeemed ?? 0)}</dd>
            </div>
          </dl>
        </BentoTile>
      </BentoGrid>

      {log && dailyNetSeries(log).length >= 2 && (
        <div className="rounded-2xl bg-surface p-4 shadow-card text-ink">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Progress</h2>
          <DailyPointsChart rows={log} />
        </div>
      )}

      {/* Activity header + earned/spent filter */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Activity</h2>
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {FILTERS.map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={clsx(
                'rounded-md px-3.5 py-1.5 text-sm font-semibold capitalize transition',
                filter === k ? 'bg-brand-600 text-white shadow-sm' : 'text-muted hover:bg-hover/[0.04]',
              )}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {logQuery.isError ? (
        <ErrorState onRetry={() => logQuery.refetch()} />
      ) : isLoading && !log ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : !log || log.length === 0 ? (
        <EmptyState icon={Wallet} title="No activity yet" subtitle="Earned and spent points will show up here." />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={filter === 'spent' ? ShoppingBag : CheckCircle2}
          title={filter === 'spent' ? 'Nothing spent yet' : 'Nothing earned yet'}
          subtitle="Try a different filter."
        />
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
                  const credit = e.kind === 'credit'
                  const cat = (e.category && CATS[e.category]) || FALLBACK
                  const Icon = cat.icon
                  return (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      <div className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', cat.chip)}>
                        <Icon className="h-[18px] w-[18px]" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{e.title}</p>
                        {(e.subtitle || e.status) && (
                          <p className="truncate text-xs text-muted">
                            {[e.subtitle, e.status].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={clsx(
                            'text-sm font-bold tabular-nums',
                            credit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
                          )}
                        >
                          {fmt(e.amount)}
                        </p>
                        <p className="text-[11px] tabular-nums text-muted">bal {formatNumber(e.balance)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
