import { useParams } from 'react-router-dom'
import { UserCheck, UserX, Ticket } from 'lucide-react'
import { DetailScreen, PullToRefresh } from '@/components/Layout'
import { EmptyState, FullScreenLoader, Pill } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { useEventRoster, useCancelRegistration, useMarkAttended } from '@/hooks/useData'

export default function EventRosterScreen() {
  const { name: raw } = useParams()
  const event = raw ? decodeURIComponent(raw) : ''
  const toast = useToast()
  const confirm = useConfirm()
  const { data, isLoading, refetch } = useEventRoster(event)
  const cancelReg = useCancelRegistration()
  const attend = useMarkAttended()
  const rows = (data ?? []).filter((r) => r.status !== 'Cancelled')

  const onCancel = async (name: string) => {
    if (!(await confirm({ title: 'Cancel this registration?', message: 'Points are refunded automatically; the seat is freed.', confirmLabel: 'Cancel registration', destructive: true }))) return
    cancelReg.mutate(name, { onSuccess: () => toast('success', 'Registration cancelled'), onError: (e) => toast('error', (e as Error).message) })
  }

  return (
    <DetailScreen title="Registrations">
      {isLoading && !data ? <FullScreenLoader label="Loading…" /> : (
        <PullToRefresh onRefresh={refetch}>
          {rows.length === 0 ? <EmptyState icon={Ticket} title="No registrations" /> : (
            <div className="flex flex-col gap-2.5">
              {rows.map((r) => (
                <div key={r.name} className="flex items-center gap-3 rounded-2xl border border-paper-edge bg-paper-card p-3.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display font-semibold text-stone-800 dark:text-slate-50">{r.full_name}</span>
                    <span className="block truncate text-xs text-stone-500 dark:text-slate-400">{r.status} · {r.method}{r.amount ? ` · ${r.amount}` : ''}</span>
                  </span>
                  <button onClick={() => attend.mutate({ name: r.name, attended: r.attended ? 0 : 1 })}
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${r.attended ? 'bg-emerald-500 text-white' : 'bg-paper-line text-stone-500 dark:bg-slate-700'}`} aria-label="Toggle attended">
                    <UserCheck className="h-4 w-4" />
                  </button>
                  <button onClick={() => onCancel(r.name)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-paper-line text-rose-600 dark:bg-slate-700" aria-label="Cancel registration">
                    <UserX className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </PullToRefresh>
      )}
    </DetailScreen>
  )
}
