export type Frequency = 'Daily' | 'Weekly' | 'Monthly'
export type MonthlyMode = 'Day of Month' | 'Nth Weekday'
export type Nth = 'First' | 'Second' | 'Third' | 'Fourth' | 'Last'

export interface Recurrence {
  isRecurring: boolean
  frequency: Frequency
  interval: number
  weekdays: string // CSV MON,THU
  monthlyMode: MonthlyMode
  dayOfMonth: number | null
  nth: Nth
  until: string
  exceptionWeekdays: string // CSV MON,SUN
  exceptionMonthdays: string // CSV 1,25
  exceptionDates: { from: string; to: string }[]
  exceptionBehavior: 'Skip' | 'Shift'
}

export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const
export const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

export const emptyRecurrence: Recurrence = {
  isRecurring: false, frequency: 'Daily', interval: 1, weekdays: '',
  monthlyMode: 'Day of Month', dayOfMonth: null, nth: 'First', until: '',
  exceptionWeekdays: '', exceptionMonthdays: '', exceptionDates: [], exceptionBehavior: 'Skip',
}

export function serializeRecurrence(r: Recurrence): Record<string, unknown> {
  if (!r.isRecurring) return { is_recurring: 0 }
  return {
    is_recurring: 1,
    recurring_frequency: r.frequency,
    recurring_interval: r.interval || 1,
    recurring_weekdays: r.frequency === 'Monthly' && r.monthlyMode === 'Nth Weekday' ? (r.weekdays.split(',')[0] || '') : (r.frequency === 'Weekly' ? r.weekdays : ''),
    recurring_monthly_mode: r.frequency === 'Monthly' ? r.monthlyMode : 'Day of Month',
    recurring_day_of_month: r.frequency === 'Monthly' && r.monthlyMode === 'Day of Month' ? r.dayOfMonth : null,
    recurring_nth: r.frequency === 'Monthly' && r.monthlyMode === 'Nth Weekday' ? r.nth : 'First',
    // Always send until (even empty) so clearing an end-date persists; backend maps '' -> None.
    recurring_until: r.until || '',
    recurring_exception_weekdays: r.exceptionWeekdays || '',
    recurring_exception_monthdays: r.exceptionMonthdays || '',
    recurring_exception_dates: JSON.stringify(r.exceptionDates || []),
    recurring_exception_behavior: r.exceptionBehavior || 'Skip',
  }
}

const WD_LABEL: Record<string, string> = { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun' }

const ordinal = (n: number) => {
  const s = n % 100
  if (s >= 11 && s <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

// Human clause for the exceptions, e.g. ", except Sun & the 25th (skip)". '' when none set.
export function summarizeExceptions(r: Recurrence): string {
  const parts: string[] = []
  if (r.exceptionWeekdays) parts.push(...r.exceptionWeekdays.split(',').filter(Boolean).map((d) => WD_LABEL[d] ?? d))
  if (r.exceptionMonthdays) parts.push(...r.exceptionMonthdays.split(',').filter(Boolean).map((d) => `the ${ordinal(+d)}`))
  const dates = (r.exceptionDates || []).filter((x) => x && x.from)
  if (dates.length) parts.push(dates.length === 1 ? '1 date' : `${dates.length} dates`)
  if (!parts.length) return ''
  return `, except ${parts.join(' & ')} (${(r.exceptionBehavior || 'Skip').toLowerCase()})`
}

export function summarizeRecurrence(r: Recurrence): string {
  if (!r.isRecurring) return ''
  const n = r.interval || 1
  const every = (unit: string) => (n === 1 ? `every ${unit}` : `every ${n} ${unit}s`)
  const exc = summarizeExceptions(r)
  let base: string
  if (r.frequency === 'Daily') base = every('day')
  else if (r.frequency === 'Weekly') {
    const days = r.weekdays ? r.weekdays.split(',').map((d) => WD_LABEL[d] ?? d).join(', ') : ''
    base = days ? `${every('week')} on ${days}` : every('week')
  } else if (r.monthlyMode === 'Nth Weekday') {
    const day = r.weekdays ? (WD_LABEL[r.weekdays.split(',')[0]] ?? '') : ''
    base = day ? `${r.nth} ${day} ${every('month')}` : `${r.nth} ${every('month')}`
  } else base = `${every('month')}${r.dayOfMonth ? ` on day ${r.dayOfMonth}` : ''}`
  return base + exc
}

export function recurrenceFromDetail(d: {
  is_recurring: boolean; frequency: string | null; interval?: number; weekdays?: string
  monthly_mode?: string; day_of_month?: number | null; nth?: string; until?: string | null
  exception_weekdays?: string; exception_monthdays?: string
  exception_dates?: { from: string; to: string }[] | string; exception_behavior?: string
}): Recurrence {
  return {
    isRecurring: !!d.is_recurring,
    frequency: (d.frequency as Frequency) || 'Daily',
    interval: d.interval || 1,
    weekdays: d.weekdays || '',
    monthlyMode: (d.monthly_mode as MonthlyMode) || 'Day of Month',
    dayOfMonth: d.day_of_month ?? null,
    nth: (d.nth as Nth) || 'First',
    until: d.until ?? '',
    exceptionWeekdays: d.exception_weekdays || '',
    exceptionMonthdays: d.exception_monthdays || '',
    exceptionDates: parseExceptionDates(d.exception_dates),
    exceptionBehavior: d.exception_behavior === 'Shift' ? 'Shift' : 'Skip',
  }
}

// API gives a list; tolerate a raw JSON string too. Guard bad input to [].
function parseExceptionDates(v: { from: string; to: string }[] | string | undefined): { from: string; to: string }[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string' && v.trim()) {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] }
  }
  return []
}
