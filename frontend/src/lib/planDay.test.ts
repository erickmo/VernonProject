import { describe, it, expect } from 'vitest'
import { planOnlyOn, buildNext, sortTodoCards } from './planDay'
import { addDaysISO, todayISO } from './format'
import type { ProjectItem } from './types'

// Todo-card list order (todo p9is7hu28u): AI running → focused → estimate ascending.
describe('sortTodoCards', () => {
  const t = (name: string, estimated: number, over: Partial<ProjectItem> = {}) =>
    ({ name, estimated, deadline: null, work_mode: 'AI', ai_phase: 3, ...over }) as ProjectItem
  const names = (l: ProjectItem[]) => l.map((x) => x.name)

  it('AI running first, then focused in focus-list order, then estimate ascending', () => {
    const list = [
      t('big', 90),
      t('small', 15),
      t('focusA', 60),
      t('ai', 120, { ai_in_progress: true }),
      t('focusC', 5),
      t('mid', 30),
    ]
    expect(names(sortTodoCards(list, ['focusC', 'focusA']))).toEqual(['ai', 'focusC', 'focusA', 'small', 'mid', 'big'])
  })

  it('a stale ai_in_progress on a human todo does not float it (isAiWorking)', () => {
    const list = [t('quick', 10), t('human', 50, { work_mode: 'Human', ai_phase: 0, ai_in_progress: true })]
    expect(names(sortTodoCards(list, []))).toEqual(['quick', 'human'])
  })

  it('does not mutate its input', () => {
    const list = [t('b', 20), t('a', 10)]
    sortTodoCards(list, [])
    expect(names(list)).toEqual(['b', 'a'])
  })
})

// planOnlyOn backs the 1-9 hover shortcuts on a todo card: put this todo's whole
// plan on ONE day. The spec says "(and delete other plan)" but in the same breath
// forbids deleting "another todo, historical record, unrelated plan, or any plan
// outside the specified replacement behaviour" — so rows before today survive.
//
// These live in a .test.ts rather than planDay.selfcheck.ts on purpose: that
// selfcheck says "run via esbuild", nothing in package.json references it, and
// vitest only collects src/**/*.test.ts — so cases added there would never run.
const TODAY = '2026-09-12'
const YESTERDAY = '2026-09-11'
const TOMORROW = '2026-09-13'

describe('planOnlyOn', () => {
  it('puts the plan on the chosen day', () => {
    expect(planOnlyOn([], TOMORROW, TODAY, 30)).toEqual([{ date: TOMORROW, minutes: 30 }])
  })

  it('drops this todo’s other today-or-future rows', () => {
    const before = [
      { date: TODAY, minutes: 45 },
      { date: TOMORROW, minutes: 15 },
      { date: addDaysISO(TODAY, 5), minutes: 60 },
    ]
    expect(planOnlyOn(before, TOMORROW, TODAY, 30)).toEqual([{ date: TOMORROW, minutes: 30 }])
  })

  it('NEVER touches rows before today — that is the historical record', () => {
    const before = [
      { date: addDaysISO(TODAY, -9), minutes: 90 },
      { date: YESTERDAY, minutes: 20 },
      { date: TODAY, minutes: 45 },
    ]
    expect(planOnlyOn(before, TOMORROW, TODAY, 30)).toEqual([
      { date: addDaysISO(TODAY, -9), minutes: 90 },
      { date: YESTERDAY, minutes: 20 },
      { date: TOMORROW, minutes: 30 },
    ])
  })

  it('keeps a note the user already wrote on the target day', () => {
    const before = [{ date: TOMORROW, minutes: 15, note: 'pair with Ana' }]
    expect(planOnlyOn(before, TOMORROW, TODAY, 30)).toEqual([
      { date: TOMORROW, minutes: 30, note: 'pair with Ana' },
    ])
  })

  it('does not carry a note across from a different day', () => {
    const before = [{ date: TODAY, minutes: 15, note: 'today only' }]
    expect(planOnlyOn(before, TOMORROW, TODAY, 30)).toEqual([{ date: TOMORROW, minutes: 30 }])
  })

  it('zero minutes clears the plan but still keeps history', () => {
    const before = [{ date: YESTERDAY, minutes: 20 }, { date: TODAY, minutes: 45 }]
    expect(planOnlyOn(before, TODAY, TODAY, 0)).toEqual([{ date: YESTERDAY, minutes: 20 }])
  })

  it('is idempotent — pressing the same key twice is a move, not a toggle', () => {
    const once = planOnlyOn([{ date: TODAY, minutes: 45 }], TOMORROW, TODAY, 30)
    expect(planOnlyOn(once, TOMORROW, TODAY, 30)).toEqual(once)
  })

  it('differs from buildNext, which merges and would keep the old plan rows', () => {
    const before = [{ date: TODAY, minutes: 45 }]
    expect(buildNext(before, TOMORROW, 30)).toHaveLength(2)
    expect(planOnlyOn(before, TOMORROW, TODAY, 30)).toHaveLength(1)
  })
})

describe('the 1-9 key mapping', () => {
  it('maps 1 to today and 9 to today+8', () => {
    const today = todayISO()
    expect(addDaysISO(today, 1 - 1)).toBe(today)
    expect(addDaysISO(today, 9 - 1)).toBe(addDaysISO(today, 8))
  })

  it('every key lands on a distinct day, in order', () => {
    const today = todayISO()
    const days = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => addDaysISO(today, n - 1))
    expect(new Set(days).size).toBe(9)
    expect([...days].sort()).toEqual(days)
  })
})

describe('the card only reacts where it should', () => {
  it('guards the keystroke on the event target, not document focus', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../components/TodoCard.tsx', import.meta.url), 'utf8'),
    )
    // Pre-existing guard that 1-9 now inherits: typing "1" in a title field or a
    // rich-text note must not silently re-plan the task behind it.
    expect(src).toMatch(/INPUT\|TEXTAREA\|SELECT/)
    expect(src).toMatch(/isContentEditable/)
    expect(src).toMatch(/e\.metaKey \|\| e\.ctrlKey \|\| e\.altKey/)
    // and the shortcut is gated to the assignee on an open task
    expect(src).toMatch(/const canPlan = todo\.is_mine && todo\.status_key !== 'completed'/)
    expect(src).toMatch(/\^\[1-9\]\$/)
  })
})
