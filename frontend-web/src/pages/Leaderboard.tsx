import { useState } from 'react'
import { Trophy } from 'lucide-react'
import { Avatar, EmptyState, Spinner, Segmented } from '@/components/ui'
import { useBoot, useLeaderboard } from '@/hooks/useData'
import type { LeaderboardEntry, LeaderboardPeriod } from '@/lib/types'
import { ErrorState } from '@web/components/ui'
import { SearchableSelect } from '@/components/SearchableSelect'

const PERIODS: { value: LeaderboardPeriod; label: string }[] = [
  { value: 'weekly', label: 'Week' },
  { value: 'monthly', label: 'Month' },
  { value: 'all', label: 'All-time' },
]

const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null)

function Row({ e, isMe }: { e: LeaderboardEntry; isMe: boolean }) {
  return (
    <tr className={isMe ? 'bg-brand-50 dark:bg-brand-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}>
      <td className="px-4 py-3 w-12 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
        {medal(e.rank) ?? e.rank}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar name={e.full_name} image={e.image} size={36} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
              {e.full_name}{' '}
              {isMe && <span className="text-brand-600 dark:text-brand-300">· you</span>}
            </p>
            {e.badge && (
              <span
                className="mt-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                style={
                  e.badge.color
                    ? { backgroundColor: `${e.badge.color}22`, color: e.badge.color }
                    : undefined
                }
              >
                {e.badge.icon && <span>{e.badge.icon}</span>}
                {e.badge.tier_name}
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-right text-sm font-bold text-slate-900 dark:text-slate-50 whitespace-nowrap">
        {e.points.toLocaleString(undefined, { maximumFractionDigits: 1 })}
      </td>
    </tr>
  )
}

export default function Leaderboard() {
  const { data: boot } = useBoot()
  const [period, setPeriod] = useState<LeaderboardPeriod>('monthly')
  const [brand, setBrand] = useState<string>('')
  const q = useLeaderboard(period, brand || null)
  const { data, isLoading } = q

  const meInTop = !!data?.me && data.entries.some((e) => e.user === data.me!.user)

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Leaderboard</h1>

      <div className="flex items-center gap-3 flex-wrap">
        <Segmented options={PERIODS} value={period} onChange={setPeriod} />
        {data && data.brands.length > 0 && (
          <div className="w-48">
            <SearchableSelect
              value={brand}
              onChange={setBrand}
              options={data.brands.map((b) => ({ value: b, label: b }))}
              placeholder="All brands"
              allowClear
            />
          </div>
        )}
      </div>

      {q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : isLoading && !data ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : !data || data.entries.length === 0 ? (
        <EmptyState icon={Trophy} title="No points yet" subtitle="Complete work to climb the board." />
      ) : (
        <div className="space-y-3 max-w-2xl">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">Rank</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Player</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.entries.map((e) => (
                  <Row key={e.user} e={e} isMe={e.user === boot?.user} />
                ))}
              </tbody>
            </table>
          </div>

          {data.me && !meInTop && (
            <div className="rounded-xl border border-brand-200 dark:border-brand-500/30 overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  <Row e={data.me} isMe />
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
