import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Coins, Lock } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { FullScreenLoader, Segmented, Spinner } from '@/components/ui'
import { DiceBearAvatar } from '@/avatar/DiceBearAvatar'
import { captureAvatarPng } from '@/avatar/capture'
import {
  STYLE_LIST, slotsForStyle, colorSlotsForStyle, paletteForColorSlot,
  PROB_SLOTS, PREMIUM_FREE_COUNT, variantLabel,
} from '@/avatar/styles'
import type { StyleKey } from '@/avatar/styles'
import { useAvatarCatalog, useSaveAvatar, useBuyAvatarOption } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import type { AvatarConfig } from '@/lib/types'

const STYLE_TABS = STYLE_LIST.map((s) => ({
  value: s,
  label: s[0].toUpperCase() + s.slice(1),
}))

export default function AvatarCustomizerScreen() {
  const navigate = useNavigate()
  const { data: catalog, isLoading, error } = useAvatarCatalog()
  const saveAvatar = useSaveAvatar()
  const buyAvatar = useBuyAvatarOption()
  const toast = useToast()
  const previewRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<AvatarConfig | null>(null)

  // Seed draft once; never reset after that (preserves in-progress edits)
  useEffect(() => {
    if (catalog && !draft) setDraft({ style: catalog.my.style, options: { ...catalog.my.options } })
  }, [catalog, draft])

  if (error) {
    return (
      <DetailScreen title="Customize Avatar">
        <p className="py-16 text-center text-sm text-stone-400 dark:text-slate-500">Could not load avatar data.</p>
      </DetailScreen>
    )
  }

  if (isLoading || !catalog || !draft) {
    return (
      <DetailScreen title="Customize Avatar">
        <FullScreenLoader />
      </DetailScreen>
    )
  }

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

  // Save gate: any variant in draft that's premium and not owned
  const hasUnownedPremium = slotsForStyle(draft.style as StyleKey).some(({ slot, values }) => {
    const v = draft.options[slot]?.[0]
    if (!v) return false
    const idx = values.indexOf(v)
    if (idx < PREMIUM_FREE_COUNT) return false
    return !catalog.unlocked.some(
      (u) => u.style === draft.style && u.slot === slot && u.option_value === v,
    )
  })

  const handleSave = async () => {
    if (hasUnownedPremium) {
      toast('error', 'Unlock the 🔒 items you previewed first')
      return
    }
    const configSnap = draft // ponytail: snapshot before async to avoid stale-closure race
    const png = await captureAvatarPng(previewRef.current!)
    saveAvatar.mutate(
      { config: configSnap, snapshot: png ?? undefined },
      {
        onSuccess: () => { toast('success', 'Avatar saved'); navigate(-1) },
        onError: (e) => toast('error', e instanceof Error ? e.message : 'Save failed'),
      },
    )
  }

  const slots = slotsForStyle(draft.style as StyleKey)
  const colorSlots = colorSlotsForStyle(draft.style as StyleKey)

  return (
    <DetailScreen title="Customize Avatar">
      {/* Balance chip */}
      <div className="mb-3 flex items-center justify-end gap-1.5 text-sm">
        <Coins className="h-4 w-4 text-amber-500" />
        <span className="font-semibold text-stone-700 dark:text-slate-200">{catalog.balance.toLocaleString()}</span>
        <span className="text-stone-400 dark:text-slate-500">pts</span>
      </div>

      {/* DiceBear preview */}
      <div
        ref={previewRef}
        className="mb-3 flex h-48 items-center justify-center overflow-hidden rounded-3xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 shadow-card"
      >
        <DiceBearAvatar config={draft} className="h-44 w-44" />
      </div>

      {/* Style tabs */}
      <div className="mb-4">
        <Segmented
          options={STYLE_TABS}
          value={draft.style}
          onChange={(s) => setDraft({ style: s as StyleKey, options: {} })}
        />
      </div>

      {/* Slot strips */}
      {slots.map(({ slot, values }) => {
        const isProb = PROB_SLOTS.includes(slot)
        const current = draft.options[slot]?.[0]
        const isNone = isProb && draft.options[slot + 'Probability']?.[0] === '0'
        return (
          <div key={slot} className="mb-4">
            <p className="mb-1.5 capitalize text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
              {slot.replace(/([A-Z])/g, ' $1')}
            </p>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {isProb && (
                <Chip label="None" active={isNone} onClick={() => clearProb(slot)} />
              )}
              {values.map((v, i) => {
                const isFree = i < PREMIUM_FREE_COUNT
                const isOwned =
                  isFree ||
                  catalog.unlocked.some(
                    (u) => u.style === draft.style && u.slot === slot && u.option_value === v,
                  )
                const active = !isNone && current === v
                return (
                  <VariantTile
                    key={v}
                    draft={draft}
                    slot={slot}
                    value={v}
                    index={i}
                    isOwned={isOwned}
                    active={active}
                    price={catalog.price}
                    onPreview={() => setOption(slot, v)}
                    onBuy={() =>
                      buyAvatar.mutate(
                        { style: draft.style, slot, value: v },
                        {
                          onError: (e) =>
                            toast('error', e instanceof Error ? e.message : 'Purchase failed'),
                        },
                      )
                    }
                    buyPending={buyAvatar.isPending}
                  />
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Color rows */}
      {colorSlots.length > 0 && (
        <div className="mb-4 space-y-4 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 shadow-card">
          {colorSlots.map((cSlot) => {
            const cur = draft.options[cSlot]?.[0] ?? ''
            return (
              <div key={cSlot}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
                  {cSlot.replace(/([A-Z])/g, ' $1').trim()}
                </p>
                <div className="flex flex-wrap gap-2">
                  {paletteForColorSlot(cSlot).map((c) => {
                    const isTransparent = c === 'transparent'
                    const active = cur === c
                    return (
                      <button
                        type="button"
                        key={c}
                        onClick={() =>
                          setDraft((d) => (d ? { ...d, options: { ...d.options, [cSlot]: [c] } } : d))
                        }
                        className={[
                          'h-9 w-9 rounded-full border-2 transition active:scale-95',
                          active ? 'border-brand-500 scale-110' : 'border-paper-edge dark:border-slate-600',
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
        type="button"
        onClick={handleSave}
        disabled={saveAvatar.isPending}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3.5 font-semibold text-white shadow-sm active:bg-brand-700 disabled:opacity-60"
      >
        {saveAvatar.isPending ? <Spinner className="h-4 w-4" /> : 'Save avatar'}
      </button>
    </DetailScreen>
  )
}

function VariantTile({
  draft,
  slot,
  value,
  index,
  isOwned,
  active,
  price,
  onPreview,
  onBuy,
  buyPending,
}: {
  draft: AvatarConfig
  slot: string
  value: string
  index: number
  isOwned: boolean
  active: boolean
  price: number
  onPreview: () => void
  onBuy: () => void
  buyPending: boolean
}) {
  const previewConfig: AvatarConfig = {
    style: draft.style,
    options: { ...draft.options, [slot]: [value] },
  }
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onPreview}
        className={[
          'flex flex-col items-center gap-1 rounded-xl border p-1.5 transition active:scale-95',
          active
            ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15'
            : 'border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800',
        ].join(' ')}
      >
        <DiceBearAvatar config={previewConfig} className="h-12 w-12" />
        <span className="text-[10px] font-medium text-stone-500 dark:text-slate-400 whitespace-nowrap">
          {variantLabel(index)}
        </span>
      </button>
      {!isOwned && (
        // ponytail: overlay covers tile; clicking overlay = preview, Buy btn stops propagation
        <div
          onClick={onPreview}
          className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl bg-black/50 p-1"
        >
          <Lock className="h-3.5 w-3.5 text-white" />
          <span className="text-[9px] leading-none text-amber-300">{price.toLocaleString()}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onBuy() }}
            disabled={buyPending}
            className="mt-0.5 rounded-md bg-amber-500 px-1.5 py-0.5 text-[9px] font-semibold text-white active:bg-amber-600 disabled:opacity-60"
          >
            Buy
          </button>
        </div>
      )}
    </div>
  )
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-3 py-2 text-xs font-medium transition active:scale-95',
        active
          ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
          : 'border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 text-stone-600 dark:text-slate-300',
      ].join(' ')}
    >
      <span className="whitespace-nowrap">{label}</span>
    </button>
  )
}
