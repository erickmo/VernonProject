import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { todoCreateDateError } from './todoDates'

const TODAY = '2026-09-16'
const YESTERDAY = '2026-09-15'
const TOMORROW = '2026-09-17'
const NEXT_WEEK = '2026-09-23'

describe('todoCreateDateError', () => {
  it('rejects a start date before today', () => {
    expect(todoCreateDateError(YESTERDAY, TOMORROW, TODAY)).toMatch(/Start date cannot be in the past/)
  })

  it('rejects a deadline before today', () => {
    // Start date is today, so only the deadline rule can answer — a past start
    // would otherwise be what fails and this would pass for the wrong reason.
    expect(todoCreateDateError(TODAY, YESTERDAY, TODAY)).toMatch(/Deadline cannot be in the past/)
  })

  it('rejects a deadline before the start date', () => {
    expect(todoCreateDateError(NEXT_WEEK, TOMORROW, TODAY)).toMatch(/after the deadline/)
  })

  it('accepts today as the start date', () => {
    expect(todoCreateDateError(TODAY, NEXT_WEEK, TODAY)).toBeNull()
  })

  it('accepts today as both dates', () => {
    expect(todoCreateDateError(TODAY, TODAY, TODAY)).toBeNull()
  })

  it('accepts an equal future pair', () => {
    expect(todoCreateDateError(NEXT_WEEK, NEXT_WEEK, TODAY)).toBeNull()
  })

  it('accepts an ordered future range', () => {
    expect(todoCreateDateError(TOMORROW, NEXT_WEEK, TODAY)).toBeNull()
  })

  it('stays quiet while a date is still empty, so the form nags about the blank first', () => {
    expect(todoCreateDateError('', '', TODAY)).toBeNull()
    expect(todoCreateDateError(TOMORROW, '', TODAY)).toBeNull()
  })
})

// Source assertions rather than render tests: every test in src/lib is pure and this
// app ships no testing-library (same reasoning as createTodoSubmitGuard.test.ts). What
// they pin is that BOTH create surfaces actually use the shared rule — /m and /w each
// had their own inline `startDate > deadline` check before, which is exactly how the
// two drift apart.
const mobile = readFileSync(resolve(__dirname, '../components/CreateProjectItemSheet.tsx'), 'utf8')
const web = readFileSync(
  resolve(__dirname, '../../../frontend-web/src/components/CreateProjectItemDialog.tsx'),
  'utf8',
)

describe.each([
  ['mobile create sheet', mobile],
  ['web create dialog', web],
])('%s', (_name, src) => {
  it('validates the date pair through the shared rule', () => {
    expect(src).toMatch(/todoCreateDateError\(startDate, deadline\)/)
  })

  it('no longer carries its own copy of the ordering check', () => {
    expect(src).not.toMatch(/if \(startDate > deadline\)/)
  })

  it('stops the past being pickable in the first place', () => {
    expect(src).toMatch(/min=\{today\}/)
    expect(src).toMatch(/min=\{startDate \|\| today\}/)
  })
})
