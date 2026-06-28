import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Coins } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { FullScreenLoader, Segmented, Spinner } from '@/components/ui'
import { DiceBearAvatar } from '@/avatar/DiceBearAvatar'
import { captureAvatarPng } from '@/avatar/capture'
import { STYLE_LIST, slotsForStyle, colorSlotsForStyle, COLOR_PALETTE, PROB_SLOTS } from '@/avatar/styles'
import type { StyleKey } from '@/avatar/styles'
import { useAvatarCatalog, useSaveAvatar, useWallet, keys } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { useQueryClient } from '@tanstack/react-query'
import { mobileApi } from '@/lib/api'
import type { AvatarConfig, PremiumItem } from '@/lib/types'

const STYLE_TABS = STYLE_LIST.map((s) => ({
  value: s,
  label: s[0].toUpperCase() + s.slice(1),
}))

export default function AvatarCustomizerScreen() {
  const navigate = useNavigate()
  const { data: catalog, isLoading, error } = useAvatarCatalog()
  const { data: wallet } = useWallet()
  const saveAvatar = useSaveAvatar()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const previewRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<AvatarConfig | null>(null)
  const [buying, setBuying] = useState(false)

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

  const buy = async (item: PremiumItem, slot: string) => {
    if (!item.reward) { toast('error', 'This item has no reward linked'); return }
    const ok = await confirm({
      title: `Buy ${item.item_name}?`,
      message: `${item.price != null ? item.price.toLocaleString() : '?'} pts from your balance (${balance.toLocaleString()} pts).`,
      confirmLabel: 'Buy',
    })
    if (!ok) return
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
        <span className="font-semibold text-stone-700 dark:text-slate-200">{balance.toLocaleString()}</span>
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
                    onClick={() => (locked ? buy(locked, slot) : setOption(slot, v))}
                    disabled={buying}
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
                  {COLOR_PALETTE.map((c) => {
                    const isTransparent = c === 'transparent'
                    const active = cur === c
                    return (
                      <button
                        type="button"
                        key={c}
                        onClick={() => setDraft((d) => d ? { ...d, options: { ...d.options, [cSlot]: [c] } } : d)}
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
        disabled={saveAvatar.isPending || buying}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3.5 font-semibold text-white shadow-sm active:bg-brand-700 disabled:opacity-60"
      >
        {saveAvatar.isPending ? <Spinner className="h-4 w-4" /> : 'Save avatar'}
      </button>
    </DetailScreen>
  )
}

function Chip({
  label,
  sub,
  active,
  onClick,
  disabled,
}: {
  label: string
  sub?: string
  active: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-3 py-2 text-xs font-medium transition active:scale-95 disabled:opacity-60',
        active
          ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
          : 'border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 text-stone-600 dark:text-slate-300',
      ].join(' ')}
    >
      <span className="whitespace-nowrap">{label}</span>
      {sub && <span className="text-[10px] text-amber-600 dark:text-amber-400">{sub}</span>}
    </button>
  )
}
