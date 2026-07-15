// Pure, timezone-safe date math for the calendar picker.
// NEVER `new Date("2026-07-14")` — that parses as UTC midnight and shifts a day
// in negative-offset zones. We parse strings by hand and build Dates from LOCAL
// components (`new Date(y, m-1, d)`) so a picked day is the day the user sees.

export type Parts = { y: number; m: number; d: number } // m is 1-12

export function parseISO(s: string): Parts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null
}

export function fmtISO(y: number, m: number, d: number): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${y}-${p(m)}-${p(d)}`
}

export function todayParts(): Parts {
  const now = new Date()
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() }
}

export function todayISO(): string {
  const t = todayParts()
  return fmtISO(t.y, t.m, t.d)
}

export type GridDay = { iso: string; day: number; inMonth: boolean }

// 6×7 grid, weeks start Sunday. Local Date math only.
export function monthGrid(year: number, month: number): GridDay[][] {
  const startDow = new Date(year, month - 1, 1).getDay() // 0=Sun
  const start = new Date(year, month - 1, 1 - startDow)
  const weeks: GridDay[][] = []
  for (let w = 0; w < 6; w++) {
    const row: GridDay[] = []
    for (let d = 0; d < 7; d++) {
      const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d)
      row.push({
        iso: fmtISO(cur.getFullYear(), cur.getMonth() + 1, cur.getDate()),
        day: cur.getDate(),
        inMonth: cur.getMonth() === month - 1,
      })
    }
    weeks.push(row)
  }
  return weeks
}

// Prev/next month, wrapping the year.
export function stepMonth(y: number, m: number, delta: number): { y: number; m: number } {
  const idx = (m - 1) + delta
  return { y: y + Math.floor(idx / 12), m: ((idx % 12) + 12) % 12 + 1 }
}

// YYYY-MM-DD lexical compare == chronological compare.
export function inRange(iso: string, min?: string, max?: string): boolean {
  if (min && iso < min) return false
  if (max && iso > max) return false
  return true
}

// Split/join a datetime-local string: 'YYYY-MM-DDTHH:mm'.
export function splitDT(s: string): { date: string; time: string } {
  if (!s) return { date: '', time: '' }
  const [date, time = ''] = s.split('T')
  return { date, time: time.slice(0, 5) }
}

export function joinDT(date: string, time: string): string {
  if (!date) return ''
  return `${date}T${time || '00:00'}`
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
export function monthLabel(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`
}

export const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
