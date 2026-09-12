import { describe, expect, it } from 'vitest'
import { hasAnyAnswer, missingBrief, parseBrief, serializeBrief, type BriefField } from './codingBrief'

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
