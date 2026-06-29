import { useGamification } from '@/hooks/useData'
import { Trophy } from 'lucide-react'
import { BentoGrid, BentoTile } from '@web/components/bento'
import type { Achievement } from '@/lib/types'

function AchievementTile({ a }: { a: Achievement }) {
  const pct = a.threshold > 0 ? Math.min(100, (a.progress / a.threshold) * 100) : 0
  return (
    <BentoTile
      span="md"
      tone={a.met ? 'tint' : 'plain'}
      accent={a.met ? 'amber' : 'slate'}
      className={a.met ? '' : 'opacity-60'}
    >
      <div className="flex items-start gap-3">
        <span className="text-3xl leading-none">{a.icon || '🏅'}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold">{a.title}</p>
            {a.met && (
              <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                ✓ Unlocked
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{a.condition}</p>
        </div>
      </div>

      {!a.met && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-slate-400">
            <span>{a.progress}/{a.threshold}</span>
            <span>{Math.round(pct)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-3 text-xs font-medium text-amber-600 dark:text-amber-400">
        +{a.reward_points} pts
        {a.reward_asset && (
          <span className="ml-1 text-slate-400 dark:text-slate-500">· {a.reward_asset}</span>
        )}
      </div>
    </BentoTile>
  )
}

export default function Achievements() {
  const { data: gami, isLoading } = useGamification()
  const list = (gami?.achievements ?? []).filter((a) => !a.is_tier)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Achievements</h1>

      {isLoading && !gami ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
          <Trophy className="w-12 h-12 opacity-30" />
          <p className="text-sm">No achievements yet — complete tasks to unlock rewards.</p>
        </div>
      ) : (
        <BentoGrid>
          {list.map((a) => (
            <AchievementTile key={a.code} a={a} />
          ))}
        </BentoGrid>
      )}
    </div>
  )
}
