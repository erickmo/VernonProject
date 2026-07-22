// frontend/src/pages/WalletLogScreen.tsx
import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { EmptyState, FullScreenLoader } from '@/components/ui'
import DailyPointsChart, { dailyNetSeries } from '@/components/DailyPointsChart'
import { useWallet, useWalletLog } from '@/hooks/useData'

const fmt = (n: number) =>
  (n < 0 ? '' : '+') + n.toLocaleString(undefined, { maximumFractionDigits: 1 })

export default function WalletLogScreen() {
  const { data: wallet } = useWallet()
  const { data: log, isLoading } = useWalletLog()

  return (
    <DetailScreen title="Points log">
      <div className="mb-4 flex items-center gap-3 rounded-3xl bg-gradient-to-br from-amber-500 via-orange-500 to-pink-500 p-5 text-white shadow-md">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20">
          <Wallet className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-white/80">Spendable balance</p>
          <p className="text-2xl font-bold leading-tight">
            {(wallet?.balance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </p>
        </div>
      </div>

      {log && dailyNetSeries(log).length >= 2 && (
        <div className="mb-4 rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm text-slate-600 dark:text-slate-300">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Progress</p>
          <DailyPointsChart rows={log} />
        </div>
      )}

      {isLoading && !log ? (
        <FullScreenLoader />
      ) : !log || log.length === 0 ? (
        <EmptyState icon={Wallet} title="No activity yet" subtitle="Earned and spent points will show up here." />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
          {log.map((e, i) => {
            const credit = e.kind === 'credit'
            return (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-2 ring-amber-200 dark:ring-amber-500/30 ${
                    credit
                      ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {credit ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{e.title}</p>
                  <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                    {[e.subtitle, e.status, e.date_human].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`text-sm font-semibold ${
                      e.amount < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {fmt(e.amount)}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    bal {e.balance.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </DetailScreen>
  )
}
