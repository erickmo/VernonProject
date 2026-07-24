import { useNavigate } from 'react-router-dom'
import { CalendarClock, CalendarDays, Clock, Plus } from 'lucide-react'
import { DetailScreen, PullToRefresh } from '@/components/Layout'
import { EmptyState, FullScreenLoader, Pill } from '@/components/ui'
import { useBookings, useCancelBooking, useBoot } from '@/hooks/useData'
import { formatDate, groupByStartDate } from '@/lib/format'

export default function BookingsScreen() {
  const navigate = useNavigate()
  const { data: boot } = useBoot()
  const { data, isLoading, refetch } = useBookings()
  const bookings = data ?? []
  const groups = groupByStartDate(bookings)
  const cancel = useCancelBooking()

  return (
    <DetailScreen
      title="Bookings"
      right={
        <button
          onClick={() => navigate('/bookings/new')}
          className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white active:scale-95"
        >
          <Plus className="h-4 w-4" /> New
        </button>
      }
    >
      {isLoading && !data ? (
        <FullScreenLoader label="Loading bookings…" />
      ) : (
        <PullToRefresh onRefresh={refetch}>
          {cancel.error && (
            <p className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
              {(cancel.error as Error).message}
            </p>
          )}
          {bookings.length === 0 ? (
            <EmptyState icon={CalendarClock} title="No bookings yet" subtitle="Tap New to create one." />
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map((g) => (
                <section key={g.date} className="flex flex-col gap-2.5">
                  <h2 className="flex items-center gap-1.5 px-1 text-sm font-display font-semibold text-stone-600 dark:text-slate-300">
                    <CalendarDays className="h-4 w-4 text-brand-500" /> {formatDate(g.date)}
                  </h2>
                  {g.items.map((b) => (
                    <div
                      key={b.name}
                      className={`flex items-start gap-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-3.5 shadow-sm${b.status === 'Cancelled' ? ' opacity-60' : ''}`}
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-slate-700">
                        <CalendarClock className="h-5 w-5 text-brand-500" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate font-display font-semibold ${b.status === 'Cancelled' ? 'text-stone-400 line-through dark:text-slate-500' : 'text-stone-800 dark:text-slate-50'}`}>{b.title}</span>
                        <span className="flex items-center gap-1 truncate text-xs text-stone-500 dark:text-slate-400">
                          <Clock className="h-3.5 w-3.5 shrink-0" /> {b.start.slice(11, 16)}–{b.end.slice(11, 16)}
                          {b.room && <> · {b.room}</>}
                        </span>
                        <span className="block truncate text-xs text-stone-400 dark:text-slate-500">{b.booked_by}</span>
                      </span>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <Pill>{b.status}</Pill>
                        {b.status === 'Confirmed' && b.booked_by === boot?.user && (
                          <button
                            onClick={(e) => { e.stopPropagation(); cancel.mutate(b.name) }}
                            disabled={cancel.isPending}
                            className="rounded-lg bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-600 active:bg-rose-100 disabled:opacity-50 dark:bg-rose-900/30 dark:text-rose-400"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
        </PullToRefresh>
      )}
    </DetailScreen>
  )
}
