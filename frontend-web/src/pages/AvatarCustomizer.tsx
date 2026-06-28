import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Coins, Lock } from 'lucide-react'
import { Spinner } from '@/components/ui'
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
import type { AvatarConfig } from '@/lib/types'
import { BentoGrid, BentoTile } from '@web/components/bento'

const STYLE_TABS = STYLE_LIST.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))

export default function AvatarCustomizer() {
  const navigate = useNavigate()
  const { data: catalog, isLoading, error } = useAvatarCatalog()
  const saveAvatar = useSaveAvatar()
  const buyAvatar = useBuyAvatarOption()
  const buyAsset = useBuyAvatarAsset()
  const toast = useToast()
  const previewRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<AvatarConfig | null>(null)

  // Seed draft once; never reset (preserves in-progress edits)
  useEffect(() => {
    if (catalog && !draft) setDraft({
      style: catalog.my.style,
      options: { ...catalog.my.options },
      scene: catalog.my.scene ?? null,
      props: [...(catalog.my.props ?? [])],
      featured_collectible: catalog.my.featured_collectible ?? null,
    })
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
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Customize Avatar</h1>
        <div className="flex items-center gap-1.5 text-sm">
          <Coins className="h-4 w-4 text-amber-500" />
          <span className="font-semibold text-slate-700 dark:text-slate-200">{catalog.balance.toLocaleString()}</span>
          <span className="text-slate-400 dark:text-slate-500">pts</span>
        </div>
      </div>

      <BentoGrid>
        {/* AvatarScene preview — sticky so it stays visible while controls scroll */}
        <BentoTile span="lg" tone="plain" className="min-h-[18rem] sticky top-14 lg:top-4 self-start">
          <div ref={previewRef} className="relative flex flex-1 min-h-0 h-72 items-center justify-center overflow-hidden rounded-2xl bg-slate-50 dark:bg-slate-800">
            <AvatarScene config={draft} assets={catalog.assets} className="h-full w-full" />
            {(() => {
              const fc = draft.featured_collectible
                ? catalog.assets.find((a) => a.asset_name === draft.featured_collectible)
                : null
              return fc?.emoji ? (
                <span className="pointer-events-none absolute bottom-1 right-1 text-2xl select-none drop-shadow">{fc.emoji}</span>
              ) : null
            })()}
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
                onClick={() => setDraft((d) => ({ style: value as StyleKey, options: {}, scene: d?.scene ?? null, props: d?.props ?? [], featured_collectible: d?.featured_collectible ?? null }))}
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

          {/* Slot strips — mini avatar tiles */}
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
                    <NoneChip active={isNone} onClick={() => clearProb(slot)} />
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

          {/* Color swatches */}
          {colorSlots.length > 0 && (
            <div className="mb-5 space-y-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
              {colorSlots.map((cSlot) => {
                const isBg = cSlot === 'backgroundColor'
                const cur = isBg ? bgColor1 : (draft.options[cSlot]?.[0] ?? '')
                return (
                  <div key={cSlot}>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {cSlot.replace(/([A-Z])/g, ' $1').trim()}
                      </p>
                      {isBg && (
                        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
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
                              : setDraft((d) => d ? { ...d, options: { ...d.options, [cSlot]: [c] } } : d)
                            }
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
                    {isBg && isGradient && (
                      <div className="mt-3">
                        <p className="mb-2 text-xs text-slate-400 dark:text-slate-500">Gradient end</p>
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
                                  active ? 'border-brand-500 scale-110' : 'border-slate-200 dark:border-slate-600',
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
            <div className="mb-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Scene</p>
              <div className="flex flex-wrap gap-2">
                <NoneChip active={!draft.scene} onClick={() => setDraft(d => d ? { ...d, scene: null } : d)} />
                {scenes.map(a => {
                  const active = draft.scene === a.asset_name
                  return (
                    <div key={a.asset_name} className="relative">
                      <button
                        type="button"
                        onClick={() => a.owned && setDraft(d => d ? { ...d, scene: d.scene === a.asset_name ? null : a.asset_name } : d)}
                        className={[
                          'flex flex-col items-center gap-1 rounded-xl border p-1.5 transition hover:-translate-y-0.5 active:scale-95',
                          active ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900',
                        ].join(' ')}
                      >
                        <div className="h-10 w-10 rounded-lg" style={{ background: a.gradient ?? '#e5e7eb' }} />
                        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">{a.asset_name}</span>
                      </button>
                      {!a.owned && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-xl bg-black/50 p-1">
                          <Lock className="h-3.5 w-3.5 text-white" />
                          <span className="text-[9px] leading-none text-amber-300">{a.price?.toLocaleString()}</span>
                          <button
                            type="button"
                            onClick={() => buyAsset.mutate(a.asset_name, { onError: e => toast('error', e instanceof Error ? e.message : 'Purchase failed') })}
                            disabled={buyAsset.isPending}
                            className="mt-0.5 rounded-md bg-amber-500 px-1.5 py-0.5 text-[9px] font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                          >Buy</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Props */}
          {assetProps.length > 0 && (
            <div className="mb-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Props</p>
              <div className="flex flex-wrap gap-2">
                {assetProps.map(a => {
                  const active = (draft.props || []).includes(a.asset_name)
                  return (
                    <div key={a.asset_name} className="relative">
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
                          'flex flex-col items-center gap-1 rounded-xl border p-1.5 transition hover:-translate-y-0.5 active:scale-95',
                          active ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900',
                        ].join(' ')}
                      >
                        <span className="text-2xl leading-none">{a.emoji ?? '?'}</span>
                        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">{a.asset_name}</span>
                      </button>
                      {!a.owned && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-xl bg-black/50 p-1">
                          <Lock className="h-3.5 w-3.5 text-white" />
                          <span className="text-[9px] leading-none text-amber-300">{a.price?.toLocaleString()}</span>
                          <button
                            type="button"
                            onClick={() => buyAsset.mutate(a.asset_name, { onError: e => toast('error', e instanceof Error ? e.message : 'Purchase failed') })}
                            disabled={buyAsset.isPending}
                            className="mt-0.5 rounded-md bg-amber-500 px-1.5 py-0.5 text-[9px] font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                          >Buy</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Collectibles */}
          {collectibles.length > 0 && (
            <div className="mb-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Collectibles</p>
              <div className="flex flex-wrap gap-2">
                {collectibles.map(a => {
                  const featured = draft.featured_collectible === a.asset_name
                  return (
                    <div key={a.asset_name} className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          if (!a.owned) return
                          setDraft(d => d ? { ...d, featured_collectible: d.featured_collectible === a.asset_name ? null : a.asset_name } : d)
                        }}
                        className={[
                          'flex flex-col items-center gap-1 rounded-xl border p-1.5 transition hover:-translate-y-0.5 active:scale-95',
                          featured ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900',
                        ].join(' ')}
                      >
                        <span className="text-2xl leading-none">{a.emoji ?? '?'}</span>
                        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">{a.asset_name}</span>
                        {a.owned && (
                          <span className={['text-[9px] font-semibold', featured ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400 dark:text-slate-500'].join(' ')}>
                            {featured ? 'Featured' : 'Feature'}
                          </span>
                        )}
                      </button>
                      {!a.owned && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-xl bg-black/50 p-1">
                          <Lock className="h-3.5 w-3.5 text-white" />
                          <span className="text-[9px] leading-none text-amber-300">{a.price?.toLocaleString()}</span>
                          <button
                            type="button"
                            onClick={() => buyAsset.mutate(a.asset_name, { onError: e => toast('error', e instanceof Error ? e.message : 'Purchase failed') })}
                            disabled={buyAsset.isPending}
                            className="mt-0.5 rounded-md bg-amber-500 px-1.5 py-0.5 text-[9px] font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                          >Buy</button>
                        </div>
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
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition"
          >
            {saveAvatar.isPending ? <Spinner className="h-4 w-4" /> : 'Save avatar'}
          </button>
        </BentoTile>
      </BentoGrid>
    </div>
  )
}

function VariantTile({
  draft, slot, value, index, isOwned, active, price, onPreview, onBuy, buyPending,
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
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onPreview}
        className={[
          'flex flex-col items-center gap-1 rounded-xl border p-1.5 transition hover:-translate-y-0.5 active:scale-95',
          active
            ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900',
        ].join(' ')}
      >
        <DiceBearAvatar config={previewConfig} className="h-12 w-12" />
        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
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
            className="mt-0.5 rounded-md bg-amber-500 px-1.5 py-0.5 text-[9px] font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
          >
            Buy
          </button>
        </div>
      )}
    </div>
  )
}

function NoneChip({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-3 py-2 text-xs font-medium transition hover:-translate-y-0.5',
        active
          ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300',
      ].join(' ')}
    >
      <span className="whitespace-nowrap">None</span>
    </button>
  )
}
