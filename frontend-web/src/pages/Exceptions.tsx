import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useBoot, canHrApprove, useHrPendingExceptions, useApproveException, useRejectException } from '@/hooks/useData'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { Card, CardList } from '@web/components/Card'
import { Sheet } from '@web/components/Sheet'

const dot: Record<string, string> = {
  Approved: 'bg-emerald-500',
  Rejected: 'bg-rose-500',
  Pending: 'bg-amber-400',
}

export default function Exceptions() {
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
    if (!rejecting || !reason.trim()) return
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
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">HR · Leave / WFH requests</h1>
      <BentoGrid>
        <BentoTile span="full" tone="plain">
          {isLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : !rows || rows.length === 0 ? (
            <EmptyState icon={Check} title="All clear" subtitle="No requests awaiting HR." />
          ) : (
            <CardList>
              {rows.map((e) => (
                <Card
                  key={e.name}
                  title={`${e.employee} · ${e.exception_type === 'Leave' ? (e.leave_type || 'Cuti') : 'WFH'}`}
                  meta={
                    <div className="flex flex-col gap-1">
                      <span>{e.from_date} → {e.to_date}{e.reason ? ` · ${e.reason}` : ''}</span>
                      {e.proof && (
                        <a
                          href={e.proof}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-brand-600 underline"
                        >
                          Lihat lampiran
                        </a>
                      )}
                      {e.approvers.length > 0 ? (
                        e.approvers.map((a) => (
                          <span key={a.approver} className="flex items-center gap-1.5 text-xs">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot[a.decision] || dot.Pending}`} />
                            {a.approver} ·{' '}
                            {a.decision === 'Rejected' ? 'Objected' : a.decision === 'Approved' ? 'Supports' : 'No input yet'}
                            {a.reason ? ` — ${a.reason}` : ''}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs">No project leaders.</span>
                      )}
                    </div>
                  }
                  footer={
                    <>
                      <button onClick={() => doApprove(e.name)} disabled={approve.isPending} className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 active:scale-[0.99] transition disabled:opacity-50"><Check className="h-4 w-4" /> Approve</button>
                      <button onClick={() => { setRejecting(e.name); setReason('') }} className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-rose-600 py-2 text-sm font-semibold text-white hover:bg-rose-700 active:scale-[0.99] transition"><X className="h-4 w-4" /> Reject</button>
                    </>
                  }
                />
              ))}
            </CardList>
          )}
        </BentoTile>
      </BentoGrid>

      <Sheet open={!!rejecting} onClose={() => setRejecting(null)} title="Reason for rejection" size="sm">
        <textarea
          className="w-full min-h-[90px] resize-y rounded-xl border border-line px-3 py-2 text-sm text-ink"
          value={reason}
          onChange={(ev) => setReason(ev.target.value)}
          autoFocus
        />
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={() => setRejecting(null)} className="rounded-xl border border-line px-3 py-1.5 text-sm text-muted active:scale-[0.99] transition">Cancel</button>
          <button
            onClick={submitReject}
            disabled={reject.isPending || !reason.trim()}
            className="rounded-xl bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white active:scale-[0.99] transition disabled:opacity-50"
          >
            Confirm reject
          </button>
        </div>
      </Sheet>
    </div>
  )
}
