import { FileText } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useMyExceptions } from '@/hooks/useData'

const badge: Record<string, string> = {
  Approved: 'bg-emerald-100 text-emerald-700',
  Rejected: 'bg-rose-100 text-rose-700',
  Pending: 'bg-amber-100 text-amber-700',
}

const dot: Record<string, string> = {
  Approved: 'bg-emerald-500',
  Rejected: 'bg-rose-500',
  Pending: 'bg-amber-400',
}

export default function MyExceptions() {
  const { data: rows, isLoading } = useMyExceptions()

  return (
    <DetailScreen title="My leave / WFH">
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : !rows || rows.length === 0 ? (
        <EmptyState icon={FileText} title="No requests yet" subtitle="Your leave / WFH requests show here." />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((e) => (
            <div
              key={e.name}
              className="rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold text-stone-800 dark:text-slate-100">
                  {e.leave_type || (e.exception_type === 'Leave' ? 'Cuti' : 'WFH')}
                </p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge[e.status] || badge.Pending}`}>
                  {e.status}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-stone-400">
                {e.from_date} → {e.to_date}
                {e.reason ? ` · ${e.reason}` : ''}
              </p>

              <div className="mt-3 flex flex-col gap-1.5 border-t border-paper-edge pt-2.5 dark:border-slate-700">
                {e.approvers.length > 0 ? (
                  e.approvers.map((a) => (
                    <div key={a.approver} className="flex items-start gap-2 text-xs">
                      <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dot[a.decision] || dot.Pending}`} />
                      <span className="text-stone-600 dark:text-slate-300">{a.approver}</span>
                      <span className="ml-auto shrink-0 text-stone-400">
                        {a.decision === 'Rejected' ? 'Objected' : a.decision === 'Approved' ? 'Supports' : 'No input yet'}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-stone-400">No project leaders — straight to HR.</p>
                )}
                <div className="flex items-start gap-2 text-xs">
                  <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dot[e.hr_decision] || dot.Pending}`} />
                  <span className="font-semibold text-stone-700 dark:text-slate-200">HR (final)</span>
                  <span className="ml-auto shrink-0 text-stone-400">{e.hr_decision}</span>
                </div>
                {e.hr_reason && <p className="pl-3.5 text-xs text-rose-600">{e.hr_reason}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </DetailScreen>
  )
}
