import type { ProjectItemDetail } from './types'
import { todayISO } from './format'

/** Prefill values for the create form. Every field optional; the form falls
 *  back to its own empty defaults when a key is absent. */
export interface CreateTodoInitial {
  toDo?: string
  assignedTo?: string
  startDate?: string
  deadline?: string
  estimated?: string
  notes?: string
  isRecurring?: boolean
  frequency?: string
  interval?: number
  weekdays?: string
  monthlyMode?: string
  dayOfMonth?: number | null
  nth?: string
  until?: string
  group?: string
  typeName?: string
  levelId?: string
  blockedBy?: string[]
  blocking?: string[]
}

/** A duplicate is a NEW task, so the source's dates are only a suggestion: one
 *  already in the past would open the form invalid (the create form and the
 *  Project Todo controller both reject start_date > deadline). Anything before
 *  `today` — or a deadline before the start date — defaults to today; an empty
 *  date stays empty. ISO YYYY-MM-DD compares lexicographically = chronologically. */
function duplicateDate(iso: string | null | undefined, today: string, start = today): string {
  if (!iso) return ''
  return iso < today || iso < start ? today : iso
}

/** Seed the create form from an existing todo (the "Duplicate task" action).
 *  Copies user-editable fields only; lifecycle/scoring state — status, points,
 *  waiting, allocations, overdue — is left out so the controller derives it
 *  fresh on insert. `today` is injectable so the date defaults are testable. */
export function todoDuplicateInitial(data: ProjectItemDetail, today = todayISO()): CreateTodoInitial {
  const startDate = duplicateDate(data.start_date, today)
  return {
    toDo: `${data.to_do} 👏🏻`,
    assignedTo: data.assigned_to,
    startDate,
    deadline: duplicateDate(data.deadline, today, startDate),
    estimated: String(data.estimated || ''),
    notes: data.notes ?? '',
    isRecurring: data.recurring.is_recurring,
    frequency: data.recurring.frequency || 'Daily',
    interval: data.recurring.interval,
    weekdays: data.recurring.weekdays,
    monthlyMode: data.recurring.monthly_mode,
    dayOfMonth: data.recurring.day_of_month,
    nth: data.recurring.nth,
    until: data.recurring.until ?? '',
    group: data.group ?? '',
    typeName: data.level_type ?? '',
    levelId: data.level_id ?? '',
    blockedBy: data.blocked_by ?? [],
    blocking: data.blocking ?? [],
  }
}

/** Seed the create form as a follow-up of an existing todo. Carries only the
 *  identity fields (assignee, group, level, title + suffix) and sets blocked_by
 *  to the source task so the follow-up can't start until it's done; everything
 *  else (dates, notes, recurrence) is left blank for the user to fill fresh. */
export function todoFollowUpInitial(data: ProjectItemDetail): CreateTodoInitial {
  return {
    toDo: `${data.to_do} (Follow Up)`,
    assignedTo: data.assigned_to,
    startDate: todayISO(),
    group: data.group ?? '',
    typeName: data.level_type ?? '',
    levelId: data.level_id ?? '',
    blockedBy: [data.name],
  }
}
