import { Minus, Plus, Wand2 } from 'lucide-react'
import { formatEstimate } from '@/lib/format'
import type { ProjectItem } from '@/lib/types'

const CHIPS = [15, 30, 60]

// One candidate row in the plan-my-day drawer. Shared by the mobile sheet and
// the web drawer. The buttons and chips edit through onSet, which clamps to the
// row's floor upstream; the text input edits through onSetRaw and is clamped on
// blur instead, since clamping a controlled input mid-word corrupts the digits.
export function PlanRow({
  todo,
  minutes,
  floor,
  onSet,
  onSetRaw,
  onUseEstimate,
}: {
  todo: ProjectItem
  minutes: number
  floor: number
  onSet: (id: string, v: number) => void
  onSetRaw: (id: string, v: number) => void
  onUseEstimate: (t: ProjectItem) => void
}) {
  return (
    <li className="rounded-2xl border border-paper-edge bg-paper p-3 dark:border-slate-700 dark:bg-slate-800/60">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-semibold text-stone-800 dark:text-slate-100">{todo.to_do}</p>
          <p className="mt-0.5 truncate text-[11px] text-stone-400 dark:text-slate-500">
            {todo.project_name}
            {todo.estimated > 0 ? ` · est ${formatEstimate(todo.estimated)}` : ''}
          </p>
          {floor > 0 && (
            <p className="mt-1 text-[11px] font-semibold text-brand-600 dark:text-brand-400">
              Deadline hari ini — wajib di rencana
            </p>
          )}
        </div>
        {todo.estimated > 0 && (
          <button
            onClick={() => onUseEstimate(todo)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 transition active:scale-95 dark:bg-brand-500/15 dark:text-brand-300"
          >
            <Wand2 className="h-3.5 w-3.5" /> Use est.
          </button>
        )}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <button
          onClick={() => onSet(todo.name, minutes - 15)}
          aria-label="15 minutes less"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper-line text-stone-600 transition active:scale-90 dark:bg-slate-700 dark:text-slate-300"
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={floor}
          value={minutes || 0}
          onChange={(e) => onSetRaw(todo.name, Number(e.target.value) || 0)}
          onBlur={() => onSet(todo.name, minutes)}
          aria-label="Planned minutes"
          className="w-16 shrink-0 rounded-lg border border-paper-edge bg-paper-card px-1 py-1 text-center text-sm font-bold tabular-nums text-stone-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
        <button
          onClick={() => onSet(todo.name, minutes + 15)}
          aria-label="15 minutes more"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper-line text-stone-600 transition active:scale-90 dark:bg-slate-700 dark:text-slate-300"
        >
          <Plus className="h-4 w-4" />
        </button>
        <div className="ml-auto flex items-center gap-1">
          {CHIPS.map((c) => (
            <button
              key={c}
              onClick={() => onSet(todo.name, c)}
              className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 transition active:scale-95 dark:bg-brand-500/15 dark:text-brand-300"
            >
              {c}m
            </button>
          ))}
        </div>
      </div>
    </li>
  )
}
