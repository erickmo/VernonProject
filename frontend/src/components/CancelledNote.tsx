import { Ban } from 'lucide-react'
import { formatDateTime } from '@/lib/format'

/**
 * Cancelled marker for a todo. Shared by both frontends (rose classes render the
 * same in /m and /w). `banner` = padded alert for the detail drawer/sheet;
 * `line` = one compact line for cards and dense rows.
 */
export function CancelledNote({
  item,
  variant = 'banner',
}: {
  item: { cancelled_on?: string | null; cancellation_reason?: string | null }
  variant?: 'banner' | 'line'
}) {
  const reason = item.cancellation_reason?.trim()
  const when = item.cancelled_on ? formatDateTime(item.cancelled_on) : null

  if (variant === 'line') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-rose-500 dark:text-rose-400">
        <Ban className="h-3 w-3 shrink-0" />
        <span className="truncate">
          Cancelled{when ? ` · ${when}` : ''}{reason ? ` · ${reason}` : ''}
        </span>
      </span>
    )
  }

  return (
    <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3 py-2.5 text-sm text-rose-700 dark:text-rose-300">
      <div className="flex items-center gap-2 font-semibold">
        <Ban className="h-4 w-4 shrink-0" />
        This task was cancelled
      </div>
      {when && <p className="mt-1 text-xs text-rose-600/90 dark:text-rose-300/80">on {when}</p>}
      <p className="mt-1">{reason ? `Reason: ${reason}` : 'No reason was given.'}</p>
    </div>
  )
}
