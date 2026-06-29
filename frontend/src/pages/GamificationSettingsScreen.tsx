import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Plus, Trash2, Zap } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { useBoot, canManageBadges, useGamificationSettings, useSaveGamificationSettings, useAvatarCatalog } from '@/hooks/useData'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

type LevelRow = { level: string; reward_points: string; reward_asset: string }
type AchievRow = { code: string; title: string; icon: string; condition: string; threshold: string; reward_points: string; reward_asset: string; is_tier: number; color: string }

const emptyLevel = (): LevelRow => ({ level: '', reward_points: '', reward_asset: '' })
const emptyAchiev = (): AchievRow => ({ code: '', title: '', icon: '', condition: 'todos_completed', threshold: '', reward_points: '', reward_asset: '', is_tier: 0, color: '' })

const CONDITIONS = ['todos_completed', 'badge_points', 'streak_days']

function Lbl({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">{children}</label>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 shadow-card">
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-stone-500 dark:text-slate-400">{title}</p>
      {children}
    </div>
  )
}

export default function GamificationSettingsScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { data: boot } = useBoot()
  const { data: loaded, isLoading } = useGamificationSettings()
  const save = useSaveGamificationSettings()
  const { data: catalog } = useAvatarCatalog()
  const assetNames = catalog?.assets.map((a) => a.asset_name) ?? []

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
    setAchievements(loaded.achievements.map((a) => ({ ...a, threshold: String(a.threshold), reward_points: String(a.reward_points), is_tier: a.is_tier ?? 0, color: a.color ?? '' })))
  }, [loaded])

  const blocked = !boot ? false : !canManageBadges(boot)
  useEffect(() => { if (blocked) navigate('/', { replace: true }) }, [blocked, navigate])
  if (blocked) return null

  if (isLoading && !loaded) {
    return (
      <DetailScreen title="Gamification">
        <Spinner className="mx-auto h-5 w-5 text-slate-400" />
      </DetailScreen>
    )
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
        achievements: achievements.map((a) => ({ code: a.code.trim(), title: a.title.trim(), icon: a.icon.trim(), condition: a.condition, threshold: Number(a.threshold), reward_points: Number(a.reward_points), reward_asset: a.reward_asset.trim(), is_tier: a.is_tier, color: a.color.trim() })),
      },
      {
        onSuccess: () => { toast('success', 'Gamification settings saved'); navigate(-1) },
        onError: (e) => toast('error', (e as Error).message),
      },
    )
  }

  return (
    <DetailScreen title="Gamification">
      <div className="flex flex-col gap-4">
        {/* Icon header */}
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
          <Zap className="h-6 w-6" />
        </div>

        <p className="text-xs text-stone-500 dark:text-slate-400 leading-relaxed">Pengaturan Gamifikasi — atur ekonomi &amp; progres avatar: harga item, level/XP, hadiah harian, dan pencapaian. Semua tersimpan langsung saat disimpan.</p>

        {/* Global settings */}
        <Section title="Global settings">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Lbl>Premium price</Lbl>
              <input type="number" inputMode="decimal" className={field} value={premiumPrice} onChange={(e) => setPremiumPrice(e.target.value)} placeholder="500" />
              <p className="mt-1 text-xs text-stone-400 dark:text-slate-500">Harga (poin) untuk membuka 1 varian/item premium.</p>
            </div>
            <div>
              <Lbl>Points/level</Lbl>
              <input type="number" inputMode="decimal" className={field} value={pointsPerLevel} onChange={(e) => setPointsPerLevel(e.target.value)} placeholder="100" />
              <p className="mt-1 text-xs text-stone-400 dark:text-slate-500">Poin yang dibutuhkan untuk naik 1 level avatar.</p>
            </div>
            <div>
              <Lbl>Daily reward pts</Lbl>
              <input type="number" inputMode="decimal" className={field} value={dailyRewardPoints} onChange={(e) => setDailyRewardPoints(e.target.value)} placeholder="10" />
              <p className="mt-1 text-xs text-stone-400 dark:text-slate-500">Poin hadiah saat klaim harian.</p>
            </div>
            <div>
              <Lbl>Streak bonus pts</Lbl>
              <input type="number" inputMode="decimal" className={field} value={streakBonusPoints} onChange={(e) => setStreakBonusPoints(e.target.value)} placeholder="5" />
              <p className="mt-1 text-xs text-stone-400 dark:text-slate-500">Tambahan poin per hari beruntun (streak).</p>
            </div>
            <div>
              <Lbl>Streak cap</Lbl>
              <input type="number" inputMode="decimal" className={field} value={streakCap} onChange={(e) => setStreakCap(e.target.value)} placeholder="30" />
              <p className="mt-1 text-xs text-stone-400 dark:text-slate-500">Maksimum hari beruntun yang dihitung untuk bonus.</p>
            </div>
          </div>
        </Section>

        {/* Level Rewards */}
        <Section title="Level Rewards">
          <p className="mb-3 text-xs text-stone-400 dark:text-slate-500">Hadiah Level — saat user mencapai level tertentu, beri poin + item kosmetik (sekali).</p>
          {levels.length === 0 ? (
            <button type="button" onClick={() => setLevels((ls) => [...ls, emptyLevel()])}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-4 text-sm font-semibold text-slate-500 dark:border-slate-600 dark:text-slate-400">
              <Plus className="h-4 w-4" /> Add level reward
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              {levels.map((l, i) => (
                <div key={i} className="rounded-xl bg-paper dark:bg-slate-900 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Level reward {i + 1}</span>
                    <button type="button" onClick={() => removeLevel(i)} className="flex h-7 w-7 items-center justify-center rounded-lg text-rose-500 active:bg-rose-50 dark:active:bg-rose-500/10">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Lbl>Level</Lbl><input type="number" className={field} value={l.level} onChange={(e) => setLevel(i, { level: e.target.value })} placeholder="5" /></div>
                    <div><Lbl>Reward pts</Lbl><input type="number" className={field} value={l.reward_points} onChange={(e) => setLevel(i, { reward_points: e.target.value })} placeholder="100" /></div>
                    <div className="col-span-2">
                      <Lbl>Reward asset</Lbl>
                      <select className={field} value={l.reward_asset} onChange={(e) => setLevel(i, { reward_asset: e.target.value })}>
                        <option value="">(none)</option>
                        {assetNames.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => setLevels((ls) => [...ls, emptyLevel()])}
                className="flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-sm font-semibold text-slate-500 dark:border-slate-600 dark:text-slate-400">
                <Plus className="h-4 w-4" /> Add level reward
              </button>
            </div>
          )}
        </Section>

        {/* Achievements */}
        <Section title="Achievements">
          <p className="mb-3 text-xs text-stone-400 dark:text-slate-500">Pencapaian — saat kondisi tercapai, beri hadiah (sekali). Centang 'Tier' untuk menjadikannya tingkat peringkat (badge).</p>
          {achievements.length === 0 ? (
            <button type="button" onClick={() => setAchievements((as) => [...as, emptyAchiev()])}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-4 text-sm font-semibold text-slate-500 dark:border-slate-600 dark:text-slate-400">
              <Plus className="h-4 w-4" /> Add achievement
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              {achievements.map((a, i) => (
                <div key={i} className="rounded-xl bg-paper dark:bg-slate-900 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Achievement {i + 1}</span>
                    <button type="button" onClick={() => removeAchiev(i)} className="flex h-7 w-7 items-center justify-center rounded-lg text-rose-500 active:bg-rose-50 dark:active:bg-rose-500/10">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Lbl>Code</Lbl><input className={field} value={a.code} onChange={(e) => setAchiev(i, { code: e.target.value })} placeholder="first_todo" /></div>
                    <div><Lbl>Title</Lbl><input className={field} value={a.title} onChange={(e) => setAchiev(i, { title: e.target.value })} placeholder="First Steps" /></div>
                    <div><Lbl>Icon</Lbl><input className={field} value={a.icon} onChange={(e) => setAchiev(i, { icon: e.target.value })} placeholder="🏆" /></div>
                    <div>
                      <Lbl>Condition</Lbl>
                      <select className={field} value={a.condition} onChange={(e) => setAchiev(i, { condition: e.target.value })}>
                        {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <p className="mt-1 text-xs text-stone-400 dark:text-slate-500">todos_completed · badge_points · streak_days</p>
                    </div>
                    <div>
                      <Lbl>Threshold</Lbl>
                      <input type="number" className={field} value={a.threshold} onChange={(e) => setAchiev(i, { threshold: e.target.value })} placeholder="1" />
                      <p className="mt-1 text-xs text-stone-400 dark:text-slate-500">Ambang batas kondisi.</p>
                    </div>
                    <div>
                      <Lbl>Reward pts</Lbl>
                      <input type="number" className={field} value={a.reward_points} onChange={(e) => setAchiev(i, { reward_points: e.target.value })} placeholder="50" />
                      <p className="mt-1 text-xs text-stone-400 dark:text-slate-500">Hadiah poin yang diberikan.</p>
                    </div>
                    <div className="col-span-2">
                      <Lbl>Reward asset</Lbl>
                      <select className={field} value={a.reward_asset} onChange={(e) => setAchiev(i, { reward_asset: e.target.value })}>
                        <option value="">(none)</option>
                        {assetNames.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <p className="mt-1 text-xs text-stone-400 dark:text-slate-500">Item kosmetik yang diberikan sebagai hadiah.</p>
                    </div>
                    <div>
                      <Lbl>Color (tier)</Lbl>
                      <input className={field} value={a.color} onChange={(e) => setAchiev(i, { color: e.target.value })} placeholder="#6366f1" />
                      <p className="mt-1 text-xs text-stone-400 dark:text-slate-500">Warna badge (hex), untuk baris tier.</p>
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input type="checkbox" className="h-4 w-4 rounded accent-brand-600" checked={!!a.is_tier} onChange={(e) => setAchiev(i, { is_tier: e.target.checked ? 1 : 0 })} />
                        <span className="text-sm text-slate-600 dark:text-slate-300">Rank tier</span>
                      </label>
                      <p className="ml-2 text-xs text-stone-400 dark:text-slate-500">Jadikan tingkat peringkat.</p>
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => setAchievements((as) => [...as, emptyAchiev()])}
                className="flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-sm font-semibold text-slate-500 dark:border-slate-600 dark:text-slate-400">
                <Plus className="h-4 w-4" /> Add achievement
              </button>
            </div>
          )}
        </Section>

        {/* Save */}
        <button
          onClick={doSave}
          disabled={save.isPending}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
        >
          {save.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          Save settings
        </button>
      </div>
    </DetailScreen>
  )
}
