import { Check } from 'lucide-react'
import type { Opt2 } from '@/lib/types'

interface Props {
  options: Opt2[]
  value: string[]
  onChange: (value: string[]) => void
  emptyText?: string
}

// Tap-to-toggle chip multiselect. Used for Project Detail's glossaries.
export function MultiSelectChips({ options, value, onChange, emptyText = 'No options' }: Props) {
  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])

  if (!options.length) return <p className="mt-1 text-xs italic text-slate-400 dark:text-slate-500">{emptyText}</p>

  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className={
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition active:scale-95 ' +
              (on
                ? 'border-brand-600 bg-brand-50 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400')
            }
          >
            {on && <Check className="h-3 w-3" />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
