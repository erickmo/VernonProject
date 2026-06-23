import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Plus, Trash2 } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canManageBadges, useBadgeSettings, useSaveBadgeSettings } from '@/hooks/useData'
import type { BadgeTierInput } from '@/lib/types'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

const emptyTier = (): BadgeTierInput => ({ tier_name: '', min_points: 0, color: '', icon: '' })

export default function BadgeSettings() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: boot } = useBoot()
  const { data: loaded, isLoading } = useBadgeSettings()
  const save = useSaveBadgeSettings()

  const [tiers, setTiers] = useState<BadgeTierInput[]>([])

  useEffect(() => {
    if (loaded) setTiers(loaded.length ? loaded : [emptyTier()])
  }, [loaded])

  // Access gate: redirect outside render.
  const blocked = !boot ? false : !canManageBadges(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  if (blocked) return null

  if (isLoading && !loaded) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  const setTier = (i: number, patch: Partial<BadgeTierInput>) =>
    setTiers((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)))

  const addTier = () => setTiers((ts) => [...ts, emptyTier()])
  const removeTier = (i: number) => setTiers((ts) => ts.filter((_, j) => j !== i))

  const doSave = () => {
    for (const t of tiers) {
      if (!t.tier_name.trim()) {
        toast('error', 'Every tier needs a name')
        return
      }
      if (isNaN(t.min_points) || t.min_points < 0) {
        toast('error', 'Min points must be a non-negative number')
        return
      }
    }
    const payload = tiers.map((t) => ({
      tier_name: t.tier_name.trim(),
      min_points: Number(t.min_points),
      color: t.color.trim(),
      icon: t.icon.trim(),
    }))
    save.mutate(payload, {
      onSuccess: () => toast('success', 'Badges saved'),
      onError: (e) => toast('error', (e as Error).message),
    })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Badges</h1>

      <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        A user's badge is the highest tier whose <b>Min Points</b> is ≤ their lifetime
        Todo-source points earned. Grants and gifts never change the badge.
      </p>

      <div className="flex flex-col gap-3">
        {tiers.map((t, i) => (
          <div
            key={i}
            className="rounded-2xl bg-white dark:bg-slate-900 shadow-card p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Tier {i + 1}
              </span>
              <button
                type="button"
                aria-label="Remove tier"
                onClick={() => removeTier(i)}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-rose-500 hover:bg-rose-50 dark:border-slate-700 dark:hover:bg-rose-500/10"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  className={field}
                  value={t.tier_name}
                  onChange={(e) => setTier(i, { tier_name: e.target.value })}
                  placeholder="Tier name (e.g. Silver)"
                />
                <input
                  type="number"
                  inputMode="decimal"
                  className={field}
                  value={String(t.min_points)}
                  onChange={(e) => setTier(i, { min_points: e.target.value === '' ? 0 : Number(e.target.value) })}
                  placeholder="Min points (e.g. 500)"
                />
              </div>
              <div className="flex gap-3">
                <input
                  className={field}
                  value={t.color}
                  onChange={(e) => setTier(i, { color: e.target.value })}
                  placeholder="Color (e.g. #9ca3af)"
                />
                <input
                  className={field}
                  value={t.icon}
                  onChange={(e) => setTier(i, { icon: e.target.value })}
                  placeholder="Icon (emoji)"
                />
              </div>
              {(t.color || t.icon) && (
                <span
                  className="inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={t.color ? { backgroundColor: `${t.color}22`, color: t.color } : undefined}
                >
                  {t.icon && <span>{t.icon}</span>}
                  {t.tier_name || 'Preview'}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={addTier}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-500 hover:border-slate-400 dark:border-slate-600 dark:text-slate-400 dark:hover:border-slate-500"
        >
          <Plus className="h-4 w-4" /> Add tier
        </button>

        <button
          onClick={doSave}
          disabled={save.isPending}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
        >
          {save.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          Save badges
        </button>
      </div>
    </div>
  )
}
