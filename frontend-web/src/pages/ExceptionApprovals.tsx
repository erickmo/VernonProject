import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Spinner, EmptyState } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { usePendingExceptionApprovals, useApproveException, useRejectException } from '@/hooks/useData'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { Card, CardList } from '@web/components/Card'
import { Sheet } from '@web/components/Sheet'

export default function ExceptionApprovals() {
  const toast = useToast()
  const { data: rows, isLoading } = usePendingExceptionApprovals()
  const approve = useApproveException()
  const reject = useRejectException()
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const submitReject = async () => {
    if (!rejecting || !reason.trim()) return
    try {
      await reject.mutateAsync({ name: rejecting, reason: reason.trim() })
      toast('success', 'Objection sent')
      setRejecting(null)
      setReason('')
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">My input · Leave / WFH</h1>
      <BentoGrid>
        <BentoTile span="full" tone="plain">
          {isLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : !rows || rows.length === 0 ? (
            <EmptyState icon={Check} title="All clear" subtitle="Nothing awaiting your input." />
          ) : (
            <CardList>
              {rows.map((e) => (
                <Card
                  key={e.name}
                  title={`${e.employee} · ${e.exception_type === 'Leave' ? 'Cuti' : 'WFH'}`}
                  meta={<span>{e.from_date} → {e.to_date}{e.reason ? ` · ${e.reason}` : ''} · {e.approved_count}/{e.total} leaders support · HR decides</span>}
                  footer={
                    <>
                      <button
                        onClick={() => approve.mutate({ name: e.name }, {
                          onSuccess: () => toast('success', 'Input sent'),
                          onError: (err) => toast('error', (err as Error).message),
                        })}
                        disabled={approve.isPending}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 active:scale-[0.99] transition disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" /> Support
                      </button>
                      <button
                        onClick={() => { setRejecting(e.name); setReason('') }}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-rose-600 py-2 text-sm font-semibold text-white hover:bg-rose-700 active:scale-[0.99] transition"
                      >
                        <X className="h-4 w-4" /> Object
                      </button>
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
            Send objection
          </button>
        </div>
      </Sheet>
    </div>
  )
}
