// Editing a habit — shared by the mobile sheet and the web dialog, which differ
// only in chrome. api/habit.py::update_habit takes a partial patch, so the rule
// here is: send what actually changed, and never send a set the server would
// keep interpreting after the cadence moved on.
import type { Habit } from './types'

/** 0 = Monday … 6 = Sunday, matching api/habit.py::_scheduled (Python's date.weekday()). */
export const WEEKDAY_LABELS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'] as const

export interface HabitDraft {
  title: string
  icon: string
  cadence: 'Daily' | 'Weekdays'
  weekdays: number[]
}

export type HabitPatch = Partial<HabitDraft>

export function habitDraft(h: Habit): HabitDraft {
  return { title: h.title, icon: h.icon, cadence: h.cadence, weekdays: [...(h.weekdays ?? [])].sort((a, b) => a - b) }
}

export function toggleWeekday(weekdays: number[], day: number): number[] {
  const next = weekdays.includes(day) ? weekdays.filter((d) => d !== day) : [...weekdays, day]
  return next.sort((a, b) => a - b)
}

export function habitDraftError(d: HabitDraft): string | null {
  if (!d.title.trim()) return 'Judul wajib diisi'
  // The server accepts Weekdays with an empty set, which schedules the habit on no
  // day at all — the streak then can never move. Refuse it here instead.
  if (d.cadence === 'Weekdays' && d.weekdays.length === 0) return 'Pilih minimal satu hari'
  return null
}

const sameDays = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort((x, y) => x - y).every((n, i) => n === [...b].sort((x, y) => x - y)[i])

/** Only the changed fields, or null when nothing changed. */
export function habitPatch(h: Habit, d: HabitDraft): HabitPatch | null {
  const patch: HabitPatch = {}
  const title = d.title.trim()
  if (title !== h.title) patch.title = title
  if (d.icon !== h.icon) patch.icon = d.icon
  if (d.cadence !== h.cadence) {
    patch.cadence = d.cadence
    // Always restate the set when the cadence moves: going Daily clears a set that
    // would otherwise sit in the record, and going Weekdays must carry its own days.
    patch.weekdays = d.cadence === 'Weekdays' ? d.weekdays : []
  } else if (!sameDays(d.weekdays, h.weekdays ?? [])) {
    patch.weekdays = d.weekdays
  }
  return Object.keys(patch).length ? patch : null
}
