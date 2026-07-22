import { SearchableSelect } from '@/components/SearchableSelect'
import { WEEKDAYS, MONTH_DAYS, type Recurrence } from '@/lib/recurrence'

const field = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:bg-slate-800 dark:text-slate-100'

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

  const excDays = new Set(value.exceptionWeekdays ? value.exceptionWeekdays.split(',') : [])
  const toggleExcDay = (d: string) => {
    const next = new Set(excDays); next.has(d) ? next.delete(d) : next.add(d)
    set({ exceptionWeekdays: WEEKDAYS.filter((w) => next.has(w)).join(',') })
  }
  const excMonthdays = new Set(value.exceptionMonthdays ? value.exceptionMonthdays.split(',').map(Number) : [])
  const toggleExcMonthday = (n: number) => {
    const next = new Set(excMonthdays); next.has(n) ? next.delete(n) : next.add(n)
    set({ exceptionMonthdays: MONTH_DAYS.filter((m) => next.has(m)).join(',') })
  }
  const excDates = value.exceptionDates || []
  const setDate = (i: number, patch: Partial<{ from: string; to: string }>) =>
    set({ exceptionDates: excDates.map((row, j) => (j === i ? { ...row, ...patch } : row)) })
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
      <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
        <input type="checkbox" checked={value.isRecurring} onChange={(e) => set({ isRecurring: e.target.checked })} />
        Recurring
      </label>
      {value.isRecurring && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm text-slate-600 dark:text-slate-300">Frequency
              <SearchableSelect value={value.frequency} onChange={(v) => set({ frequency: v as Recurrence['frequency'] })}
                options={['Daily', 'Weekly', 'Monthly'].map((s) => ({ value: s, label: s }))} />
            </label>
            <label className="text-sm text-slate-600 dark:text-slate-300">Every (N)
              <input type="number" min={1} className={field + ' mt-1'} value={value.interval}
                onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })} />
            </label>
          </div>
          {showWeekdays && (
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.map((d) => (
                <button key={d} type="button" onClick={() => toggleDay(d)}
                  className={'rounded-lg px-2 py-1 text-xs font-medium ' + (selected.has(d) ? 'bg-brand-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300')}>
                  {d[0] + d.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          )}
          {value.frequency === 'Monthly' && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm text-slate-600 dark:text-slate-300">Monthly by
                <SearchableSelect value={value.monthlyMode} onChange={(v) => set({ monthlyMode: v as Recurrence['monthlyMode'], ...(v === 'Nth Weekday' ? { weekdays: value.weekdays ? value.weekdays.split(',')[0] : '' } : {}) })}
                  options={['Day of Month', 'Nth Weekday'].map((s) => ({ value: s, label: s }))} />
              </label>
              {value.monthlyMode === 'Day of Month' ? (
                <label className="text-sm text-slate-600 dark:text-slate-300">Day (1-31)
                  <input type="number" min={1} max={31} className={field + ' mt-1'} value={value.dayOfMonth ?? ''}
                    onChange={(e) => set({ dayOfMonth: e.target.value ? Number(e.target.value) : null })} />
                </label>
              ) : (
                <label className="text-sm text-slate-600 dark:text-slate-300">Which
                  <SearchableSelect value={value.nth} onChange={(v) => set({ nth: v as Recurrence['nth'] })}
                    options={['First', 'Second', 'Third', 'Fourth', 'Last'].map((s) => ({ value: s, label: s }))} />
                </label>
              )}
            </div>
          )}
          <label className="text-sm text-slate-600 dark:text-slate-300">Until
            <input type="date" className={field + ' mt-1'} value={value.until} onChange={(e) => set({ until: e.target.value })} />
          </label>

          <details className="rounded-xl bg-white/60 dark:bg-slate-900/40 p-2 open:pb-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-600 dark:text-slate-300 select-none">Exceptions</summary>
            <div className="mt-3 flex flex-col gap-3">
              <div>
                <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Skip weekdays</div>
                <div className="flex flex-wrap gap-1">
                  {WEEKDAYS.map((d) => (
                    <button key={d} type="button" onClick={() => toggleExcDay(d)}
                      className={'rounded-lg px-2 py-1 text-xs font-medium ' + (excDays.has(d) ? 'bg-brand-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300')}>
                      {d[0] + d.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Skip days of month</div>
                <div className="flex flex-wrap gap-1">
                  {MONTH_DAYS.map((n) => (
                    <button key={n} type="button" onClick={() => toggleExcMonthday(n)}
                      className={'w-7 rounded-lg py-1 text-xs font-medium ' + (excMonthdays.has(n) ? 'bg-brand-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300')}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Skip specific dates / ranges</div>
                <div className="flex flex-col gap-2">
                  {excDates.map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="date" className={field} value={row.from} onChange={(e) => setDate(i, { from: e.target.value })} />
                      <span className="text-xs text-slate-400">to</span>
                      <input type="date" className={field} value={row.to} onChange={(e) => setDate(i, { to: e.target.value })} />
                      <button type="button" onClick={() => set({ exceptionDates: excDates.filter((_, j) => j !== i) })}
                        className="shrink-0 rounded-lg bg-slate-200 dark:bg-slate-700 px-2 py-1 text-xs text-slate-600 dark:text-slate-300">✕</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => set({ exceptionDates: [...excDates, { from: '', to: '' }] })}
                    className="self-start rounded-lg bg-slate-200 dark:bg-slate-700 px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300">+ Add date</button>
                </div>
              </div>
              <label className="text-sm text-slate-600 dark:text-slate-300">On an exception
                <SearchableSelect value={value.exceptionBehavior} onChange={(v) => set({ exceptionBehavior: v as Recurrence['exceptionBehavior'] })}
                  options={['Skip', 'Shift'].map((s) => ({ value: s, label: s }))} />
                <span className="mt-1 block text-xs text-slate-400">Skip = drop it; Shift = move to next open day</span>
              </label>
            </div>
          </details>
        </>
      )}
    </div>
  )
}
