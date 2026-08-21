import { User, Zap } from 'lucide-react'
import clsx from 'clsx'

// Shared by both frontends (imported as @/components/PlanMeta on web too).
// Kept token-safe: only stone/slate + core Tailwind colours that exist in both
// tailwind configs — no web-only `text-muted` etc.

// Who a plan card is assigned to. Name only (a small icon, no avatar) — the plan
// pool deliberately omits assignee avatar config/image to stay light, and a name
// answers "who's on this". Hidden when the todo is unassigned.
export function AssigneeTag({ name }: { name?: string | null }) {
  if (!name || !name.trim()) return null
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-[11px] font-medium text-stone-500 dark:text-slate-400">
      <User className="h-3 w-3 shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  )
}

// Legend for the card left-border colours (deadline urgency). Swatch colours must
// match TONE_BORDER in PlanProjectBoard / PlanDeadlineDay.
const LEGEND: [string, string][] = [
  ['bg-rose-500', 'Lewat tenggat'],
  ['bg-orange-500', 'Jatuh tempo hari ini'],
  ['bg-amber-400', 'Segera (≤3 hari)'],
  ['bg-emerald-500', 'Masih lama'],
]

export function PlanLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-black/[0.03] px-3 py-2 text-[11px] text-stone-500 dark:bg-white/[0.04] dark:text-slate-400">
      <span className="font-semibold uppercase tracking-wide">Warna tenggat</span>
      {LEGEND.map(([dot, label]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
          {label}
        </span>
      ))}
    </div>
  )
}

// Site-wide slot occupancy for one assignee on one date — "2/3" — sourced from
// get_priority_occupancy, not a locally-visible count, so it never undercounts a slot
// claimed by a project this view can't see. `used` excludes the row being toggled from
// its own count when the caller passes one (see PlanDeadlineDay).
export function PriorityBadge({ used, slots }: { used: number; slots: number }) {
  if (!slots) return null
  const full = used >= slots
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
        full
          ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400'
          : 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
      )}
    >
      <Zap className="h-3 w-3" fill="currentColor" />
      {used}/{slots}
    </span>
  )
}
