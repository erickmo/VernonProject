import { useEffect, useState } from 'react'
import { X, Check, CalendarClock } from 'lucide-react'
import { usePostpone, useProjectDetail } from '@/hooks/useData'
import { useToast } from '@/components/Toast'
import { Spinner } from '@/components/ui'

interface Props {
  open: boolean
  onClose: () => void
  targetType: 'Project' | 'Project Detail'
  targetName: string
  targetLabel: string
  anchorDate: string
}

// Whole-day delta between two 'YYYY-MM-DD' strings, parsed as UTC midnight so
// DST / local offset can't drift the count.
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000)

export function PostponeSheet({ open, onClose, targetType, targetName, targetLabel, anchorDate }: Props) {
  const toast = useToast()
  const post = usePostpone()
  // The per-detail row on the project screen carries no date, so resolve a
  // detail's own deadline here (its latest_deadline, else the project deadline).
  // For a Project the caller already has the deadline and passes it as anchorDate.
  const isDetail = targetType === 'Project Detail'
  const { data: detail } = useProjectDetail(open && isDetail ? targetName : '')
  const anchor = (isDetail ? detail?.latest_deadline || detail?.project_deadline : anchorDate) || ''

  const [picked, setPicked] = useState('')
  useEffect(() => {
    if (open) setPicked(anchor)
  }, [open, anchor])

  if (!open) return null

  const delta = picked && anchor ? daysBetween(picked, anchor) : 0
  const sign = delta > 0 ? '+' : ''
  const unit = Math.abs(delta) === 1 ? 'day' : 'days'

  const submit = () =>
    post.mutate(
      { targetType, targetName, newDate: picked },
      {
        onSuccess: (r) => {
          const s = r.delta_days > 0 ? '+' : ''
          toast('success', `Moved ${r.shifted_count} tasks by ${s}${r.delta_days} days`)
          onClose()
        },
        onError: (e) => toast('error', (e as Error).message),
      },
    )

  const field =
    'w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:text-slate-100'

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white dark:bg-slate-800 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-50">
            <CalendarClock className="h-5 w-5 text-brand-600" /> Postpone
          </h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 dark:text-slate-500 active:scale-95">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 truncate text-sm text-slate-500 dark:text-slate-400">{targetLabel}</p>

        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            New deadline
            <input type="date" className={field + ' mt-1'} value={picked} onChange={(e) => setPicked(e.target.value)} />
          </label>

          {!anchor ? (
            <p className="rounded-xl bg-amber-50 dark:bg-amber-500/15 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-300">
              No current deadline to move from.
            </p>
          ) : delta === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">Pick a different date to shift the schedule.</p>
          ) : (
            <p className="rounded-xl bg-brand-50 dark:bg-brand-500/15 px-3 py-2 text-sm font-medium text-brand-700 dark:text-brand-300">
              Moves every active task by {sign}{delta} {unit} ({delta > 0 ? 'later' : 'earlier'}).
            </p>
          )}

          <div className="mt-1 flex gap-2">
            <button onClick={onClose} className="flex-1 rounded-xl bg-slate-100 dark:bg-slate-700 py-3 text-sm font-semibold text-slate-600 dark:text-slate-200 active:scale-95">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={post.isPending || !picked || delta === 0}
              className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
            >
              {post.isPending ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
