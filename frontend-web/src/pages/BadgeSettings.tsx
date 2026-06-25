import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Plus, Trash2 } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { Field } from '@web/components/ui'
import { PageGrid, SectionCard } from '@web/components/layout'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { useBoot, canManageBadges, useBadgeSettings, useSaveBadgeSettings } from '@/hooks/useData'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500'

// Local row keeps numeric fields as strings so clearing a field doesn't snap to 0.
type TierRow = { tier_name: string; min_points: string; color: string; icon: string }
type TierError = { tier_name?: string; min_points?: string }

const emptyTier = (): TierRow => ({ tier_name: '', min_points: '', color: '', icon: '' })

const hasData = (t: TierRow) =>
  !!(t.tier_name.trim() || t.min_points.trim() || t.color.trim() || t.icon.trim())

export default function BadgeSettings() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { data: boot } = useBoot()
  const { data: loaded, isLoading } = useBadgeSettings()
  const save = useSaveBadgeSettings()

  const [tiers, setTiers] = useState<TierRow[]>([])
  const [errors, setErrors] = useState<Record<number, TierError>>({})
  const rowRefs = useRef<Record<number, HTMLInputElement | null>>({})

  useEffect(() => {
    if (loaded)
      setTiers(
        loaded.length
          ? loaded.map((t) => ({
              tier_name: t.tier_name,
              min_points: String(t.min_points),
              color: t.color,
              icon: t.icon,
            }))
          : [],
      )
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

  const setTier = (i: number, patch: Partial<TierRow>) =>
    setTiers((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)))

  const clearError = (i: number, key: keyof TierError) =>
    setErrors((e) => (e[i]?.[key] ? { ...e, [i]: { ...e[i], [key]: undefined } } : e))

  const addTier = () => setTiers((ts) => [...ts, emptyTier()])

  const removeTier = async (i: number) => {
    if (hasData(tiers[i])) {
      const ok = await confirm({
        title: 'Remove this tier?',
        message: 'This tier has data that will be lost. This cannot be undone.',
        confirmLabel: 'Remove',
        destructive: true,
      })
      if (!ok) return
    }
    setTiers((ts) => ts.filter((_, j) => j !== i))
    setErrors({})
  }

  const doSave = () => {
    const nextErrors: Record<number, TierError> = {}
    let firstInvalid = -1
    tiers.forEach((t, i) => {
      const err: TierError = {}
      if (!t.tier_name.trim()) err.tier_name = 'Tier name is required'
      const n = Number(t.min_points)
      if (t.min_points.trim() === '' || isNaN(n) || n < 0)
        err.min_points = 'Min points must be a non-negative number'
      if (err.tier_name || err.min_points) {
        nextErrors[i] = err
        if (firstInvalid === -1) firstInvalid = i
      }
    })
    setErrors(nextErrors)
    if (firstInvalid !== -1) {
      toast('error', 'Fix the highlighted tiers')
      rowRefs.current[firstInvalid]?.focus()
      return
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
    <form
      onSubmit={(e) => {
        e.preventDefault()
        doSave()
      }}
      className="space-y-6 max-w-2xl"
    >
      <h1 className="text-2xl font-bold">Badges</h1>

      <PageGrid
        main={
          tiers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">No badge tiers yet.</p>
              <button
                type="button"
                onClick={addTier}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                <Plus className="h-4 w-4" /> Add first tier
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3">
              {tiers.map((t, i) => (
            <div key={i} className="rounded-2xl bg-white dark:bg-slate-900 shadow-card p-4">
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
                  <div className="flex-1">
                    <Field label="Tier name" required error={errors[i]?.tier_name}>
                      {(id) => (
                        <input
                          id={id}
                          ref={(el) => {
                            rowRefs.current[i] = el
                          }}
                          className={field}
                          value={t.tier_name}
                          onChange={(e) => {
                            setTier(i, { tier_name: e.target.value })
                            clearError(i, 'tier_name')
                          }}
                          placeholder="e.g. Silver"
                        />
                      )}
                    </Field>
                  </div>
                  <div className="flex-1">
                    <Field label="Min points" required error={errors[i]?.min_points}>
                      {(id) => (
                        <input
                          id={id}
                          type="number"
                          inputMode="decimal"
                          className={field}
                          value={t.min_points}
                          onChange={(e) => {
                            setTier(i, { min_points: e.target.value })
                            clearError(i, 'min_points')
                          }}
                          placeholder="e.g. 500"
                        />
                      )}
                    </Field>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Field label="Color">
                      {(id) => (
                        <input
                          id={id}
                          className={field}
                          value={t.color}
                          onChange={(e) => setTier(i, { color: e.target.value })}
                          placeholder="e.g. #9ca3af"
                        />
                      )}
                    </Field>
                  </div>
                  <div className="flex-1">
                    <Field label="Icon">
                      {(id) => (
                        <input
                          id={id}
                          className={field}
                          value={t.icon}
                          onChange={(e) => setTier(i, { icon: e.target.value })}
                          placeholder="Emoji"
                        />
                      )}
                    </Field>
                  </div>
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
          )
        }
        rail={
          <>
            <SectionCard title="How badges work">
              <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                A user's badge is the highest tier whose <b>Min Points</b> is ≤ their lifetime
                Todo-source points earned. Grants and gifts never change the badge.
              </p>
            </SectionCard>

            {tiers.length > 0 && (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={addTier}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-500 hover:border-slate-400 dark:border-slate-600 dark:text-slate-400 dark:hover:border-slate-500"
                >
                  <Plus className="h-4 w-4" /> Add tier
                </button>

                <button
                  type="submit"
                  disabled={save.isPending}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
                >
                  {save.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                  Save badges
                </button>
              </div>
            )}
          </>
        }
      />
    </form>
  )
}
