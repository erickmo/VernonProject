import { Search, Save, CalendarRange } from 'lucide-react'
import { Drawer } from '@web/components/overlays/Drawer'
import { EmptyState, Spinner } from '@/components/ui'
import { PlanRow } from '@/components/PlanRow'
import { usePlanDay } from '@/hooks/usePlanDay'
import { formatEstimate } from '@/lib/format'
import type { ProjectItem } from '@/lib/types'

const DAILY_TARGET_MIN = 360

export function PlanDayDrawer({
  open,
  onClose,
  candidates,
}: {
  open: boolean
  onClose: () => void
  candidates: ProjectItem[]
}) {
  const plan = usePlanDay(candidates)
  const pct = Math.min(1, plan.total / DAILY_TARGET_MIN)

  const onSave = async () => {
    try {
      await plan.save()
      onClose()
    } catch {
      /* save() already toasted — keep open */
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Plan my day"
      widthClass="max-w-lg"
      footer={
        <button
          onClick={onSave}
          disabled={plan.saving}
          className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {plan.saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Save plan
        </button>
      }
    >
      {/* Progress */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs font-medium text-muted dark:text-slate-400">
          <span>Planned today</span>
          <span>
            <span className="font-bold text-brand-600 dark:text-brand-400">{formatEstimate(plan.total)}</span> /{' '}
            {formatEstimate(DAILY_TARGET_MIN)}
          </span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas">
          <div className="h-full rounded-full bg-brand-500 transition-[width] duration-300" style={{ width: `${pct * 100}%` }} />
        </div>
      </div>

      {/* Search */}
      <div className="mb-3 flex items-center gap-2 rounded-xl bg-canvas px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-muted" />
        <input
          value={plan.query}
          onChange={(e) => plan.setQuery(e.target.value)}
          placeholder="Search tasks…"
          className="w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none dark:text-slate-100"
        />
      </div>

      {plan.visible.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title={plan.query ? 'No matches' : 'Nothing to plan'}
          subtitle={plan.query ? 'Try a different search.' : 'No tasks due today or overdue.'}
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {plan.visible.map((t) => (
            <PlanRow key={t.name} todo={t} minutes={plan.mins[t.name] || 0} floor={plan.floors[t.name] || 0} onSet={plan.setMin} onSetRaw={plan.setMinRaw} onUseEstimate={plan.useEstimate} />
          ))}
        </ul>
      )}
    </Drawer>
  )
}
