import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Megaphone, Plus } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { Button, ErrorState } from '@web/components/ui'
import { useAds } from '@/hooks/useData'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable } from '@web/components/DataTable'
import type { AdListItem, AdType } from '@/lib/types'

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'Sell', label: 'Jual' },
  { value: 'Buy', label: 'Beli' },
  { value: 'Rent', label: 'Sewa' },
] as const
const TYPE_LABEL: Record<AdType, string> = { Sell: 'Jual', Buy: 'Beli', Rent: 'Sewa' }

function price(a: AdListItem) {
  if (!a.price) return 'Nego'
  const rp = `Rp ${a.price.toLocaleString('id-ID')}`
  return a.rate_period ? `${rp} ${a.rate_period}` : rp
}

export default function PapanIklan() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<string>('all')
  const [q, setQ] = useState('')
  const list = useAds(tab === 'all' ? undefined : tab, q.trim() || undefined)

  return (
    <Page>
      <PageHeader
        icon={Megaphone}
        title="Papan Iklan"
        actions={
          <Button variant="primary" onClick={() => navigate('/papan-iklan/new')}>
            <Plus className="h-4 w-4" /> Pasang iklan
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${tab === t.value ? 'bg-brand-600 text-white' : 'bg-hover/[0.05] text-muted hover:bg-hover/[0.1]'}`}
          >
            {t.label}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari…"
          className="ml-auto rounded-xl border border-line bg-transparent px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none"
        />
      </div>

      {list.isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : list.isError ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : (
        <DataTable
          rows={list.data ?? []}
          columns={[
            { key: 'title', header: 'Iklan', sortValue: (a) => a.title, render: (a) => <span className="font-medium text-ink">{a.title}</span> },
            { key: 'type', header: 'Jenis', render: (a) => <span className="text-muted">{TYPE_LABEL[a.ad_type]}</span> },
            { key: 'price', header: 'Harga', render: (a) => <span className="text-muted">{price(a)}</span> },
            { key: 'author', header: 'Oleh', render: (a) => <span className="text-muted">{a.author_name}</span> },
          ]}
          getKey={(a) => a.name}
          onRowClick={(a) => navigate(`/papan-iklan/${encodeURIComponent(a.name)}`)}
        />
      )}
    </Page>
  )
}
