import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Coins } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { DiceBearAvatar } from '@/avatar/DiceBearAvatar'
import { captureAvatarPng } from '@/avatar/capture'
import { STYLE_LIST, slotsForStyle, colorSlotsForStyle, COLOR_PALETTE, PROB_SLOTS } from '@/avatar/styles'
import type { StyleKey } from '@/avatar/styles'
import { useAvatarCatalog, useSaveAvatar, useWallet, keys } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { useQueryClient } from '@tanstack/react-query'
import { mobileApi } from '@/lib/api'
import type { AvatarConfig, PremiumItem } from '@/lib/types'
import { Dialog } from '@web/components/overlays/Dialog'
import { BentoGrid, BentoTile } from '@web/components/bento'

const STYLE_TABS = STYLE_LIST.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))

export default function AvatarCustomizer() {
  const navigate = useNavigate()
  const { data: catalog, isLoading, error } = useAvatarCatalog()
  const { data: wallet } = useWallet()
  const saveAvatar = useSaveAvatar()
  const toast = useToast()
  const qc = useQueryClient()
  const previewRef = useRef<HTMLDivElement>(null)

  const [draft, setDraft] = useState<AvatarConfig | null>(null)
  const [buying, setBuying] = useState(false)
  const [buyItem, setBuyItem] = useState<{ item: PremiumItem; slot: string } | null>(null)

  // Seed draft once; never reset (preserves in-progress edits)
  useEffect(() => {
    if (catalog && !draft) setDraft({ style: catalog.my.style, options: { ...catalog.my.options } })
  }, [catalog, draft])

  if (error) return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Customize Avatar</h1>
      <p className="py-16 text-center text-sm text-slate-400">Could not load avatar data.</p>
    </div>
  )

  if (isLoading || !catalog || !draft) return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Customize Avatar</h1>
      <div className="flex justify-center py-16"><Spinner className="h-8 w-8 text-brand-500" /></div>
    </div>
  )

  const balance = wallet?.balance ?? 0

  const setOption = (slot: string, value: string) => {
    setDraft((d) => {
      if (!d) return d
      const opts = { ...d.options, [slot]: [value] }
      if (PROB_SLOTS.includes(slot)) opts[slot + 'Probability'] = ['100']
      return { ...d, options: opts }
    })
  }

  const clearProb = (slot: string) => {
    setDraft((d) => {
      if (!d) return d
      const opts = { ...d.options }
      delete opts[slot]
      opts[slot + 'Probability'] = ['0']
      return { ...d, options: opts }
    })
  }

  const confirmBuy = async () => {
    const { item, slot } = buyItem!
    if (!item.reward) { toast('error', 'This item has no reward linked'); setBuyItem(null); return }
    setBuyItem(null)
    setBuying(true)
    try {
      await mobileApi.redeemReward(item.reward)
      await qc.invalidateQueries({ queryKey: keys.avatarCatalog })
      setOption(slot, item.option_value)
      toast('success', `Unlocked ${item.item_name}`)
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Purchase failed')
    } finally {
      setBuying(false)
    }
  }

  const handleSave = async () => {
    const png = await captureAvatarPng(previewRef.current!)
    saveAvatar.mutate(
      { config: draft, snapshot: png ?? undefined },
      {
        onSuccess: () => { toast('success', 'Avatar saved'); navigate(-1) },
        onError: (e) => toast('error', e instanceof Error ? e.message : 'Save failed'),
      },
    )
  }

  const slots = slotsForStyle(draft.style as StyleKey)
  const colorSlots = colorSlotsForStyle(draft.style as StyleKey)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Customize Avatar</h1>
        <div className="flex items-center gap-1.5 text-sm">
          <Coins className="h-4 w-4 text-amber-500" />
          <span className="font-semibold text-slate-700 dark:text-slate-200">{balance.toLocaleString()}</span>
          <span className="text-slate-400 dark:text-slate-500">pts</span>
        </div>
      </div>

      <BentoGrid>
        {/* DiceBear preview */}
        <BentoTile span="lg" tone="plain" className="min-h-[18rem]">
          <div ref={previewRef} className="flex flex-1 min-h-0 h-72 items-center justify-center overflow-hidden rounded-2xl bg-slate-50 dark:bg-slate-800">
            <DiceBearAvatar config={draft} className="h-56 w-56" />
          </div>
        </BentoTile>

        {/* Controls */}
        <BentoTile span="lg" tone="plain">
          {/* Style tabs */}
          <div className="mb-5 flex flex-wrap gap-2">
            {STYLE_TABS.map(({ value, label }) => (
              <button
                type="button"
                key={value}
                onClick={() => setDraft({ style: value as StyleKey, options: {} })}
                className={[
                  'rounded-lg px-4 py-2 text-sm font-semibold transition',
                  draft.style === value
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Slot strips */}
          {slots.map(({ slot, values }) => {
            const isProb = PROB_SLOTS.includes(slot)
            const current = draft.options[slot]?.[0]
            const isNone = isProb && draft.options[slot + 'Probability']?.[0] === '0'
            return (
              <div key={slot} className="mb-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {slot.replace(/([A-Z])/g, ' $1').trim()}
                </p>
                <div className="flex flex-wrap gap-2">
                  {isProb && (
                    <Chip label="None" active={isNone} onClick={() => clearProb(slot)} disabled={buying} />
                  )}
                  {values.map((v) => {
                    const locked = catalog.premium.find(
                      (p) => p.style === draft.style && p.slot === slot && p.option_value === v && !p.owned,
                    )
                    const active = !isNone && current === v
                    return (
                      <Chip
                        key={v}
                        label={locked ? `🔒 ${v}` : v}
                        sub={locked ? `${locked.price?.toLocaleString() ?? '?'} pts` : undefined}
                        active={active}
                        onClick={() => locked ? setBuyItem({ item: locked, slot }) : setOption(slot, v)}
                        disabled={buying}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Color swatches */}
          {colorSlots.length > 0 && (
            <div className="mb-5 space-y-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
              {colorSlots.map((cSlot) => {
                const cur = draft.options[cSlot]?.[0] ?? ''
                return (
                  <div key={cSlot}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {cSlot.replace(/([A-Z])/g, ' $1').trim()}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {COLOR_PALETTE.map((c) => {
                        const isTransparent = c === 'transparent'
                        const active = cur === c
                        return (
                          <button
                            key={c}
                            onClick={() => setDraft((d) => d ? { ...d, options: { ...d.options, [cSlot]: [c] } } : d)}
                            className={[
                              'h-9 w-9 rounded-full border-2 transition active:scale-95',
                              active ? 'border-brand-500 scale-110' : 'border-slate-200 dark:border-slate-600',
                            ].join(' ')}
                            style={{
                              background: isTransparent
                                // ponytail: CSS conic checkerboard — no image dependency
                                ? 'repeating-conic-gradient(#ccc 0% 25%, white 0% 50%) 0 0 / 8px 8px'
                                : `#${c}`,
                            }}
                            aria-label={c}
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saveAvatar.isPending || buying}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition"
          >
            {saveAvatar.isPending ? <Spinner className="h-4 w-4" /> : 'Save avatar'}
          </button>
        </BentoTile>
      </BentoGrid>

      {/* Buy confirmation dialog — ponytail: web Dialog, no native confirm */}
      <Dialog
        open={!!buyItem}
        onClose={() => !buying && setBuyItem(null)}
        title={`Buy ${buyItem?.item.item_name ?? ''}?`}
        footer={
          <>
            <button
              type="button"
              onClick={() => setBuyItem(null)}
              disabled={buying}
              className="rounded-lg bg-slate-100 dark:bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmBuy}
              disabled={buying}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {buying ? <Spinner className="h-4 w-4" /> : 'Buy'}
            </button>
          </>
        }
      >
        {buyItem && (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Spend{' '}
            <span className="font-semibold">
              {buyItem.item.price != null ? buyItem.item.price.toLocaleString() : '?'} pts
            </span>{' '}
            from your balance (<span className="font-semibold">{balance.toLocaleString()} pts</span>) to unlock{' '}
            <span className="font-semibold">{buyItem.item.item_name}</span>.
          </p>
        )}
      </Dialog>
    </div>
  )
}

function Chip({
  label, sub, active, onClick, disabled,
}: {
  label: string; sub?: string; active: boolean; onClick: () => void; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-3 py-2 text-xs font-medium transition hover:-translate-y-0.5 disabled:opacity-60',
        active
          ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300',
      ].join(' ')}
    >
      <span className="whitespace-nowrap">{label}</span>
      {sub && <span className="text-[10px] text-amber-600 dark:text-amber-400">{sub}</span>}
    </button>
  )
}
