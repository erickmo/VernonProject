import { describe, it, expect } from 'vitest'
import { STATUS_TONE } from './recruitmentStatus'

/** Tailwind colour family out of a class string: bg-indigo-50 -> "indigo". */
function family(cls: string): string {
  const m = /(?:^|[\s:])(?:bg|text)-([a-z]+)-\d{2,3}/.exec(cls)
  return m ? m[1] : ''
}

describe('recruitment status badge colours', () => {
  it('gives every status its own colour family', () => {
    const fams = Object.values(STATUS_TONE).map(family)
    expect(fams.every(Boolean)).toBe(true)
    // The actual regression: two statuses sharing a family are indistinguishable
    // on the board, which is what Offered-on-brand did next to Interview.
    expect(new Set(fams).size).toBe(fams.length)
  })

  it('keeps Offered visually distinct from Interview', () => {
    // `brand` is not a neutral alias: on web it is defined as violet, the exact
    // same hex at every stop (50 #f5f3ff, 500 #8b5cf6, 700 #6d28d9). So
    // Offered-on-brand next to Interview-on-violet was one colour, not two.
    expect(family(STATUS_TONE.Offered)).not.toBe(family(STATUS_TONE.Interview))
    expect(family(STATUS_TONE.Offered)).not.toBe('brand')
  })

  it('covers every status the pipeline can be in', () => {
    for (const s of ['Submitted', 'Screening', 'Interview', 'Offered', 'Hired', 'Rejected']) {
      expect(STATUS_TONE[s], `${s} has no badge colour`).toBeTruthy()
    }
  })
})
