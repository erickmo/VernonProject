import { describe, expect, it } from 'vitest'
import { hasAnyAnswer, isCodingWork, missingBrief, parseBrief, serializeBrief, type BriefField, type CodingLevelRow } from './codingBrief'

// Shaped like what get_coding_brief_schema returns; the real list lives on the server.
const FIELDS: BriefField[] = [
  { key: 'goal', label: 'Goal / outcome', required: true, rows: 2, placeholder: '' },
  { key: 'surface', label: 'Where it lives', required: true, rows: 2, placeholder: '' },
  { key: 'constraints', label: 'Constraints / must not break', required: false, rows: 3, placeholder: '' },
]
const FULL = { goal: 'ship it', surface: 'MarkdownEditor.tsx', constraints: 'keep comments working' }

describe('parseBrief', () => {
  it('reads stored answers and fills every question', () => {
    expect(parseBrief(JSON.stringify(FULL), FIELDS)).toEqual(FULL)
    expect(parseBrief(JSON.stringify({ goal: 'g' }), FIELDS)).toEqual({ goal: 'g', surface: '', constraints: '' })
  })

  it('treats an unreadable or empty value as no brief instead of throwing', () => {
    for (const raw of ['', '   ', null, undefined, 'not json', '[1,2]', '"a string"']) {
      expect(parseBrief(raw, FIELDS)).toEqual({ goal: '', surface: '', constraints: '' })
    }
  })

  it('drops keys the schema does not ask for, and trims', () => {
    const got = parseBrief(JSON.stringify({ goal: '  g  ', sneaky: 'x' }), FIELDS)
    expect(got.goal).toBe('g')
    expect(got).not.toHaveProperty('sneaky')
  })

  it('a whitespace-only answer is not an answer', () => {
    expect(parseBrief(JSON.stringify({ goal: ' \n ' }), FIELDS).goal).toBe('')
  })
})

describe('serializeBrief', () => {
  it('round-trips through parse', () => {
    expect(parseBrief(serializeBrief(FULL, FIELDS), FIELDS)).toEqual(FULL)
  })

  it('is stable whatever order the answers arrive in, so an unchanged brief is not an edit', () => {
    const reversed = Object.fromEntries(Object.entries(FULL).reverse())
    expect(serializeBrief(reversed, FIELDS)).toBe(serializeBrief(FULL, FIELDS))
  })

  it('keeps a key for every question, even unanswered ones', () => {
    expect(Object.keys(JSON.parse(serializeBrief({ goal: 'g' }, FIELDS))).sort()).toEqual([
      'constraints', 'goal', 'surface',
    ])
  })
})

describe('missingBrief', () => {
  it('names each blank required question in the order it is asked', () => {
    expect(missingBrief(parseBrief(JSON.stringify({ surface: 'x' }), FIELDS), FIELDS).map((f) => f.key)).toEqual(['goal'])
    expect(missingBrief(parseBrief('', FIELDS), FIELDS).map((f) => f.key)).toEqual(['goal', 'surface'])
  })

  it('never requires the optional question', () => {
    const brief = parseBrief(JSON.stringify({ ...FULL, constraints: '' }), FIELDS)
    expect(missingBrief(brief, FIELDS)).toEqual([])
  })
})

describe('hasAnyAnswer', () => {
  it('is false for an untouched brief and true once something is typed', () => {
    expect(hasAnyAnswer(parseBrief('', FIELDS))).toBe(false)
    expect(hasAnyAnswer(parseBrief(JSON.stringify({ goal: 'g' }), FIELDS))).toBe(true)
  })
})

// One group tagged coding as a whole, and one ordinary group whose levels are
// tagged individually — the shape the owner asked for.
const ROWS: CodingLevelRow[] = [
  { group: 'Whole', level_id: 'W1', group_type: 'Coding', is_coding: 1 },
  { group: 'Mixed', level_id: 'M-build', group_type: '', is_coding: 1 },
  { group: 'Mixed', level_id: 'M-admin', group_type: '', is_coding: 0 },
  { group: 'Plain', level_id: 'P1', group_type: '', is_coding: 0 },
]

describe('isCodingWork', () => {
  it('treats a level tagged coding as coding even when its group is not', () => {
    expect(isCodingWork(ROWS, 'Mixed', 'M-build')).toBe(true)
  })

  it('leaves an untagged level in the same group alone', () => {
    expect(isCodingWork(ROWS, 'Mixed', 'M-admin')).toBe(false)
  })

  it('still honours a whole group tagged Coding', () => {
    expect(isCodingWork(ROWS, 'Whole', 'W1')).toBe(true)
    expect(isCodingWork(ROWS, 'Whole', null)).toBe(true)
  })

  it('says no for an ordinary group', () => {
    expect(isCodingWork(ROWS, 'Plain', 'P1')).toBe(false)
    expect(isCodingWork(ROWS, 'Plain', null)).toBe(false)
  })

  it('answers from the group while no level is chosen yet', () => {
    expect(isCodingWork(ROWS, 'Mixed', null)).toBe(false)
    expect(isCodingWork(ROWS, 'Whole', undefined)).toBe(true)
  })

  it('falls back to the group when the catalog has not loaded or the level is unknown', () => {
    expect(isCodingWork(undefined, 'Whole', 'W1')).toBe(false)
    expect(isCodingWork(ROWS, 'Whole', 'not-a-level')).toBe(true)
  })

  it('is false with no group chosen', () => {
    expect(isCodingWork(ROWS, '', 'M-build')).toBe(false)
    expect(isCodingWork(ROWS, null, null)).toBe(false)
  })
})
