import { useNavigate } from 'react-router-dom'
import { CalendarDays, Ticket } from 'lucide-react'
import { DetailScreen, PullToRefresh } from '@/components/Layout'
import { EmptyState, FullScreenLoader, Pill } from '@/components/ui'
import { useEvents } from '@/hooks/useData'

function priceLabel(e: { pricing: string; points_cost?: number; price?: number }) {
  if (e.pricing === 'Free') return 'Free'
  if (e.pricing === 'Points') return `${e.points_cost ?? 0} pts`
  return `Rp ${(e.price ?? 0).toLocaleString('id-ID')}`
}

export default function EventsScreen() {
  const navigate = useNavigate()
  const { data, isLoading, refetch } = useEvents()
  const events = data ?? []
  return (
    <DetailScreen title="Events">
      {isLoading && !data ? (
        <FullScreenLoader label="Loading events…" />
      ) : (
        <PullToRefresh onRefresh={refetch}>
          {events.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No events yet" subtitle="Check back soon." />
          ) : (
            <div className="flex flex-col gap-2.5">
              {events.map((e) => (
                <button
                  key={e.name}
                  onClick={() => navigate(`/events/${encodeURIComponent(e.name)}`)}
                  className="flex items-center gap-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-3.5 text-left shadow-sm transition active:scale-[0.99]"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 dark:bg-slate-700">
                    <Ticket className="h-5 w-5 text-brand-500" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display font-semibold text-stone-800 dark:text-slate-50">{e.title}</span>
                    <span className="block truncate text-xs text-stone-500 dark:text-slate-400">
                      {new Date(e.start_datetime).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  </span>
                  <Pill>{e.my_status === 'Confirmed' ? 'Joined' : priceLabel(e)}</Pill>
                </button>
              ))}
            </div>
          )}
        </PullToRefresh>
      )}
    </DetailScreen>
  )
}
