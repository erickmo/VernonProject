import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Coins, Palette, Wand2 } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { FullScreenLoader, Segmented, Spinner } from '@/components/ui'
import { AvatarViewer } from '@/avatar/AvatarViewer'
import { AvatarBoundary } from '@/avatar/AvatarBoundary'
import { useAvatarCatalog, useSaveAvatar, useWallet, keys } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { useQueryClient } from '@tanstack/react-query'
import { mobileApi } from '@/lib/api'
import type { AvatarConfig, AvatarItem } from '@/lib/types'

type Tab = 'Base' | 'Hat' | 'Face' | 'Color'

// ponytail: direct map avoids SLOT_KEY[tab] TS narrowing dance
const SLOT_MAP = { Base: 'base', Hat: 'hat', Face: 'face' } as const
type SlotKey = (typeof SLOT_MAP)[keyof typeof SLOT_MAP]

const SKIN_PRESETS = ['#FDDBB4', '#F1C27D', '#E0AC69', '#C68642', '#8D5524', '#2C1A0E']
const ACCENT_PRESETS = ['#6366F1', '#EC4899', '#F59E0B', '#10B981', '#EF4444', '#06B6D4']

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: 'Base', label: 'Base' },
  { value: 'Hat', label: 'Hat' },
  { value: 'Face', label: 'Face' },
  { value: 'Color', label: 'Color' },
]

export default function AvatarCustomizerScreen() {
  const navigate = useNavigate()
  const { data: catalog, isLoading, error } = useAvatarCatalog()
  const { data: wallet } = useWallet()
  const saveAvatar = useSaveAvatar()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const captureRef = useRef<(() => string) | null>(null)

  const [draft, setDraft] = useState<AvatarConfig | null>(null)
  const [tab, setTab] = useState<Tab>('Base')
  const [buying, setBuying] = useState(false)

  // Seed draft once catalog arrives; never reset after that (preserves in-progress edits)
  useEffect(() => {
    if (catalog && !draft) setDraft({ ...catalog.my })
  }, [catalog, draft])

  if (error) {
    return (
      <DetailScreen title="Customize Avatar">
        <p className="py-16 text-center text-sm text-stone-400 dark:text-slate-500">
          Could not load avatar data.
        </p>
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
  const slotKey: SlotKey | null = tab === 'Color' ? null : SLOT_MAP[tab]
  const slotItems: AvatarItem[] = slotKey ? catalog.items.filter((i) => i.slot === tab) : []

  const equip = (item: AvatarItem) => {
    if (!item.owned || !slotKey) return
    setDraft((d) => {
      if (!d) return d
      // Hat/Face toggle off on re-tap; Base always stays on
      const next = item.slot !== 'Base' && d[slotKey] === item.name ? null : item.name
      return { ...d, [slotKey]: next }
    })
  }

  const buy = async (item: AvatarItem) => {
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
      const itemSlot = SLOT_MAP[item.slot as keyof typeof SLOT_MAP] ?? null
      if (itemSlot) setDraft((d) => d ? { ...d, [itemSlot]: item.name } : d)
      toast('success', `Unlocked ${item.item_name}`)
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Purchase failed')
    } finally {
      setBuying(false)
    }
  }

  const handleSave = () => {
    const snapshot = captureRef.current?.() ?? undefined
    saveAvatar.mutate(
      { config: draft, snapshot },
      {
        onSuccess: () => { toast('success', 'Avatar saved'); navigate(-1) },
        onError: (e) => toast('error', e instanceof Error ? e.message : 'Save failed'),
      },
    )
  }

  return (
    <DetailScreen title="Customize Avatar">
      {/* Balance chip */}
      <div className="mb-3 flex items-center justify-end gap-1.5 text-sm">
        <Coins className="h-4 w-4 text-amber-500" />
        <span className="font-semibold text-stone-700 dark:text-slate-200">{balance.toLocaleString()}</span>
        <span className="text-stone-400 dark:text-slate-500">pts</span>
      </div>

      {/* 3-D preview */}
      <div className="mb-3 h-56 overflow-hidden rounded-3xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 shadow-card">
        <AvatarBoundary fallback={
          <div className="flex h-full items-center justify-center rounded-3xl bg-paper-card dark:bg-slate-800 text-sm text-stone-400 dark:text-slate-500">
            3D preview not available on this device
          </div>
        }>
          <AvatarViewer
            config={draft}
            items={catalog.items}
            interactive
            onCapture={(fn) => { captureRef.current = fn }}
          />
        </AvatarBoundary>
      </div>

      {/* Slot tabs */}
      <div className="mb-3">
        <Segmented options={TAB_OPTIONS} value={tab} onChange={setTab} />
      </div>

      {/* Item grid for Base / Hat / Face */}
      {slotKey && (
        <div className="grid grid-cols-3 gap-2">
          {slotItems.map((item) => {
            const active = draft[slotKey] === item.name
            return (
              <button
                key={item.name}
                onClick={() => item.owned ? equip(item) : buy(item)}
                disabled={buying}
                className={[
                  'flex flex-col items-center gap-1.5 rounded-2xl border p-3 transition active:scale-95 disabled:opacity-60',
                  active
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15'
                    : 'border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800',
                ].join(' ')}
              >
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-paper-line dark:bg-slate-700">
                  {item.thumbnail ? (
                    <img src={item.thumbnail} alt={item.item_name} className="h-full w-full object-cover" />
                  ) : (
                    <Wand2 className="h-6 w-6 text-stone-300 dark:text-slate-600" />
                  )}
                </div>
                <p className="line-clamp-1 text-center text-[11px] font-medium leading-tight text-stone-700 dark:text-slate-200">
                  {item.item_name}
                </p>
                {!item.owned && (
                  <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                    🔒 {item.price != null ? item.price.toLocaleString() : '?'} pts
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Color tab */}
      {tab === 'Color' && (
        <div className="space-y-4 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-4 shadow-card">
          <ColorPicker
            label="Skin tone"
            presets={SKIN_PRESETS}
            value={draft.skin_color}
            onChange={(c) => setDraft((d) => d ? { ...d, skin_color: c } : d)}
          />
          <ColorPicker
            label="Accent"
            presets={ACCENT_PRESETS}
            value={draft.accent_color}
            onChange={(c) => setDraft((d) => d ? { ...d, accent_color: c } : d)}
          />
        </div>
      )}

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saveAvatar.isPending || buying}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3.5 font-semibold text-white shadow-sm active:bg-brand-700 disabled:opacity-60"
      >
        {saveAvatar.isPending ? <Spinner className="h-4 w-4" /> : 'Save avatar'}
      </button>
    </DetailScreen>
  )
}

function ColorPicker({
  label,
  presets,
  value,
  onChange,
}: {
  label: string
  presets: string[]
  value: string
  onChange: (c: string) => void
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {presets.map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            className={[
              'h-9 w-9 rounded-full border-2 transition active:scale-95',
              value === c ? 'border-brand-500 scale-110' : 'border-transparent',
            ].join(' ')}
            style={{ background: c }}
          />
        ))}
        {/* ponytail: <input type="color"> — native platform picker, no lib */}
        <label className="relative flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-paper-edge dark:border-slate-600">
          <input
            type="color"
            value={value || '#F1C27D'}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          <Palette className="h-4 w-4 text-stone-400 dark:text-slate-500" />
        </label>
      </div>
    </div>
  )
}
