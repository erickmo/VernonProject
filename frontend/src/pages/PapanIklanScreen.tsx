import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tag, ShoppingBag, Search } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Segmented, Spinner, EmptyState } from '@/components/ui'
import { useAds } from '@/hooks/useData'
import type { AdListItem, AdType } from '@/lib/types'

const TYPE_TABS = [
  { value: 'all', label: 'All' },
  { value: 'Sell', label: 'Jual' },
  { value: 'Buy', label: 'Beli' },
  { value: 'Rent', label: 'Sewa' },
] as const

const TYPE_LABEL: Record<AdType, string> = { Sell: 'Jual', Buy: 'Beli', Rent: 'Sewa' }
const TYPE_TONE: Record<AdType, string> = {
  Sell: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
  Buy: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
  Rent: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
}

function priceText(a: AdListItem) {
  if (!a.price) return 'Nego'
  const rp = `Rp ${a.price.toLocaleString('id-ID')}`
  return a.rate_period ? `${rp} ${a.rate_period}` : rp
}

export default function PapanIklanScreen() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<string>('all')
  const [q, setQ] = useState('')
  const list = useAds(tab === 'all' ? undefined : tab, q.trim() || undefined)

  const items = list.data ?? []

  return (
    <DetailScreen title="Papan Iklan">
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari iklan…"
            className="w-full rounded-xl border border-slate-200 bg-transparent py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:text-slate-100"
          />
        </div>

        <Segmented options={TYPE_TABS.map((t) => ({ value: t.value, label: t.label }))} value={tab} onChange={setTab} scroll />

        {list.isLoading ? (
          <div className="py-16 text-center"><Spinner className="mx-auto h-5 w-5 text-slate-400" /></div>
        ) : items.length === 0 ? (
          <EmptyState icon={ShoppingBag} title="Belum ada iklan" subtitle="Jadilah yang pertama pasang iklan." />
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((a) => (
              <button
                key={a.name}
                onClick={() => navigate(`/papan-iklan/${encodeURIComponent(a.name)}`)}
                className="flex gap-3 rounded-2xl border border-paper-edge bg-paper-card p-3 text-left shadow-card active:scale-[0.99] dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-700">
                  {a.thumbnail ? (
                    <img src={a.thumbnail} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-300"><Tag className="h-6 w-6" /></div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TYPE_TONE[a.ad_type]}`}>{TYPE_LABEL[a.ad_type]}</span>
                    {a.status === 'Fulfilled' && <span className="text-[11px] font-medium text-stone-400">Selesai</span>}
                  </div>
                  <p className="mt-1 truncate text-sm font-semibold text-stone-800 dark:text-slate-100">{a.title}</p>
                  <p className="text-sm font-medium text-brand-600">{priceText(a)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </DetailScreen>
  )
}
