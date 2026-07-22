import { Plus, Trash2 } from 'lucide-react'
import { MONTH_DAYS, WEEKDAYS } from '@/lib/recurrence'
import { SearchableSelect } from '@/components/SearchableSelect'
import { DatePicker } from '@web/components/DatePicker'

type Range = { from: string; to: string }
type Patch = Partial<{
  weekdays: string
  monthdays: string
  dates: Range[]
  behavior: 'Skip' | 'Shift'
}>

interface Props {
  weekdays: string
  monthdays: string
  dates: Range[]
  behavior: 'Skip' | 'Shift'
  onChange: (patch: Patch) => void
}

const WD_LABEL: Record<string, string> = {
  MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun',
}

// Toggle a token in a CSV, preserving `order`. `sortNum` re-sorts numerically.
function toggleCsv(csv: string, token: string, order: readonly (string | number)[], sortNum = false): string {
  const set = new Set(csv.split(',').filter(Boolean))
  if (set.has(token)) set.delete(token)
  else set.add(token)
  const seq = order.map(String).filter((t) => set.has(t))
  return (sortNum ? seq.sort((a, b) => +a - +b) : seq).join(',')
}

export function RecurrenceExceptions({ weekdays, monthdays, dates, behavior, onChange }: Props) {
  const wdSet = new Set(weekdays.split(',').filter(Boolean))
  const mdSet = new Set(monthdays.split(',').filter(Boolean))

  const chip = (active: boolean) =>
    'rounded-lg px-2.5 py-1 text-xs font-semibold transition ' +
    (active
      ? 'bg-brand-600 text-white'
      : 'bg-hover/[0.04] text-muted hover:bg-brand-50 dark:hover:bg-brand-500/15')

  const field =
    'w-full rounded-xl border border-line bg-hover/[0.04] px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none'

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-hover/[0.04] p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Exceptions</p>

      {/* Weekdays */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted">Skip weekdays</label>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onChange({ weekdays: toggleCsv(weekdays, d, WEEKDAYS) })}
              className={chip(wdSet.has(d))}
            >
              {WD_LABEL[d]}
            </button>
          ))}
        </div>
      </div>

      {/* Month days */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted">Skip days of month</label>
        <div className="grid grid-cols-7 gap-1">
          {MONTH_DAYS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange({ monthdays: toggleCsv(monthdays, String(n), MONTH_DAYS, true) })}
              className={chip(mdSet.has(String(n))) + ' py-1'}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Specific dates / ranges */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted">Skip specific dates &amp; ranges</label>
        <div className="flex flex-col gap-2">
          {dates.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <DatePicker
                value={r.from}
                onChange={(v) => onChange({ dates: dates.map((x, j) => (j === i ? { ...x, from: v } : x)) })}
                className={field + ' min-w-0 flex-1'}
                placeholder="From"
              />
              <span className="text-xs text-muted">→</span>
              <DatePicker
                value={r.to}
                onChange={(v) => onChange({ dates: dates.map((x, j) => (j === i ? { ...x, to: v } : x)) })}
                className={field + ' min-w-0 flex-1'}
                placeholder="To (same day = single)"
              />
              <button
                type="button"
                onClick={() => onChange({ dates: dates.filter((_, j) => j !== i) })}
                className="shrink-0 rounded-lg p-1.5 text-rose-600 transition hover:bg-rose-50 dark:hover:bg-rose-500/15"
                aria-label="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange({ dates: [...dates, { from: '', to: '' }] })}
            className="inline-flex items-center gap-1.5 self-start rounded-lg border border-dashed border-line px-2.5 py-1.5 text-xs font-medium text-muted transition hover:border-brand-400 hover:text-brand-600"
          >
            <Plus className="h-3.5 w-3.5" /> Add date
          </button>
        </div>
      </div>

      {/* Behavior */}
      <label className="text-xs font-medium text-muted">
        When an occurrence lands on an exception
        <div className="mt-1">
          <SearchableSelect
            value={behavior}
            onChange={(v) => onChange({ behavior: v === 'Shift' ? 'Shift' : 'Skip' })}
            options={[
              { value: 'Skip', label: 'Skip it (continue at next natural date)' },
              { value: 'Shift', label: 'Shift to the next open day' },
            ]}
          />
        </div>
      </label>
    </div>
  )
}
