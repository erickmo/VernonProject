import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canHrApprove, useHrPendingExceptions, useApproveException, useRejectException } from '@/hooks/useData'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100'

const dot: Record<string, string> = {
  Approved: 'bg-emerald-500',
  Rejected: 'bg-rose-500',
  Pending: 'bg-amber-400',
}

export default function AttendanceExceptionsScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: boot } = useBoot()
  const blocked = !!boot && !canHrApprove(boot)
  useEffect(() => {
    if (blocked) navigate('/', { replace: true })
  }, [blocked, navigate])

  const { data: rows, isLoading } = useHrPendingExceptions()
  const approve = useApproveException()
  const reject = useRejectException()
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const doApprove = async (name: string) => {
    try {
      await approve.mutateAsync({ name, as_hr: true })
      toast('success', 'Approved')
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  const submitReject = async () => {
    if (!rejecting) return
    if (!reason.trim()) {
      toast('error', 'Reason required')
      return
    }
    try {
      await reject.mutateAsync({ name: rejecting, reason: reason.trim(), as_hr: true })
      toast('success', 'Rejected')
      setRejecting(null)
      setReason('')
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  if (blocked) return null

  return (
    <DetailScreen title="HR · Leave / WFH">
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : !rows || rows.length === 0 ? (
        <EmptyState icon={Check} title="All clear" subtitle="No requests awaiting HR." />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((e) => (
            <div
              key={e.name}
              className="rounded-2xl border border-paper-edge bg-paper-card p-4 shadow-card dark:border-slate-700 dark:bg-slate-800"
            >
              <p className="font-semibold text-stone-800 dark:text-slate-100">
                {e.employee} · {e.exception_type === 'Leave' ? 'Cuti' : 'WFH'}
              </p>
              <p className="mt-0.5 text-xs text-stone-400">
                {e.from_date} → {e.to_date}
                {e.reason ? ` · ${e.reason}` : ''}
              </p>

              <div className="mt-3 flex flex-col gap-1.5 border-t border-paper-edge pt-2.5 dark:border-slate-700">
                <p className="text-xs font-semibold text-stone-500">Leader input</p>
                {e.approvers.length > 0 ? (
                  e.approvers.map((a) => (
                    <div key={a.approver} className="flex items-start gap-2 text-xs">
                      <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dot[a.decision] || dot.Pending}`} />
                      <span className="text-stone-600 dark:text-slate-300">{a.approver}</span>
                      <span className="ml-auto shrink-0 text-stone-400">
                        {a.decision === 'Rejected' ? 'Objected' : a.decision === 'Approved' ? 'Supports' : 'No input yet'}
                      </span>
                      {a.reason && <span className="basis-full pl-3.5 text-rose-600">{a.reason}</span>}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-stone-400">No project leaders.</p>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => doApprove(e.name)}
                  disabled={approve.isPending}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" /> Approve
                </button>
                <button
                  onClick={() => { setRejecting(e.name); setReason('') }}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white active:scale-95"
                >
                  <X className="h-4 w-4" /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4" onClick={() => setRejecting(null)}>
          <div
            className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl dark:bg-slate-800"
            onClick={(ev) => ev.stopPropagation()}
          >
            <p className="mb-2 font-semibold text-stone-800 dark:text-slate-100">Reason for rejection</p>
            <textarea
              className={field + ' min-h-[90px] resize-y'}
              value={reason}
              onChange={(ev) => setReason(ev.target.value)}
              autoFocus
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => setRejecting(null)}
                className="rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-stone-500 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={submitReject}
                disabled={reject.isPending}
                className="rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Confirm reject
              </button>
            </div>
          </div>
        </div>
      )}
    </DetailScreen>
  )
}
