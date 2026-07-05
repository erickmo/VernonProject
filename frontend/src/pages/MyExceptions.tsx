import { FileText } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useMyExceptions } from '@/hooks/useData'

const badge: Record<string, string> = {
  Approved: 'bg-emerald-100 text-emerald-700',
  Rejected: 'bg-rose-100 text-rose-700',
  Pending: 'bg-amber-100 text-amber-700',
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
                  {e.exception_type === 'Leave' ? 'Cuti' : 'WFH'}
                </p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge[e.status] || badge.Pending}`}>
                  {e.status}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-stone-400">
                {e.from_date} → {e.to_date}
                {e.reason ? ` · ${e.reason}` : ''}
              </p>
              {e.total > 0 && (
                <p className="mt-1 text-xs font-medium text-stone-500">{e.approved_count}/{e.total} leaders approved</p>
              )}
            </div>
          ))}
        </div>
      )}
    </DetailScreen>
  )
}
