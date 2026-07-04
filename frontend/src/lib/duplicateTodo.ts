import type { ProjectItemDetail } from './types'

/** Prefill values for the create form. Every field optional; the form falls
 *  back to its own empty defaults when a key is absent. */
export interface CreateTodoInitial {
  toDo?: string
  assignedTo?: string
  startDate?: string
  deadline?: string
  leaderDeadline?: string
  ownerDeadline?: string
  estimated?: string
  leaderEstimated?: string
  ownerEstimated?: string
  notes?: string
  isRecurring?: boolean
  frequency?: string
  until?: string
  group?: string
  typeName?: string
  levelId?: string
  blockedBy?: string[]
  blocking?: string[]
}

/** Seed the create form from an existing todo (the "Duplicate task" action).
 *  Copies user-editable fields only; lifecycle/scoring state — status, points,
 *  waiting, allocations, overdue — is left out so the controller derives it
 *  fresh on insert. */
export function todoDuplicateInitial(data: ProjectItemDetail): CreateTodoInitial {
  return {
    toDo: `${data.to_do} 👏🏻`,
    assignedTo: data.assigned_to,
    startDate: data.start_date ?? '',
    deadline: data.deadline ?? '',
    leaderDeadline: data.leader_deadline ?? '',
    ownerDeadline: data.owner_deadline ?? '',
    estimated: String(data.estimated || ''),
    leaderEstimated: String(data.phase_estimates.done_to_checked || ''),
    ownerEstimated: String(data.phase_estimates.checked_to_completed || ''),
    notes: data.notes ?? '',
    isRecurring: data.recurring.is_recurring,
    frequency: data.recurring.frequency || 'Daily',
    until: data.recurring.until ?? '',
    group: data.group ?? '',
    typeName: data.level_type ?? '',
    levelId: data.level_id ?? '',
    blockedBy: data.blocked_by ?? [],
    blocking: data.blocking ?? [],
  }
}
