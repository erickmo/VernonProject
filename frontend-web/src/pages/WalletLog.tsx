import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react'
import { EmptyState, Spinner } from '@/components/ui'
import { useWallet, useWalletLog } from '@/hooks/useData'
import { formatNumber } from '@/lib/format'
import { ErrorState } from '@web/components/ui'
import { PageGrid, SectionCard } from '@web/components/layout'

const fmt = (n: number) =>
  (n > 0 ? '+' : '') + n.toLocaleString(undefined, { maximumFractionDigits: 1 })

export default function WalletLog() {
  const { data: wallet } = useWallet()
  const logQuery = useWalletLog()
  const { data: log, isLoading } = logQuery

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Points log</h1>

      <PageGrid
        railFirst
        main={
          logQuery.isError ? (
            <ErrorState onRetry={() => logQuery.refetch()} />
          ) : isLoading && !log ? (
            <div className="flex justify-center py-20">
              <Spinner />
            </div>
          ) : !log || log.length === 0 ? (
            <EmptyState icon={Wallet} title="No activity yet" subtitle="Earned and spent points will show up here." />
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Detail</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {log.map((e, i) => {
                    const credit = e.kind === 'credit'
                    return (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
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
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{e.title}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">
                            {[e.subtitle, e.status, e.date_human].filter(Boolean).join(' · ')}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <p
                            className={`text-sm font-semibold ${
                              credit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {fmt(e.amount)}
                          </p>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500">
                            bal {formatNumber(e.balance)}
                          </p>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        }
        rail={
          <>
            <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-card">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-brand-200">Spendable balance</p>
                <p className="text-2xl font-bold leading-tight">{formatNumber(wallet?.balance ?? 0)}</p>
              </div>
            </div>
            <SectionCard title="Summary">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">Total earned</dt>
                  <dd className="font-semibold text-slate-800 dark:text-slate-100">{formatNumber(wallet?.earned ?? 0)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">Total redeemed</dt>
                  <dd className="font-semibold text-slate-800 dark:text-slate-100">{formatNumber(wallet?.redeemed ?? 0)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">Earned today</dt>
                  <dd className="font-semibold text-emerald-600 dark:text-emerald-400">+{formatNumber(wallet?.today_earned ?? 0)}</dd>
                </div>
              </dl>
            </SectionCard>
          </>
        }
      />
    </div>
  )
}
