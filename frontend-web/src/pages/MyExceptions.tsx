import { FileText, CalendarPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Spinner, EmptyState } from '@/components/ui'
import { useMyExceptions } from '@/hooks/useData'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { Card, CardList } from '@web/components/Card'

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
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">My leave / WFH</h1>
        <Link
          to="/attendance/request"
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 active:scale-[0.99] transition"
        >
          <CalendarPlus className="h-4 w-4" /> Request
        </Link>
      </div>
      <BentoGrid>
        <BentoTile span="full" tone="plain">
          {isLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : !rows || rows.length === 0 ? (
            <EmptyState icon={FileText} title="No requests yet" subtitle="Your leave / WFH requests show here." />
          ) : (
            <CardList>
              {rows.map((e) => (
                <Card
                  key={e.name}
                  title={
                    <span className="flex items-center gap-2">
                      {e.leave_type || (e.exception_type === 'Leave' ? 'Cuti' : 'WFH')}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge[e.status] || badge.Pending}`}>
                        {e.status}
                      </span>
                    </span>
                  }
                  meta={
                    <div className="flex flex-col gap-1">
                      <span>{e.from_date} → {e.to_date}{e.reason ? ` · ${e.reason}` : ''}</span>
                      {e.approvers.length > 0 ? (
                        e.approvers.map((a) => (
                          <span key={a.approver} className="flex items-center gap-1.5 text-xs">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot[a.decision] || dot.Pending}`} />
                            {a.approver} ·{' '}
                            {a.decision === 'Rejected' ? 'Objected' : a.decision === 'Approved' ? 'Supports' : 'No input yet'}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs">No project leaders — straight to HR.</span>
                      )}
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot[e.hr_decision] || dot.Pending}`} />
                        HR (final) · {e.hr_decision}
                      </span>
                      {e.hr_reason && <span className="text-xs text-rose-600">{e.hr_reason}</span>}
                    </div>
                  }
                />
              ))}
            </CardList>
          )}
        </BentoTile>
      </BentoGrid>
    </div>
  )
}
