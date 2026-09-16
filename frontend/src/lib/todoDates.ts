import { todayISO } from './format'

/** The date rules a NEW todo has to satisfy, mirrored from the controller
 *  (ProjectTodo.refuse_past_dates_on_create + validate_start_date):
 *
 *      - start date >= today
 *      - deadline   >= today
 *      - deadline   >= start date
 *
 *  Returns the message to show, or null when the pair is fine. The server is the
 *  real gate — this exists so the form says which date is wrong instead of
 *  bouncing off a server error after the user has filled everything in.
 *
 *  ISO YYYY-MM-DD compares lexicographically = chronologically, same as
 *  duplicateTodo.ts. `today` is injectable so this stays pure and testable. */
export function todoCreateDateError(
  startDate: string,
  deadline: string,
  today = todayISO(),
): string | null {
  if (startDate && startDate < today) return 'Start date cannot be in the past'
  if (deadline && deadline < today) return 'Deadline cannot be in the past'
  if (startDate && deadline && startDate > deadline) return 'Start date cannot be after the deadline'
  return null
}
