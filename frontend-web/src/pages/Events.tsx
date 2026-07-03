import { useNavigate } from 'react-router-dom'
import { CalendarDays } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { ErrorState } from '@web/components/ui'
import { useEvents } from '@/hooks/useData'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable } from '@web/components/DataTable'
import type { EventItem } from '@/lib/types'

function price(e: EventItem) {
  if (e.pricing === 'Free') return 'Free'
  if (e.pricing === 'Points') return `${e.points_cost ?? 0} pts`
  return `Rp ${(e.price ?? 0).toLocaleString('id-ID')}`
}

export default function Events() {
  const navigate = useNavigate()
  const q = useEvents()
  if (q.isLoading) return <div className="flex justify-center py-20"><Spinner /></div>
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />
  const list = q.data ?? []
  return (
    <Page>
      <PageHeader icon={CalendarDays} title="Events" />
      <DataTable
        rows={list}
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
    </Page>
  )
}
