import { useNavigate } from 'react-router-dom'
import { CalendarCog } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { ErrorState } from '@web/components/ui'
import { useManagedEvents } from '@/hooks/useData'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable } from '@web/components/DataTable'
import type { ManagedEvent } from '@/lib/types'

export default function EventManage() {
  const navigate = useNavigate()
  const q = useManagedEvents()
  if (q.isLoading) return <div className="flex justify-center py-20"><Spinner /></div>
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />
  const list: ManagedEvent[] = q.data ?? []
  return (
    <Page>
      <PageHeader
        icon={CalendarCog}
        title="Manage Events"
        actions={
          <button
            onClick={() => navigate('/events/manage/new')}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            New event
          </button>
        }
      />
      <DataTable
        rows={list}
        columns={[
          { key: 'title', header: 'Event', sortValue: (e) => e.title,
            render: (e) => <span className="font-medium text-ink">{e.title}</span> },
          { key: 'when', header: 'When', sortValue: (e) => e.start_datetime,
            render: (e) => <span className="text-muted">{new Date(e.start_datetime).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span> },
          { key: 'status', header: 'Status',
            render: (e) => <span className="text-muted">{e.status}</span> },
          { key: 'registered_count', header: 'Registered',
            render: (e) => <span className="text-muted">{e.registered_count}</span> },
        ]}
        getKey={(e) => e.name}
        onRowClick={(e) => navigate(`/events/manage/${encodeURIComponent(e.name)}`)}
      />
    </Page>
  )
}
