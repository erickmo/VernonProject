import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Coins, Lock } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { FullScreenLoader, Segmented, Spinner } from '@/components/ui'
import { DiceBearAvatar } from '@/avatar/DiceBearAvatar'
import { AvatarScene } from '@/avatar/AvatarScene'
import { captureAvatarPng } from '@/avatar/capture'
import {
  STYLE_LIST, slotsForStyle, colorSlotsForStyle, paletteForColorSlot,
  PROB_SLOTS, PREMIUM_FREE_COUNT, variantLabel, BG_PALETTE,
} from '@/avatar/styles'
import type { StyleKey } from '@/avatar/styles'
import { useAvatarCatalog, useSaveAvatar, useBuyAvatarOption, useBuyAvatarAsset } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { CollectibleIcon } from '@/avatar/collectibleIcons'
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
  const buyAsset = useBuyAvatarAsset()
  const toast = useToast()
  const previewRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<AvatarConfig | null>(null)

  // Seed draft once; never reset after that (preserves in-progress edits)
  useEffect(() => {
    if (catalog && !draft) setDraft({
      style: catalog.my.style,
      options: { ...catalog.my.options },
      scene: catalog.my.scene ?? null,
      props: [...(catalog.my.props ?? [])],
      featured_collectible: catalog.my.featured_collectible ?? null,
    })
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

  // Save gate: unowned assets in draft
  const assetOwned = (name: string | null | undefined) => {
    if (!name) return true
    const a = catalog.assets.find(x => x.asset_name === name)
    return !a || a.owned
  }
  const hasUnownedAssets =
    !assetOwned(draft.scene) ||
    (draft.props || []).some(n => !assetOwned(n)) ||
    !assetOwned(draft.featured_collectible)

  const handleSave = async () => {
    if (hasUnownedPremium || hasUnownedAssets) {
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

  // Background gradient — derived from draft (ponytail: no extra useState)
  const isGradient = draft.options.backgroundType?.[0] === 'gradientLinear'
  const bgColor1 = draft.options.backgroundColor?.[0] ?? ''
  const bgColor2 = draft.options.backgroundColor?.[1] ?? ''

  const setBgColor1 = (c: string) => setDraft(d => {
    if (!d) return d
    const g = d.options.backgroundType?.[0] === 'gradientLinear'
    const c2 = d.options.backgroundColor?.[1] ?? 'c0aede'
    return { ...d, options: { ...d.options, backgroundColor: g ? [c, c2] : [c] } }
  })
  const setBgColor2 = (c: string) => setDraft(d => {
    if (!d) return d
    return { ...d, options: { ...d.options, backgroundColor: [d.options.backgroundColor?.[0] ?? 'b6e3f4', c] } }
  })
  const toggleGradient = () => setDraft(d => {
    if (!d) return d
    const opts = { ...d.options }
    if (opts.backgroundType?.[0] === 'gradientLinear') {
      delete opts.backgroundType
      opts.backgroundColor = [opts.backgroundColor?.[0] ?? 'b6e3f4']
    } else {
      opts.backgroundType = ['gradientLinear']
      const c1 = opts.backgroundColor?.[0] ?? 'b6e3f4'
      opts.backgroundColor = [c1, 'c0aede']
    }
    return { ...d, options: opts }
  })

  const scenes = catalog.assets.filter(a => a.asset_type === 'Scene')
  const assetProps = catalog.assets.filter(a => a.asset_type === 'Prop')
  const collectibles = catalog.assets.filter(a => a.asset_type === 'Collectible')

  return (
    <DetailScreen title="Customize Avatar">
      {/* Balance chip */}
      <div className="mb-3 flex items-center justify-end gap-1.5 text-sm">
        <Coins className="h-4 w-4 text-amber-500" />
        <span className="font-semibold text-stone-700 dark:text-slate-200">{catalog.balance.toLocaleString()}</span>
        <span className="text-stone-400 dark:text-slate-500">pts</span>
      </div>

      {/* AvatarScene preview — sticky so it stays visible while slots scroll */}
      <div className="sticky top-16 z-10 -mx-4 px-4 bg-paper dark:bg-slate-950 pb-2">
        <div
          ref={previewRef}
          className="relative mx-auto flex aspect-square w-56 max-w-full items-center justify-center overflow-hidden rounded-3xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 shadow-card"
        >
          <AvatarScene config={draft} assets={catalog.assets} className="h-full w-full" />
        </div>
      </div>

      {/* Style tabs */}
      <div className="mb-4">
        <Segmented
          options={STYLE_TABS}
          value={draft.style}
          onChange={(s) => setDraft((d) => ({ style: s as StyleKey, options: {}, scene: d?.scene ?? null, props: d?.props ?? [], featured_collectible: d?.featured_collectible ?? null }))}
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
                    onPreview={() => { if (isOwned) setOption(slot, v); else toast('error', 'Buy to use this on your avatar') }}
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
            const isBg = cSlot === 'backgroundColor'
            const cur = isBg ? bgColor1 : (draft.options[cSlot]?.[0] ?? '')
            return (
              <div key={cSlot}>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
                    {cSlot.replace(/([A-Z])/g, ' $1').trim()}
                  </p>
                  {isBg && (
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-stone-500 dark:text-slate-400">
                      <input
                        type="checkbox"
                        checked={isGradient}
                        onChange={toggleGradient}
                        className="accent-indigo-500 cursor-pointer"
                      />
                      Gradient
                    </label>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {paletteForColorSlot(cSlot).map((c) => {
                    const isTransparent = c === 'transparent'
                    const active = cur === c
                    return (
                      <button
                        type="button"
                        key={c}
                        onClick={() => isBg
                          ? setBgColor1(c)
                          : setDraft((d) => (d ? { ...d, options: { ...d.options, [cSlot]: [c] } } : d))
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
                {isBg && isGradient && (
                  <div className="mt-3">
                    <p className="mb-2 text-xs text-stone-400 dark:text-slate-500">Gradient end</p>
                    <div className="flex flex-wrap gap-2">
                      {BG_PALETTE.filter(c => c !== 'transparent').map((c) => {
                        const active = bgColor2 === c
                        return (
                          <button
                            type="button"
                            key={c}
                            onClick={() => setBgColor2(c)}
                            className={[
                              'h-9 w-9 rounded-full border-2 transition active:scale-95',
                              active ? 'border-brand-500 scale-110' : 'border-paper-edge dark:border-slate-600',
                            ].join(' ')}
                            style={{ background: `#${c}` }}
                            aria-label={c}
                          />
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Scene */}
      {scenes.length > 0 && (
        <div className="mb-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">Scene</p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            <Chip label="None" active={!draft.scene} onClick={() => setDraft(d => d ? { ...d, scene: null } : d)} />
            {scenes.map(a => {
              const active = draft.scene === a.asset_name
              return (
                <div key={a.asset_name} className="flex shrink-0 flex-col items-center gap-1">
                  <button
                    type="button"
                    onClick={() => a.owned && setDraft(d => d ? { ...d, scene: d.scene === a.asset_name ? null : a.asset_name } : d)}
                    className={[
                      'flex flex-col items-center gap-1 rounded-xl border p-1.5 transition active:scale-95',
                      active ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15' : 'border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800',
                    ].join(' ')}
                  >
                    <div className="relative h-10 w-10">
                      <div className="h-full w-full rounded-lg" style={{ background: a.gradient ?? '#e5e7eb' }} />
                      {!a.owned && (
                        <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-lg bg-black/40">
                          <Lock className="h-3 w-3 text-white" />
                          <span className="text-[8px] leading-none text-amber-300">{a.price?.toLocaleString()}</span>
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-medium text-stone-500 dark:text-slate-400 whitespace-nowrap">{a.asset_name}</span>
                  </button>
                  {!a.owned && (
                    <button
                      type="button"
                      onClick={() => buyAsset.mutate(a.asset_name, { onError: e => toast('error', e instanceof Error ? e.message : 'Purchase failed') })}
                      disabled={buyAsset.isPending}
                      className="w-full rounded-md bg-amber-500 px-1.5 py-0.5 text-[9px] font-semibold text-white active:bg-amber-600 disabled:opacity-60"
                    >Buy</button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Props */}
      {assetProps.length > 0 && (
        <div className="mb-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">Props</p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {assetProps.map(a => {
              const active = (draft.props || []).includes(a.asset_name)
              return (
                <div key={a.asset_name} className="flex shrink-0 flex-col items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (!a.owned) return
                      setDraft(d => {
                        if (!d) return d
                        const others = (d.props || []).filter(n => {
                          const o = catalog.assets.find(x => x.asset_name === n)
                          return o && o.anchor !== a.anchor
                        })
                        const has = (d.props || []).includes(a.asset_name)
                        return { ...d, props: has ? (d.props || []).filter(n => n !== a.asset_name) : [...others, a.asset_name] }
                      })
                    }}
                    className={[
                      'flex flex-col items-center gap-1 rounded-xl border p-1.5 transition active:scale-95',
                      active ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15' : 'border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800',
                    ].join(' ')}
                  >
                    <div className="relative">
                      <span className="text-2xl leading-none">{a.emoji ?? '?'}</span>
                      {!a.owned && (
                        <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-black/0">
                          <Lock className="h-3 w-3 text-white drop-shadow" />
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-medium text-stone-500 dark:text-slate-400 whitespace-nowrap">{a.asset_name}</span>
                    {!a.owned && (
                      <span className="text-[8px] leading-none text-amber-500">{a.price?.toLocaleString()}</span>
                    )}
                  </button>
                  {!a.owned && (
                    <button
                      type="button"
                      onClick={() => buyAsset.mutate(a.asset_name, { onError: e => toast('error', e instanceof Error ? e.message : 'Purchase failed') })}
                      disabled={buyAsset.isPending}
                      className="w-full rounded-md bg-amber-500 px-1.5 py-0.5 text-[9px] font-semibold text-white active:bg-amber-600 disabled:opacity-60"
                    >Buy</button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Collectibles */}
      {collectibles.length > 0 && (
        <div className="mb-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">Collectibles</p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {collectibles.map(a => {
              const featured = draft.featured_collectible === a.asset_name
              return (
                <div key={a.asset_name} className="flex shrink-0 flex-col items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (!a.owned) return
                      setDraft(d => d ? { ...d, featured_collectible: d.featured_collectible === a.asset_name ? null : a.asset_name } : d)
                    }}
                    className={[
                      'flex flex-col items-center gap-1 rounded-xl border p-1.5 transition active:scale-95',
                      featured ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15' : 'border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800',
                    ].join(' ')}
                  >
                    {a.icon
                      ? <CollectibleIcon name={a.icon} className="h-8 w-8 text-stone-700 dark:text-slate-200" />
                      : <span className="text-2xl leading-none">{a.emoji ?? '?'}</span>
                    }
                    <span className="text-[10px] font-medium text-stone-500 dark:text-slate-400 whitespace-nowrap">{a.asset_name}</span>
                    {a.owned ? (
                      <span className={['text-[9px] font-semibold', featured ? 'text-brand-600 dark:text-brand-400' : 'text-stone-400 dark:text-slate-500'].join(' ')}>
                        {featured ? 'Featured' : 'Feature'}
                      </span>
                    ) : (
                      <span className="text-[8px] leading-none text-amber-500">{a.price?.toLocaleString()}</span>
                    )}
                  </button>
                  {!a.owned && (
                    <button
                      type="button"
                      onClick={() => buyAsset.mutate(a.asset_name, { onError: e => toast('error', e instanceof Error ? e.message : 'Purchase failed') })}
                      disabled={buyAsset.isPending}
                      className="w-full rounded-md bg-amber-500 px-1.5 py-0.5 text-[9px] font-semibold text-white active:bg-amber-600 disabled:opacity-60"
                    >Buy</button>
                  )}
                </div>
              )
            })}
          </div>
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
  const previewOptions: Record<string, string[]> = { ...draft.options, [slot]: [value] }
  if (PROB_SLOTS.includes(slot)) previewOptions[`${slot}Probability`] = ['100']
  const previewConfig: AvatarConfig = { style: draft.style, options: previewOptions }
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
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
        <div className="relative">
          <DiceBearAvatar config={previewConfig} className="h-12 w-12" />
          {!isOwned && (
            <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-lg bg-black/40">
              <Lock className="h-3 w-3 text-white" />
              <span className="text-[8px] leading-none text-amber-300">{price.toLocaleString()}</span>
            </span>
          )}
        </div>
        <span className="text-[10px] font-medium text-stone-500 dark:text-slate-400 whitespace-nowrap">
          {variantLabel(index)}
        </span>
      </button>
      {!isOwned && (
        <button
          type="button"
          onClick={onBuy}
          disabled={buyPending}
          className="w-full rounded-md bg-amber-500 px-1.5 py-0.5 text-[9px] font-semibold text-white active:bg-amber-600 disabled:opacity-60"
        >
          Buy
        </button>
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
