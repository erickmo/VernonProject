import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react'
import { EmptyState, Spinner } from '@/components/ui'
import { useWallet, useWalletLog } from '@/hooks/useData'
import { formatNumber } from '@/lib/format'
import { ErrorState } from '@web/components/ui'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'

const fmt = (n: number) =>
  (n > 0 ? '+' : '') + n.toLocaleString(undefined, { maximumFractionDigits: 1 })

export default function WalletLog() {
  const { data: wallet } = useWallet()
  const logQuery = useWalletLog()
  const { data: log, isLoading } = logQuery

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Points log</h1>

      <BentoGrid>
        {/* Balance hero */}
        <BentoTile span="md" tall tone="solid" accent="amber" icon={Wallet} title="Spendable balance">
          <BentoStat
            value={formatNumber(wallet?.balance ?? 0)}
            label="balance"
          />
        </BentoTile>

        {/* Earned today */}
        <BentoTile span="sm" tone="tint" accent="amber" title="Earned today">
          <BentoStat
            value={`+${formatNumber(wallet?.today_earned ?? 0)}`}
            label="today"
          />
        </BentoTile>

        {/* Summary stats — total earned / redeemed */}
        <BentoTile span="sm" tone="tint" accent="amber" title="Summary">
          <dl className="space-y-2 text-sm pt-1">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Total earned</dt>
              <dd className="font-semibold">{formatNumber(wallet?.earned ?? 0)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Total redeemed</dt>
              <dd className="font-semibold">{formatNumber(wallet?.redeemed ?? 0)}</dd>
            </div>
          </dl>
        </BentoTile>

        {/* Transaction log */}
        <BentoTile span="full" tone="plain">
          {logQuery.isError ? (
            <ErrorState onRetry={() => logQuery.refetch()} />
          ) : isLoading && !log ? (
            <div className="flex justify-center py-20">
              <Spinner />
            </div>
          ) : !log || log.length === 0 ? (
            <EmptyState icon={Wallet} title="No activity yet" subtitle="Earned and spent points will show up here." />
          ) : (
            <div className="overflow-x-auto -mx-5 -mb-5">
              {/* ponytail: simple static 3-col table, kept hand-written (not DataTable). */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted">Detail</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {log.map((e, i) => {
                    const credit = e.kind === 'credit'
                    return (
                      <tr key={i} className="hover:bg-hover/[0.03] dark:hover:bg-hover/[0.04]">
                        <td className="px-4 py-3 w-12">
                          <div
                            aria-label={credit ? 'Credit' : 'Debit'}
                            title={credit ? 'Credit' : 'Debit'}
                            className={`flex h-9 w-9 items-center justify-center rounded-full ${
                              credit
                                ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {credit ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                            <span className="sr-only">{credit ? 'Credit' : 'Debit'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-ink">{e.title}</p>
                          <p className="text-xs text-muted">
                            {[e.subtitle, e.status, e.date_human].filter(Boolean).join(' · ')}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <p
                            className={`text-sm font-semibold ${
                              e.amount < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {fmt(e.amount)}
                          </p>
                          <p className="text-[11px] text-muted">
                            bal {formatNumber(e.balance)}
                          </p>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </BentoTile>
      </BentoGrid>
    </div>
  )
}
