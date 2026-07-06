import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarDays } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { ErrorState } from '@web/components/ui'
import { useEvents, useManagedEvents } from '@/hooks/useData'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable } from '@web/components/DataTable'
import type { EventItem, ManagedEvent } from '@/lib/types'

type Tab = 'browse' | 'manage'
const TABS: { value: Tab; label: string }[] = [
  { value: 'browse', label: 'Browse' },
  { value: 'manage', label: 'Manage' },
]

function price(e: EventItem) {
  if (e.pricing === 'Free') return 'Free'
  if (e.pricing === 'Points') return `${e.points_cost ?? 0} pts`
  return `Rp ${(e.price ?? 0).toLocaleString('id-ID')}`
}

export default function Events() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'manage' ? 'manage' : 'browse')
  const browse = useEvents()
  const managed = useManagedEvents()

  const q = tab === 'browse' ? browse : managed
  const toggle = (
    <div className="flex items-center gap-2">
      {TABS.map((t) => (
        <button
          key={t.value}
          onClick={() => setTab(t.value)}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${tab === t.value ? 'bg-brand-600 text-white' : 'bg-hover/[0.05] text-muted hover:bg-hover/[0.1]'}`}
        >
          {t.label}
        </button>
      ))}
      {tab === 'manage' && (
        <button
          onClick={() => navigate('/events/manage/new')}
          className="ml-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          New event
        </button>
      )}
    </div>
  )

  return (
    <Page>
      <PageHeader icon={CalendarDays} title="Events" actions={toggle} />
      {q.isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : tab === 'browse' ? (
        <DataTable
          rows={(browse.data ?? []) as EventItem[]}
          columns={[
            { key: 'title', header: 'Event', sortValue: (e) => e.title,
              render: (e) => <span className="font-medium text-ink">{e.title}</span> },
            { key: 'start', header: 'When', sortValue: (e) => e.start_datetime,
              render: (e) => <span className="text-muted">{new Date(e.start_datetime).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span> },
            { key: 'price', header: 'Price', render: (e) => <span className="text-muted">{price(e)}</span> },
            { key: 'status', header: '', render: (e) => e.my_status === 'Confirmed' ? <span className="text-brand-600">Joined</span> : e.is_full ? <span className="text-muted">Full</span> : null },
          ]}
          getKey={(e) => e.name}
          onRowClick={(e) => navigate(`/events/${encodeURIComponent(e.name)}`)}
        />
      ) : (
        <DataTable
          rows={(managed.data ?? []) as ManagedEvent[]}
          columns={[
            { key: 'title', header: 'Event', sortValue: (e) => e.title,
              render: (e) => <span className="font-medium text-ink">{e.title}</span> },
            { key: 'when', header: 'When', sortValue: (e) => e.start_datetime,
              render: (e) => <span className="text-muted">{new Date(e.start_datetime).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span> },
            { key: 'status', header: 'Status', render: (e) => <span className="text-muted">{e.status}</span> },
            { key: 'registered_count', header: 'Registered', render: (e) => <span className="text-muted">{e.registered_count}</span> },
          ]}
          getKey={(e) => e.name}
          onRowClick={(e) => navigate(`/events/manage/${encodeURIComponent(e.name)}`)}
        />
      )}
    </Page>
  )
}
