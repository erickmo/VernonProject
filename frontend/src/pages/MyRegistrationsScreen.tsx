import { Ticket } from 'lucide-react'
import { DetailScreen, PullToRefresh } from '@/components/Layout'
import { EmptyState, FullScreenLoader, Pill } from '@/components/ui'
import { useMyRegistrations } from '@/hooks/useData'

const STATUS_CLASS: Record<string, string> = {
  Confirmed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  Pending: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  Cancelled: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
}

export default function MyRegistrationsScreen() {
  const { data, isLoading, refetch } = useMyRegistrations()
  const regs = data ?? []
  return (
    <DetailScreen title="My Registrations">
      {isLoading && !data ? (
        <FullScreenLoader label="Loading registrations…" />
      ) : (
        <PullToRefresh onRefresh={refetch}>
          {regs.length === 0 ? (
            <EmptyState icon={Ticket} title="No registrations yet" subtitle="Register for an event to see it here." />
          ) : (
            <div className="flex flex-col gap-2.5">
              {regs.map((r) => (
                <div
                  key={r.name}
                  className="flex items-center gap-3 rounded-2xl border border-paper-edge dark:border-slate-700 bg-paper-card dark:bg-slate-800 p-3.5 shadow-sm"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-slate-700">
                    <Ticket className="h-5 w-5 text-brand-500" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display font-semibold text-stone-800 dark:text-slate-50">
                      {r.event_title ?? r.event}
                    </span>
                    {r.start_datetime && (
                      <span className="block truncate text-xs text-stone-500 dark:text-slate-400">
                        {new Date(r.start_datetime).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    )}
                  </span>
                  <Pill className={STATUS_CLASS[r.status] ?? 'bg-paper-line text-stone-500'}>
                    {r.status}
                  </Pill>
                </div>
              ))}
            </div>
          )}
        </PullToRefresh>
      )}
    </DetailScreen>
  )
}
