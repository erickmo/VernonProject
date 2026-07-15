import { useEffect, useState } from 'react'
import { Dialog } from '@web/components/overlays/Dialog'
import { Button } from '@web/components/ui'
import { DatePicker } from '@web/components/DatePicker'
import { usePostpone, useProjectDetail } from '@/hooks/useData'
import { useToast } from '@/components/Toast'

const INPUT_CLS =
  'w-full rounded-xl border border-line dark:border-slate-700 bg-transparent px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:text-slate-100'

// Whole-day delta between two YYYY-MM-DD strings. Both parse as UTC midnight, so
// the difference is exact days with no timezone drift.
function deltaDays(from: string, to: string): number | null {
  if (!from || !to) return null
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000)
}

export function PostponeDialog({
  open,
  onClose,
  targetType,
  targetName,
  targetLabel,
  anchorDate,
}: {
  open: boolean
  onClose: () => void
  targetType: 'Project' | 'Project Detail'
  targetName: string
  targetLabel: string
  /** Current deadline the user is moving from — '' if unknown. */
  anchorDate: string
}) {
  const postpone = usePostpone()
  const toast = useToast()
  // The Project page's per-detail row carries no deadline, so resolve the
  // detail's own anchor here (latest_deadline, else the project deadline) —
  // only fetched when the caller couldn't supply one.
  const needFetch = open && targetType === 'Project Detail' && !anchorDate
  const { data: detail } = useProjectDetail(needFetch ? targetName : '')
  const anchor = anchorDate || detail?.latest_deadline || detail?.project_deadline || ''
  const [picked, setPicked] = useState(anchor)

  useEffect(() => {
    if (open) setPicked(anchor)
  }, [open, anchor])

  const delta = deltaDays(anchor, picked)
  const preview =
    !picked
      ? 'Pick a new deadline.'
      : delta === null
        ? 'Shifts every active task to match the new deadline.'
        : delta === 0
          ? 'No change.'
          : `Moves every active task by ${delta > 0 ? '+' : ''}${delta} days.`

  const submit = () => {
    if (!picked || picked === anchor || postpone.isPending) return
    postpone.mutate(
      { targetType, targetName, newDate: picked },
      {
        onSuccess: (r) => {
          toast(
            'success',
            `Moved ${r.shifted_count} tasks by ${r.delta_days >= 0 ? '+' : ''}${r.delta_days} days`,
          )
          onClose()
        },
        onError: (e) => toast('error', (e as Error).message),
      },
    )
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Postpone ${targetLabel}`}
      onSubmit={submit}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={!picked || picked === anchor || postpone.isPending}
          >
            Confirm
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted">New deadline</span>
          <DatePicker
            value={picked}
            onChange={(v) => setPicked(v)}
            className={INPUT_CLS}
          />
        </label>
        <p className="text-sm text-muted">{preview}</p>
      </div>
    </Dialog>
  )
}
