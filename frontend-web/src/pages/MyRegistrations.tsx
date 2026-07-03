import { Ticket } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { ErrorState } from '@web/components/ui'
import { useMyRegistrations } from '@/hooks/useData'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable } from '@web/components/DataTable'
import type { EventRegistration } from '@/lib/types'

export default function MyRegistrations() {
  const q = useMyRegistrations()
  if (q.isLoading) return <div className="flex justify-center py-20"><Spinner /></div>
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />
  const list: EventRegistration[] = q.data ?? []
  return (
    <Page>
      <PageHeader icon={Ticket} title="My Registrations" />
      <DataTable
        rows={list}
        columns={[
          { key: 'event', header: 'Event',
            render: (r) => <span className="font-medium text-ink">{r.event_title ?? r.event}</span> },
          { key: 'when', header: 'When', sortValue: (r) => r.start_datetime ?? '',
            render: (r) => <span className="text-muted">{r.start_datetime ? new Date(r.start_datetime).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</span> },
          { key: 'method', header: 'Method',
            render: (r) => <span className="text-muted">{r.method}</span> },
          { key: 'status', header: 'Status',
            render: (r) => <span className={r.status === 'Confirmed' ? 'text-brand-600' : r.status === 'Cancelled' ? 'text-muted line-through' : 'text-amber-600'}>{r.status}</span> },
        ]}
        getKey={(r) => r.name}
      />
    </Page>
  )
}
