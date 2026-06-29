import { DetailScreen } from '@/components/Layout'
import { EmptyState, FullScreenLoader, ProgressBar } from '@/components/ui'
import { useGamification } from '@/hooks/useData'
import { Trophy } from 'lucide-react'
import type { Achievement } from '@/lib/types'

function AchievementCard({ a }: { a: Achievement }) {
  const pct = a.threshold > 0 ? Math.min(100, (a.progress / a.threshold) * 100) : 0
  return (
    <div
      className={`rounded-2xl border px-4 py-3.5 shadow-card transition ${
        a.met
          ? 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10'
          : 'border-paper-edge bg-paper-card dark:border-slate-700 dark:bg-slate-800 opacity-70'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl leading-none">{a.icon || '🏅'}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-stone-800 dark:text-slate-100">{a.title}</p>
          <p className="truncate text-xs text-stone-400 dark:text-slate-500">{a.condition}</p>
        </div>
        {a.met && (
          <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
            ✓ Unlocked
          </span>
        )}
      </div>

      {!a.met && (
        <div className="mt-2">
          <div className="mb-1 flex justify-between text-xs text-stone-400 dark:text-slate-500">
            <span>{a.progress}/{a.threshold}</span>
          </div>
          <ProgressBar value={pct} />
        </div>
      )}

      <div className="mt-2 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
        <span>+{a.reward_points} pts</span>
        {a.reward_asset && <span className="text-stone-400 dark:text-slate-500">· {a.reward_asset}</span>}
      </div>
    </div>
  )
}

export default function AchievementsScreen() {
  const { data: gami, isLoading } = useGamification()

  if (isLoading && !gami) {
    return (
      <DetailScreen title="Achievements">
        <FullScreenLoader />
      </DetailScreen>
    )
  }

  const list = gami?.achievements ?? []

  return (
    <DetailScreen title="Achievements">
      {list.length === 0 ? (
        <EmptyState icon={Trophy} title="No achievements yet" subtitle="Complete tasks to unlock rewards" />
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((a) => (
            <AchievementCard key={a.code} a={a} />
          ))}
        </div>
      )}
    </DetailScreen>
  )
}
