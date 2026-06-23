import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react'
import { EmptyState, Spinner } from '@/components/ui'
import { useWallet, useWalletLog } from '@/hooks/useData'

const fmt = (n: number) =>
  (n < 0 ? '' : '+') + n.toLocaleString(undefined, { maximumFractionDigits: 1 })

export default function WalletLog() {
  const { data: wallet } = useWallet()
  const { data: log, isLoading } = useWalletLog()

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Points log</h1>

      <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-card max-w-sm">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
          <Wallet className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-brand-200">Spendable balance</p>
          <p className="text-2xl font-bold leading-tight">
            {(wallet?.balance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </p>
        </div>
      </div>

      {isLoading && !log ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : !log || log.length === 0 ? (
        <EmptyState icon={Wallet} title="No activity yet" subtitle="Earned and spent points will show up here." />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {log.map((e, i) => {
                const credit = e.kind === 'credit'
                return (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 w-12">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-full ${
                          credit
                            ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {credit ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
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
                        bal {e.balance.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </p>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
