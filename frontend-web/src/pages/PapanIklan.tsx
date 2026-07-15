import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Megaphone, Plus, Search } from 'lucide-react'
import clsx from 'clsx'
import { EmptyState } from '@/components/ui'
import { Button, ErrorState, Skeleton } from '@web/components/ui'
import { useAds } from '@/hooks/useData'
import { Page, PageHeader, rise } from '@web/components/Page'
import type { AdListItem, AdType } from '@/lib/types'

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'Sell', label: 'Jual' },
  { value: 'Buy', label: 'Beli' },
  { value: 'Rent', label: 'Sewa' },
] as const
const TYPE_LABEL: Record<AdType, string> = { Sell: 'Jual', Buy: 'Beli', Rent: 'Sewa' }
// Type badge tint — one hue per intent so the board scans at a glance.
const TYPE_TINT: Record<AdType, string> = {
  Sell: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-200',
  Buy: 'bg-sky-100 text-sky-700 dark:bg-sky-500/25 dark:text-sky-200',
  Rent: 'bg-violet-100 text-violet-700 dark:bg-violet-500/25 dark:text-violet-200',
}

function price(a: AdListItem) {
  if (!a.price) return 'Nego'
  const rp = `Rp ${a.price.toLocaleString('id-ID')}`
  return a.rate_period ? `${rp} ${a.rate_period}` : rp
}

// Compact Bahasa relative time; falls back to a short date past a week.
function timeAgo(at: string): string {
  const d = new Date(at.replace(' ', 'T'))
  const s = (Date.now() - d.getTime()) / 1000
  if (isNaN(s)) return ''
  if (s < 60) return 'baru saja'
  if (s < 3600) return `${Math.floor(s / 60)} mnt`
  if (s < 86400) return `${Math.floor(s / 3600)} jam`
  if (s < 604800) return `${Math.floor(s / 86400)} hr`
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

function AdCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl bg-surface shadow-card">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="flex flex-col gap-2 p-3">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="mt-1 h-3 w-2/3" />
      </div>
    </div>
  )
}

function AdCard({ a, onClick }: { a: AdListItem; onClick: () => void }) {
  const done = a.status === 'Fulfilled'
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-2xl bg-surface text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-paper-line dark:bg-slate-800">
        {a.thumbnail ? (
          <img src={a.thumbnail} alt={a.title} loading="lazy" className={clsx('h-full w-full object-cover transition duration-300 group-hover:scale-105', done && 'grayscale')} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted">
            <Megaphone className="h-8 w-8 opacity-30" />
          </div>
        )}
        <span className={clsx('absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm', TYPE_TINT[a.ad_type])}>
          {TYPE_LABEL[a.ad_type]}
        </span>
        {done && (
          <span className="absolute right-2 top-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">
            Selesai
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className={clsx('line-clamp-2 text-sm font-semibold leading-snug', done ? 'text-muted' : 'text-ink')}>{a.title}</h3>
        <p className={clsx('font-display text-base font-bold', done ? 'text-muted line-through' : 'text-brand-600 dark:text-brand-400')}>{price(a)}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1.5 text-xs text-muted">
          <span className="truncate">{a.author_name}</span>
          <span className="shrink-0">{timeAgo(a.at)}</span>
        </div>
      </div>
    </button>
  )
}

export default function PapanIklan() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<string>('all')
  const [q, setQ] = useState('')
  const list = useAds(tab === 'all' ? undefined : tab, q.trim() || undefined)
  const ads = list.data ?? []

  return (
    <Page>
      <PageHeader
        icon={Megaphone}
        title="Papan Iklan"
        subtitle="Jual, beli, sewa — dari sesama Vernonian"
        actions={
          <Button variant="primary" onClick={() => navigate('/papan-iklan/new')}>
            <Plus className="h-4 w-4" /> Pasang iklan
          </Button>
        }
      />

      {/* Filter tabs + search */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={clsx(
              'rounded-full px-3.5 py-1.5 text-sm font-semibold shadow-card transition active:scale-95',
              tab === t.value ? 'bg-brand-600 text-white' : 'bg-surface text-muted hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari…"
            className="w-full rounded-full border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:outline-none"
          />
        </div>
      </div>

      {list.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => <AdCardSkeleton key={i} />)}
        </div>
      ) : list.isError ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : ads.length === 0 ? (
        <EmptyState icon={Megaphone} title="Belum ada iklan" subtitle={q ? `Tidak ada hasil untuk "${q.trim()}".` : 'Jadilah yang pertama pasang iklan.'} />
      ) : (
        <>
          <p className="mb-3 px-1 text-xs font-medium text-muted">{ads.length} iklan</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {ads.map((a, i) => (
              <div key={a.name} {...rise(i)}>
                <AdCard a={a} onClick={() => navigate(`/papan-iklan/${encodeURIComponent(a.name)}`)} />
              </div>
            ))}
          </div>
        </>
      )}
    </Page>
  )
}
