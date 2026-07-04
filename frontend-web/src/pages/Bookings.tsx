import { useNavigate } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { ErrorState } from '@web/components/ui'
import { useBookings, useCancelBooking, useBoot } from '@/hooks/useData'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable } from '@web/components/DataTable'
import type { Booking } from '@/lib/types'

export default function Bookings() {
  const navigate = useNavigate()
  const q = useBookings()
  const cancel = useCancelBooking()
  const { data: boot } = useBoot()
  if (q.isLoading) return <div className="flex justify-center py-20"><Spinner /></div>
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />
  const list = q.data ?? []
  return (
    <Page>
      <PageHeader
        icon={CalendarClock}
        title="Bookings"
        actions={
          <button
            type="button"
            onClick={() => navigate('/bookings/new')}
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            New Booking
          </button>
        }
      />
      <DataTable
        rows={list}
        columns={[
          { key: 'title', header: 'Title', sortValue: (b: Booking) => b.title,
            render: (b: Booking) => <span className="font-medium text-ink">{b.title}</span> },
          { key: 'room', header: 'Room',
            render: (b: Booking) => <span className="text-muted">{b.room ?? '—'}</span> },
          { key: 'start', header: 'Start', sortValue: (b: Booking) => b.start,
            render: (b: Booking) => <span className="text-muted">{b.start.slice(0, 16)}</span> },
          { key: 'end', header: 'End',
            render: (b: Booking) => <span className="text-muted">{b.end.slice(0, 16)}</span> },
          { key: 'booked_by', header: 'Booked by',
            render: (b: Booking) => <span className="text-muted">{b.booked_by}</span> },
          { key: 'status', header: 'Status',
            render: (b: Booking) => (
              <div className="flex items-center gap-2">
                <span className={b.status === 'Confirmed' ? 'text-brand-600' : 'text-muted'}>{b.status}</span>
                {b.status === 'Confirmed' && b.booked_by === boot?.user && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); cancel.mutate(b.name) }}
                    disabled={cancel.isPending}
                    className="rounded-lg border border-rose-300 px-2 py-0.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-60 transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            ),
          },
        ]}
        getKey={(b: Booking) => b.name}
      />
    </Page>
  )
}
