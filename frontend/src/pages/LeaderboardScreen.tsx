// frontend/src/pages/LeaderboardScreen.tsx
import { useState } from 'react'
import { Trophy } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Avatar, EmptyState, FullScreenLoader, Segmented } from '@/components/ui'
import { useBoot, useLeaderboard } from '@/hooks/useData'
import type { LeaderboardEntry, LeaderboardPeriod } from '@/lib/types'

const PERIODS: { value: LeaderboardPeriod; label: string }[] = [
  { value: 'weekly', label: 'Week' },
  { value: 'monthly', label: 'Month' },
  { value: 'all', label: 'All-time' },
]

const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null)

function Row({ e, isMe }: { e: LeaderboardEntry; isMe: boolean }) {
  return (
    <li
      className={`flex items-center gap-3 px-4 py-3 ${
        isMe ? 'bg-brand-50 dark:bg-brand-500/10' : ''
      }`}
    >
      <div className="w-7 shrink-0 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
        {medal(e.rank) ?? e.rank}
      </div>
      <Avatar name={e.full_name} image={e.image} size={36} />
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">
        {e.full_name} {isMe && <span className="text-brand-600 dark:text-brand-300">· you</span>}
      </p>
      <p className="text-sm font-bold text-slate-900 dark:text-slate-50">
        {e.points.toLocaleString(undefined, { maximumFractionDigits: 1 })}
      </p>
    </li>
  )
}

export default function LeaderboardScreen() {
  const { data: boot } = useBoot()
  const [period, setPeriod] = useState<LeaderboardPeriod>('monthly')
  const [brand, setBrand] = useState<string>('')
  const { data, isLoading } = useLeaderboard(period, brand || null)

  const meInTop = !!data?.me && data.entries.some((e) => e.user === data.me!.user)

  return (
    <DetailScreen title="Leaderboard">
      <Segmented options={PERIODS} value={period} onChange={setPeriod} />

      {data && data.brands.length > 0 && (
        <select
          value={brand}
          onChange={(ev) => setBrand(ev.target.value)}
          className="mt-3 w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200"
        >
          <option value="">All brands</option>
          {data.brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      )}

      {isLoading && !data ? (
        <FullScreenLoader />
      ) : !data || data.entries.length === 0 ? (
        <EmptyState icon={Trophy} title="No points yet" subtitle="Complete work to climb the board." />
      ) : (
        <>
          <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-700 overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-card">
            {data.entries.map((e) => (
              <Row key={e.user} e={e} isMe={e.user === boot?.user} />
            ))}
          </ul>

          {data.me && !meInTop && (
            <ul className="mt-3 overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-card ring-1 ring-brand-200 dark:ring-brand-500/30">
              <Row e={data.me} isMe />
            </ul>
          )}
        </>
      )}
    </DetailScreen>
  )
}
