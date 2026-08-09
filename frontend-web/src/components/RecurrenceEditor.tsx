import { SearchableSelect } from '@/components/SearchableSelect'
import { DatePicker } from '@web/components/DatePicker'
import { RecurrenceExceptions } from '@web/components/RecurrenceExceptions'
import { WEEKDAYS, type Recurrence } from '@/lib/recurrence'

const field =
  'w-full rounded-xl border border-line px-3 py-2 text-sm text-ink placeholder:text-muted bg-hover/[0.04] focus:border-brand-600 focus:outline-none'

// Web twin of frontend/src/components/RecurrenceEditor.tsx — same Recurrence
// contract + shared serialize lib, web bento styling. Substance lives in
// @/lib/recurrence; this is presentation only.
export function RecurrenceEditor({ value, onChange }: { value: Recurrence; onChange: (r: Recurrence) => void }) {
  const set = (patch: Partial<Recurrence>) => onChange({ ...value, ...patch })
  const isNth = value.frequency === 'Monthly' && value.monthlyMode === 'Nth Weekday'
  const showWeekdays = value.frequency === 'Weekly' || isNth
  const selected = new Set(value.weekdays ? value.weekdays.split(',') : [])
  const toggleDay = (d: string) => {
    if (isNth) return set({ weekdays: d }) // exactly one
    const next = new Set(selected); next.has(d) ? next.delete(d) : next.add(d)
    set({ weekdays: WEEKDAYS.filter((w) => next.has(w)).join(',') })
  }

  const chip = (active: boolean) =>
    'rounded-lg px-2.5 py-1 text-xs font-semibold transition ' +
    (active ? 'bg-brand-600 text-white' : 'bg-hover/[0.04] text-muted hover:bg-brand-50 dark:hover:bg-brand-500/15')

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-canvas p-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-medium text-muted">Frequency
          <SearchableSelect value={value.frequency} onChange={(v) => set({ frequency: v as Recurrence['frequency'] })}
            options={['Daily', 'Weekly', 'Monthly', 'Annually'].map((s) => ({ value: s, label: s }))} />
        </label>
        <label className="text-sm font-medium text-muted">Every (N)
          <input type="number" min={1} className={field + ' mt-1'} value={value.interval}
            onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })} />
        </label>
      </div>

      {showWeekdays && (
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((d) => (
            <button key={d} type="button" onClick={() => toggleDay(d)} className={chip(selected.has(d))}>
              {d[0] + d.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      )}

      {value.frequency === 'Monthly' && (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-muted">Monthly by
            <SearchableSelect value={value.monthlyMode}
              onChange={(v) => set({ monthlyMode: v as Recurrence['monthlyMode'], ...(v === 'Nth Weekday' ? { weekdays: value.weekdays ? value.weekdays.split(',')[0] : '' } : {}) })}
              options={['Day of Month', 'Nth Weekday'].map((s) => ({ value: s, label: s }))} />
          </label>
          {value.monthlyMode === 'Day of Month' ? (
            <label className="text-sm font-medium text-muted">Day (1-31)
              <input type="number" min={1} max={31} className={field + ' mt-1'} value={value.dayOfMonth ?? ''}
                onChange={(e) => set({ dayOfMonth: e.target.value ? Number(e.target.value) : null })} />
            </label>
          ) : (
            <label className="text-sm font-medium text-muted">Which
              <SearchableSelect value={value.nth} onChange={(v) => set({ nth: v as Recurrence['nth'] })}
                options={['First', 'Second', 'Third', 'Fourth', 'Last'].map((s) => ({ value: s, label: s }))} />
            </label>
          )}
        </div>
      )}

      <label className="text-sm font-medium text-muted">Until
        <DatePicker className={field + ' mt-1'} value={value.until} onChange={(v) => set({ until: v })} />
      </label>

      <RecurrenceExceptions
        weekdays={value.exceptionWeekdays}
        monthdays={value.exceptionMonthdays}
        dates={value.exceptionDates}
        behavior={value.exceptionBehavior}
        onChange={(p) => set({
          ...(p.weekdays !== undefined ? { exceptionWeekdays: p.weekdays } : {}),
          ...(p.monthdays !== undefined ? { exceptionMonthdays: p.monthdays } : {}),
          ...(p.dates !== undefined ? { exceptionDates: p.dates } : {}),
          ...(p.behavior !== undefined ? { exceptionBehavior: p.behavior } : {}),
        })}
      />
    </div>
  )
}
