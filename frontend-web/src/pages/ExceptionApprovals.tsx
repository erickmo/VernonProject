import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { usePendingExceptionApprovals, useApproveException, useRejectException } from '@/hooks/useData'
import { BentoGrid, BentoTile } from '@web/components/bento'

export default function ExceptionApprovals() {
  const { data: rows, isLoading } = usePendingExceptionApprovals()
  const approve = useApproveException()
  const reject = useRejectException()
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const submitReject = async () => {
    if (!rejecting || !reason.trim()) return
    await reject.mutateAsync({ name: rejecting, reason: reason.trim() })
    setRejecting(null)
    setReason('')
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">My approvals · Leave / WFH</h1>
      <BentoGrid>
        <BentoTile span="full" tone="plain">
          {isLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : !rows || rows.length === 0 ? (
            <EmptyState icon={Check} title="All clear" subtitle="Nothing awaiting your approval." />
          ) : (
            <div className="flex flex-col gap-2">
              {rows.map((e) => (
                <div key={e.name} className="flex items-center gap-3 rounded-lg border border-line p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{e.employee} · {e.exception_type === 'Leave' ? 'Cuti' : 'WFH'}</p>
                    <p className="text-xs text-muted">
                      {e.from_date} → {e.to_date}{e.reason ? ` · ${e.reason}` : ''} · {e.approved_count}/{e.total} approved
                    </p>
                  </div>
                  <button
                    onClick={() => approve.mutate(e.name)}
                    disabled={approve.isPending}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" /> Approve
                  </button>
                  <button
                    onClick={() => { setRejecting(e.name); setReason('') }}
                    className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700"
                  >
                    <X className="h-4 w-4" /> Reject
                  </button>
                </div>
              ))}
            </div>
          )}
        </BentoTile>
      </BentoGrid>

      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setRejecting(null)}>
          <div className="w-full max-w-md rounded-xl bg-surface p-4 shadow-xl" onClick={(ev) => ev.stopPropagation()}>
            <p className="mb-2 font-medium text-ink">Reason for rejection</p>
            <textarea
              className="w-full min-h-[90px] resize-y rounded-lg border border-line px-3 py-2 text-sm text-ink"
              value={reason}
              onChange={(ev) => setReason(ev.target.value)}
              autoFocus
            />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setRejecting(null)} className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted">Cancel</button>
              <button
                onClick={submitReject}
                disabled={reject.isPending || !reason.trim()}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Confirm reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
