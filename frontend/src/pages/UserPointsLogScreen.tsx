// frontend/src/pages/UserPointsLogScreen.tsx
// Transparent earned-points log for any user, opened by tapping a leaderboard row.
import { useParams } from 'react-router-dom'
import { ArrowUpRight, Trophy } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Avatar, EmptyState, FullScreenLoader } from '@/components/ui'
import DailyPointsChart, { dailyNetSeries } from '@/components/DailyPointsChart'
import { useUserPointsLog } from '@/hooks/useData'

const fmt = (n: number) =>
  (n < 0 ? '' : '+') + n.toLocaleString(undefined, { maximumFractionDigits: 1 })

export default function UserPointsLogScreen() {
  const { user } = useParams<{ user: string }>()
  const { data, isLoading } = useUserPointsLog(user)

  return (
    <DetailScreen title="Points log">
      <div className="mb-4 flex items-center gap-3 rounded-3xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 p-5 text-white shadow-md">
        <div className="shrink-0 rounded-full ring-2 ring-white/40">
          <Avatar name={data?.full_name ?? user ?? ''} image={data?.image ?? null} config={data?.avatar_config} size={44} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">{data?.full_name ?? user}</p>
          <p className="text-xs font-medium uppercase tracking-wide text-white/80">Points earned</p>
          <p className="text-2xl font-bold leading-tight">
            {(data?.total_earned ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </p>
        </div>
      </div>

      {data && dailyNetSeries(data.rows).length >= 2 && (
        <div className="mb-4 rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm text-slate-600 dark:text-slate-300">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Progress</p>
          <DailyPointsChart rows={data.rows} />
        </div>
      )}

      {isLoading && !data ? (
        <FullScreenLoader />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState icon={Trophy} title="No earnings yet" subtitle="Earned points will show up here." />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
          {data.rows.map((e, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-2 ring-violet-200 dark:ring-violet-500/30 ${
                  e.amount < 0
                    ? 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400'
                    : 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                }`}
              >
                <ArrowUpRight className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{e.title}</p>
                <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                  {[e.subtitle, e.date_human].filter(Boolean).join(' · ')}
                </p>
              </div>
              <p
                className={`text-sm font-semibold ${
                  e.amount < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {fmt(e.amount)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </DetailScreen>
  )
}
