import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Users } from 'lucide-react'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useRequestException, useMyLeaders } from '@/hooks/useData'
import { BentoGrid, BentoTile } from '@web/components/bento'
import { DatePicker } from '@web/components/DatePicker'

export default function RequestException() {
  const navigate = useNavigate()
  const toast = useToast()
  const req = useRequestException()
  const { data: leaders, isLoading: leadersLoading } = useMyLeaders()
  const [type, setType] = useState<'WFH' | 'Leave'>('Leave')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')

  const submit = async () => {
    if (!from || !to) {
      toast('error', 'Pick both dates')
      return
    }
    try {
      await req.mutateAsync({ from_date: from, to_date: to, exception_type: type, reason })
      toast('success', 'Request submitted')
      navigate('/attendance/my-requests')
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Request leave / WFH</h1>
      <BentoGrid>
        <BentoTile span="full" tone="plain">
          <div className="flex max-w-xl flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Type</label>
              <div className="flex gap-2">
                {(['Leave', 'WFH'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex-1 rounded-xl border py-2 text-sm font-semibold transition ${
                      type === t ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line text-muted'
                    }`}
                  >
                    {t === 'Leave' ? 'Cuti' : 'WFH'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">From</label>
                <DatePicker value={from} onChange={setFrom} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">To</label>
                <DatePicker value={to} onChange={setTo} min={from || undefined} />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Reason</label>
              <textarea
                className="w-full min-h-[90px] resize-y rounded-xl border border-line px-3 py-2 text-sm text-ink"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <div className="rounded-2xl border border-line p-3">
              <p className="text-xs font-semibold text-muted">Who reviews this</p>
              {leadersLoading ? (
                <div className="py-2"><Spinner className="h-4 w-4" /></div>
              ) : leaders && leaders.length > 0 ? (
                <>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {leaders.map((l) => (
                      <li key={l} className="flex items-center gap-1.5 text-sm text-ink">
                        <Users className="h-3.5 w-3.5 shrink-0 text-muted" /> {l}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted">
                    Your project leaders give input. HR gives the final approval.
                  </p>
                </>
              ) : (
                <p className="mt-1 text-xs text-muted">No project leaders — this goes straight to HR.</p>
              )}
            </div>

            <button
              onClick={submit}
              disabled={req.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 font-semibold text-white hover:bg-brand-700 active:scale-[0.99] transition disabled:opacity-50"
            >
              {req.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Submit request
            </button>
          </div>
        </BentoTile>
      </BentoGrid>
    </div>
  )
}
