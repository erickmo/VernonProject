import { useState } from 'react'
import { Trophy } from 'lucide-react'
import { Avatar, EmptyState, Spinner, Segmented } from '@/components/ui'
import { useBoot, useLeaderboard } from '@/hooks/useData'
import type { LeaderboardEntry, LeaderboardPeriod, LeaderboardDimension } from '@/lib/types'
import { ErrorState } from '@web/components/ui'
import { BentoGrid, BentoTile, BentoStat } from '@web/components/bento'
import { SearchableSelect } from '@/components/SearchableSelect'
import { DataTable } from '@web/components/DataTable'
import type { Column } from '@web/components/DataTable'

const PERIODS: { value: LeaderboardPeriod; label: string }[] = [
  { value: 'weekly', label: 'Week' },
  { value: 'monthly', label: 'Month' },
  { value: 'all', label: 'All-time' },
]

const DIMENSIONS: { value: LeaderboardDimension; label: string }[] = [
  { value: 'productivity', label: 'Productivity' },
  { value: 'character', label: 'Character' },
]

const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null)

export default function Leaderboard() {
  const { data: boot } = useBoot()
  const [period, setPeriod] = useState<LeaderboardPeriod>('monthly')
  const [dimension, setDimension] = useState<LeaderboardDimension>('productivity')
  const [brand, setBrand] = useState<string>('')
  const q = useLeaderboard(period, brand || null, dimension)
  const { data, isLoading } = q

  // Top-3 entries for podium tile
  const top3 = data ? data.entries.slice(0, 3) : []

  const meUser = boot?.user
  const leaderCols: Column<LeaderboardEntry>[] = [
    {
      key: 'rank',
      header: 'Rank',
      width: 'w-12',
      render: (e) => (
        <span className="text-sm font-bold text-muted">{medal(e.rank) ?? e.rank}</span>
      ),
    },
    {
      key: 'player',
      header: 'Player',
      render: (e) => {
        const isMe = e.user === meUser
        return (
          <div className="flex items-center gap-3">
            <Avatar name={e.full_name} image={e.image} config={e.avatar_config} size={36} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">
                {e.full_name}
                {isMe && <span className="text-brand-600 dark:text-brand-300"> · you</span>}
              </p>
              {e.badge && (
                <span
                  className="mt-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                  style={e.badge.color ? { backgroundColor: `${e.badge.color}22`, color: e.badge.color } : undefined}
                >
                  {e.badge.icon && <span>{e.badge.icon}</span>}
                  {e.badge.tier_name}
                </span>
              )}
            </div>
          </div>
        )
      },
    },
    {
      key: 'points',
      header: 'Points',
      align: 'right',
      sortValue: (e) => e.points,
      render: (e) => (
        <span className="text-sm font-bold text-ink whitespace-nowrap">
          {e.points.toLocaleString(undefined, { maximumFractionDigits: 1 })}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Leaderboard</h1>
        <Segmented options={DIMENSIONS} value={dimension} onChange={setDimension} />
      </div>

      {q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : isLoading && !data ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : !data || data.entries.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No points yet"
          subtitle={
            dimension === 'character'
              ? "Cheer teammates' work and mentor others to climb."
              : 'Complete work to climb the board.'
          }
        />
      ) : (
        <BentoGrid>
          {/* Top-3 podium */}
          <BentoTile span="wide" tone="gradient" accent="violet" title="Top Players">
            <div className="flex flex-wrap gap-4 pt-1">
              {top3.map((e) => (
                <div key={e.user} className="flex items-center gap-3 min-w-0">
                  <div className="text-2xl shrink-0">{medal(e.rank) ?? `#${e.rank}`}</div>
                  <Avatar name={e.full_name} image={e.image} config={e.avatar_config} size={40} />
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
              <p className="text-xs text-muted">
                Showing <b className="text-ink">{PERIODS.find((p) => p.value === period)?.label}</b>{' '}
                standings{brand ? <> for <b className="text-ink">{brand}</b></> : ''}.
              </p>
            </div>
          </BentoTile>

          {/* Full ranking */}
          <BentoTile span="full" tone="plain">
            <div className="-mx-5 -mb-5">
              <DataTable
                rows={data.entries}
                columns={leaderCols}
                getKey={(e) => e.user}
                activeKey={boot?.user}
              />
            </div>
          </BentoTile>
        </BentoGrid>
      )}
    </div>
  )
}
