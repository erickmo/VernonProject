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
}

export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const

export const emptyRecurrence: Recurrence = {
  isRecurring: false, frequency: 'Daily', interval: 1, weekdays: '',
  monthlyMode: 'Day of Month', dayOfMonth: null, nth: 'First', until: '',
}

export function serializeRecurrence(r: Recurrence): Record<string, unknown> {
  if (!r.isRecurring) return { is_recurring: 0 }
  return {
    is_recurring: 1,
    recurring_frequency: r.frequency,
    recurring_interval: r.interval || 1,
    recurring_weekdays: r.frequency === 'Weekly' || (r.frequency === 'Monthly' && r.monthlyMode === 'Nth Weekday') ? r.weekdays : '',
    recurring_monthly_mode: r.frequency === 'Monthly' ? r.monthlyMode : 'Day of Month',
    recurring_day_of_month: r.frequency === 'Monthly' && r.monthlyMode === 'Day of Month' ? r.dayOfMonth : null,
    recurring_nth: r.frequency === 'Monthly' && r.monthlyMode === 'Nth Weekday' ? r.nth : 'First',
    ...(r.until ? { recurring_until: r.until } : {}),
  }
}

const WD_LABEL: Record<string, string> = { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun' }

export function summarizeRecurrence(r: Recurrence): string {
  if (!r.isRecurring) return ''
  const n = r.interval || 1
  const every = (unit: string) => (n === 1 ? `every ${unit}` : `every ${n} ${unit}s`)
  if (r.frequency === 'Daily') return every('day')
  if (r.frequency === 'Weekly') {
    const days = r.weekdays ? r.weekdays.split(',').map((d) => WD_LABEL[d] ?? d).join(', ') : ''
    return days ? `${every('week')} on ${days}` : every('week')
  }
  if (r.monthlyMode === 'Nth Weekday') {
    const day = r.weekdays ? (WD_LABEL[r.weekdays.split(',')[0]] ?? '') : ''
    return `${r.nth} ${day} ${every('month')}`
  }
  return `${every('month')}${r.dayOfMonth ? ` on day ${r.dayOfMonth}` : ''}`
}

export function recurrenceFromDetail(d: {
  is_recurring: boolean; frequency: string | null; interval?: number; weekdays?: string
  monthly_mode?: string; day_of_month?: number | null; nth?: string; until?: string | null
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
  }
}
