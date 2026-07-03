import { useNavigate } from 'react-router-dom'
import { Plus, CalendarCog } from 'lucide-react'
import { DetailScreen, PullToRefresh } from '@/components/Layout'
import { EmptyState, FullScreenLoader, Pill } from '@/components/ui'
import { useManagedEvents } from '@/hooks/useData'

export default function EventManageScreen() {
  const navigate = useNavigate()
  const { data, isLoading, refetch } = useManagedEvents()
  const events = data ?? []
  const addBtn = (
    <button onClick={() => navigate('/events/manage/new')} aria-label="New event"
      className="flex h-10 w-10 items-center justify-center rounded-full text-stone-600 transition active:scale-90 dark:text-slate-300">
      <Plus className="h-6 w-6" />
    </button>
  )
  return (
    <DetailScreen title="Manage Events" right={addBtn}>
      {isLoading && !data ? (
        <FullScreenLoader label="Loading…" />
      ) : (
        <PullToRefresh onRefresh={refetch}>
          {events.length === 0 ? (
            <EmptyState icon={CalendarCog} title="No events yet" subtitle="Tap + to create one." />
          ) : (
            <div className="flex flex-col gap-2.5">
              {events.map((e) => (
                <button key={e.name} onClick={() => navigate(`/events/manage/${encodeURIComponent(e.name)}`)}
                  className="flex items-center gap-3 rounded-2xl border border-paper-edge bg-paper-card p-3.5 text-left shadow-sm transition active:scale-[0.99] dark:border-slate-700 dark:bg-slate-800">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display font-semibold text-stone-800 dark:text-slate-50">{e.title}</span>
                    <span className="block truncate text-xs text-stone-500 dark:text-slate-400">
                      {new Date(e.start_datetime).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })} · {e.registered_count} registered
                    </span>
                  </span>
                  <Pill className="bg-paper-line text-stone-600 dark:bg-slate-700 dark:text-slate-300">{e.status}</Pill>
                </button>
              ))}
            </div>
          )}
        </PullToRefresh>
      )}
    </DetailScreen>
  )
}
