import { useNavigate } from 'react-router-dom'
import { CalendarClock, CalendarDays, Clock } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { ErrorState, Button } from '@web/components/ui'
import { useBookings, useCancelBooking, useBoot } from '@/hooks/useData'
import { Page, PageHeader } from '@web/components/Page'
import { DataTable } from '@web/components/DataTable'
import { formatDate, groupByStartDate } from '@/lib/format'
import type { Booking } from '@/lib/types'

export default function Bookings() {
  const navigate = useNavigate()
  const q = useBookings()
  const cancel = useCancelBooking()
  const { data: boot } = useBoot()
  if (q.isLoading) return <div className="flex justify-center py-20"><Spinner /></div>
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />
  const list = q.data ?? []
  const groups = groupByStartDate(list)
  const columns = [
    { key: 'title', header: 'Title', sortValue: (b: Booking) => b.title,
      render: (b: Booking) => <span className="font-medium text-ink">{b.title}</span> },
    { key: 'room', header: 'Room',
      render: (b: Booking) => <span className="text-muted">{b.room ?? '—'}</span> },
    { key: 'time', header: 'Time', sortValue: (b: Booking) => b.start,
      render: (b: Booking) => (
        <span className="inline-flex items-center gap-1 text-muted">
          <Clock className="h-3.5 w-3.5 shrink-0" /> {b.start.slice(11, 16)}–{b.end.slice(11, 16)}
        </span>
      ) },
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
              className="rounded-xl border border-rose-300 px-2 py-0.5 text-xs font-medium text-rose-600 hover:bg-rose-50 active:scale-[0.97] transition disabled:opacity-60"
            >
              Cancel
            </button>
          )}
        </div>
      ),
    },
  ]
  return (
    <Page>
      <PageHeader
        icon={CalendarClock}
        title="Bookings"
        actions={
          <Button variant="primary" size="sm" onClick={() => navigate('/bookings/new')}>
            New Booking
          </Button>
        }
      />
      {cancel.error && (
        <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
          {(cancel.error as Error).message}
        </p>
      )}
      {groups.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No bookings yet" subtitle="Click New to create one." />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.date}>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
                <CalendarDays className="h-4 w-4 text-brand-600" /> {formatDate(g.date)}
              </h2>
              <DataTable
                rows={g.items}
                columns={columns}
                getKey={(b: Booking) => b.name}
                rowClassName={(b: Booking) => (b.status === 'Cancelled' ? 'opacity-55 line-through' : undefined)}
              />
            </section>
          ))}
        </div>
      )}
    </Page>
  )
}
