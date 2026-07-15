import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Users } from 'lucide-react'
import { DetailScreen } from '@/components/Layout'
import { Spinner } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useRequestException, useMyLeaders } from '@/hooks/useData'

const field =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100'

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
      navigate('/attendance')
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  return (
    <DetailScreen title="Request leave / WFH">
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Type</label>
          <div className="flex gap-2">
            {(['Leave', 'WFH'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 rounded-xl border py-2 text-sm font-semibold ${
                  type === t
                    ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-slate-200 bg-white text-slate-500 dark:bg-slate-800 dark:border-slate-700'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">From</label>
            <input type="date" className={field} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">To</label>
            <input type="date" className={field} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Reason</label>
          <textarea className={field + ' min-h-[90px] resize-y'} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="rounded-2xl border border-paper-edge bg-paper-card p-3 dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs font-semibold text-stone-500">Who reviews this</p>
          {leadersLoading ? (
            <div className="py-2"><Spinner className="h-4 w-4" /></div>
          ) : leaders && leaders.length > 0 ? (
            <>
              <ul className="mt-1.5 flex flex-col gap-1">
                {leaders.map((l) => (
                  <li key={l} className="flex items-center gap-1.5 text-sm text-stone-700 dark:text-slate-200">
                    <Users className="h-3.5 w-3.5 shrink-0 text-stone-400" /> {l}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-stone-400">
                Your project leaders give input. HR gives the final approval.
              </p>
            </>
          ) : (
            <p className="mt-1 text-xs text-stone-400">
              No project leaders — this goes straight to HR.
            </p>
          )}
        </div>
        <button
          onClick={submit}
          disabled={req.isPending}
          className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 font-semibold text-white active:scale-95 disabled:opacity-50"
        >
          {req.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Submit request
        </button>
      </div>
    </DetailScreen>
  )
}
