import { describe, it, expect } from 'vitest'
import { todoDuplicateInitial } from './duplicateTodo'
import type { ProjectItemDetail } from './types'

const TODAY = '2026-09-10'

// Minimum shape todoDuplicateInitial reads; the rest of ProjectItemDetail is
// irrelevant to the date defaults under test.
function src(start: string | null, deadline: string | null) {
  return {
    name: 'T1',
    to_do: 'Task',
    assigned_to: 'a@vernon.id',
    start_date: start,
    deadline,
    estimated: 30,
    notes: '',
    recurring: { is_recurring: false, frequency: '', interval: 1, weekdays: '', monthly_mode: '', day_of_month: null, nth: '', until: null },
  } as unknown as ProjectItemDetail
}

describe('todoDuplicateInitial date defaults', () => {
  it('pulls a past start date up to today', () => {
    expect(todoDuplicateInitial(src('2026-01-05', '2026-12-01'), TODAY).startDate).toBe(TODAY)
  })

  it('keeps a start date that is today or later', () => {
    expect(todoDuplicateInitial(src(TODAY, '2026-12-01'), TODAY).startDate).toBe(TODAY)
    expect(todoDuplicateInitial(src('2026-12-01', '2026-12-05'), TODAY).startDate).toBe('2026-12-01')
  })

  it('pulls a past deadline up to today', () => {
    expect(todoDuplicateInitial(src('2026-01-01', '2026-01-05'), TODAY).deadline).toBe(TODAY)
  })

  it('pulls a deadline earlier than the resulting start date up to today', () => {
    // Only reachable from legacy/bad source data: both the create form and
    // ProjectTodo.validate_start_date reject start_date > deadline on save.
    expect(todoDuplicateInitial(src('2026-12-01', '2026-11-01'), TODAY).deadline).toBe(TODAY)
  })

  it('keeps a deadline on or after today and the start date', () => {
    expect(todoDuplicateInitial(src('2026-01-01', TODAY), TODAY).deadline).toBe(TODAY)
    expect(todoDuplicateInitial(src('2026-01-01', '2026-12-01'), TODAY).deadline).toBe('2026-12-01')
  })

  it('leaves an absent date absent instead of inventing today', () => {
    const out = todoDuplicateInitial(src(null, null), TODAY)
    expect(out.startDate).toBe('')
    expect(out.deadline).toBe('')
  })

  it('does not mutate the source todo', () => {
    const data = src('2026-01-05', '2026-01-06')
    todoDuplicateInitial(data, TODAY)
    expect(data.start_date).toBe('2026-01-05')
    expect(data.deadline).toBe('2026-01-06')
  })

  it('still copies the non-date fields', () => {
    const out = todoDuplicateInitial(src('2026-01-05', '2026-01-06'), TODAY)
    expect(out.toDo).toBe('Task 👏🏻')
    expect(out.assignedTo).toBe('a@vernon.id')
    expect(out.estimated).toBe('30')
  })
})
