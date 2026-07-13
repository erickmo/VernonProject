import { AlertTriangle } from 'lucide-react'
import { useAssignmentOverload } from '@/hooks/useData'
import { formatEstimate } from '@/lib/format'

// Non-blocking advisory under the assignee picker: warns when this todo's estimate would
// push the chosen assignee's day above their daily minimum + tolerance (assignment_overload_check).
// Renders nothing until it has a user, a date, and >0 minutes, and nothing when not over.
// Shared by both frontends (mobile /m + web /w) via the @ alias.
export function AssignmentOverloadBanner({
  user, date, minutes, enabled = true,
}: {
  user: string
  date: string
  minutes: number
  enabled?: boolean
}) {
  const { data } = useAssignmentOverload(user, date, minutes, enabled)
  if (!data?.over) return null
  return (
    <div className="mt-1 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        Overloads this member on {data.date}: {formatEstimate(data.assigned + data.added)} of {formatEstimate(data.minimum)} target.
      </span>
    </div>
  )
}
