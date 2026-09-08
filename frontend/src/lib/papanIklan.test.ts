import { describe, it, expect } from 'vitest'
import { TYPE_LABEL, TYPE_TINT_WEB } from './papanIklan'

// Pins the consolidation itself (previously 3 independently-hand-typed copies,
// 2 of which had already drifted into different colors between /m and /w) —
// not a drift guard, since Record<AdType, string> is already TS-exhaustive.
// The risk this catches is a transcription slip during the merge, not a
// missing-key one.
describe('papanIklan shared constants', () => {
  it('has a label for every ad type', () => {
    expect(TYPE_LABEL).toEqual({ Sell: 'Jual', Buy: 'Beli', Rent: 'Sewa' })
  })

  it('has web tint colors for every ad type, matching what both web pages used', () => {
    expect(TYPE_TINT_WEB.Sell).toContain('emerald')
    expect(TYPE_TINT_WEB.Buy).toContain('sky')
    expect(TYPE_TINT_WEB.Rent).toContain('violet')
  })
})
