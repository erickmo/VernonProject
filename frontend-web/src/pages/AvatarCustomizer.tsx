import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Coins, Palette, Wand2 } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { AvatarViewer } from '@/avatar/AvatarViewer'
import { AvatarBoundary } from '@/avatar/AvatarBoundary'
import { useAvatarCatalog, useSaveAvatar, useWallet, keys } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { useQueryClient } from '@tanstack/react-query'
import { mobileApi } from '@/lib/api'
import type { AvatarConfig, AvatarItem } from '@/lib/types'
import { Dialog } from '@web/components/overlays/Dialog'
import { BentoGrid, BentoTile } from '@web/components/bento'

type Tab = 'Base' | 'Hat' | 'Face' | 'Color'
// ponytail: direct map avoids SLOT_KEY[tab] TS narrowing dance
const SLOT_MAP = { Base: 'base', Hat: 'hat', Face: 'face' } as const
type SlotKey = (typeof SLOT_MAP)[keyof typeof SLOT_MAP]

const SKIN_PRESETS = ['#FDDBB4', '#F1C27D', '#E0AC69', '#C68642', '#8D5524', '#2C1A0E']
const TABS: Tab[] = ['Base', 'Hat', 'Face', 'Color']

export default function AvatarCustomizer() {
  const navigate = useNavigate()
  const { data: catalog, isLoading, error } = useAvatarCatalog()
  const { data: wallet } = useWallet()
  const saveAvatar = useSaveAvatar()
  const toast = useToast()
  const qc = useQueryClient()
  const captureRef = useRef<(() => string | null) | null>(null)

  const [draft, setDraft] = useState<AvatarConfig | null>(null)
  const [tab, setTab] = useState<Tab>('Base')
  const [buying, setBuying] = useState(false)
  const [buyItem, setBuyItem] = useState<AvatarItem | null>(null)

  // Seed draft once; never reset (preserves in-progress edits)
  useEffect(() => {
    if (catalog && !draft) setDraft({ ...catalog.my })
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

  const confirmBuy = async () => {
    const item = buyItem // capture before closing dialog
    if (!item?.reward) { toast('error', 'This item has no reward linked'); setBuyItem(null); return }
    setBuyItem(null)
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
        {/* 3-D preview */}
        <BentoTile span="lg" tone="plain" className="min-h-[18rem]">
          <div className="flex-1 min-h-0 overflow-hidden rounded-2xl h-72">
            <AvatarBoundary fallback={
              <div className="flex h-full items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-sm text-slate-400 dark:text-slate-500">
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
        </BentoTile>

        {/* Controls */}
        <BentoTile span="lg" tone="plain">
          {/* Tab strip */}
          <div className="mb-4 flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setTab(t)}
                className={[
                  'rounded-lg px-4 py-2 text-sm font-semibold transition',
                  tab === t
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700',
                ].join(' ')}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Item grid for Base / Hat / Face */}
          {slotKey && (
            <div className="mb-4 grid grid-cols-3 sm:grid-cols-4 gap-3">
              {slotItems.map((item) => {
                const active = draft[slotKey] === item.name
                return (
                  <button
                    type="button"
                    key={item.name}
                    onClick={() => item.owned ? equip(item) : setBuyItem(item)}
                    disabled={buying}
                    className={[
                      'flex flex-col items-center gap-2 rounded-xl border p-3 transition hover:-translate-y-0.5 disabled:opacity-60',
                      active
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-brand-300 dark:hover:border-brand-500/40',
                    ].join(' ')}
                  >
                    <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                      {item.thumbnail ? (
                        <img src={item.thumbnail} alt={item.item_name} className="h-full w-full object-cover" />
                      ) : (
                        <Wand2 className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                      )}
                    </div>
                    <p className="line-clamp-1 text-center text-xs font-medium text-slate-700 dark:text-slate-200">
                      {item.item_name}
                    </p>
                    {!item.owned && (
                      <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                        {item.price != null ? item.price.toLocaleString() : '?'} pts
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Color tab */}
          {tab === 'Color' && (
            <div className="mb-4 space-y-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
              <ColorPicker
                label="Skin tone"
                presets={SKIN_PRESETS}
                value={draft.skin_color}
                onChange={(c) => setDraft((d) => d ? { ...d, skin_color: c } : d)}
              />
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
        title={`Buy ${buyItem?.item_name ?? ''}?`}
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
              {buyItem.price != null ? buyItem.price.toLocaleString() : '?'} pts
            </span>{' '}
            from your balance (
            <span className="font-semibold">{balance.toLocaleString()} pts</span>) to unlock{' '}
            <span className="font-semibold">{buyItem.item_name}</span>.
          </p>
        )}
      </Dialog>
    </div>
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
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
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
        <label className="relative flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-slate-200 dark:border-slate-600">
          <input
            type="color"
            value={value || '#F1C27D'}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          <Palette className="h-4 w-4 text-slate-400 dark:text-slate-500" />
        </label>
      </div>
    </div>
  )
}
