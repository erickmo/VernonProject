import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Plus, Trash2 } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { Field } from '@web/components/ui'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { useBoot, canManageBadges, useGamificationSettings, useSaveGamificationSettings } from '@/hooks/useData'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

type LevelRow = { level: string; reward_points: string; reward_asset: string }
type AchievRow = { code: string; title: string; icon: string; condition: string; threshold: string; reward_points: string; reward_asset: string }

const emptyLevel = (): LevelRow => ({ level: '', reward_points: '', reward_asset: '' })
const emptyAchiev = (): AchievRow => ({ code: '', title: '', icon: '', condition: 'todos_completed', threshold: '', reward_points: '', reward_asset: '' })

const CONDITIONS = ['todos_completed', 'badge_points', 'streak_days']

export default function GamificationSettings() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { data: boot } = useBoot()
  const { data: loaded, isLoading } = useGamificationSettings()
  const save = useSaveGamificationSettings()

  const [premiumPrice, setPremiumPrice] = useState('')
  const [pointsPerLevel, setPointsPerLevel] = useState('')
  const [dailyRewardPoints, setDailyRewardPoints] = useState('')
  const [streakBonusPoints, setStreakBonusPoints] = useState('')
  const [streakCap, setStreakCap] = useState('')
  const [levels, setLevels] = useState<LevelRow[]>([])
  const [achievements, setAchievements] = useState<AchievRow[]>([])

  useEffect(() => {
    if (!loaded) return
    setPremiumPrice(String(loaded.premium_price))
    setPointsPerLevel(String(loaded.points_per_level))
    setDailyRewardPoints(String(loaded.daily_reward_points))
    setStreakBonusPoints(String(loaded.streak_bonus_points))
    setStreakCap(String(loaded.streak_cap))
    setLevels(loaded.level_rewards.map((r) => ({ level: String(r.level), reward_points: String(r.reward_points), reward_asset: r.reward_asset })))
    setAchievements(loaded.achievements.map((a) => ({ ...a, threshold: String(a.threshold), reward_points: String(a.reward_points) })))
  }, [loaded])

  const blocked = !boot ? false : !canManageBadges(boot)
  useEffect(() => { if (blocked) navigate('/', { replace: true }) }, [blocked, navigate])
  if (blocked) return null

  if (isLoading && !loaded) {
    return <div className="flex justify-center py-20"><Spinner /></div>
  }

  const setLevel = (i: number, patch: Partial<LevelRow>) =>
    setLevels((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  const setAchiev = (i: number, patch: Partial<AchievRow>) =>
    setAchievements((as) => as.map((a, j) => (j === i ? { ...a, ...patch } : a)))

  const removeLevel = async (i: number) => {
    const r = levels[i]
    if (r.level || r.reward_points || r.reward_asset) {
      const ok = await confirm({ title: 'Remove level reward?', message: 'This cannot be undone.', confirmLabel: 'Remove', destructive: true })
      if (!ok) return
    }
    setLevels((ls) => ls.filter((_, j) => j !== i))
  }

  const removeAchiev = async (i: number) => {
    const a = achievements[i]
    if (a.code || a.title) {
      const ok = await confirm({ title: 'Remove achievement?', message: 'This cannot be undone.', confirmLabel: 'Remove', destructive: true })
      if (!ok) return
    }
    setAchievements((as) => as.filter((_, j) => j !== i))
  }

  const doSave = () => {
    save.mutate(
      {
        premium_price: Number(premiumPrice),
        points_per_level: Number(pointsPerLevel),
        daily_reward_points: Number(dailyRewardPoints),
        streak_bonus_points: Number(streakBonusPoints),
        streak_cap: Number(streakCap),
        level_rewards: levels.map((l) => ({ level: Number(l.level), reward_points: Number(l.reward_points), reward_asset: l.reward_asset.trim() })),
        achievements: achievements.map((a) => ({ code: a.code.trim(), title: a.title.trim(), icon: a.icon.trim(), condition: a.condition, threshold: Number(a.threshold), reward_points: Number(a.reward_points), reward_asset: a.reward_asset.trim() })),
      },
      {
        onSuccess: () => toast('success', 'Gamification settings saved'),
        onError: (e) => toast('error', (e as Error).message),
      },
    )
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); doSave() }} className="space-y-6">
      <h1 className="text-2xl font-bold">Gamification Settings</h1>

      <BentoGrid>
        <BentoTile span="full" tone="plain" title="Global settings">
          <div className="mt-1 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Field label="Premium price">
              {(id) => (
                <input id={id} type="number" inputMode="decimal" className={field} value={premiumPrice}
                  onChange={(e) => setPremiumPrice(e.target.value)} placeholder="e.g. 500" />
              )}
            </Field>
            <Field label="Points per level">
              {(id) => (
                <input id={id} type="number" inputMode="decimal" className={field} value={pointsPerLevel}
                  onChange={(e) => setPointsPerLevel(e.target.value)} placeholder="e.g. 100" />
              )}
            </Field>
            <Field label="Daily reward pts">
              {(id) => (
                <input id={id} type="number" inputMode="decimal" className={field} value={dailyRewardPoints}
                  onChange={(e) => setDailyRewardPoints(e.target.value)} placeholder="e.g. 10" />
              )}
            </Field>
            <Field label="Streak bonus pts">
              {(id) => (
                <input id={id} type="number" inputMode="decimal" className={field} value={streakBonusPoints}
                  onChange={(e) => setStreakBonusPoints(e.target.value)} placeholder="e.g. 5" />
              )}
            </Field>
            <Field label="Streak cap">
              {(id) => (
                <input id={id} type="number" inputMode="decimal" className={field} value={streakCap}
                  onChange={(e) => setStreakCap(e.target.value)} placeholder="e.g. 30" />
              )}
            </Field>
          </div>
        </BentoTile>

        <BentoTile span="full" tone="plain" title="Level Rewards">
          <div className="mt-1 space-y-3">
            {levels.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">No level rewards yet.</p>
                <button type="button" onClick={() => setLevels((ls) => [...ls, emptyLevel()])}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
                  <Plus className="h-4 w-4" /> Add first level reward
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3">
                  {levels.map((l, i) => (
                    <div key={i} className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Level reward {i + 1}</span>
                        <button type="button" aria-label="Remove level reward" onClick={() => removeLevel(i)}
                          className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-rose-500 hover:bg-rose-50 dark:border-slate-700 dark:hover:bg-rose-500/10">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <div className="flex-1">
                          <Field label="Level">
                            {(id) => <input id={id} type="number" className={field} value={l.level} onChange={(e) => setLevel(i, { level: e.target.value })} placeholder="e.g. 5" />}
                          </Field>
                        </div>
                        <div className="flex-1">
                          <Field label="Reward points">
                            {(id) => <input id={id} type="number" className={field} value={l.reward_points} onChange={(e) => setLevel(i, { reward_points: e.target.value })} placeholder="e.g. 100" />}
                          </Field>
                        </div>
                        <div className="flex-1">
                          <Field label="Reward asset">
                            {(id) => <input id={id} className={field} value={l.reward_asset} onChange={(e) => setLevel(i, { reward_asset: e.target.value })} placeholder="Avatar Asset name" />}
                          </Field>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => setLevels((ls) => [...ls, emptyLevel()])}
                  className="flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-3 px-4 text-sm font-semibold text-slate-500 hover:border-slate-400 dark:border-slate-600 dark:text-slate-400 dark:hover:border-slate-500">
                  <Plus className="h-4 w-4" /> Add level reward
                </button>
              </>
            )}
          </div>
        </BentoTile>

        <BentoTile span="full" tone="plain" title="Achievements">
          <div className="mt-1 space-y-3">
            {achievements.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">No achievements yet.</p>
                <button type="button" onClick={() => setAchievements((as) => [...as, emptyAchiev()])}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
                  <Plus className="h-4 w-4" /> Add first achievement
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3">
                  {achievements.map((a, i) => (
                    <div key={i} className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Achievement {i + 1}</span>
                        <button type="button" aria-label="Remove achievement" onClick={() => removeAchiev(i)}
                          className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-rose-500 hover:bg-rose-50 dark:border-slate-700 dark:hover:bg-rose-500/10">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        <Field label="Code">
                          {(id) => <input id={id} className={field} value={a.code} onChange={(e) => setAchiev(i, { code: e.target.value })} placeholder="first_todo" />}
                        </Field>
                        <Field label="Title">
                          {(id) => <input id={id} className={field} value={a.title} onChange={(e) => setAchiev(i, { title: e.target.value })} placeholder="First Steps" />}
                        </Field>
                        <Field label="Icon">
                          {(id) => <input id={id} className={field} value={a.icon} onChange={(e) => setAchiev(i, { icon: e.target.value })} placeholder="🏆" />}
                        </Field>
                        <Field label="Condition">
                          {(id) => (
                            <select id={id} className={field} value={a.condition} onChange={(e) => setAchiev(i, { condition: e.target.value })}>
                              {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          )}
                        </Field>
                        <Field label="Threshold">
                          {(id) => <input id={id} type="number" className={field} value={a.threshold} onChange={(e) => setAchiev(i, { threshold: e.target.value })} placeholder="e.g. 1" />}
                        </Field>
                        <Field label="Reward points">
                          {(id) => <input id={id} type="number" className={field} value={a.reward_points} onChange={(e) => setAchiev(i, { reward_points: e.target.value })} placeholder="e.g. 50" />}
                        </Field>
                        <Field label="Reward asset">
                          {(id) => <input id={id} className={field} value={a.reward_asset} onChange={(e) => setAchiev(i, { reward_asset: e.target.value })} placeholder="Avatar Asset name" />}
                        </Field>
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => setAchievements((as) => [...as, emptyAchiev()])}
                  className="flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-3 px-4 text-sm font-semibold text-slate-500 hover:border-slate-400 dark:border-slate-600 dark:text-slate-400 dark:hover:border-slate-500">
                  <Plus className="h-4 w-4" /> Add achievement
                </button>
              </>
            )}
          </div>
        </BentoTile>

        <BentoTile span="sm" tone="plain" title="Save">
          <div className="mt-1">
            <button type="submit" disabled={save.isPending}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors">
              {save.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              Save settings
            </button>
          </div>
        </BentoTile>
      </BentoGrid>
    </form>
  )
}
