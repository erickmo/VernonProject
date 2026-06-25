import { useState } from 'react'
import { Trophy } from 'lucide-react'
import { Avatar, EmptyState, Spinner, Segmented } from '@/components/ui'
import { useBoot, useLeaderboard } from '@/hooks/useData'
import type { LeaderboardEntry, LeaderboardPeriod } from '@/lib/types'
import { ErrorState } from '@web/components/ui'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
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

  // Top-3 entries for podium tile
  const top3 = data ? data.entries.slice(0, 3) : []

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Leaderboard</h1>

      {q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : isLoading && !data ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : !data || data.entries.length === 0 ? (
        <EmptyState icon={Trophy} title="No points yet" subtitle="Complete work to climb the board." />
      ) : (
        <BentoGrid>
          {/* Top-3 podium */}
          <BentoTile span="wide" tone="gradient" accent="violet" title="Top Players">
            <div className="flex flex-wrap gap-4 pt-1">
              {top3.map((e) => (
                <div key={e.user} className="flex items-center gap-3 min-w-0">
                  <div className="text-2xl shrink-0">{medal(e.rank) ?? `#${e.rank}`}</div>
                  <Avatar name={e.full_name} image={e.image} size={40} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{e.full_name}</p>
                    <p className="text-xs opacity-70">{e.points.toLocaleString(undefined, { maximumFractionDigits: 1 })} pts</p>
                  </div>
                </div>
              ))}
            </div>
          </BentoTile>

          {/* My rank */}
          {data.me && (
            <BentoTile span="sm" tone="solid" accent="violet" title="Your rank">
              <BentoStat
                value={medal(data.me.rank) ?? `#${data.me.rank}`}
                label={`${data.me.points.toLocaleString(undefined, { maximumFractionDigits: 1 })} pts`}
              />
            </BentoTile>
          )}

          {/* Period / filter controls */}
          <BentoTile span="sm" tone="tint" accent="slate" title="Filter">
            <div className="flex flex-col gap-3 pt-1">
              <Segmented options={PERIODS} value={period} onChange={setPeriod} />
              {data.brands.length > 0 && (
                <div className="w-full">
                  <SearchableSelect
                    value={brand}
                    onChange={setBrand}
                    options={data.brands.map((b) => ({ value: b, label: b }))}
                    placeholder="All brands"
                    allowClear
                  />
                </div>
              )}
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Showing <b className="text-slate-700 dark:text-slate-200">{PERIODS.find((p) => p.value === period)?.label}</b>{' '}
                standings{brand ? <> for <b className="text-slate-700 dark:text-slate-200">{brand}</b></> : ''}.
              </p>
            </div>
          </BentoTile>

          {/* Full ranking */}
          <BentoTile span="full" tone="plain">
            <div className="overflow-x-auto -mx-5 -mb-5">
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
          </BentoTile>
        </BentoGrid>
      )}
    </div>
  )
}
