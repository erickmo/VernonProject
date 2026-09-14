import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { canMoveDeadlineToday } from './filters'
import type { ProjectItem } from './types'

// 4oves731h6 — hovering a todo card and pressing `t` pulls its deadline to today.
// Same gate as the open-task "Deadline → today" action, expressed on list-row fields.
const TODAY = '2026-09-14'
const todo = (over: Partial<ProjectItem>) =>
  ({ is_mine: true, can_prioritize: false, status_key: 'planned', deadline: '2026-09-10', ...over }) as ProjectItem

describe('canMoveDeadlineToday', () => {
  it('lets the assignee or a lead/owner move an open todo', () => {
    expect(canMoveDeadlineToday(todo({}), TODAY)).toBe(true)
    expect(canMoveDeadlineToday(todo({ is_mine: false, can_prioritize: true }), TODAY)).toBe(true)
    expect(canMoveDeadlineToday(todo({ deadline: null }), TODAY)).toBe(true)
  })

  it('refuses someone who can edit neither', () => {
    expect(canMoveDeadlineToday(todo({ is_mine: false, can_prioritize: false }), TODAY)).toBe(false)
  })

  it('refuses once fields are locked (any non-Planned status)', () => {
    for (const status_key of ['done', 'checked', 'completed', 'cancelled'] as const) {
      expect(canMoveDeadlineToday(todo({ status_key }), TODAY)).toBe(false)
    }
  })

  it('is a no-op when the deadline is already today', () => {
    expect(canMoveDeadlineToday(todo({ deadline: TODAY }), TODAY)).toBe(false)
  })

  it('is wired into the shared TodoCard hover handler (both frontends render it)', () => {
    const card = readFileSync(resolve(__dirname, '../components/TodoCard.tsx'), 'utf8')
    expect(card).toMatch(/e\.key === 't' && canMoveDeadlineToday\(todo, todayISO\(\)\)/)
    expect(card).toMatch(/moveDeadline\.mutate\(\{ todo, date: todayISO\(\) \}\)/)
  })
})
