import { describe, it, expect } from 'vitest'
import { WEEKDAY_LABELS, habitDraft, habitDraftError, habitPatch, toggleWeekday } from './habitForm'
import type { Habit } from './types'

const habit = (over: Partial<Habit> = {}): Habit => ({
  name: 'HAB-1',
  title: 'Minum air',
  icon: '💧',
  cadence: 'Daily',
  weekdays: [],
  active: 1,
  scheduled_today: true,
  done_today: false,
  current_streak: 3,
  best_streak: 5,
  week: [],
  ...over,
})

describe('habit edit form', () => {
  it('labels Monday first, matching the server (0=Mon..6=Sun)', () => {
    expect(WEEKDAY_LABELS).toHaveLength(7)
    expect(WEEKDAY_LABELS[0]).toBe('Sen')
    expect(WEEKDAY_LABELS[6]).toBe('Min')
  })

  it('seeds the draft from the habit', () => {
    expect(habitDraft(habit({ cadence: 'Weekdays', weekdays: [0, 2] }))).toEqual({
      title: 'Minum air', icon: '💧', cadence: 'Weekdays', weekdays: [0, 2],
    })
  })

  it('toggles a weekday on and off, keeping it sorted', () => {
    expect(toggleWeekday([0, 4], 2)).toEqual([0, 2, 4])
    expect(toggleWeekday([0, 2, 4], 2)).toEqual([0, 4])
  })

  it('requires a title', () => {
    expect(habitDraftError({ title: '  ', icon: '💧', cadence: 'Daily', weekdays: [] })).toBe('Judul wajib diisi')
    expect(habitDraftError({ title: 'Minum air', icon: '💧', cadence: 'Daily', weekdays: [] })).toBeNull()
  })

  it('requires at least one day when the cadence is Weekdays', () => {
    // Weekdays with an empty set schedules the habit on NO day, so the streak can
    // never move — the server accepts it, the form must not.
    expect(habitDraftError({ title: 'Lari', icon: '🏃', cadence: 'Weekdays', weekdays: [] }))
      .toBe('Pilih minimal satu hari')
    expect(habitDraftError({ title: 'Lari', icon: '🏃', cadence: 'Weekdays', weekdays: [1] })).toBeNull()
  })

  it('sends only what changed', () => {
    const h = habit()
    expect(habitPatch(h, habitDraft(h))).toBeNull()
    expect(habitPatch(h, { ...habitDraft(h), title: 'Minum air putih' })).toEqual({ title: 'Minum air putih' })
    expect(habitPatch(h, { ...habitDraft(h), icon: '🚰' })).toEqual({ icon: '🚰' })
  })

  it('trims the title before comparing and sending', () => {
    const h = habit()
    expect(habitPatch(h, { ...habitDraft(h), title: '  Minum air  ' })).toBeNull()
    expect(habitPatch(h, { ...habitDraft(h), title: '  Air putih  ' })).toEqual({ title: 'Air putih' })
  })

  it('sends the weekday set whenever the cadence changes, so the server never keeps a stale one', () => {
    const daily = habit()
    expect(habitPatch(daily, { ...habitDraft(daily), cadence: 'Weekdays', weekdays: [0, 2] }))
      .toEqual({ cadence: 'Weekdays', weekdays: [0, 2] })
    // Back to Daily: weekdays are irrelevant, and clearing them keeps the record honest.
    const weekly = habit({ cadence: 'Weekdays', weekdays: [0, 2] })
    expect(habitPatch(weekly, { ...habitDraft(weekly), cadence: 'Daily' }))
      .toEqual({ cadence: 'Daily', weekdays: [] })
  })

  it('sends a changed weekday set on its own', () => {
    const h = habit({ cadence: 'Weekdays', weekdays: [0, 2] })
    expect(habitPatch(h, { ...habitDraft(h), weekdays: [0, 2, 4] })).toEqual({ weekdays: [0, 2, 4] })
    // Order must not register as a change — the server stores them sorted.
    expect(habitPatch(h, { ...habitDraft(h), weekdays: [2, 0] })).toBeNull()
  })
})
